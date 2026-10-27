import { useEffect, useState } from 'react'
import type { RepoStatus, StatusFile } from '@shared/types'
import type { Actions } from '../actions'
import type { MenuItem } from './ContextMenu'
import { FileList, FileViewToggle } from './FileList'
import { canEdit, type FileViewRequest } from './FileViewer'
import { copyToClipboard, errorMessage, revealInFolder, revealLabel } from '../util'

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
  const [working, setWorking] = useState<string | null>(null)
  const operation = status.operation
  const conflicted = new Set(status.conflicted)
  const conflictFiles = status.unstaged.filter((f) => conflicted.has(f.path))
  const unstagedFiles = status.unstaged.filter((f) => !conflicted.has(f.path))

  useEffect(() => {
    if (operation?.message && !message) setMessage(operation.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation?.kind])

  useEffect(() => {
    if (!viewing || viewing.source.kind !== 'worktree') return
    const list = viewing.source.staged ? status.staged : status.unstaged
    if (!list.some((f) => f.path === viewing.file.path)) onView(null)
  }, [status, viewing, onView])

  const run = async (fn: () => Promise<void>, key = 'action'): Promise<void> => {
    setWorking(key)
    try {
      await fn()
    } catch (e) {
      actions.showError(errorMessage(e))
    } finally {
      setWorking(null)
      actions.refresh()
    }
  }

  const stage = (files: string[], key = 'stage'): Promise<void> => run(() => window.git.stage(repoPath, files), key)
  const unstage = (files: string[], key = 'unstage'): Promise<void> => run(() => window.git.unstage(repoPath, files), key)
  const discard = async (files: string[]): Promise<void> => {
    const ok = await actions.confirm(
      'Discard changes',
      `Discard changes to ${files.length === 1 ? files[0] : `${files.length} files`}? This cannot be undone.`,
      true
    )
    if (ok) await run(() => window.git.discard(repoPath, files), 'discard')
  }

  const commit = async (): Promise<void> => {
    if (!message.trim() && !amend) return
    await run(async () => {
      await window.git.commit(repoPath, message.trim(), amend)
      setMessage('')
      setAmend(false)
    }, 'commit')
  }

  const view = (area: Area, file: StatusFile, mode: 'diff' | 'edit' | 'conflict'): void => {
    if (mode === 'edit' && !canEdit(file)) mode = 'diff'
    onView({ file, source: { kind: 'worktree', staged: area === 'staged', status: file.status }, mode })
  }

  const resolveWith = (file: StatusFile, side: 'ours' | 'theirs'): Promise<void> =>
    run(() => window.git.resolveFile(repoPath, file.path, null, side))

  const abort = async (): Promise<void> => {
    if (!operation) return
    const ok = await actions.confirm(`Abort ${operation.kind}`, `Abort the ${operation.kind} in progress and restore the previous state?`, true)
    if (ok) await run(() => window.git.abortOperation(repoPath), 'abort')
  }

  const continueOp = async (): Promise<void> => {
    await run(async () => {
      await window.git.continueOperation(repoPath, message)
      setMessage('')
    }, 'continue')
  }

  const fileMenu =
    (area: Area | 'conflict') =>
    (e: React.MouseEvent, files: StatusFile[], folder: string | null): void => {
      e.preventDefault()
      const paths = files.map((f) => f.path)
      const noun = folder ? 'folder' : 'file'
      const items: MenuItem[] = []
      if (area === 'unstaged') {
        items.push({ label: `Stage ${noun}`, onClick: () => stage(paths) })
        items.push({ label: `Discard changes in ${noun}`, danger: true, onClick: () => discard(paths) })
      } else if (area === 'staged') {
        items.push({ label: `Unstage ${noun}`, onClick: () => unstage(paths) })
      } else {
        const takeAll = (side: 'ours' | 'theirs'): Promise<void> =>
          run(async () => {
            for (const p of paths) await window.git.resolveFile(repoPath, p, null, side)
          })
        items.push({ label: folder ? 'Take ours for folder' : 'Take ours', onClick: () => takeAll('ours') })
        items.push({ label: folder ? 'Take theirs for folder' : 'Take theirs', onClick: () => takeAll('theirs') })
      }
      if (!folder && area !== 'conflict' && canEdit(files[0])) {
        items.push({ separator: true })
        items.push({ label: 'Edit', onClick: () => view(area, files[0], 'edit') })
      }
      items.push({ separator: true })
      items.push({ label: revealLabel(), onClick: () => revealInFolder(repoPath, folder ?? files[0].path) })
      items.push({
        label: 'Copy path',
        onClick: () => {
          const p = folder ?? files[0].path
          void copyToClipboard(p)
          actions.showInfo(`Copied ${p}`)
        }
      })
      actions.openMenu(e, items)
    }

  const opLabel = operation
    ? { merge: 'Merge', 'cherry-pick': 'Cherry-pick', revert: 'Revert', rebase: 'Rebase' }[operation.kind]
    : ''

  const selectedIn = (area: Area): string | null =>
    viewing && viewing.source.kind === 'worktree' && viewing.source.staged === (area === 'staged')
      ? viewing.file.path
      : null

  const unstagedPaths = unstagedFiles.map((f) => f.path)
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
      {operation && (
        <div className={`operation-banner${conflictFiles.length ? ' conflicted' : ''}`}>
          <div className="operation-text">
            <strong>{opLabel} in progress</strong>
            <span className="muted">
              {conflictFiles.length
                ? `${conflictFiles.length} file${conflictFiles.length === 1 ? '' : 's'} with conflicts to resolve`
                : operation.message || 'All conflicts resolved'}
            </span>
          </div>
          <button disabled={!!working} aria-busy={working === 'abort'} onClick={abort}>Abort</button>
          <button className="primary" disabled={!!working || conflictFiles.length > 0} aria-busy={working === 'continue'} onClick={continueOp}>
            {operation.kind === 'merge' ? 'Commit merge' : 'Continue'}
          </button>
        </div>
      )}
      <div className="panel-body">
        {conflictFiles.length > 0 && (
          <>
            <div className="file-group-title conflicts">
              <span>Conflicts ({conflictFiles.length})</span>
            </div>
            <FileList
              files={conflictFiles}
              selectedPath={selectedIn('unstaged')}
              onSelect={(f) => view('unstaged', f, 'conflict')}
              onDoubleClick={(f) => view('unstaged', f, 'conflict')}
              onContextMenu={fileMenu('conflict')}
              actions={(f) => (
                <span className="actions" onClick={(e) => e.stopPropagation()}>
                  <button title="Resolve in editor" onClick={() => view('unstaged', f, 'conflict')}>⚡</button>
                  <button title="Take ours" onClick={() => resolveWith(f, 'ours')}>Ours</button>
                  <button title="Take theirs" onClick={() => resolveWith(f, 'theirs')}>Theirs</button>
                </span>
              )}
            />
          </>
        )}
        <div className="file-group-title">
          <span>Unstaged ({unstagedFiles.length})</span>
          <button disabled={!!working || !unstagedFiles.length} aria-busy={working === 'stage-all'} onClick={() => stage(unstagedPaths, 'stage-all')}>
            Stage all
          </button>
        </div>
        <FileList
          files={unstagedFiles}
          selectedPath={selectedIn('unstaged')}
          onSelect={(f) => view('unstaged', f, 'diff')}
          onDoubleClick={(f) => view('unstaged', f, 'edit')}
          onContextMenu={fileMenu('unstaged')}
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
          <button disabled={!!working || !status.staged.length} aria-busy={working === 'unstage-all'} onClick={() => unstage(stagedPaths, 'unstage-all')}>
            Unstage all
          </button>
        </div>
        <FileList
          files={status.staged}
          selectedPath={selectedIn('staged')}
          onSelect={(f) => view('staged', f, 'diff')}
          onDoubleClick={(f) => view('staged', f, 'edit')}
          onContextMenu={fileMenu('staged')}
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
          {operation ? (
            <button className="primary" disabled={!!working || conflictFiles.length > 0} aria-busy={working === 'continue'} onClick={continueOp}>
              {operation.kind === 'merge' ? 'Commit merge' : `Continue ${operation.kind}`}
            </button>
          ) : (
            <button className="primary" disabled={!!working || !canCommit} aria-busy={working === 'commit'} onClick={commit}>
              {amend ? 'Amend commit' : `Commit ${status.staged.length ? `(${status.staged.length})` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
