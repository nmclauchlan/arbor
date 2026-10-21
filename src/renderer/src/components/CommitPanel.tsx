import { useEffect, useState } from 'react'
import type { CommitDetails, StatusFile } from '@shared/types'
import { FileList, FileViewToggle } from './FileList'
import { canEdit, type FileViewRequest } from './FileViewer'
import { formatFullDate, shortHash } from '../util'

export function CommitPanel({
  repoPath,
  hash,
  viewing,
  onView
}: {
  repoPath: string
  hash: string
  viewing: FileViewRequest | null
  onView: (request: FileViewRequest | null) => void
}): React.JSX.Element {
  const [details, setDetails] = useState<CommitDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetails(null)
    setError(null)
    window.git
      .commitDetails(repoPath, hash)
      .then((d) => !cancelled && setDetails(d))
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, hash])

  const view = (file: StatusFile, mode: 'diff' | 'edit'): void => {
    if (mode === 'edit' && !canEdit(file)) mode = 'diff'
    onView({ file, source: { kind: 'commit', hash }, mode })
  }

  const selected = viewing && viewing.source.kind === 'commit' && viewing.source.hash === hash ? viewing.file.path : null

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
      <div className="panel-body">
        <div className="file-group-title">
          <span>{details.files.length} file{details.files.length === 1 ? '' : 's'} changed</span>
          <FileViewToggle />
        </div>
        <FileList
          files={details.files}
          selectedPath={selected}
          onSelect={(f) => view(f, 'diff')}
          onDoubleClick={(f) => view(f, 'edit')}
          actions={(f) =>
            canEdit(f) ? (
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                <button title="Edit working copy" onClick={() => view(f, 'edit')}>✎</button>
              </span>
            ) : null
          }
        />
      </div>
    </div>
  )
}
