import { useEffect, useMemo, useRef, useState } from 'react'
import type { Branch, CommitBuild, HostInfo, PullRequest, Ref, RemoteBranch, RepoRefs, Stash, Tag } from '@shared/types'
import { buildRefMenu, type FocusRef } from '../refMenu'
import type { Actions } from '../actions'
import { Loading } from './Spinner'
import { BuildMarker } from './BuildStatus'
import { hostName, hostPath, prNoun, prPrefix } from '../util'

function Section({
  title,
  count,
  forceOpen,
  children
}: {
  title: string
  count: number
  forceOpen: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const shown = open || forceOpen
  return (
    <div>
      <div className="section-title" onClick={() => setOpen(!open)}>
        <span>{shown ? '▾' : '▸'} {title}</span>
        <span>{count}</span>
      </div>
      {shown && children}
    </div>
  )
}

function Highlight({ text, query }: { text: string; query: string }): React.JSX.Element {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function Sidebar({
  refs,
  actions,
  active,
  host,
  hasAccount,
  prs,
  prError,
  prsLoaded = true,
  graphFiltered = false,
  selectedPr,
  onSelectPr,
  builds = {}
}: {
  refs: RepoRefs
  actions: Actions
  active: boolean
  host: HostInfo | null
  hasAccount: boolean
  prs: PullRequest[]
  prError: string | null
  prsLoaded?: boolean
  graphFiltered?: boolean
  selectedPr: number | null
  onSelectPr: (pr: PullRequest) => void
  builds?: Record<string, CommitBuild[]>
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()
  const matches = (name: string): boolean => !q || name.toLowerCase().includes(q)

  useEffect(() => {
    if (!active) return
    const key = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active])

  const branches = useMemo(() => refs.branches.filter((b) => matches(b.name)), [refs.branches, q])
  const remotes = useMemo(() => refs.remotes.filter((r) => matches(`${r.remote}/${r.name}`)), [refs.remotes, q])
  const tags = useMemo(() => refs.tags.filter((t) => matches(t.name)), [refs.tags, q])
  const stashes = useMemo(() => refs.stashes.filter((s) => matches(s.message)), [refs.stashes, q])
  const shownPrs = useMemo(() => prs.filter((p) => matches(p.title) || matches(p.sourceBranch) || matches(String(p.id))), [prs, q])
  const prByBranch = useMemo(() => new Map(prs.map((p) => [p.sourceBranch, p])), [prs])

  const refsAt = (hash: string): Ref[] => [
    ...refs.branches.filter((b) => b.hash === hash).map((b) => ({ kind: 'branch' as const, name: b.name })),
    ...refs.remotes.filter((r) => r.hash === hash).map((r) => ({ kind: 'remote' as const, name: `${r.remote}/${r.name}` })),
    ...refs.tags.filter((t) => t.hash === hash).map((t) => ({ kind: 'tag' as const, name: t.name }))
  ]
  const open = (e: React.MouseEvent, hash: string, focus: FocusRef): void => {
    e.preventDefault()
    actions.openMenu(e, buildRefMenu({ sha: hash, refs: refsAt(hash), focus, repoRefs: refs, host, actions, filtered: graphFiltered }))
  }
  const branchMenu = (e: React.MouseEvent, b: Branch): void => open(e, b.hash, { kind: 'branch', name: b.name })
  const remoteMenu = (e: React.MouseEvent, r: RemoteBranch): void => open(e, r.hash, { kind: 'remote', name: `${r.remote}/${r.name}` })
  const tagMenu = (e: React.MouseEvent, t: Tag): void => open(e, t.hash, { kind: 'tag', name: t.name })

  const stashMenu = (e: React.MouseEvent, s: Stash): void => {
    e.preventDefault()
    actions.openMenu(e, [
      { label: 'Pop stash', onClick: () => actions.stashPop(s.index) },
      { separator: true },
      { label: 'Drop stash', danger: true, onClick: () => actions.stashDrop(s.index) }
    ])
  }

  const remoteGroups = new Map<string, RemoteBranch[]>()
  for (const r of remotes) {
    if (!remoteGroups.has(r.remote)) remoteGroups.set(r.remote, [])
    remoteGroups.get(r.remote)!.push(r)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      setQuery('')
      input.current?.blur()
    } else if (e.key === 'Enter' && q) {
      const first = branches.find((b) => !b.current) ?? branches[0]
      const remote = remotes[0]
      if (first && !first.current) actions.checkout(first.name)
      else if (!first && remote) actions.checkout(remote.name)
    }
  }

  const filtering = q.length > 0
  const total = branches.length + remotes.length + tags.length + stashes.length + shownPrs.length

  return (
    <div className="sidebar">
      <div className="sidebar-search">
        <input
          ref={input}
          value={query}
          placeholder="Filter branches (Ctrl+B)"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
        />
        {query && (
          <span className="clear" title="Clear" onClick={() => setQuery('')}>
            ×
          </span>
        )}
      </div>
      {filtering && total === 0 && <div className="empty">No matches for “{query}”</div>}
      <Section title="Local" count={branches.length} forceOpen={filtering}>
        {branches.map((b) => (
          <div
            key={b.name}
            className={`ref-item${b.current ? ' current' : ''}`}
            title={b.name}
            onClick={() => actions.selectHash(b.hash)}
            onDoubleClick={() => !b.current && actions.checkout(b.name)}
            onContextMenu={(e) => branchMenu(e, b)}
          >
            <span className="name"><Highlight text={b.name} query={q} /></span>
            {prByBranch.has(b.name) && (
              <span
                className="pr-pill"
                title={prByBranch.get(b.name)!.title}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectPr(prByBranch.get(b.name)!)
                }}
              >
                {prPrefix(host?.kind ?? 'azure')}{prByBranch.get(b.name)!.id}
              </span>
            )}
            {(b.ahead || b.behind) ? (
              <span className="track">
                {b.ahead ? `↑${b.ahead}` : ''} {b.behind ? `↓${b.behind}` : ''}
              </span>
            ) : null}
            {builds[b.hash] && <BuildMarker builds={builds[b.hash]} />}
          </div>
        ))}
        {branches.length === 0 && !filtering && <div className="empty">No branches</div>}
      </Section>
      {host && (
        <Section title={host.kind === 'gitlab' ? 'Merge requests' : 'Pull requests'} count={hasAccount ? shownPrs.length : 0} forceOpen={filtering}>
          {!hasAccount ? (
            <div className="connect-row">
              <button onClick={() => actions.openSettings(host.baseUrl)}>Connect to {hostName(host.kind)}</button>
              <small className="muted">{hostPath(host)}</small>
            </div>
          ) : (
            <>
              {!prsLoaded && <Loading className="empty" label={`Loading ${prNoun(host.kind)}s…`} />}
              {prError && <div className="empty error-text" title={prError}>{prError}</div>}
              {shownPrs.map((p) => (
                <div
                  key={p.id}
                  className={`ref-item pr-item${selectedPr === p.id ? ' current' : ''}`}
                  title={`${prPrefix(host.kind)}${p.id} ${p.title}\n${p.sourceBranch} → ${p.targetBranch}`}
                  onClick={() => onSelectPr(p)}
                  onDoubleClick={() => actions.checkout(p.sourceBranch)}
                >
                  <span className="pr-id">{prPrefix(host.kind)}{p.id}</span>
                  <span className="name">{p.isDraft ? '[Draft] ' : ''}<Highlight text={p.title} query={q} /></span>
                </div>
              ))}
              {prsLoaded && shownPrs.length === 0 && !filtering && !prError && <div className="empty">No open {prNoun(host.kind)}s</div>}
            </>
          )}
        </Section>
      )}
      <Section title="Remote" count={remotes.length} forceOpen={filtering}>
        {[...remoteGroups.entries()].map(([remote, list]) => (
          <div key={remote}>
            <div className="remote-group">☁ {remote}</div>
            {list.map((r) => (
              <div
                key={r.name}
                className="ref-item"
                style={{ paddingLeft: 30 }}
                title={`${remote}/${r.name}`}
                onClick={() => actions.selectHash(r.hash)}
                onDoubleClick={() => actions.checkout(r.name)}
                onContextMenu={(e) => remoteMenu(e, r)}
              >
                <span className="name"><Highlight text={r.name} query={q} /></span>
                {builds[r.hash] && <BuildMarker builds={builds[r.hash]} />}
              </div>
            ))}
          </div>
        ))}
        {remotes.length === 0 && !filtering && <div className="empty">No remote branches</div>}
      </Section>
      <Section title="Tags" count={tags.length} forceOpen={filtering}>
        {tags.map((t) => (
          <div
            key={t.name}
            className="ref-item"
            title={t.name}
            onClick={() => actions.selectHash(t.hash)}
            onContextMenu={(e) => tagMenu(e, t)}
          >
            <span className="name">🏷 <Highlight text={t.name} query={q} /></span>
          </div>
        ))}
        {tags.length === 0 && !filtering && <div className="empty">No tags</div>}
      </Section>
      <Section title="Stashes" count={stashes.length} forceOpen={filtering}>
        {stashes.map((s) => (
          <div
            key={s.index}
            className="ref-item"
            title={s.message}
            onDoubleClick={() => actions.stashPop(s.index)}
            onContextMenu={(e) => stashMenu(e, s)}
          >
            <span className="name"><Highlight text={s.message} query={q} /></span>
          </div>
        ))}
        {stashes.length === 0 && !filtering && <div className="empty">No stashes</div>}
      </Section>
    </div>
  )
}
