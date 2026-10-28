import { useMemo, useState } from 'react'
import { buildPatch, isPartiallyPatchable, parsePatch, type ParsedPatch } from '@shared/patch'
import { Loading } from './Spinner'
import { setDiffPrefs, useDiffPrefs } from '../diffPrefs'
import { wordDiff, type Range } from '../wordDiff'

export type ApplyMode = 'stage' | 'unstage' | 'discard'

const LABELS: Record<ApplyMode, string> = { stage: 'Stage', unstage: 'Unstage', discard: 'Discard' }
const SELECT_HINT = 'Click to select this line, Shift+click to select a range'

interface Line {
  kind: 'add' | 'del' | 'ctx'
  text: string
  hunk: number
  line: number
  oldNo?: number
  newNo?: number
  marks?: Range[]
}

type Item = Line | { kind: 'meta'; text: string }

interface HunkView {
  index: number
  text: string
  changes: number
  items: Item[]
}

type SplitRow = { kind: 'hunk'; hunk: HunkView } | { kind: 'meta'; text: string } | { kind: 'pair'; left?: Line; right?: Line }

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

function markWords(items: Item[]): void {
  for (let i = 0; i < items.length; ) {
    const dels: Line[] = []
    const adds: Line[] = []
    while (i < items.length && items[i].kind === 'del') dels.push(items[i++] as Line)
    while (dels.length && i < items.length && items[i].kind === 'meta') i++
    while (i < items.length && items[i].kind === 'add') adds.push(items[i++] as Line)
    if (!dels.length && !adds.length) {
      i++
      continue
    }
    for (let k = 0; k < Math.min(dels.length, adds.length); k++) {
      const d = wordDiff(dels[k].text, adds[k].text)
      if (d) {
        dels[k].marks = d.a
        adds[k].marks = d.b
      }
    }
  }
}

function buildHunks(p: ParsedPatch): HunkView[] {
  return p.hunks.map((h, hi) => {
    const oldCount = h.lines.filter((l) => l.op === ' ' || l.op === '-').length
    const newCount = h.lines.filter((l) => l.op === ' ' || l.op === '+').length
    const items: Item[] = []
    let oldNo = h.oldStart
    let newNo = h.newStart
    h.lines.forEach((l, li) => {
      if (l.op === '+') items.push({ kind: 'add', newNo: newNo++, text: l.text, hunk: hi, line: li })
      else if (l.op === '-') items.push({ kind: 'del', oldNo: oldNo++, text: l.text, hunk: hi, line: li })
      else if (l.op === '\\') items.push({ kind: 'meta', text: '\\' + l.text })
      else items.push({ kind: 'ctx', oldNo: oldNo++, newNo: newNo++, text: l.text, hunk: hi, line: li })
    })
    markWords(items)
    return {
      index: hi,
      text: `@@ -${h.oldStart},${oldCount} +${h.newStart},${newCount} @@${h.heading}`,
      changes: h.lines.filter((l) => l.op === '+' || l.op === '-').length,
      items
    }
  })
}

function splitRows(hunks: HunkView[]): SplitRow[] {
  const rows: SplitRow[] = []
  for (const h of hunks) {
    rows.push({ kind: 'hunk', hunk: h })
    const items = h.items
    for (let i = 0; i < items.length; ) {
      const it = items[i]
      if (it.kind === 'ctx') {
        rows.push({ kind: 'pair', left: it, right: it })
        i++
      } else if (it.kind === 'meta') {
        rows.push({ kind: 'meta', text: it.text })
        i++
      } else {
        const dels: Line[] = []
        const adds: Line[] = []
        while (i < items.length && items[i].kind === 'del') dels.push(items[i++] as Line)
        while (i < items.length && items[i].kind === 'add') adds.push(items[i++] as Line)
        for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ kind: 'pair', left: dels[k], right: adds[k] })
      }
    }
  }
  return rows
}

