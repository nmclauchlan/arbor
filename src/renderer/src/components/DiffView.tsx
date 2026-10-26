import { useMemo } from 'react'
import { Loading } from './Spinner'

interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk' | 'meta'
  oldNo?: number
  newNo?: number
  text: string
}

function parseDiff(text: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  let inHunk = false
  for (const raw of text.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw)
      if (m) {
        oldNo = Number(m[1])
        newNo = Number(m[2])
      }
      inHunk = true
      lines.push({ kind: 'hunk', text: raw })
      continue
    }
    if (!inHunk) {
      if (raw.trim()) lines.push({ kind: 'meta', text: raw })
      continue
    }
    if (raw.startsWith('+')) {
      lines.push({ kind: 'add', newNo: newNo++, text: raw.slice(1) })
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', oldNo: oldNo++, text: raw.slice(1) })
    } else if (raw.startsWith('\\')) {
      lines.push({ kind: 'meta', text: raw })
    } else if (raw.startsWith(' ') || raw === '') {
      if (raw === '' && lines.length && lines[lines.length - 1].kind !== 'ctx') continue
      lines.push({ kind: 'ctx', oldNo: oldNo++, newNo: newNo++, text: raw.slice(1) })
    } else {
      inHunk = false
      lines.push({ kind: 'meta', text: raw })
    }
  }
  return lines
}

export function DiffView({ text, loading, empty }: { text: string; loading?: boolean; empty?: string }): React.JSX.Element {
  const lines = useMemo(() => parseDiff(text), [text])
  if (loading) return <div className="diff"><Loading className="placeholder" /></div>
  if (!text.trim()) return <div className="diff"><div className="placeholder">{empty ?? 'No changes'}</div></div>
  return (
    <div className="diff">
      <table>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className={l.kind}>
              <td className="ln">{l.kind === 'hunk' || l.kind === 'meta' ? '' : l.oldNo ?? ''}</td>
              <td className="ln">{l.kind === 'hunk' || l.kind === 'meta' ? '' : l.newNo ?? ''}</td>
              <td colSpan={l.kind === 'hunk' || l.kind === 'meta' ? 1 : undefined}>
                {l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : l.kind === 'ctx' ? ' ' : ''}
                {l.text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
