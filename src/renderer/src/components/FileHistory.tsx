import { useEffect, useState } from 'react'
import type { FileHistoryEntry } from '@shared/types'
import { DiffView } from './DiffView'
import { Loading } from './Spinner'
import { errorMessage, formatDate, shortHash } from '../util'

export function FileHistory({ repoPath, file, onShowCommit }: { repoPath: string; file: string; onShowCommit: (hash: string) => void }): React.JSX.Element {
  const [entries, setEntries] = useState<FileHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FileHistoryEntry | null>(null)
  const [diff, setDiff] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)

  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    setSelected(null)
    window.git
      .fileHistory(repoPath, file)
      .then((list) => {
        if (cancelled) return
        setEntries(list)
        setSelected(list[0] ?? null)
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, file])

  useEffect(() => {
    if (!selected) {
      setDiff('')
      return
    }
    let cancelled = false
    setLoadingDiff(true)
    window.git
      .commitFileDiff(repoPath, selected.hash, selected.path, selected.oldPath)
      .then((d) => !cancelled && setDiff(d))
      .catch((e) => !cancelled && setDiff(errorMessage(e)))
      .finally(() => !cancelled && setLoadingDiff(false))
    return () => {
      cancelled = true
    }
  }, [repoPath, selected])

  if (error) return <div className="file-history"><div className="placeholder">{error}</div></div>
  if (!entries) return <div className="file-history"><Loading className="placeholder" /></div>
  if (!entries.length) return <div className="file-history"><div className="placeholder">No commits have changed this file yet.</div></div>

  return (
    <div className="file-history">
      <div className="file-history-list" role="listbox" aria-label="Commits that changed this file">
        <div className="file-history-count">
          {entries.length}
          {entries.length >= 500 ? '+' : ''} commit{entries.length === 1 ? '' : 's'}
        </div>
        {entries.map((e) => (
          <div
            key={e.hash}
            role="option"
            aria-selected={selected?.hash === e.hash}
            className={`file-history-item${selected?.hash === e.hash ? ' selected' : ''}`}
            onClick={() => setSelected(e)}
            onDoubleClick={() => onShowCommit(e.hash)}
            title={`${e.subject}\n${e.author} · ${new Date(e.date).toLocaleString()}\nDouble-click to show it in the graph`}
          >
            <div className="subject">{e.subject}</div>
            <div className="meta">
              <span className="author">{e.author}</span>
              <span>{formatDate(e.date)}</span>
              <span className="mono">{shortHash(e.hash)}</span>
            </div>
            {e.oldPath && <div className="renamed">renamed from {e.oldPath}</div>}
          </div>
        ))}
      </div>
      <div className="file-history-diff">
        {selected && (
          <div className="file-history-bar">
            <span className="mono">{shortHash(selected.hash)}</span>
            <span className="subject">{selected.subject}</span>
            <button onClick={() => onShowCommit(selected.hash)}>Show in graph</button>
          </div>
        )}
        <DiffView text={diff} loading={loadingDiff} empty="No textual changes" />
      </div>
    </div>
  )
}
