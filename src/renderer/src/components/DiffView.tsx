import { useMemo, useState } from 'react'
import { buildPatch, isPartiallyPatchable, parsePatch, type ParsedPatch } from '@shared/patch'
import { Loading } from './Spinner'

export type ApplyMode = 'stage' | 'unstage' | 'discard'

const LABELS: Record<ApplyMode, string> = { stage: 'Stage', unstage: 'Unstage', discard: 'Discard' }

interface Row {
  kind: 'add' | 'del' | 'ctx' | 'hunk' | 'meta'
  text: string
  oldNo?: number
  newNo?: number
  hunk?: number
  line?: number
}

function headerNotes(header: string[]): string[] {
  const notes: string[] = []
  let oldMode = ''
  let similarity = ''
  for (const h of header) {
    let m: RegExpExecArray | null
    if (!h.trim() || /^(diff --git |index |--- |\+\+\+ |rename to |copy to |dissimilarity index )/.test(h)) continue
    if (/^new file\b/.test(h)) notes.push('New file')
    else if (/^deleted file\b/.test(h)) notes.push('Deleted file')
    else if ((m = /^old mode (\d+)/.exec(h))) oldMode = m[1]
    else if ((m = /^new mode (\d+)/.exec(h))) notes.push(`File mode changed from ${oldMode} to ${m[1]}`)
    else if ((m = /^similarity index (\d+%)/.exec(h))) similarity = m[1]
    else if ((m = /^rename from (.*)/.exec(h))) notes.push(`Renamed from ${m[1]}${similarity && similarity !== '100%' ? ` (${similarity} similar)` : ''}`)
    else if ((m = /^copy from (.*)/.exec(h))) notes.push(`Copied from ${m[1]}`)
    else if (/^Binary files .* differ$/.test(h)) notes.push('Binary file changed')
    else notes.push(h)
  }
  return notes
}

function layoutRows(p: ParsedPatch): Row[] {
  const rows: Row[] = []
  for (const note of headerNotes(p.header)) rows.push({ kind: 'meta', text: note })
  p.hunks.forEach((h, hi) => {
    const oldCount = h.lines.filter((l) => l.op === ' ' || l.op === '-').length
    const newCount = h.lines.filter((l) => l.op === ' ' || l.op === '+').length
    rows.push({ kind: 'hunk', text: `@@ -${h.oldStart},${oldCount} +${h.newStart},${newCount} @@${h.heading}`, hunk: hi })
    let oldNo = h.oldStart
    let newNo = h.newStart
    h.lines.forEach((l, li) => {
      if (l.op === '+') rows.push({ kind: 'add', newNo: newNo++, text: l.text, hunk: hi, line: li })
      else if (l.op === '-') rows.push({ kind: 'del', oldNo: oldNo++, text: l.text, hunk: hi, line: li })
      else if (l.op === '\\') rows.push({ kind: 'meta', text: '\\' + l.text })
      else rows.push({ kind: 'ctx', oldNo: oldNo++, newNo: newNo++, text: l.text })
    })
  })
  return rows
}

const lineKey = (hunk: number, line: number): string => `${hunk}:${line}`

export function DiffView({
  text,
  loading,
  empty,
  modes,
  onApply
}: {
  text: string
  loading?: boolean
  empty?: string
  modes?: ApplyMode[]
  onApply?: (patch: string, mode: ApplyMode, lines: number) => Promise<void>
}): React.JSX.Element {
  const parsed = useMemo(() => parsePatch(text), [text])
  const rows = useMemo(() => layoutRows(parsed), [parsed])
  const changeKeys = useMemo(() => rows.filter((r) => r.kind === 'add' || r.kind === 'del').map((r) => lineKey(r.hunk!, r.line!)), [rows])
  const actions = modes && onApply && isPartiallyPatchable(parsed) ? modes : []
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shownText, setShownText] = useState(text)
  if (shownText !== text) {
    setShownText(text)
    setSelected(new Set())
    setAnchor(null)
  }

  const select = (key: string, range: boolean): void => {
    if (window.getSelection()?.toString()) return
    setSelected((s) => {
      const next = new Set(s)
      if (range && anchor) {
        const a = changeKeys.indexOf(anchor)
        const b = changeKeys.indexOf(key)
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(changeKeys[i])
      } else if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    if (!range) setAnchor(key)
  }

  const apply = async (mode: ApplyMode, pick: (hunk: number, line: number) => boolean, lines: number): Promise<void> => {
    const patch = buildPatch(parsed, pick, mode !== 'stage')
    if (!patch || !onApply) return
    setBusy(true)
    try {
      await onApply(patch, mode, lines)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="diff"><Loading className="placeholder" /></div>
  if (!text.trim()) return <div className="diff"><div className="placeholder">{empty ?? 'No changes'}</div></div>
  return (
    <div className={`diff${actions.length ? ' patchable' : ''}`}>
      {selected.size > 0 && (
        <div className="diff-selection" role="toolbar" aria-label="Selected lines">
          <span>
            {selected.size} line{selected.size === 1 ? '' : 's'} selected
          </span>
          {actions.map((m) => (
            <button
              key={m}
              className={m === 'discard' ? 'danger' : undefined}
              disabled={busy}
              onClick={() => void apply(m, (h, l) => selected.has(lineKey(h, l)), selected.size)}
            >
              {LABELS[m]} lines
            </button>
          ))}
          <button className="icon" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
      <table>
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === 'hunk') {
              const changes = parsed.hunks[r.hunk!].lines.filter((l) => l.op === '+' || l.op === '-').length
              return (
                <tr key={i} className="hunk">
                  <td className="ln" />
                  <td className="ln" />
                  <td>
                    <span className="hunk-text">{r.text}</span>
                    {actions.length > 0 && (
                      <span className="hunk-actions">
                        {actions.map((m) => (
                          <button
                            key={m}
                            className={m === 'discard' ? 'danger' : undefined}
                            disabled={busy}
                            onClick={() => void apply(m, (h) => h === r.hunk, changes)}
                          >
                            {LABELS[m]} chunk
                          </button>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              )
            }
            const key = r.kind === 'add' || r.kind === 'del' ? lineKey(r.hunk!, r.line!) : null
            const selectable = !!key && actions.length > 0
            const hint = selectable ? 'Click to select this line, Shift+click to select a range' : undefined
            return (
              <tr
                key={i}
                className={`${r.kind}${selectable ? ' selectable' : ''}${key && selected.has(key) ? ' selected' : ''}`}
                onMouseDown={selectable ? (e) => e.shiftKey && e.preventDefault() : undefined}
                onClick={selectable ? (e) => select(key!, e.shiftKey) : undefined}
              >
                <td className="ln" title={hint}>{r.kind === 'meta' ? '' : r.oldNo ?? ''}</td>
                <td className="ln" title={hint}>{r.kind === 'meta' ? '' : r.newNo ?? ''}</td>
                <td>
                  {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : r.kind === 'ctx' ? ' ' : ''}
                  {r.text}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
