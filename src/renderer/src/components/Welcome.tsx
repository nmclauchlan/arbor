import type { CSSProperties } from 'react'
import type { RepoInfo } from '@shared/types'
import { BrandIcon } from './BrandIcon'

export function Welcome({
  recent,
  onOpen,
  onClone,
  onOpenRecent
}: {
  recent: RepoInfo[]
  onOpen: () => void
  onClone: () => void
  onOpenRecent: (path: string) => void
}): React.JSX.Element {
  const modifier = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'

  return (
    <main className="welcome">
      <div className="welcome-content">
        <div className="welcome-brand">
          <BrandIcon size={112} animated />
          <h1 className="welcome-heading">Arbor</h1>
          <p className="welcome-tagline">A clearer view of every branch.</p>
        </div>
        <div className="welcome-actions">
          <button className="primary welcome-open" onClick={onOpen}>
            <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M2.5 6V4.5h5L9 6h8.5v10h-15Z" />
              <path d="M2.5 8h15" />
            </svg>
            Open repository…
            <kbd>{modifier} O</kbd>
          </button>
          <button className="welcome-clone" onClick={onClone}>
            <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2.5v9m-3-3 3 3 3-3M3.5 12v4.5h13V12" />
            </svg>
            Clone repository…
          </button>
        </div>
        {recent.length > 0 && (
          <section className="recent" aria-labelledby="recent-heading">
            <h2 id="recent-heading">Recent repositories</h2>
            <div className="recent-list">
              {recent.map((repo, index) => (
                <button
                  className="recent-repo"
                  key={repo.path}
                  title={repo.path}
                  style={{ '--recent-delay': `${Math.min(index, 5) * 28}ms` } as CSSProperties}
                  onClick={() => onOpenRecent(repo.path)}
                >
                  <svg className="recent-repo-icon" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2.5" width="12" height="15" rx="2" />
                    <path d="M7 2.5v15m3-11h3m-3 3h3" />
                  </svg>
                  <span className="recent-repo-text">
                    <span>{repo.name}</span>
                    <small>{repo.path}</small>
                  </span>
                  <svg className="recent-repo-arrow" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10h12m-5-5 5 5-5 5" />
                  </svg>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
