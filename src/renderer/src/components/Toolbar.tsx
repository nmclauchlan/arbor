import type { HostInfo, PullRequest, RepoInfo, RepoRefs } from '@shared/types'
import type { Actions } from '../actions'

export function Toolbar({
  repo,
  refs,
  busy,
  actions,
  host,
  prs,
  onCreatePr,
  onViewPr
}: {
  repo: RepoInfo
  refs: RepoRefs | null
  busy: boolean
  actions: Actions
  host: HostInfo | null
  prs: PullRequest[]
  onCreatePr: () => void
  onViewPr: (pr: PullRequest) => void
}): React.JSX.Element {
  const current = refs?.branches.find((b) => b.current)
  const currentPr = current ? prs.find((p) => p.sourceBranch === current.name) : undefined
  return (
    <div className="toolbar">
      <button onClick={actions.openRepo} title="Open another repository">
        📁 {repo.name}
      </button>
      <button disabled={busy} onClick={actions.fetch} title="git fetch --all --prune">
        ⟳ Fetch
      </button>
      <button disabled={busy} onClick={actions.pull} title="git pull">
        ⇣ Pull
        {current?.behind ? <span className="badge">{current.behind}</span> : null}
      </button>
      <button disabled={busy} onClick={actions.push} title="git push">
        ⇡ Push
        {current?.ahead ? <span className="badge">{current.ahead}</span> : null}
      </button>
      <button disabled={busy} onClick={() => actions.createBranch('HEAD')} title="Create a branch at HEAD">
        ⑂ Branch
      </button>
      <button disabled={busy} onClick={actions.stash} title="git stash push --include-untracked">
        ▣ Stash
      </button>
      <button
        disabled={busy || !refs?.stashes.length}
        onClick={() => actions.stashPop(0)}
        title="git stash pop"
      >
        ▢ Pop
      </button>
      {host && current && (
        currentPr ? (
          <button disabled={busy} onClick={() => onViewPr(currentPr)} title={currentPr.title}>
            ⇄ PR !{currentPr.id}
          </button>
        ) : (
          <button disabled={busy || !current.upstream} onClick={onCreatePr} title={current.upstream ? 'Create a pull request for this branch' : 'Push the branch first'}>
            ⇄ Pull request
          </button>
        )
      )}
      <div className="spacer" />
      <span className="muted">
        {refs?.detached ? 'HEAD detached' : current ? `on ${current.name}` : ''}
        {current?.upstream ? ` → ${current.upstream}` : ''}
      </span>
    </div>
  )
}
