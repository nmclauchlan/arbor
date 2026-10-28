import { useEffect, useState } from 'react'
import type { StashOptions } from '@shared/types'

export function StashDialog({
  paths,
  onStash,
  onClose
}: {
  paths?: string[]
  onStash: (options: StashOptions) => void
  onClose: () => void
}): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(true)
  const [keepIndex, setKeepIndex] = useState(false)

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const submit = (): void => onStash({ message: message.trim(), includeUntracked, keepIndex, paths })
  const what = !paths?.length ? 'changes' : paths.length === 1 ? paths[0] : `${paths.length} files`

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog stash-dialog" role="dialog" aria-label="Stash changes" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Stash {what}</h3>
        <input
          autoFocus
          value={message}
          placeholder="Message (optional)"
          aria-label="Stash message"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <label className="pr-draft-row">
          <input type="checkbox" checked={includeUntracked} onChange={(e) => setIncludeUntracked(e.target.checked)} /> Include untracked files
        </label>
        <label className="pr-draft-row">
          <input type="checkbox" checked={keepIndex} onChange={(e) => setKeepIndex(e.target.checked)} /> Keep staged changes in the working tree
        </label>
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit}>
            Stash
          </button>
        </div>
      </div>
    </div>
  )
}
