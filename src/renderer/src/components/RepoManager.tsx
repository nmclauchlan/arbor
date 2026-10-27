import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RepoInfo, RepoSummary } from '@shared/types'
import { parentName, revealLabel } from '../util'
import { Spinner } from './Spinner'
import { UpdateNotice } from './UpdateNotice'

type SectionId = 'open' | 'favorites' | 'recent'

interface Entry {
  path: string
  name: string
  hint?: string
}

const WIP_KEY = 'arbor.home.wip'
const COLLAPSE_KEY = 'arbor.home.collapsed'

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

const Icon = {
  star: (filled: boolean) => (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" />
    </svg>
  ),
  open: (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v4H2.5V4h4" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M1.5 4.5v-1h4.2l1.3 1.5h7.5v8h-13Z" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  ),
  chevron: (open: boolean) => (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'none' : 'rotate(-90deg)' }}>
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

function BranchCell({ s, wip }: { s: RepoSummary | undefined; wip: boolean }): React.JSX.Element {
  if (!s) return <span className="muted"><Spinner /></span>
  if (!s.exists) return <span className="repo-missing">Folder not found</span>
  if (!s.isRepo) return <span className="repo-missing">Not a git repository</span>
  const c = s.changes
  return (
    <span className="repo-state">
      <span className="repo-chip branch" title={s.upstream ? `${s.branch ?? 'HEAD'} → ${s.upstream}` : s.branch ?? 'Detached HEAD'}>
        {s.detached ? 'HEAD' : s.branch}
      </span>
      {s.behind > 0 && <span className="repo-chip behind" title={`${s.behind} commit${s.behind === 1 ? '' : 's'} behind ${s.upstream}`}>↓{s.behind}</span>}
      {s.ahead > 0 && <span className="repo-chip ahead" title={`${s.ahead} commit${s.ahead === 1 ? '' : 's'} ahead of ${s.upstream}`}>↑{s.ahead}</span>}
      {wip && c && (c.staged + c.modified > 0 || c.untracked > 0 || c.conflicted > 0) && (
        <span className="repo-chip changes" title={`${c.staged} staged, ${c.modified} modified, ${c.untracked} new${c.conflicted ? `, ${c.conflicted} conflicted` : ''}`}>
          {c.conflicted > 0 && <span className="conflicted">⚠ {c.conflicted}</span>}
          {c.staged + c.modified > 0 && <span>✎ {c.staged + c.modified}</span>}
          {c.untracked > 0 && <span className="added">+ {c.untracked}</span>}
        </span>
      )}
    </span>
  )
}

