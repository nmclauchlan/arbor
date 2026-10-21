import { useEffect, useState } from 'react'
import type { RepoStatus, StatusFile } from '@shared/types'
import type { Actions } from '../actions'
import { FileList, FileViewToggle } from './FileList'
import { canEdit, type FileViewRequest } from './FileViewer'
import { errorMessage } from '../util'

type Area = 'staged' | 'unstaged'

export function WorkingTree({
  repoPath,
  status,
  actions,
  viewing,
  onView
}: {
  repoPath: string
  status: RepoStatus
  actions: Actions
  viewing: FileViewRequest | null
  onView: (request: FileViewRequest | null) => void
}): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!viewing || viewing.source.kind !== 'worktree') return
    const list = viewing.source.staged ? status.staged : status.unstaged
    if (!list.some((f) => f.path === viewing.file.path)) onView(null)
  }, [status, viewing, onView])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setWorking(true)
    try {
      await fn()
    } catch (e) {
      actions.showError(errorMessage(e))
    } finally {
      setWorking(false)
      actions.refresh()
    }
  }

  const stage = (files: string[]): Promise<void> => run(() => window.git.stage(repoPath, files))
  const unstage = (files: string[]): Promise<void> => run(() => window.git.unstage(repoPath, files))
  const discard = async (files: string[]): Promise<void> => {
    const ok = await actions.confirm(
      'Discard changes',
      `Discard changes to ${files.length === 1 ? files[0] : `${files.length} files`}? This cannot be undone.`,
      true
    )
    if (ok) await run(() => window.git.discard(repoPath, files))
  }

  const commit = async (): Promise<void> => {
    if (!message.trim() && !amend) return
    await run(async () => {
      await window.git.commit(repoPath, message.trim(), amend)
      setMessage('')
      setAmend(false)
    })
  }

  const view = (area: Area, file: StatusFile, mode: 'diff' | 'edit'): void => {
    if (mode === 'edit' && !canEdit(file)) mode = 'diff'
    onView({ file, source: { kind: 'worktree', staged: area === 'staged', status: file.status }, mode })
  }

  const selectedIn = (area: Area): string | null =>
    viewing && viewing.source.kind === 'worktree' && viewing.source.staged === (area === 'staged')
      ? viewing.file.path
      : null

  const unstagedPaths = status.unstaged.map((f) => f.path)
  const stagedPaths = status.staged.map((f) => f.path)
  const canCommit = (status.staged.length > 0 && message.trim().length > 0) || amend

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-header-row">
          <h3>Uncommitted changes</h3>
          <FileViewToggle />
        </div>
        <div className="meta">
          {status.staged.length} staged · {status.unstaged.length} unstaged
          {status.conflicted.length ? ` · ${status.conflicted.length} conflicted` : ''}
        </div>
      </div>
      <div className="panel-body">
        <div className="file-group-title">
          <span>Unstaged ({status.unstaged.length})</span>
          <button disabled={working || !status.unstaged.length} onClick={() => stage(unstagedPaths)}>
            Stage all
          </button>
        </div>
        <FileList
          files={status.unstaged}
          selectedPath={selectedIn('unstaged')}
          onSelect={(f) => view('unstaged', f, 'diff')}
          onDoubleClick={(f) => view('unstaged', f, 'edit')}
          actions={(f) => (
            <span className="actions" onClick={(e) => e.stopPropagation()}>
              {canEdit(f) && <button title="Edit" onClick={() => view('unstaged', f, 'edit')}>✎</button>}
              <button title="Discard" onClick={() => discard([f.path])}>↶</button>
              <button title="Stage" onClick={() => stage([f.path])}>+</button>
            </span>
          )}
        />
        <div className="file-group-title">
          <span>Staged ({status.staged.length})</span>
          <button disabled={working || !status.staged.length} onClick={() => unstage(stagedPaths)}>
            Unstage all
          </button>
        </div>
        <FileList
          files={status.staged}
          selectedPath={selectedIn('staged')}
          onSelect={(f) => view('staged', f, 'diff')}
          onDoubleClick={(f) => view('staged', f, 'edit')}
          actions={(f) => (
            <span className="actions" onClick={(e) => e.stopPropagation()}>
              {canEdit(f) && <button title="Edit" onClick={() => view('staged', f, 'edit')}>✎</button>}
              <button title="Unstage" onClick={() => unstage([f.path])}>−</button>
            </span>
          )}
        />
      </div>
      <div className="commit-form">
        <textarea
          placeholder="Commit message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commit()
          }}
        />
        <div className="row">
          <label>
            <input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> Amend
          </label>
          <div style={{ flex: 1 }} />
          <button className="primary" disabled={working || !canCommit} onClick={commit}>
            {amend ? 'Amend commit' : `Commit ${status.staged.length ? `(${status.staged.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