function Code({ line, prefix }: { line: Line; prefix: boolean }): React.JSX.Element {
  const sign = prefix ? (line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' ') : ''
  if (!line.marks?.length) return <>{sign}{line.text}</>
  const out: React.ReactNode[] = []
  let pos = 0
  for (const [start, end] of line.marks) {
    if (start > pos) out.push(line.text.slice(pos, start))
    out.push(
      <span key={start} className="intra">
        {line.text.slice(start, end)}
      </span>
    )
    pos = end
  }
  if (pos < line.text.length) out.push(line.text.slice(pos))
  return <>{sign}{out}</>
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
  const { split, wrap } = useDiffPrefs()
  const parsed = useMemo(() => parsePatch(text), [text])
  const notes = useMemo(() => headerNotes(parsed.header), [parsed])
  const hunks = useMemo(() => buildHunks(parsed), [parsed])
  const pairs = useMemo(() => (split ? splitRows(hunks) : []), [split, hunks])
  const changeKeys = useMemo(
    () => hunks.flatMap((h) => h.items.filter((it): it is Line => it.kind === 'add' || it.kind === 'del').map((l) => lineKey(l.hunk, l.line))),
    [hunks]
  )
  const stats = useMemo(() => {
    const items = hunks.flatMap((h) => h.items)
    return { adds: items.filter((it) => it.kind === 'add').length, dels: items.filter((it) => it.kind === 'del').length }
  }, [hunks])
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

  const selectable = (l: Line | undefined): l is Line => !!l && l.kind !== 'ctx' && actions.length > 0
  const pick = (l: Line): { onMouseDown: (e: React.MouseEvent) => void; onClick: (e: React.MouseEvent) => void } => ({
    onMouseDown: (e) => e.shiftKey && e.preventDefault(),
    onClick: (e) => select(lineKey(l.hunk, l.line), e.shiftKey)
  })
  const isSelected = (l: Line | undefined): boolean => !!l && l.kind !== 'ctx' && selected.has(lineKey(l.hunk, l.line))

  const hunkHeader = (h: HunkView, span: number): React.JSX.Element => (
    <tr key={`h${h.index}`} className="hunk">
      <td className="ln" />
      <td colSpan={span}>
        <div className="hunk-line">
          <span className="hunk-text">{h.text}</span>
          {actions.length > 0 && (
            <span className="hunk-actions">
              {actions.map((m) => (
                <button key={m} className={m === 'discard' ? 'danger' : undefined} disabled={busy} onClick={() => void apply(m, (hi) => hi === h.index, h.changes)}>
                  {LABELS[m]} chunk
                </button>
              ))}
            </span>
          )}
        </div>
      </td>
    </tr>
  )

  if (loading) return <div className="diff"><Loading className="placeholder" /></div>
  if (!text.trim()) return <div className="diff"><div className="placeholder">{empty ?? 'No changes'}</div></div>
  return (
    <div className={`diff${actions.length ? ' patchable' : ''}${split ? ' split' : ''}${wrap && !split ? ' wrap' : ''}`}>
      <div className="diff-bar">
        {selected.size > 0 ? (
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
        ) : (
          <span className="diff-stats" aria-label={`${stats.adds} added, ${stats.dels} removed`}>
            {(stats.adds > 0 || stats.dels > 0) && (
              <>
                <span className="adds">+{stats.adds}</span> <span className="dels">−{stats.dels}</span>
              </>
            )}
          </span>
        )}
        <span className="diff-options">
          {!split && (
            <label title="Wrap long lines">
              <input type="checkbox" checked={wrap} onChange={(e) => setDiffPrefs({ wrap: e.target.checked })} /> Wrap
            </label>
          )}
          <span className="view-tabs" role="tablist" aria-label="Diff layout">
            <button role="tab" aria-selected={!split} className={split ? '' : 'active'} onClick={() => setDiffPrefs({ split: false })}>
              Unified
            </button>
            <button role="tab" aria-selected={split} className={split ? 'active' : ''} onClick={() => setDiffPrefs({ split: true })}>
              Split
            </button>
          </span>
        </span>
      </div>
      {split ? (
        <table>
          <colgroup>
            <col className="ln-col" />
            <col />
            <col className="ln-col" />
            <col />
          </colgroup>
          <tbody>
            {notes.map((n, i) => (
              <tr key={`n${i}`} className="meta">
                <td className="ln" />
                <td colSpan={3}>{n}</td>
              </tr>
            ))}
            {pairs.map((r, i) => {
              if (r.kind === 'hunk') return hunkHeader(r.hunk, 3)
              if (r.kind === 'meta') {
                return (
                  <tr key={i} className="meta">
                    <td className="ln" />
                    <td colSpan={3}>{r.text}</td>
                  </tr>
                )
              }
              const side = (l: Line | undefined, which: 'left' | 'right'): React.JSX.Element[] => {
                const no = which === 'left' ? l?.oldNo : l?.newNo
                const cls = `${l ? l.kind : 'empty'}${selectable(l) ? ' selectable' : ''}${isSelected(l) ? ' selected' : ''}`
                const handlers = selectable(l) ? pick(l) : {}
                return [
                  <td key={`${which}-ln`} className={`ln ${cls}`} title={selectable(l) ? SELECT_HINT : undefined} {...handlers}>
                    {no ?? ''}
                  </td>,
                  <td key={`${which}-code`} className={`code ${cls}`} {...handlers}>
                    {l && <Code line={l} prefix={false} />}
                  </td>
                ]
              }
              return (
                <tr key={i} className="pair">
                  {side(r.left?.kind === 'add' ? undefined : r.left, 'left')}
                  {side(r.right?.kind === 'del' ? undefined : r.right, 'right')}
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <table>
          <tbody>
            {notes.map((n, i) => (
              <tr key={`n${i}`} className="meta">
                <td className="ln" />
                <td className="ln" />
                <td>{n}</td>
              </tr>
            ))}
            {hunks.flatMap((h) => [
              hunkHeader(h, 2),
              ...h.items.map((it, i) => {
                if (it.kind === 'meta') {
                  return (
                    <tr key={`${h.index}-${i}`} className="meta">
                      <td className="ln" />
                      <td className="ln" />
                      <td>{it.text}</td>
                    </tr>
                  )
                }
                const can = selectable(it)
                return (
                  <tr
                    key={`${h.index}-${i}`}
                    className={`${it.kind}${can ? ' selectable' : ''}${isSelected(it) ? ' selected' : ''}`}
                    {...(can ? pick(it) : {})}
                  >
                    <td className="ln" title={can ? SELECT_HINT : undefined}>{it.oldNo ?? ''}</td>
                    <td className="ln" title={can ? SELECT_HINT : undefined}>{it.newNo ?? ''}</td>
                    <td>
                      <Code line={it} prefix />
                    </td>
                  </tr>
                )
              })
            ])}
          </tbody>
        </table>
      )}
    </div>
  )
}
