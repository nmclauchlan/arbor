export type Range = [number, number]

const TOKEN = /\w+|\s+|[^\w\s]/g
const MAX_CHARS = 2000
const MAX_CELLS = 250_000
const MIN_SHARED = 0.35

function tokens(s: string): string[] {
  return s.match(TOKEN) ?? []
}

function changedRanges(parts: string[], kept: boolean[]): Range[] {
  const out: Range[] = []
  let pos = 0
  parts.forEach((part, i) => {
    const end = pos + part.length
    if (!kept[i]) {
      const last = out[out.length - 1]
      if (last && last[1] === pos) last[1] = end
      else out.push([pos, end])
    }
    pos = end
  })
  return out
}

// Returns null when the lines share too little for word highlights to help.
export function wordDiff(a: string, b: string): { a: Range[]; b: Range[] } | null {
  if (a === b || a.length + b.length > MAX_CHARS) return null
  const ta = tokens(a)
  const tb = tokens(b)
  const n = ta.length
  const m = tb.length
  if (!n || !m || n * m > MAX_CELLS) return null
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = ta[i] === tb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  }
  const keepA: boolean[] = []
  const keepB: boolean[] = []
  let shared = 0
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (ta[i] === tb[j]) {
      keepA[i] = keepB[j] = true
      if (ta[i].trim()) shared += ta[i].length
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++
    else j++
  }
  if (shared / Math.max(a.trim().length, b.trim().length, 1) < MIN_SHARED) return null
  return { a: changedRanges(ta, keepA), b: changedRanges(tb, keepB) }
}
