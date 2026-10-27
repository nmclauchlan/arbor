import { useEffect, useRef } from 'react'
import type { CommitSearchMode } from '@shared/types'
import { Spinner } from './Spinner'

const MODES: { id: CommitSearchMode; label: string }[] = [
  { id: 'all', label: 'Message, author or SHA' },
  { id: 'message', label: 'Message' },
  { id: 'author', label: 'Author' },
  { id: 'sha', label: 'SHA' },
  { id: 'file', label: 'File path' },
  { id: 'code', label: 'Code change' }
]

export function CommitSearch({
  query,
  mode,
  focusKey,
  searching,
  total,
  position,
  older,
  onQuery,
  onMode,
  onStep,
  onClose
}: {
  query: string
  mode: CommitSearchMode
  focusKey: number
  searching: boolean
  total: number
  position: number
  older: number
  onQuery: (query: string) => void
  onMode: (mode: CommitSearchMode) => void
  onStep: (direction: 1 | -1) => void
  onClose: () => void
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [focusKey])

  const status = !query.trim() ? '' : total ? `${position || '–'} of ${total}` : 'No matches'
  return (
    <div className="commit-search" role="search">
      <input
        ref={input}
        type="search"
        value={query}
        placeholder="Search commits"
        aria-label="Search commits"
        spellCheck={false}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onStep(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }
        }}
      />
      <select value={mode} aria-label="Search in" onChange={(e) => onMode(e.target.value as CommitSearchMode)}>
        {MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <span className="commit-search-count" role="status">
        {searching ? <Spinner label="Searching" /> : status}
        {!searching && older > 0 ? ` · ${older} older not loaded` : ''}
      </span>
      <button className="icon" title="Previous match (Shift+Enter)" aria-label="Previous match" disabled={!total} onClick={() => onStep(-1)}>
        ↑
      </button>
      <button className="icon" title="Next match (Enter)" aria-label="Next match" disabled={!total} onClick={() => onStep(1)}>
        ↓
      </button>
      <button className="icon" title="Close (Esc)" aria-label="Close search" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}
