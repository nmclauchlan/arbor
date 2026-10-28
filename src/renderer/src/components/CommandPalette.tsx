import { useEffect, useMemo, useRef, useState } from 'react'
import type { Command } from '../commands'
import { highlight, run, subsequence } from '../fuzzy'

interface Match {
  command: Command
  rank: number
  marks: number[]
}

function match(command: Command, q: string): Match | null {
  if (!q) return { command, rank: 0, marks: [] }
  const title = command.title.toLowerCase()
  const at = title.indexOf(q)
  if (at >= 0) return { command, rank: at === 0 ? 0 : 1, marks: run(at, q.length) }
  const words = q.split(/\s+/).filter(Boolean)
  const haystack = `${command.group} ${title}`.toLowerCase()
  if (words.length > 1 && words.every((w) => haystack.includes(w))) return { command, rank: 2, marks: [] }
  const marks = subsequence(title, q.replace(/\s+/g, ''))
  if (marks) return { command, rank: 3, marks }
  if (command.group.toLowerCase().includes(q)) return { command, rank: 4, marks: [] }
  return null
}

export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const results = useMemo(
    () =>
      commands
        .map((c) => match(c, q))
        .filter((m): m is Match => !!m)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 200),
    [commands, q]
  )
  const active = Math.min(index, Math.max(results.length - 1, 0))

  useEffect(() => {
    list.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  const pick = (command: Command): void => {
    onClose()
    command.run()
  }

  const key = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!results.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setIndex((active + step + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[active]) pick(results[active].command)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="overlay switcher-overlay" onMouseDown={onClose}>
      <div className="dialog repo-switcher command-palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="repo-switcher-input"
          autoFocus
          value={query}
          placeholder="Type a command, branch or action"
          spellCheck={false}
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-list"
          aria-activedescendant={results.length ? `command-palette-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={key}
        />
        <div className="repo-switcher-list" id="command-palette-list" role="listbox" ref={list}>
          {results.map((r, i) => (
            <div
              key={r.command.id}
              id={`command-palette-${i}`}
              role="option"
              aria-selected={i === active}
              className={`repo-switcher-item command-item${i === active ? ' selected' : ''}`}
              onMouseMove={() => i !== active && setIndex(i)}
              onClick={() => pick(r.command)}
            >
              <span className="name">{highlight(r.command.title, r.marks)}</span>
              <span className="meta">
                <span>{r.command.group}</span>
                {r.command.shortcut && <kbd>{r.command.shortcut}</kbd>}
              </span>
            </div>
          ))}
          {!results.length && <div className="repo-switcher-empty">No commands match "{query.trim()}"</div>}
        </div>
        <div className="repo-switcher-hint">↑ ↓ to choose · Enter to run · Esc to close</div>
      </div>
    </div>
  )
}
