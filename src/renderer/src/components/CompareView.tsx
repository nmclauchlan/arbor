import { useEffect, useState } from 'react'
import type { CompareCommit, CompareMode, CompareSummary, StatusFile } from '@shared/types'
import { DiffView } from './DiffView'
import { FileList, FileViewToggle } from './FileList'
import { Loading } from './Spinner'
import { errorMessage, formatDate, shortHash } from '../util'

export interface CompareRequest {
  from: string
  to: string | null
  fromLabel: string
  toLabel: string
  mode: CompareMode
}

function CommitGroup({ title, commits, onShowCommit }: { title: string; commits: CompareCommit[]; onShowCommit: (hash: string) => void }): React.JSX.Element {
  return (
    <div className="compare-group">
      <div className="file-group-title">
        <span>
          {title} ({commits.length}
          {commits.length >= 200 ? '+' : ''})
        </span>
      </div>
      {commits.map((c) => (
        <div key={c.hash} className="file-history-item" onClick={() => onShowCommit(c.hash)} title="Show this commit in the graph">
          <div className="subject">{c.subject}</div>
          <div className="meta">
            <span className="author">{c.author}</span>
            <span>{formatDate(c.date)}</span>
            <span className="mono">{shortHash(c.hash)}</span>
          </div>
        </div>
      ))}
      {!commits.length && <div className="empty">None</div>}
    </div>
  )
}

export function CompareView({
  repoPath,
  request,
  onChange,
  onClose,
  onShowCommit
}: {
  repoPath: string
  request: CompareRequest
  onChange: (request: CompareRequest) => void
  onClose: () => void
  onShowCommit: (hash: string) => void
}): React.JSX.Element {
  const { from, to, fromLabel, toLabel, mode } = request
  const [summary, setSummary] = useState<CompareSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'files' | 'commits'>('files')
  const [selected, setSelected] = useState<StatusFile | null>(null)
  const [diff, setDiff] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSummary(null)
    setError(null)
    setSelected(null)
    window.git
      .compareRefs(repoPath, from, to, mode)
      .then((s) => {
        if (cancelled) return
        setSummary(s)
        setSelected(s.files[0] ?? null)
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, from, to, mode])

  useEffect(() => {
    if (!selected) {
      setDiff('')
      return
    }
    let cancelled = false
    setLoadingDiff(true)
    window.git
      .compareFileDiff(repoPath, from, to, mode, selected.path, selected.oldPath)
      .then((d) => !cancelled && setDiff(d))
      .catch((e) => !cancelled && setDiff(errorMessage(e)))
      .finally(() => !cancelled && setLoadingDiff(false))
    return () => {
      cancelled = true
    }
  }, [repoPath, from, to, mode, selected])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || document.querySelector('.overlay, .dialog, .context-menu-root')) return
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="compare-view">
      <div className="file-viewer-bar">
        <strong className="compare-title">Compare</strong>
        <span className="ref-badge" title={from}>
          {fromLabel}
        </span>
        <span className="muted">→</span>
        <span className="ref-badge" title={to ?? 'Uncommitted changes in the working tree'}>
          {toLabel}
        </span>
        {to !== null && (
          <button
            className="icon"
            title="Swap the two sides"
            aria-label="Swap sides"
            onClick={() => onChange({ ...request, from: to, to: from, fromLabel: toLabel, toLabel: fromLabel })}
          >
            ⇄
          </button>
        )}
        <span className="spacer" />
        {to !== null && (
          <span className="view-tabs" role="tablist" aria-label="Compare mode">
            <button
              role="tab"
              aria-selected={mode === 'merge-base'}
              className={mode === 'merge-base' ? 'active' : ''}
              title={`Changes on ${toLabel} since it diverged from ${fromLabel}, like a pull request`}
              onClick={() => onChange({ ...request, mode: 'merge-base' })}
            >
              Since they diverged
            </button>
            <button
              role="tab"
              aria-selected={mode === 'direct'}
              className={mode === 'direct' ? 'active' : ''}
              title={`Every difference between ${fromLabel} and ${toLabel}`}
              onClick={() => onChange({ ...request, mode: 'direct' })}
            >
              Direct
            </button>
          </span>
        )}
        <button onClick={onClose} title="Back to the commit graph (Esc)">
          ✕ Close
        </button>
      </div>
      {error ? (
        <div className="placeholder">{error}</div>
      ) : !summary ? (
        <Loading className="placeholder" />
      ) : (
        <div className="compare-body">
          <div className="compare-side">
            <div className="compare-side-head">
              <span className="view-tabs" role="tablist" aria-label="Show">
                <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
                  Files ({summary.files.length})
                </button>
                {to !== null && (
                  <button role="tab" aria-selected={tab === 'commits'} className={tab === 'commits' ? 'active' : ''} onClick={() => setTab('commits')}>
                    Commits ({summary.ahead.length + summary.behind.length})
                  </button>
                )}
              </span>
              {tab === 'files' && <FileViewToggle />}
            </div>
            <div className="compare-side-body">
              {tab === 'files' ? (
                summary.files.length ? (
                  <FileList files={summary.files} selectedPath={selected?.path ?? null} onSelect={setSelected} />
                ) : (
                  <div className="empty">No differences</div>
                )
              ) : (
                <>
                  <CommitGroup title={`Only on ${toLabel}`} commits={summary.ahead} onShowCommit={onShowCommit} />
                  <CommitGroup title={`Only on ${fromLabel}`} commits={summary.behind} onShowCommit={onShowCommit} />
                </>
              )}
            </div>
          </div>
          <div className="compare-diff">
            <DiffView text={diff} loading={loadingDiff} empty={summary.files.length ? 'No textual changes' : 'No differences'} />
          </div>
        </div>
      )}
    </div>
  )
}
