import { useEffect, useState } from 'react'
import { isImageFile, type ImageSource, type StatusFile } from '@shared/types'
import type { Shell } from '../actions'
import { ConflictResolver } from './ConflictResolver'
import { DiffView, type ApplyMode } from './DiffView'
import { FileHistory } from './FileHistory'
import { BlameView } from './BlameView'
import { Editor } from './Editor'
import { ImageDiff } from './ImageDiff'
import { errorMessage, shortHash } from '../util'

export interface FileViewRequest {
  file: StatusFile
  source: ImageSource
  mode: 'diff' | 'edit' | 'conflict' | 'history' | 'blame'
}

const VIEW_TABS = [
  { mode: 'diff', label: 'Diff' },
  { mode: 'history', label: 'History' },
  { mode: 'blame', label: 'Blame' }
] as const

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
  onSaved,
  onShowCommit
}: {
  repoPath: string
  request: FileViewRequest
  shell: Shell
  onChange: (request: FileViewRequest) => void
  onClose: () => void
  onSaved: () => void
  onShowCommit: (hash: string) => void
}): React.JSX.Element {
  const { file, source, mode } = request
  const [diff, setDiff] = useState('')
  const [loading, setLoading] = useState(false)
  const image = isImageFile(file.path)
  const sourceKey = JSON.stringify(source)

  useEffect(() => {
    if (mode === 'edit' || mode === 'history' || mode === 'blame' || image) return
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
  const modes: ApplyMode[] | undefined =
    source.kind === 'worktree' && file.status === 'M' ? (source.staged ? ['unstage'] : ['stage', 'discard']) : undefined

  const applyPatch = async (patch: string, how: ApplyMode, lines: number): Promise<void> => {
    if (source.kind !== 'worktree') return
    if (how === 'discard') {
      const ok = await shell.confirm('Discard changes', `Discard ${lines} changed line${lines === 1 ? '' : 's'} in ${file.path}? This cannot be undone.`, true)
      if (!ok) return
    }
    try {
      await window.git.applyPatch(repoPath, patch, how)
    } catch (e) {
      shell.showError(errorMessage(e))
      return
    }
    onSaved()
    const next = await window.git.fileDiff(repoPath, file.path, source.staged, file.status).catch(() => '')
    if (!next.trim() && how !== 'discard') onChange({ ...request, source: { ...source, staged: !source.staged } })
    else setDiff(next)
  }

  return (
    <div className="file-viewer">
      <div className="file-viewer-bar">
        <span className={`status-letter ${file.status}`}>{file.status}</span>
        <span className="file-viewer-title" title={label}>
          {label}
        </span>
        <span className="muted">{sourceLabel(source)}</span>
        {(mode === 'diff' || mode === 'history' || mode === 'blame') && file.status !== '?' && (
          <span className="view-tabs" role="tablist" aria-label="File view">
            {VIEW_TABS.filter((t) => t.mode !== 'blame' || (!image && file.status !== 'D')).map((t) => (
              <button key={t.mode} role="tab" aria-selected={mode === t.mode} className={mode === t.mode ? 'active' : ''} onClick={() => onChange({ ...request, mode: t.mode })}>
                {t.label}
              </button>
            ))}
          </span>
        )}
        {mode === 'diff' && canEdit(file) && (
          <button onClick={() => onChange({ ...request, mode: 'edit' })} title="Edit the working copy">
            ✎ Edit
          </button>
        )}
        <button onClick={onClose} title="Back to the commit graph (Esc)">
          ✕ Close
        </button>
      </div>
      {mode === 'conflict' ? (
        <ConflictResolver key={file.path} repoPath={repoPath} file={file.path} shell={shell} onResolved={onSaved} />
      ) : mode === 'edit' ? (
        <Editor
          key={file.path}
          repoPath={repoPath}
          file={file.path}
          shell={shell}
          onClose={() => onChange({ ...request, mode: 'diff' })}
          onSaved={onSaved}
        />
      ) : mode === 'history' ? (
        <FileHistory key={file.path} repoPath={repoPath} file={file.path} onShowCommit={onShowCommit} />
      ) : mode === 'blame' ? (
        <BlameView key={file.path + sourceKey} repoPath={repoPath} file={file.path} rev={source.kind === 'commit' ? source.hash : undefined} onShowCommit={onShowCommit} />
      ) : image ? (
        <ImageDiff key={sourceKey + file.path} repoPath={repoPath} file={file.path} oldPath={file.oldPath} source={source} />
      ) : (
        <DiffView text={diff} loading={loading} empty="No textual changes" modes={modes} onApply={applyPatch} />
      )}
    </div>
  )
}
