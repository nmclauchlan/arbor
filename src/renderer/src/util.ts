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

export function hostName(kind: string): string {
  return kind === 'azure' ? 'Azure DevOps' : kind === 'github' ? 'GitHub' : kind === 'gitlab' ? 'GitLab' : kind
}

export function prPrefix(kind: string): string {
  return kind === 'github' ? '#' : '!'
}

export function prNoun(kind: string): string {
  return kind === 'gitlab' ? 'merge request' : 'pull request'
}

export function hostPath(host: { kind: string; org: string; project: string; repo: string }): string {
  if (host.kind === 'github') return `${host.org}/${host.repo}`
  if (host.kind === 'gitlab') return host.project
  return `${host.project} / ${host.repo}`
}

export function revealLabel(): string {
  const p = window.native?.platform
  if (p === 'darwin') return 'Reveal in Finder'
  if (p === 'win32') return 'Show in Explorer'
  return 'Show in file manager'
}

export function revealInFolder(repoPath: string, relative: string | null): void {
  window.native?.showInFolder(repoPath, relative)
}
