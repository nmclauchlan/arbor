import { useEffect, useMemo, useRef, useState } from 'react'
import { highlight, run, subsequence } from '../fuzzy'

export interface SwitcherEntry {
  path: string
  name: string
  detail: string
  open: boolean
}

interface Match {
  entry: SwitcherEntry
  rank: number
  marks: number[]
}

function match(entry: SwitcherEntry, q: string): Match | null {
  if (!q) return { entry, rank: 0, marks: [] }
  const name = entry.name.toLowerCase()
  const at = name.indexOf(q)
  if (at >= 0) return { entry, rank: at === 0 ? 0 : 1, marks: run(at, q.length) }
  const compact = q.replace(/\s+/g, '')
  const marks = subsequence(name, compact)
  if (marks) return { entry, rank: 2, marks }
  const detail = entry.detail.toLowerCase()
  const path = entry.path.toLowerCase().replace(/\\/g, '/')
  if (detail.includes(q) || path.includes(q.replace(/\\/g, '/'))) return { entry, rank: 3, marks: [] }
  if (subsequence(detail, compact)) return { entry, rank: 4, marks: [] }
  return null
}

export function RepoSwitcher({
  entries,
  onPick,
  onClose
}: {
  entries: SwitcherEntry[]
  onPick: (entry: SwitcherEntry) => void
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const q = query.trim().toLowerCase()
  const results = useMemo(
    () =>
      entries
        .map((e) => match(e, q))
        .filter((m): m is Match => !!m)
        .sort((a, b) => a.rank - b.rank),
    [entries, q]
  )
  const active = Math.min(index, Math.max(results.length - 1, 0))

  useEffect(() => {
    list.current?.querySelector('.selected')?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  const key = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!results.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setIndex((active + step + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[active]) onPick(results[active].entry)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="overlay switcher-overlay" onMouseDown={onClose}>
      <div className="dialog repo-switcher" role="dialog" aria-label="Go to repository" onMouseDown={(e) => e.stopPropagation()}>
        <input
          className="repo-switcher-input"
          autoFocus
          value={query}
          placeholder="Go to repository by name, group or path"
          spellCheck={false}
          role="combobox"
          aria-expanded="true"
          aria-controls="repo-switcher-list"
          aria-activedescendant={results.length ? `repo-switcher-${active}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={key}
        />
        <div className="repo-switcher-list" id="repo-switcher-list" role="listbox" ref={list}>
          {results.map((r, i) => (
            <div
              key={r.entry.path}
              id={`repo-switcher-${i}`}
              role="option"
              aria-selected={i === active}
              className={`repo-switcher-item${i === active ? ' selected' : ''}`}
              title={r.entry.path}
              onMouseMove={() => i !== active && setIndex(i)}
              onClick={() => onPick(r.entry)}
            >
              <span className="name">{highlight(r.entry.name, r.marks)}</span>
              <span className="meta">
                {r.entry.detail && <span>{r.entry.detail}</span>}
                {r.entry.open && <span className="open-badge">open</span>}
              </span>
              <span className="path">{r.entry.path}</span>
            </div>
          ))}
          {!results.length && <div className="repo-switcher-empty">{entries.length ? `No repositories match "${query.trim()}"` : 'No repositories yet. Open or clone one first.'}</div>}
        </div>
        <div className="repo-switcher-hint">↑ ↓ to choose · Enter to open · Esc to close</div>
      </div>
    </div>
  )
}
