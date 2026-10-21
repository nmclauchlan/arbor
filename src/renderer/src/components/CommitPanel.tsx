import { useEffect, useState } from 'react'
import { isImageFile, type CommitDetails, type StatusFile } from '@shared/types'
import type { Shell } from '../actions'
import { DiffView } from './DiffView'
import { Editor } from './Editor'
import { ImageDiff } from './ImageDiff'
import { formatFullDate, shortHash } from '../util'

export function FileRow({
  file,
  selected,
  onClick,
  onDoubleClick,
  children
}: {
  file: StatusFile
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  children?: React.ReactNode
}): React.JSX.Element {
  const label = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
  return (
    <div
      className={`file-item${selected ? ' selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={label}
    >
      <span className={`status-letter ${file.status}`}>{file.status}</span>
      <span className="path"><span>{label}</span></span>
      {children}
    </div>
  )
}

export function CommitPanel({
  repoPath,
  hash,
  shell,
  onFileSaved
}: {
  repoPath: string
  hash: string
  shell: Shell
  onFileSaved: () => void
}): React.JSX.Element {
  const [details, setDetails] = useState<CommitDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDetails(null)
    setFile(null)
    setEditing(null)
    setDiff('')
    setError(null)
    window.git
      .commitDetails(repoPath, hash)
      .then((d) => {
        if (cancelled) return
        setDetails(d)
        if (d.files.length) setFile(d.files[0].path)
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  useEffect(() => {
    if (!file || editing || isImageFile(file)) return
    let cancelled = false
    setLoadingDiff(true)
    window.git
      .commitFileDiff(repoPath, hash, file)
      .then((d) => !cancelled && setDiff(d))
      .catch((e) => !cancelled && setDiff(String(e.message ?? e)))
      .finally(() => !cancelled && setLoadingDiff(false))
    return () => {
      cancelled = true
    }
  }, [repoPath, hash, file, editing])

  if (error) return <div className="panel"><div className="center">{error}</div></div>
  if (!details) return <div className="panel"><div className="center">Loading…</div></div>

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{details.subject}</h3>
        <div className="meta">
          {details.author} &lt;{details.email}&gt; · {formatFullDate(details.date)}
        </div>
        <div className="meta">
          <span className="mono">{shortHash(details.hash)}</span>
          {details.parents.length > 0 && (
            <>
              {' '}· parent{details.parents.length > 1 ? 's' : ''}{' '}
              <span className="mono">{details.parents.map(shortHash).join(', ')}</span>
            </>
          )}
        </div>
        {details.body && <div className="body">{details.body}</div>}
      </div>
      <div className="panel-split">
        <div>
          <div className="file-group-title">
            <span>{details.files.length} file{details.files.length === 1 ? '' : 's'} changed</span>
          </div>
          {details.files.map((f) => (
            <FileRow
              key={f.path}
              file={f}
              selected={file === f.path}
              onClick={() => setFile(f.path)}
              onDoubleClick={() => f.status !== 'D' && !isImageFile(f.path) && setEditing(f.path)}
            >
              {f.status !== 'D' && !isImageFile(f.path) && (
                <span className="actions" onClick={(e) => e.stopPropagation()}>
                  <button title="Edit working copy" onClick={() => setEditing(f.path)}>✎</button>
                </span>
              )}
            </FileRow>
          ))}
        </div>
        {editing ? (
          <Editor
            repoPath={repoPath}
            file={editing}
            shell={shell}
            onClose={() => setEditing(null)}
            onSaved={onFileSaved}
          />
        ) : file && isImageFile(file) ? (
          <ImageDiff
            key={file}
            repoPath={repoPath}
            file={file}
            oldPath={details.files.find((f) => f.path === file)?.oldPath}
            source={{ kind: 'commit', hash }}
          />
        ) : (
          <DiffView text={diff} loading={loadingDiff} empty={file ? 'No textual changes' : 'Select a file'} />
        )}
      </div>
    </div>
  )
}
