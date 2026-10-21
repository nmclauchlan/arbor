export interface TextSegment {
  kind: 'text'
  lines: string[]
}

export interface ConflictSegment {
  kind: 'conflict'
  ours: string[]
  theirs: string[]
  base: string[] | null
  oursLabel: string
  theirsLabel: string
}

export type Segment = TextSegment | ConflictSegment

export type Choice = 'ours' | 'theirs' | 'both' | 'both-reversed'

export function parseConflicts(text: string): { segments: Segment[]; eol: string } {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const segments: Segment[] = []
  let buffer: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('<<<<<<< ')) {
      if (buffer.length) segments.push({ kind: 'text', lines: buffer })
      buffer = []
      const oursLabel = line.slice(8).trim()
      const ours: string[] = []
      let base: string[] | null = null
      const theirs: string[] = []
      let theirsLabel = ''
      let mode: 'ours' | 'base' | 'theirs' = 'ours'
      i++
      let closed = false
      while (i < lines.length) {
        const l = lines[i]
        if (mode === 'ours' && l.startsWith('||||||| ')) {
          mode = 'base'
          base = []
        } else if (mode !== 'theirs' && l === '=======') {
          mode = 'theirs'
        } else if (mode === 'theirs' && l.startsWith('>>>>>>> ')) {
          theirsLabel = l.slice(8).trim()
          closed = true
          i++
          break
        } else if (mode === 'ours') ours.push(l)
        else if (mode === 'base') base!.push(l)
        else theirs.push(l)
        i++
      }
      if (closed) {
        segments.push({ kind: 'conflict', ours, theirs, base, oursLabel, theirsLabel })
      } else {
        segments.push({ kind: 'text', lines: [line, ...ours, ...(base ?? []), ...theirs] })
      }
      continue
    }
    buffer.push(line)
    i++
  }
  if (buffer.length) segments.push({ kind: 'text', lines: buffer })
  return { segments, eol }
}

export function assemble(segments: Segment[], choices: (Choice | null)[], eol: string): string {
  const out: string[] = []
  segments.forEach((seg, idx) => {
    if (seg.kind === 'text') {
      out.push(...seg.lines)
      return
    }
    const choice = choices[idx]
    switch (choice) {
      case 'ours':
        out.push(...seg.ours)
        break
      case 'theirs':
        out.push(...seg.theirs)
        break
      case 'both':
        out.push(...seg.ours, ...seg.theirs)
        break
      case 'both-reversed':
        out.push(...seg.theirs, ...seg.ours)
        break
      default:
        out.push(`<<<<<<< ${seg.oursLabel}`, ...seg.ours)
        if (seg.base) out.push('||||||| base', ...seg.base)
        out.push('=======', ...seg.theirs, `>>>>>>> ${seg.theirsLabel}`)
    }
  })
  return out.join(eol)
}

export function hasMarkers(text: string): boolean {
  return /^<<<<<<< /m.test(text) && /^>>>>>>> /m.test(text)
}
