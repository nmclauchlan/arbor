import { useEffect, useState } from 'react'
import { isImageFile, type RepoStatus, type StatusFile } from '@shared/types'
import type { Actions } from '../actions'
import { DiffView } from './DiffView'
import { Editor } from './Editor'
import { ImageDiff } from './ImageDiff'
import { FileRow } from './CommitPanel'
import { errorMessage } from '../util'

type Sel = { area: 'staged' | 'unstaged'; file: StatusFile } | null

export function WorkingTree({
  repoPath,
  status,
  actions
}: {
  repoPath: string
  status: RepoStatus
  actions: Actions
}): React.JSX.Element {
  const [sel, setSel] = useState<Sel>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [diff, setDiff] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (!sel) return
    const list = sel.area === 'staged' ? status.staged : status.unstaged
    if (!list.some((f) => f.path === sel.file.path)) setSel(null)
  }, [status, sel])

  useEffect(() => {
    if (!sel || editing || isImageFile(sel.file.path)) {
      if (!sel) setDiff('')
      return
    }
    let cancelled = false
    setLoadingDiff(true)
    window.git
      .fileDiff(repoPath, sel.file.path, sel.area === 'staged', sel.file.status)
      .then((d) => !cancelled && setDiff(d))
      .catch((e) => !cancelled && setDiff(errorMessage(e)))
      .finally(() => !cancelled && setLoadingDiff(false))
    return () => {
      cancelled = true
    }
  }, [repoPath, sel, status, editing])

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

  const edit = (f: StatusFile): void => {
    if (f.status === 'D' || isImageFile(f.path)) return
    setEditing(f.path)
  }

  const unstagedPaths = status.unstaged.map((f) => f.path)
  const stagedPaths = status.staged.map((f) => f.path)
  const canCommit = (status.staged.length > 0 && message.trim().length > 0) || amend

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>Uncommitted changes</h3>
        <div className="meta">
          {status.staged.length} staged · {status.unstaged.length} unstaged
          {status.conflicted.length ? ` · ${status.conflicted.length} conflicted` : ''}
        </div>
      </div>
      <div className="panel-split">
        <div>
          <div className="file-group-title">
            <span>Unstaged ({status.unstaged.length})</span>
            <button disabled={working || !status.unstaged.length} onClick={() => stage(unstagedPaths)}>
              Stage all
            </button>
          </div>
          {status.unstaged.map((f) => (
            <FileRow
              key={'u' + f.path}
              file={f}
              selected={sel?.area === 'unstaged' && sel.file.path === f.path}
              onClick={() => setSel({ area: 'unstaged', file: f })}
              onDoubleClick={() => edit(f)}
            >
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                {f.status !== 'D' && !isImageFile(f.path) && <button title="Edit" onClick={() => edit(f)}>✎</button>}
                <button title="Discard" onClick={() => discard([f.path])}>↶</button>
                <button title="Stage" onClick={() => stage([f.path])}>+</button>
              </span>
            </FileRow>
          ))}
          <div className="file-group-title">
            <span>Staged ({status.staged.length})</span>
            <button disabled={working || !status.staged.length} onClick={() => unstage(stagedPaths)}>
              Unstage all
            </button>
          </div>
          {status.staged.map((f) => (
            <FileRow
              key={'s' + f.path}
              file={f}
              selected={sel?.area === 'staged' && sel.file.path === f.path}
              onClick={() => setSel({ area: 'staged', file: f })}
              onDoubleClick={() => edit(f)}
            >
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                {f.status !== 'D' && !isImageFile(f.path) && <button title="Edit" onClick={() => edit(f)}>✎</button>}
                <button title="Unstage" onClick={() => unstage([f.path])}>−</button>
              </span>
            </FileRow>
          ))}
        </div>
        {editing ? (
          <Editor
            repoPath={repoPath}
            file={editing}
            shell={actions}
            onClose={() => setEditing(null)}
            onSaved={actions.refresh}
          />
        ) : sel && isImageFile(sel.file.path) ? (
          <ImageDiff
            key={sel.area + sel.file.path}
            repoPath={repoPath}
            file={sel.file.path}
            oldPath={sel.file.oldPath}
            source={{ kind: 'worktree', staged: sel.area === 'staged', status: sel.file.status }}
          />
        ) : (
          <DiffView
            text={diff}
            loading={loadingDiff}
            empty={sel ? 'No textual changes' : 'Select a file to view its diff, double-click to edit'}
          />
        )}
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
