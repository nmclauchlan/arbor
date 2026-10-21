import { useEffect, useState } from 'react'
import type { HostInfo, PullRequest, PullRequestDetails } from '@shared/types'
import type { Actions } from '../actions'
import { errorMessage, formatFullDate, hostPath, prPrefix } from '../util'

function voteLabel(vote: number): { text: string; cls: string } {
  if (vote >= 10) return { text: 'Approved', cls: 'ok' }
  if (vote === 5) return { text: 'Approved with suggestions', cls: 'ok' }
  if (vote === 1) return { text: 'Commented', cls: '' }
  if (vote === -5) return { text: 'Waiting for author', cls: 'warn' }
  if (vote <= -10) return { text: 'Rejected', cls: 'bad' }
  return { text: 'No vote', cls: '' }
}

export function PrPanel({
  repoPath,
  host,
  pr,
  actions,
  refreshKey
}: {
  repoPath: string
  host: HostInfo
  pr: PullRequest
  actions: Actions
  refreshKey: number
}): React.JSX.Element {
  const [details, setDetails] = useState<PullRequestDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    window.host
      .pullRequest(repoPath, pr.id)
      .then((d) => !cancelled && setDetails(d))
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, pr.id, refreshKey])

  const d = details ?? { ...pr, description: '', mergeStatus: '', checks: [] }

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <h3>
            {d.isDraft && <span className="pr-draft">Draft</span>} {d.title}
          </h3>
        </div>
        <div className="meta">
          {prPrefix(host.kind)}{d.id} · {d.author} · {formatFullDate(d.createdAt)}
        </div>
        <div className="meta pr-branches">
          <span className="ref-badge branch" title={d.sourceBranch}>{d.sourceBranch}</span>
          <span className="muted">→</span>
          <span className="ref-badge remote" title={d.targetBranch}>{d.targetBranch}</span>
        </div>
        <div className="pr-actions">
          <button onClick={() => window.open(d.url)}>Open in browser</button>
          <button onClick={() => actions.checkout(d.sourceBranch)}>Checkout {d.sourceBranch}</button>
        </div>
      </div>
      <div className="panel-body pr-body">
        {error && <div className="settings-note error">{error}</div>}
        {details?.mergeStatus && details.mergeStatus !== 'unknown' && (
          <div className={`pr-merge ${details.mergeStatus === 'succeeded' ? 'ok' : details.mergeStatus === 'conflicts' ? 'bad' : ''}`}>
            {details.mergeStatus === 'succeeded' ? 'No merge conflicts' : details.mergeStatus === 'conflicts' ? 'Has merge conflicts' : `Merge status: ${details.mergeStatus.replace(/_/g, ' ')}`}
          </div>
        )}
        <div className="file-group-title"><span>Reviewers ({d.reviewers.length})</span></div>
        {d.reviewers.length === 0 && <div className="empty">No reviewers yet</div>}
        {d.reviewers.map((r) => {
          const v = voteLabel(r.vote)
          return (
            <div key={r.name} className="pr-row">
              <span className="name">{r.name}{r.required ? <span className="muted"> (required)</span> : null}</span>
              <span className={`pr-vote ${v.cls}`}>{v.text}</span>
            </div>
          )
        })}
        <div className="file-group-title"><span>Checks ({d.checks.length})</span></div>
        {details && d.checks.length === 0 && <div className="empty">No policies or builds reported</div>}
        {!details && !error && <div className="empty">Loading…</div>}
        {d.checks.map((c, i) => (
          <div key={i} className="pr-row" onClick={() => c.url && window.open(c.url)} style={{ cursor: c.url ? 'pointer' : 'default' }}>
            <span className={`pr-check ${c.state}`}>●</span>
            <span className="name">{c.name}</span>
            <span className="muted">{c.state}</span>
          </div>
        ))}
        {d.description && (
          <>
            <div className="file-group-title"><span>Description</span></div>
            <div className="pr-description">{d.description}</div>
          </>
        )}
        <div className="file-group-title"><span>{hostPath(host)}</span></div>
      </div>
    </div>
  )
}
