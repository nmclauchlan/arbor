import type { HostInfo, PullRequest, RepoInfo, RepoRefs, UndoInfo } from '@shared/types'
import type { Actions } from '../actions'
import { prPrefix } from '../util'
import { setPanelCollapsed, useCollapsedPanels, type PanelName } from '../layout'

function PanelIcon({ side, open }: { side: 'left' | 'right'; open: boolean }): React.JSX.Element {
  const x = side === 'left' ? 2.5 : 10
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <rect x={x} y="3" width="3.5" height="10" fill={open ? 'currentColor' : 'none'} stroke="none" opacity={open ? 0.55 : 1} />
      <path d={side === 'left' ? 'M6 2.5v11' : 'M10 2.5v11'} />
    </svg>
  )
}

export function Toolbar({
  repo,
  refs,
  busy,
  busyLabel = null,
  actions,
  host,
  prs,
  onCreatePr,
  onViewPr,
  onSearch,
  undoInfo
}: {
  repo: RepoInfo
  refs: RepoRefs | null
  busy: boolean
  busyLabel?: string | null
  actions: Actions
  host: HostInfo | null
  prs: PullRequest[]
  onCreatePr: () => void
  onViewPr: (pr: PullRequest) => void
  onSearch: () => void
  undoInfo: UndoInfo
}): React.JSX.Element {
  const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'
  const current = refs?.branches.find((b) => b.current)
  const currentPr = current ? prs.find((p) => p.sourceBranch === current.name) : undefined
  const collapsed = useCollapsedPanels()
  const toggle = (panel: PanelName, label: string, side: 'left' | 'right'): React.JSX.Element => {
    const open = !collapsed.includes(panel)
    return (
      <button
        className="icon panel-toggle"
        aria-pressed={open}
        aria-label={`${open ? 'Hide' : 'Show'} the ${label}`}
        title={`${open ? 'Hide' : 'Show'} the ${label}`}
        onClick={() => setPanelCollapsed(panel, open)}
      >
        <PanelIcon side={side} open={open} />
      </button>
    )
  }
  return (
    <div className="toolbar">
      {toggle('sidebar', 'branch panel', 'left')}
      <button onClick={actions.openRepo} title="Open another repository">
        📁 {repo.name}
      </button>
      <span className="toolbar-group">
        <button
          disabled={busy || !undoInfo.undo}
          onClick={actions.undo}
          aria-busy={busyLabel === 'Undoing'}
          title={undoInfo.undo ? `Undo ${undoInfo.undo} (${mod}Z)` : 'Nothing to undo'}
          aria-label="Undo"
        >
          ↶ Undo
        </button>
        <button
          disabled={busy || !undoInfo.redo}
          onClick={actions.redo}
          aria-busy={busyLabel === 'Redoing'}
          title={undoInfo.redo ? `Redo ${undoInfo.redo} (${mod}Shift+Z)` : 'Nothing to redo'}
          aria-label="Redo"
        >
          ↷ Redo
        </button>
      </span>
      <button disabled={busy} aria-busy={busyLabel === 'Fetching'} onClick={actions.fetch} title="git fetch --all --prune">
        ⟳ Fetch
      </button>
      <button disabled={busy} aria-busy={busyLabel === 'Pulling'} onClick={actions.pull} title="git pull">
        ⇣ Pull
        {current?.behind ? <span className="badge">{current.behind}</span> : null}
      </button>
      <button disabled={busy} aria-busy={busyLabel === 'Pushing'} onClick={actions.push} title="git push">
        ⇡ Push
        {current?.ahead ? <span className="badge">{current.ahead}</span> : null}
      </button>
      <button disabled={busy} aria-busy={busyLabel === 'Creating branch'} onClick={() => actions.createBranch('HEAD')} title="Create a branch at HEAD">
        ⑂ Branch
      </button>
      <button disabled={busy} aria-busy={busyLabel === 'Stashing'} onClick={() => actions.stash()} title="Stash your uncommitted changes">
        ▣ Stash
      </button>
      <button
        disabled={busy || !refs?.stashes.length}
        aria-busy={busyLabel === 'Popping stash'}
        onClick={() => actions.stashPop(0)}
        title="git stash pop"
      >
        ▢ Pop
      </button>
      {host && current && (
        currentPr ? (
          <button disabled={busy} onClick={() => onViewPr(currentPr)} title={currentPr.title}>
            ⇄ {host.kind === 'gitlab' ? 'MR' : 'PR'} {prPrefix(host.kind)}{currentPr.id}
          </button>
        ) : (
          <button disabled={busy || !current.upstream} onClick={onCreatePr} title={current.upstream ? `Create a ${host.kind === 'gitlab' ? 'merge' : 'pull'} request for this branch` : 'Push the branch first'}>
            ⇄ {host.kind === 'gitlab' ? 'Merge request' : 'Pull request'}
          </button>
        )
      )}
      <button onClick={onSearch} title={`Search commits (${mod}F)`}>
        ⌕ Search
      </button>
      <div className="spacer" />
      <span className="muted">
        {refs?.detached ? 'HEAD detached' : current ? `on ${current.name}` : ''}
        {current?.upstream ? ` → ${current.upstream}` : ''}
      </span>
      {toggle('details', 'commit panel', 'right')}
    </div>
  )
}
