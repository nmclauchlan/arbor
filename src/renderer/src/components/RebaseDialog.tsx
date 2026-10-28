import { useEffect, useRef, useState } from 'react'
import type { RebaseAction, RebaseCommit, RebaseStep } from '@shared/types'
import { Loading } from './Spinner'
import { errorMessage, shortHash } from '../util'

const ACTIONS: { id: RebaseAction; label: string }[] = [
  { id: 'pick', label: 'Pick' },
  { id: 'reword', label: 'Reword' },
  { id: 'squash', label: 'Squash' },
  { id: 'fixup', label: 'Fixup' },
  { id: 'drop', label: 'Drop' }
]

interface Row extends RebaseCommit {
  action: RebaseAction
  draft: string
}

export function RebaseDialog({
  repoPath,
  base,
  preset = {},
  onStart,
  onClose
}: {
  repoPath: string
  base: string
  preset?: Record<string, RebaseAction>
  onStart: (steps: RebaseStep[]) => void
  onClose: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [original, setOriginal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const focusRef = useRef<HTMLDivElement>(null)
  const presetKey = JSON.stringify(preset)

  useEffect(() => {
    let cancelled = false
    const initial = JSON.parse(presetKey) as Record<string, RebaseAction>
    window.git
      .rebaseCommits(repoPath, base)
      .then((list) => {
        if (cancelled) return
        setOriginal(list.map((c) => c.hash).join(','))
        setRows(list.map((c) => ({ ...c, action: initial[c.hash] ?? 'pick', draft: c.message.trim() })))
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [repoPath, base, presetKey])

  const loaded = rows !== null
  useEffect(() => {
    if (!loaded) return
    focusRef.current?.scrollIntoView({ block: 'nearest' })
    focusRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  }, [loaded])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const update = (i: number, patch: Partial<Row>): void => setRows((r) => r && r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const move = (from: number, to: number): void =>
    setRows((r) => {
      if (!r || to < 0 || to >= r.length || from === to) return r
      const next = [...r]
      const [row] = next.splice(from, 1)
      next.splice(to, 0, row)
      return next
    })

  const merges = rows?.some((r) => r.merge)
  const firstKept = rows?.find((r) => r.action !== 'drop')
  const problem = !rows
    ? null
    : merges
      ? "This range contains merge commits, which interactive rebase can't keep. Start from a commit after the last merge."
      : !firstKept
        ? 'Every commit is set to drop. Keep at least one, or reset the branch instead.'
        : firstKept.action === 'squash' || firstKept.action === 'fixup'
          ? `"${firstKept.subject}" has no earlier commit to fold into. Pick it, or move it below another commit.`
          : rows.some((r) => r.action === 'reword' && !r.draft.trim())
            ? 'A reworded commit needs a message.'
            : null
  const changed = !!rows && (rows.some((r) => r.action !== 'pick') || rows.map((r) => r.hash).join(',') !== original)
  const steps = (): RebaseStep[] =>
    (rows ?? []).map((r) => ({ hash: r.hash, action: r.action, message: r.action === 'reword' ? r.draft.trim() : undefined }))

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog rebase-dialog" role="dialog" aria-label="Interactive rebase" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Interactive rebase</h3>
        <p className="muted">
          Rewriting the commits after {shortHash(base)}. Commits are applied top to bottom; squash and fixup fold a commit into the one above it.
        </p>
        {error && <div className="settings-note error">{error}</div>}
        {!rows && !error && <Loading className="placeholder" />}
        {rows && (
          <div className="rebase-list">
            {rows.map((r, i) => (
              <div
                key={r.hash}
                ref={preset[r.hash] ? focusRef : undefined}
                className={`rebase-row ${r.action}${dragging === i ? ' dragging' : ''}`}
                data-hash={r.hash}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDragging(i)
                }}
                onDragOver={(e) => {
                  if (dragging === null) return
                  e.preventDefault()
                  if (dragging !== i) {
                    move(dragging, i)
                    setDragging(i)
                  }
                }}
                onDragEnd={() => setDragging(null)}
              >
                <div className="rebase-row-head">
                  <span className="grip" aria-hidden="true">
                    ⋮⋮
                  </span>
                  <select value={r.action} aria-label={`Action for ${r.subject}`} onChange={(e) => update(i, { action: e.target.value as RebaseAction })}>
                    {ACTIONS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <span className="mono sha">{shortHash(r.hash)}</span>
                  <span className="subject" title={r.message}>
                    {r.subject}
                  </span>
                  <span className="muted author">{r.author}</span>
                  <button className="icon" aria-label={`Move ${r.subject} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    ▲
                  </button>
                  <button className="icon" aria-label={`Move ${r.subject} down`} disabled={i === rows.length - 1} onClick={() => move(i, i + 1)}>
                    ▼
                  </button>
                </div>
                {r.action === 'reword' && (
                  <textarea
                    value={r.draft}
                    rows={Math.min(8, Math.max(2, r.draft.split('\n').length))}
                    aria-label={`New message for ${r.subject}`}
                    onChange={(e) => update(i, { draft: e.target.value })}
                  />
                )}
              </div>
            ))}
            {!rows.length && <div className="placeholder">There are no commits after this one on the current branch.</div>}
          </div>
        )}
        {problem && <div className="settings-note error">{problem}</div>}
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!rows?.length || !!problem || !changed}
            onClick={() => {
              onStart(steps())
              onClose()
            }}
          >
            Rebase {rows?.length ?? 0} commit{rows?.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
