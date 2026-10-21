import type { RepoInfo, RepoRefs } from '@shared/types'
import type { Actions } from '../actions'

export function Toolbar({
  repo,
  refs,
  busy,
  actions
}: {
  repo: RepoInfo
  refs: RepoRefs | null
  busy: boolean
  actions: Actions
}): React.JSX.Element {
  const current = refs?.branches.find((b) => b.current)
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
      <div className="spacer" />
      <span className="muted">
        {refs?.detached ? 'HEAD detached' : current ? `on ${current.name}` : ''}
        {current?.upstream ? ` → ${current.upstream}` : ''}
      </span>
    </div>
  )
}
