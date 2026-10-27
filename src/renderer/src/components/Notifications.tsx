import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { IncomingBranch } from '@shared/types'
import { formatDate, shortHash } from '../util'
import { Spinner } from './Spinner'

export interface RepoIncoming {
  path: string
  name: string
  branches: IncomingBranch[]
  error?: string
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
  onRestore,
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
  onClear: (path: string, branch: string) => void
  onClearAll: () => void
  onRestore: () => void
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

  const withIncoming = repos.filter((r) => r.branches.length)
  const total = withIncoming.reduce((n, r) => n + r.branches.reduce((m, b) => m + b.behind, 0), 0)

  return (
    <div className="notifications-panel" ref={ref} style={pos} role="dialog" aria-label="Incoming commits">
      <div className="notifications-head">
        <strong>Incoming commits</strong>
        <span className="muted">
          {total ? `${total} waiting` : cleared ? 'Nothing new' : 'Up to date'}
          {lastChecked ? ` · checked ${formatDate(lastChecked)}` : ''}
        </span>
        <button className="icon" onClick={onCheckNow} disabled={checking} aria-busy={checking} title="Fetch all open repositories now">
          {checking ? 'Checking…' : 'Check now'}
        </button>
        <button className="icon" onClick={onClearAll} disabled={!withIncoming.length} title="Hide these until more commits arrive">
          Clear all
        </button>
      </div>
      <div className="notifications-body">
        {!withIncoming.length && (
          <div className="notifications-empty">
            {checking ? (
              <>
                <Spinner /> Fetching your repositories…
              </>
            ) : cleared ? (
              'Nothing new since you cleared them.'
            ) : (
              'Every open repository is up to date with its remote.'
            )}
          </div>
        )}
        {withIncoming.map((r) => (
          <section key={r.path} className="notifications-repo">
            {r.branches.map((b) => {
              const key = `${r.path}::${b.branch}`
              return (
                <div key={key} className={`notifications-branch${unseenKeys.has(key) ? ' unseen' : ''}`}>
                  <div className="notifications-branch-head">
                    {unseenKeys.has(key) && <span className="unseen-dot" aria-label="new" />}
                    <span className="repo-name">{r.name}</span>
                    <span className="ref-badge branch">{b.branch}</span>
                    <span className="muted">
                      ← {b.behind} new from {b.upstream}
                    </span>
                    <span className="spacer" />
                    {b.current && b.ahead > 0 && (
                      <span className="diverged" title={`${b.branch} also has ${b.ahead} local commit${b.ahead === 1 ? '' : 's'}; pull it from its tab to merge or rebase`}>
                        Diverged
                      </span>
                    )}
                    {b.current && !b.ahead && (
                      <button
                        onClick={() => onPull(r.path)}
                        disabled={pulling === r.path}
                        aria-busy={pulling === r.path}
                        title="Fast-forward to the remote"
                      >
                        Pull
                      </button>
                    )}
                    <button
                      className="icon notifications-clear"
                      onClick={() => onClear(r.path, b.branch)}
                      title="Hide until more commits arrive"
                      aria-label={`Clear ${b.branch}`}
                    >
                      Clear
                    </button>
                  </div>
                  {b.commits.map((c) => (
                    <button key={c.hash} className="notifications-commit" onClick={() => onOpenCommit(r.path, c.hash)} title={`${c.subject}\n${c.author} · ${shortHash(c.hash)}`}>
                      <span className="subject">{c.subject}</span>
                      <span className="muted author">{c.author}</span>
                      <span className="muted when">{formatDate(c.date)}</span>
                    </button>
                  ))}
                  {b.behind > b.commits.length && <div className="notifications-more muted">and {b.behind - b.commits.length} more</div>}
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
          <span className="muted">
            {cleared} cleared branch{cleared === 1 ? '' : 'es'} hidden until more commits arrive
          </span>
          <button className="icon" onClick={onRestore}>
            Show again
          </button>
        </div>
      )}
    </div>
  )
}
