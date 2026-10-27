import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CommitBuild, IncomingUpstream } from '@shared/types'
import { formatDate, shortHash } from '../util'
import { Spinner } from './Spinner'
import { BuildIcon } from './BuildStatus'

export interface RepoIncoming {
  path: string
  name: string
  upstreams: IncomingUpstream[]
  failedBuilds?: FailedBuild[]
  error?: string
}

export interface FailedBuild {
  upstream: string
  sha: string
  build: CommitBuild
}

export function failedBuildKey(path: string, f: FailedBuild): string {
  return `${path}::${f.upstream}::${f.build.id}`
}

export function BellIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1.5H3Z" />
      <path d="M6.5 14.5a1.6 1.6 0 0 0 3 0" strokeLinecap="round" />
    </svg>
  )
}

export function NotificationsPanel({
  repos,
  unseenKeys,
  checking,
  lastChecked,
  pulling,
  cleared,
  onOpenCommit,
  onPull,
  onCheckNow,
  onClear,
  onClearAll,
  onClearBuild,
  onUndo,
  onClose
}: {
  repos: RepoIncoming[]
  unseenKeys: Set<string>
  checking: boolean
  lastChecked: number | null
  pulling: string | null
  cleared: number
  onOpenCommit: (path: string, hash: string) => void
  onPull: (path: string) => void
  onCheckNow: () => void
  onClear: (path: string, upstream: string) => void
  onClearAll: () => void
  onClearBuild: (key: string) => void
  onUndo: () => void
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' })

  useLayoutEffect(() => {
    const place = (): void => {
      const bell = document.querySelector('.notifications-btn')
      if (!bell) return
      const rect = bell.getBoundingClientRect()
      const top = Math.round(rect.bottom + 6)
      setPos({ top, right: Math.max(8, Math.round(window.innerWidth - rect.right - 4)), maxHeight: `calc(100vh - ${top + 16}px)` })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])

  useEffect(() => {
    const down = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.notifications-btn')) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const withIncoming = repos.filter((r) => r.upstreams.length)
  const total = withIncoming.reduce((n, r) => n + r.upstreams.reduce((m, u) => m + u.count, 0), 0)
  const failures = repos.flatMap((r) => (r.failedBuilds ?? []).map((f) => ({ ...f, repo: r, key: failedBuildKey(r.path, f) })))
  const summary = [total ? `${total} new` : '', failures.length ? `${failures.length} failed build${failures.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')

  return (
    <div className="notifications-panel" ref={ref} style={pos} role="dialog" aria-label="Incoming commits">
      <div className="notifications-head">
        <strong>Incoming commits</strong>
        <span className="muted">
          {summary || 'Nothing new'}
          {lastChecked ? ` · checked ${formatDate(lastChecked)}` : ''}
        </span>
        <button className="icon" onClick={onCheckNow} disabled={checking} aria-busy={checking} title="Fetch all open repositories now">
          {checking ? 'Checking…' : 'Check now'}
        </button>
        <button className="icon" onClick={onClearAll} disabled={!withIncoming.length && !failures.length} title="Mark these as read; only commits that arrive later will show">
          Clear all
        </button>
      </div>
      <div className="notifications-body">
        {failures.map((f) => (
          <div key={f.key} className={`notifications-build${unseenKeys.has(`build::${f.key}`) ? ' unseen' : ''}`}>
            {unseenKeys.has(`build::${f.key}`) && <span className="unseen-dot" aria-label="new" />}
            <BuildIcon state="failed" />
            <span className="repo-name">{f.repo.name}</span>
            <span className="ref-badge remote">{f.upstream}</span>
            <button
              className="notifications-build-name"
              onClick={() => onOpenCommit(f.repo.path, f.sha)}
              title={`${f.build.name} failed at ${shortHash(f.sha)}. Open the commit to see the errors.`}
            >
              {f.build.name} failed
            </button>
            <a className="muted mono" href={f.build.url} target="_blank" rel="noreferrer" title="Open the build">
              {shortHash(f.sha)}
            </a>
            <button className="icon notifications-clear" onClick={() => onClearBuild(f.key)} aria-label={`Clear ${f.build.name} on ${f.upstream}`}>
              Clear
            </button>
          </div>
        ))}
        {!withIncoming.length && !failures.length && (
          <div className="notifications-empty">
            {checking ? (
              <>
                <Spinner /> Fetching your repositories…
              </>
            ) : cleared ? (
              'Nothing new since you cleared them.'
            ) : (
              'No new commits on the remote branches you track.'
            )}
          </div>
        )}
        {withIncoming.map((r) => (
          <section key={r.path} className="notifications-repo">
            {r.upstreams.map((u) => {
              const key = `${r.path}::${u.upstream}`
              const current = u.branches.find((b) => b.current)
              return (
                <div key={key} className={`notifications-branch${unseenKeys.has(key) ? ' unseen' : ''}`}>
                  <div className="notifications-branch-head">
                    {unseenKeys.has(key) && <span className="unseen-dot" aria-label="new" />}
                    <span className="repo-name">{r.name}</span>
                    <span className="ref-badge remote" title={`Tracked by ${u.branches.map((b) => b.name).join(', ')}`}>
                      {u.upstream}
                    </span>
                    <span className="muted">{u.count} new</span>
                    <span className="spacer" />
                    {current && current.ahead > 0 && current.behind > 0 && (
                      <span
                        className="diverged"
                        title={`${current.name} also has ${current.ahead} local commit${current.ahead === 1 ? '' : 's'}; pull it from its tab to merge or rebase`}
                      >
                        Diverged
                      </span>
                    )}
                    {current && !current.ahead && current.behind > 0 && (
                      <button
                        onClick={() => onPull(r.path)}
                        disabled={pulling === r.path}
                        aria-busy={pulling === r.path}
                        title={`Fast-forward ${current.name} to ${u.upstream}`}
                      >
                        Pull
                      </button>
                    )}
                    <button
                      className="icon notifications-clear"
                      onClick={() => onClear(r.path, u.upstream)}
                      title="Mark as read; only commits that arrive later will show"
                      aria-label={`Clear ${u.upstream}`}
                    >
                      Clear
                    </button>
                  </div>
                  {u.commits.map((c) => (
                    <button key={c.hash} className="notifications-commit" onClick={() => onOpenCommit(r.path, c.hash)} title={`${c.subject}\n${c.author} · ${shortHash(c.hash)}`}>
                      <span className="subject">{c.subject}</span>
                      <span className="muted author">{c.author}</span>
                      <span className="muted when">{formatDate(c.date)}</span>
                    </button>
                  ))}
                  {u.count > u.commits.length && <div className="notifications-more muted">and {u.count - u.commits.length} more</div>}
                </div>
              )
            })}
          </section>
        ))}
        {repos.filter((r) => r.error).map((r) => (
          <div key={r.path} className="notifications-error" title={r.error}>
            Couldn't fetch {r.name}: {r.error}
          </div>
        ))}
      </div>
      {cleared > 0 && (
        <div className="notifications-foot">
          <span className="muted">Cleared {cleared}</span>
          <button className="icon" onClick={onUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
