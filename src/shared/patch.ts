export type PatchOp = ' ' | '+' | '-' | '\\'

export interface PatchLine {
  op: PatchOp
  text: string
}

export interface Hunk {
  oldStart: number
  newStart: number
  heading: string
  lines: PatchLine[]
}

export interface ParsedPatch {
  header: string[]
  hunks: Hunk[]
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

export function parsePatch(diff: string): ParsedPatch {
  const header: string[] = []
  const hunks: Hunk[] = []
  let current: Hunk | null = null
  const lines = diff.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  for (const raw of lines) {
    const m = HUNK.exec(raw)
    if (m) {
      current = { oldStart: Number(m[1]), newStart: Number(m[2]), heading: m[3], lines: [] }
      hunks.push(current)
    } else if (!current) {
      header.push(raw)
    } else if (raw[0] === '+' || raw[0] === '-' || raw[0] === ' ' || raw[0] === '\\') {
      current.lines.push({ op: raw[0] as PatchOp, text: raw.slice(1) })
    } else if (raw === '') {
      current.lines.push({ op: ' ', text: '' })
    } else {
      current = null
      header.push(raw)
    }
  }
  return { header, hunks }
}

export function isPartiallyPatchable(p: ParsedPatch): boolean {
  return p.hunks.length > 0 && !p.header.some((l) => /^(new file|deleted file|Binary files|rename from|copy from|similarity index)/.test(l))
}

// Unselected lines keep the side git matches against (old forward, new reversed) identical to the file as it is now.
export function buildPatch(p: ParsedPatch, selected: (hunk: number, line: number) => boolean, reverse: boolean): string | null {
  const out = [...p.header]
  let delta = 0
  p.hunks.forEach((h, hi) => {
    const body: PatchLine[] = []
    let changed = false
    let keptPrevious = false
    h.lines.forEach((l, li) => {
      if (l.op === '\\') {
        if (keptPrevious) body.push(l)
        return
      }
      if (l.op === ' ' || selected(hi, li)) {
        body.push(l)
        changed ||= l.op !== ' '
        keptPrevious = true
        return
      }
      keptPrevious = reverse ? l.op === '+' : l.op === '-'
      if (keptPrevious) body.push({ op: ' ', text: l.text })
    })
    if (!changed) return
    const oldCount = body.filter((l) => l.op === ' ' || l.op === '-').length
    const newCount = body.filter((l) => l.op === ' ' || l.op === '+').length
    const oldStart = reverse ? h.newStart - delta : h.oldStart
    const newStart = reverse ? h.newStart : h.oldStart + delta
    delta += newCount - oldCount
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${h.heading}`, ...body.map((l) => l.op + l.text))
  })
  return out.length > p.header.length ? out.join('\n') + '\n' : null
}
