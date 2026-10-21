export function formatDate(ms: number): string {
  const d = new Date(ms)
  const now = Date.now()
  const diff = now - ms
  const min = 60_000
  if (diff < min) return 'just now'
  if (diff < 60 * min) return `${Math.floor(diff / min)}m ago`
  if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))}h ago`
  if (diff < 7 * 24 * 60 * min) return `${Math.floor(diff / (24 * 60 * min))}d ago`
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatFullDate(ms: number): string {
  return new Date(ms).toLocaleString()
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export const WIP_HASH = 'WIP'