export function RepoManager({
  open,
  favorites,
  recent,
  activePath,
  groupNames,
  onOpen,
  onBrowse,
  onClone,
  onInit,
  onClose,
  onRemoveRecent,
  onClearRecent,
  onToggleFavorite,
  onReveal,
  onFetch,
  onPull,
  busy,
  refreshKey
}: {
  open: Entry[]
  favorites: Entry[]
  recent: RepoInfo[]
  activePath: string | null
  groupNames: Record<string, string>
  onOpen: (paths: string[]) => void
  onBrowse: () => void
  onClone: () => void
  onInit: () => void
  onClose: (paths: string[]) => void
  onRemoveRecent: (paths: string[]) => void
  onClearRecent: () => void
  onToggleFavorite: (entry: Entry) => void
  onReveal: (path: string) => void
  onFetch: (paths: string[]) => Promise<void>
  onPull: (paths: string[]) => Promise<void>
  busy: string | null
  refreshKey: number
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [wip, setWip] = useState(() => load(WIP_KEY, true))
  const [collapsed, setCollapsed] = useState<Record<SectionId, boolean>>(() => load(COLLAPSE_KEY, { open: false, favorites: false, recent: false }))
  const [summaries, setSummaries] = useState<Record<string, RepoSummary>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reload, setReload] = useState(0)

  const favoriteSet = useMemo(() => new Set(favorites.map((f) => f.path)), [favorites])
  const openSet = useMemo(() => new Set(open.map((o) => o.path)), [open])

  const allPaths = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const p of [...open.map((o) => o.path), ...favorites.map((f) => f.path), ...recent.map((r) => r.path)]) {
      if (!seen.has(p)) {
        seen.add(p)
        out.push(p)
      }
    }
    return out
  }, [open, favorites, recent])

  useEffect(() => {
    let cancelled = false
    const queue = [...allPaths]
    const worker = async (): Promise<void> => {
      for (let p = queue.shift(); p && !cancelled; p = queue.shift()) {
        const path = p
        try {
          const s = await window.git.repoSummary(path, wip)
          if (!cancelled) setSummaries((m) => ({ ...m, [path]: s }))
        } catch {
          /* ignore */
        }
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => {
      cancelled = true
    }
  }, [allPaths, wip, refreshKey, reload])

  const toggleSection = (id: SectionId): void => {
    setCollapsed((c) => {
      const next = { ...c, [id]: !c[id] }
      save(COLLAPSE_KEY, next)
      return next
    })
  }

  const setAll = (value: boolean): void => {
    const next = { open: value, favorites: value, recent: value }
    setCollapsed(next)
    save(COLLAPSE_KEY, next)
  }

  const q = query.trim().toLowerCase()
  const project = useCallback(
    (e: Entry): string => summaries[e.path]?.project ?? groupNames[e.path] ?? parentName(e.path),
    [summaries, groupNames]
  )
  const matches = useCallback(
    (e: Entry): boolean => {
      if (!q) return true
      const s = summaries[e.path]
      return [e.name, e.path, project(e), s?.branch ?? ''].some((v) => v.toLowerCase().includes(q))
    },
    [q, summaries, project]
  )

  const sections: { id: SectionId; title: string; entries: Entry[] }[] = [
    { id: 'open', title: 'Open repositories', entries: open.filter(matches) },
    { id: 'favorites', title: 'Favorites', entries: favorites.filter(matches) },
    { id: 'recent', title: 'Recent repositories', entries: recent.map((r) => ({ path: r.path, name: r.name })).filter(matches) }
  ]

  const key = (id: SectionId, path: string): string => `${id}::${path}`
  const toggleSelect = (k: string): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  const selectedPaths = (id?: SectionId): string[] => [
    ...new Set([...selected].filter((k) => !id || k.startsWith(id + '::')).map((k) => k.slice(k.indexOf('::') + 2)))
  ]

  const sectionActions = (id: SectionId, entries: Entry[]): React.ReactNode => {
    const paths = entries.map((e) => e.path)
    if (id === 'open') {
      return (
        <>
          <button disabled={!paths.length || !!busy} aria-busy={busy === 'fetch:open'} onClick={() => void onFetch(paths).then(() => setReload((n) => n + 1))}>
            Fetch all
          </button>
          <button disabled={!paths.length || !!busy} aria-busy={busy === 'pull:open'} onClick={() => void onPull(paths).then(() => setReload((n) => n + 1))}>
            Pull all
          </button>
          <button disabled={!paths.length} onClick={() => onClose(paths)}>
            Close all tabs
          </button>
        </>
      )
    }
    if (id === 'favorites') {
      return (
        <button disabled={!paths.length} onClick={() => onOpen(paths)}>
          Open all
        </button>
      )
    }
    return (
      <button disabled={!recent.length} onClick={onClearRecent}>
        Remove all
      </button>
    )
  }

  const anySelected = selected.size > 0
  const bulkPaths = selectedPaths()

  return (
    <main className="repo-manager">
      <div className="repo-manager-scroll">
        <header className="repo-manager-head">
          <h2>Repository Management</h2>
          <div className="repo-manager-actions">
            <button className="primary" onClick={onBrowse}>Browse…</button>
            <button onClick={onClone}>Clone…</button>
            <button onClick={onInit}>Init…</button>
          </div>
        </header>
        <div className="repo-manager-tools">
          <button className="icon" onClick={() => setAll(true)} title="Collapse all sections">Collapse</button>
          <button className="icon" onClick={() => setAll(false)} title="Expand all sections">Expand</button>
          <input
            className="repo-search"
            type="search"
            value={query}
            placeholder="Search repositories"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="wip-toggle" title="Show staged, modified and new file counts">
            <input
              type="checkbox"
              checked={wip}
              onChange={(e) => {
                setWip(e.target.checked)
                save(WIP_KEY, e.target.checked)
              }}
            />
            Changes summary
          </label>
        </div>

        {anySelected && (
          <div className="repo-bulk" role="toolbar" aria-label="Selected repositories">
            <span>{bulkPaths.length} selected</span>
            <button onClick={() => onOpen(bulkPaths)}>Open</button>
            <button disabled={!!busy} aria-busy={busy === 'fetch:bulk'} onClick={() => void onFetch(bulkPaths).then(() => setReload((n) => n + 1))}>Fetch</button>
            <button disabled={!!busy} aria-busy={busy === 'pull:bulk'} onClick={() => void onPull(bulkPaths).then(() => setReload((n) => n + 1))}>Pull</button>
            {selectedPaths('open').length > 0 && <button onClick={() => { onClose(selectedPaths('open')); setSelected(new Set()) }}>Close tabs</button>}
            {selectedPaths('recent').length > 0 && <button onClick={() => { onRemoveRecent(selectedPaths('recent')); setSelected(new Set()) }}>Remove from recent</button>}
            <span className="spacer" />
            <button className="icon" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        )}

        {sections.map((sec) => (
          <section key={sec.id} className="repo-section" aria-labelledby={`sec-${sec.id}`}>
            <div className="repo-section-head">
              <button className="icon repo-section-toggle" aria-expanded={!collapsed[sec.id]} onClick={() => toggleSection(sec.id)} id={`sec-${sec.id}`}>
                {Icon.chevron(!collapsed[sec.id])}
                <span>{sec.title}</span>
                <span className="count">{sec.entries.length}</span>
              </button>
              <span className="spacer" />
              <span className="repo-section-actions">{sectionActions(sec.id, sec.entries)}</span>
            </div>
            {!collapsed[sec.id] && (
              <div className="repo-rows" role="list">
                {sec.entries.length === 0 && <div className="repo-empty">{q ? 'No matches' : sec.id === 'favorites' ? 'Star a repository to keep it here' : 'Nothing here yet'}</div>}
                {sec.entries.map((e) => {
                  const k = key(sec.id, e.path)
                  const s = summaries[e.path]
                  const isActive = sec.id === 'open' && e.path === activePath
                  return (
                    <div
                      key={k}
                      role="listitem"
                      className={`repo-row${selected.has(k) ? ' selected' : ''}${isActive ? ' active' : ''}`}
                      onDoubleClick={() => onOpen([e.path])}
                      title={e.path}
                    >
                      <input type="checkbox" checked={selected.has(k)} onChange={() => toggleSelect(k)} aria-label={`Select ${e.name}`} />
                      <span className="repo-name">{e.name}</span>
                      <span className="repo-project">{project(e)}</span>
                      <BranchCell s={s} wip={wip} />
                      <span className="repo-row-actions">
                        <button
                          className={`icon${favoriteSet.has(e.path) ? ' starred' : ''}`}
                          title={favoriteSet.has(e.path) ? 'Remove from favorites' : 'Add to favorites'}
                          aria-label={favoriteSet.has(e.path) ? `Unfavorite ${e.name}` : `Favorite ${e.name}`}
                          onClick={() => onToggleFavorite(e)}
                        >
                          {Icon.star(favoriteSet.has(e.path))}
                        </button>
                        <button className="icon" title={openSet.has(e.path) ? 'Switch to tab' : 'Open in a tab'} aria-label={`Open ${e.name}`} onClick={() => onOpen([e.path])}>
                          {Icon.open}
                        </button>
                        <button className="icon" title={revealLabel()} aria-label={`${revealLabel()}: ${e.name}`} onClick={() => onReveal(e.path)}>
                          {Icon.folder}
                        </button>
                        <button
                          className="icon"
                          title={sec.id === 'open' ? 'Close tab' : sec.id === 'favorites' ? 'Remove from favorites' : 'Remove from recent'}
                          aria-label={`${sec.id === 'open' ? 'Close' : 'Remove'} ${e.name}`}
                          onClick={() => (sec.id === 'open' ? onClose([e.path]) : sec.id === 'favorites' ? onToggleFavorite(e) : onRemoveRecent([e.path]))}
                        >
                          {Icon.close}
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ))}
      </div>
      <div className="statusbar">
        <span>
          {open.length} open · {favorites.length} favorite{favorites.length === 1 ? '' : 's'} · {recent.length} recent
        </span>
        <span className="spacer" />
        <UpdateNotice />
      </div>
    </main>
  )
}
