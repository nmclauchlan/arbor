import { useEffect, useState } from 'react'
import { isImageFile, type ImageSource, type StatusFile } from '@shared/types'
import type { Shell } from '../actions'
import { DiffView } from './DiffView'
import { Editor } from './Editor'
import { ImageDiff } from './ImageDiff'
import { errorMessage, shortHash } from '../util'

export interface FileViewRequest {
  file: StatusFile
  source: ImageSource
  mode: 'diff' | 'edit'
}

export function canEdit(file: StatusFile): boolean {
  return file.status !== 'D' && !isImageFile(file.path)
}

function sourceLabel(source: ImageSource): string {
  if (source.kind === 'commit') return `in ${shortHash(source.hash)}`
  return source.staged ? 'staged' : 'unstaged'
}

export function FileViewer({
  repoPath,
  request,
  shell,
  onChange,
  onClose,
  onSaved
}: {
  repoPath: string
  request: FileViewRequest
  shell: Shell
  onChange: (request: FileViewRequest) => void
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const { file, source, mode } = request
  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(false)
  const image = isImageFile(file.path)
  const sourceKey = JSON.stringify(source)

  useEffect(() => {
    if (mode === 'edit' || image) return
    let cancelled = false
    setLoading(true)
    const src: ImageSource = JSON.parse(sourceKey)
    const load =
      src.kind === 'commit'
        ? window.git.commitFileDiff(repoPath, src.hash, file.path)
        : window.git.fileDiff(repoPath, file.path, src.staged, file.status)
    load
      .then((d) => !cancelled && setDiff(d))
      .catch((e) => !cancelled && setDiff(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [repoPath, file.path, file.status, sourceKey, mode, image])

  const label = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path

  return (
    <div className="file-viewer">
      <div className="file-viewer-bar">
        <span className={`status-letter ${file.status}`}>{file.status}</span>
        <span className="file-viewer-title" title={label}>
          {label}
        </span>
        <span className="muted">{sourceLabel(source)}</span>
        {mode === 'diff' && canEdit(file) && (
          <button onClick={() => onChange({ ...request, mode: 'edit' })} title="Edit the working copy">
            ✎ Edit
          </button>
        )}
        <button onClick={onClose} title="Back to the commit graph (Esc)">
          ✕ Close
        </button>
      </div>
      {mode === 'edit' ? (
        <Editor
          key={file.path}
          repoPath={repoPath}
          file={file.path}
          shell={shell}
          onClose={() => onChange({ ...request, mode: 'diff' })}
          onSaved={onSaved}
        />
      ) : image ? (
        <ImageDiff key={sourceKey + file.path} repoPath={repoPath} file={file.path} oldPath={file.oldPath} source={source} />
      ) : (
        <DiffView text={diff} loading={loading} empty="No textual changes" />
      )}
    </div>
  )
}
