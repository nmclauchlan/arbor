import { useEffect, useRef, useState } from 'react'
import type { RepoStatus, StatusFile } from '@shared/types'
import type { Actions } from '../actions'
import type { MenuItem } from './ContextMenu'
import { FileList, FileViewToggle } from './FileList'
import { canEdit, type FileViewRequest } from './FileViewer'
import { copyToClipboard, errorMessage, revealInFolder, revealLabel } from '../util'
import { Icon } from './Icon'

type Area = 'staged' | 'unstaged'

const SUMMARY_LIMIT = 72

export function WorkingTree({
  repoPath,
  status,
  actions,
  viewing,
  onView,
  draft,
  onDraftUsed,
  branch
}: {
  repoPath: string
  status: RepoStatus
  actions: Actions
  viewing: FileViewRequest | null
  onView: (request: FileViewRequest | null) => void
  draft?: string | null
  onDraftUsed?: () => void
  branch?: string | null
}): React.JSX.Element {
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amendPrefill, setAmendPrefill] = useState<string | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const spaceQueue = useRef<Promise<void>>(Promise.resolve())
  const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()
  const setMessage = (text: string): void => {
    const [first = '', ...rest] = text.split('\n')
    setSummary(first.trim())
    setDescription(rest.join('\n').replace(/^\s*\n/, '').trimEnd())
  }
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
    if (!draft) return
    if (!message) setMessage(draft)
    onDraftUsed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  useEffect(() => {
    if (!viewing || viewing.source.kind !== 'worktree') return
    const staged = viewing.source.staged
    const key = (e: KeyboardEvent): void => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, button, [contenteditable="true"], .cm-editor')) return
      if (document.querySelector('.overlay, .dialog, .context-menu-root') || conflicted.has(viewing.file.path)) return
      e.preventDefault()
      const list = staged ? status.staged : unstagedFiles
      const at = list.findIndex((f) => f.path === viewing.file.path)
      const next = list[at + 1] ?? list[at - 1]
      const file = viewing.file.path
      const task = (): Promise<void> => (staged ? unstage : stage)([file])
      spaceQueue.current = spaceQueue.current.then(task, task)
      if (next) view(staged ? 'staged' : 'unstaged', next, 'diff')
      else onView(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

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
    if ((!message && !amend) || working === 'commit') return
    await run(async () => {
      if (stageAllFirst) await window.git.stage(repoPath, unstagedPaths)
      await window.git.commit(repoPath, message, amend)
      setMessage('')
      setAmend(false)
      setAmendPrefill(null)
    }, 'commit')
  }

  const toggleAmend = async (on: boolean): Promise<void> => {
    setAmend(on)
    if (on && !message) {
      const head = await window.git.commitDetails(repoPath, 'HEAD').catch(() => null)
      if (!head) return
      const text = head.body ? `${head.subject}\n\n${head.body}` : head.subject
      setMessage(text)
      setAmendPrefill(text)
    } else if (!on && amendPrefill !== null && message === amendPrefill) {
      setMessage('')
      setAmendPrefill(null)
    }
  }

  const view = (area: Area, file: StatusFile, mode: FileViewRequest['mode']): void => {
    if (mode === 'edit' && !canEdit(file)) mode = 'diff'
    onView({ file, source: { kind: 'worktree', staged: area === 'staged', status: file.status }, mode })
  }

  const toggle = (area: Area, file: StatusFile, mode: 'diff' | 'conflict'): void => {
    const open = viewing?.source.kind === 'worktree' && viewing.source.staged === (area === 'staged') && viewing.file.path === file.path
    if (open) onView(null)
    else view(area, file, mode)
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
        items.push({ icon: 'plus', label: `Stage ${noun}`, onClick: () => stage(paths) })
        items.push({ icon: 'undo', label: `Discard changes in ${noun}`, danger: true, onClick: () => discard(paths) })
        items.push({ icon: 'stash', label: `Stash ${noun}…`, onClick: () => actions.stash(paths) })
        if (files.every((f) => f.status === '?')) {
          const file = folder ? null : files[0].path
          const dir = folder ?? (file!.includes('/') ? file!.slice(0, file!.lastIndexOf('/')) : null)
          const ext = file && /\.[^./]+$/.exec(file.slice(file.lastIndexOf('/') + 1))?.[0]
          items.push({ separator: true })
          if (file) items.push({ icon: 'eyeOff', label: 'Ignore file', onClick: () => actions.ignore('file', file) })
          if (ext) items.push({ label: `Ignore all ${ext} files`, onClick: () => actions.ignore('extension', ext) })
          if (dir) items.push({ label: folder ? 'Ignore folder' : `Ignore folder ${dir}/`, onClick: () => actions.ignore('folder', dir) })
        }
      } else if (area === 'staged') {
        items.push({ icon: 'minus', label: `Unstage ${noun}`, onClick: () => unstage(paths) })
        items.push({ icon: 'stash', label: `Stash ${noun}…`, onClick: () => actions.stash(paths) })
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
        items.push({ icon: 'edit', label: 'Edit', onClick: () => view(area, files[0], 'edit') })
      }
      if (!folder && area !== 'conflict' && files[0].status !== '?') {
        items.push({ separator: true })
        items.push({ label: 'File history', onClick: () => view(area, files[0], 'history') })
        if (canEdit(files[0])) items.push({ label: 'Blame', onClick: () => view(area, files[0], 'blame') })
      }
      items.push({ separator: true })
      items.push({ icon: 'folder', label: revealLabel(), onClick: () => revealInFolder(repoPath, folder ?? files[0].path) })
      items.push({
        icon: 'copy',
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
  const stageAllFirst = !amend && !operation && status.staged.length === 0 && unstagedFiles.length > 0
  const canCommit = amend || (!!summary.trim() && (status.staged.length > 0 || stageAllFirst))
  const files = (n: number): string => `${n} file${n === 1 ? '' : 's'}`
  const onto = branch ? ` to ${branch}` : ''
  const commitLabel = amend
    ? status.staged.length
      ? `Amend with ${files(status.staged.length)}`
      : 'Amend last commit'
    : stageAllFirst
      ? `Stage all and commit ${files(unstagedFiles.length)}${onto}`
      : status.staged.length
        ? `Commit ${files(status.staged.length)}${onto}`
        : 'Commit'

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
              onSelect={(f) => toggle('unstaged', f, 'conflict')}
              onDoubleClick={(f) => view('unstaged', f, 'conflict')}
              onContextMenu={fileMenu('conflict')}
              actions={(f) => (
                <span className="actions" onClick={(e) => e.stopPropagation()}>
                  <button title="Resolve in editor" aria-label="Resolve in editor" onClick={() => view('unstaged', f, 'conflict')}>
                    <Icon name="conflict" size={14} />
                  </button>
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
          onSelect={(f) => toggle('unstaged', f, 'diff')}
          onDoubleClick={(f) => view('unstaged', f, 'edit')}
          onContextMenu={fileMenu('unstaged')}
          actions={(f) => (
            <span className="actions" onClick={(e) => e.stopPropagation()}>
              {canEdit(f) && (
                <button title="Edit" aria-label="Edit" onClick={() => view('unstaged', f, 'edit')}>
                  <Icon name="edit" size={14} />
                </button>
              )}
              <button title="Discard" aria-label="Discard" onClick={() => discard([f.path])}>
                <Icon name="undo" size={14} />
              </button>
              <button title="Stage" aria-label="Stage" onClick={() => stage([f.path])}>
                <Icon name="plus" size={14} />
              </button>
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
          onSelect={(f) => toggle('staged', f, 'diff')}
          onDoubleClick={(f) => view('staged', f, 'edit')}
          onContextMenu={fileMenu('staged')}
          actions={(f) => (
            <span className="actions" onClick={(e) => e.stopPropagation()}>
              {canEdit(f) && (
                <button title="Edit" aria-label="Edit" onClick={() => view('staged', f, 'edit')}>
                  <Icon name="edit" size={14} />
                </button>
              )}
              <button title="Unstage" aria-label="Unstage" onClick={() => unstage([f.path])}>
                <Icon name="minus" size={14} />
              </button>
            </span>
          )}
        />
      </div>
      <div className="commit-form">
        <div className="commit-summary">
          <input
            aria-label="Commit summary"
            placeholder="Summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (summary || !text.includes('\n')) return
              e.preventDefault()
              setMessage(description ? `${text.trimEnd()}\n\n${description}` : text)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (e.ctrlKey || e.metaKey) void commit()
              else descriptionRef.current?.focus()
            }}
          />
          {summary.length > 0 && (
            <span
              className={`commit-summary-count${summary.length > SUMMARY_LIMIT ? ' over' : ''}`}
              title={`Summaries of ${SUMMARY_LIMIT} characters or fewer read best in logs and pull requests`}
            >
              {SUMMARY_LIMIT - summary.length}
            </span>
          )}
        </div>
        <textarea
          ref={descriptionRef}
          aria-label="Commit description"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void commit()
          }}
        />
        <div className="row">
          <label>
            <input type="checkbox" checked={amend} onChange={(e) => void toggleAmend(e.target.checked)} /> Amend
          </label>
          <div style={{ flex: 1 }} />
          {operation ? (
            <button className="primary" disabled={!!working || conflictFiles.length > 0} aria-busy={working === 'continue'} onClick={continueOp}>
              {operation.kind === 'merge' ? 'Commit merge' : `Continue ${operation.kind}`}
            </button>
          ) : (
            <button className="primary commit-button" disabled={!!working || !canCommit} aria-busy={working === 'commit'} onClick={() => void commit()} title={commitLabel}>
              {commitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
