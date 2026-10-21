import type { RepoInfo } from '@shared/types'

export function Welcome({
  recent,
  onOpen,
  onOpenRecent
}: {
  recent: RepoInfo[]
  onOpen: () => void
  onOpenRecent: (path: string) => void
}): React.JSX.Element {
  return (
    <div className="welcome">
      <h1>Arbor</h1>
      <button className="primary" onClick={onOpen}>
        Open a repository…
      </button>
      {recent.length > 0 && (
        <div className="recent">
          <div className="muted">Recent</div>
          {recent.map((r) => (
            <button key={r.path} onClick={() => onOpenRecent(r.path)}>
              <span>{r.name}</span>
              <small>{r.path}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
