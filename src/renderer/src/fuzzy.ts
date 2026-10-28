import { createElement } from 'react'

export function subsequence(text: string, q: string): number[] | null {
  const marks: number[] = []
  for (let i = 0; i < text.length && marks.length < q.length; i++) if (text[i] === q[marks.length]) marks.push(i)
  return marks.length === q.length ? marks : null
}

export function run(start: number, length: number): number[] {
  return Array.from({ length }, (_, i) => start + i)
}

export function highlight(text: string, marks: number[]): React.ReactNode {
  if (!marks.length) return text
  const marked = new Set(marks)
  const out: React.ReactNode[] = []
  let start = 0
  for (let i = 1; i <= text.length; i++) {
    if (i < text.length && marked.has(i) === marked.has(start)) continue
    const piece = text.slice(start, i)
    out.push(marked.has(start) ? createElement('mark', { key: start }, piece) : piece)
    start = i
  }
  return out
}
