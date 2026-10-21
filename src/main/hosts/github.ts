import type { HostInfo, PullRequest, PullRequestCheck, PullRequestDetails, PullRequestReviewer } from '@shared/types'

export function parseGithubRemote(remote: string, knownHosts: string[]): HostInfo | null {
  const hosts = ['github.com', ...knownHosts.map((h) => h.toLowerCase())]
  for (const host of hosts) {
    const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp(`^https?://(?:[^@/]+@)?${esc}/([^/]+)/([^/]+?)(?:\\.git)?/?$`, 'i'),
      new RegExp(`^(?:ssh://)?git@${esc}[:/]([^/]+)/([^/]+?)(?:\\.git)?/?$`, 'i')
    ]
    for (const re of patterns) {
      const m = re.exec(remote)
      if (m) {
        const baseUrl = `https://${host}`
        return {
          kind: 'github',
          baseUrl,
          org: m[1],
          project: m[1],
          repo: m[2],
          webUrl: `${baseUrl}/${m[1]}/${m[2]}`,
          remote
        }
      }
    }
  }
  return null
}

export function apiBase(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  return /^https:\/\/github\.com$/i.test(url) ? 'https://api.github.com' : `${url}/api/v3`
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Arbor',
    'Content-Type': 'application/json'
  }
}

async function call<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers(token), ...(init?.headers as Record<string, string> | undefined) } })
  if (res.status === 401) throw new Error('GitHub rejected the token (401). Check that it is valid and has repository access.')
  if (res.status === 403 || res.status === 404) {
    let detail = ''
    try {
      detail = ((await res.json()) as { message?: string }).message ?? ''
    } catch {
      /* no body */
    }
    throw new Error(`GitHub request failed (${res.status})${detail ? `: ${detail}` : ''}. The token may lack access to this repository.`)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string; errors?: { message?: string }[] }
      detail = body.message ?? ''
      const extra = body.errors?.map((e) => e.message).filter(Boolean).join('; ')
      if (extra) detail += ` (${extra})`
    } catch {
      /* no body */
    }
    throw new Error(`GitHub request failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as T
}

interface GhUser {
  login: string
  name?: string | null
}

interface GhPr {
  number: number
  title: string
  body?: string | null
  state: string
  draft?: boolean
  merged_at?: string | null
  created_at: string
  html_url: string
  user: GhUser
  head: { ref: string; sha: string; label: string; repo?: { full_name: string } | null }
  base: { ref: string; repo: { full_name: string } }
  requested_reviewers?: GhUser[]
  mergeable?: boolean | null
  mergeable_state?: string
}

interface GhReview {
  user: GhUser
  state: string
  submitted_at: string
}

function repoApi(info: HostInfo): string {
  return `${apiBase(info.baseUrl)}/repos/${encodeURIComponent(info.org)}/${encodeURIComponent(info.repo)}`
}

function toPr(p: GhPr, reviewers: PullRequestReviewer[] = []): PullRequest {
  const fork = p.head.repo && p.head.repo.full_name !== p.base.repo.full_name
  return {
    id: p.number,
    title: p.title,
    author: p.user?.login ?? '',
    sourceBranch: fork ? p.head.label : p.head.ref,
    targetBranch: p.base.ref,
    status: p.merged_at ? 'completed' : p.state === 'closed' ? 'abandoned' : 'active',
    isDraft: !!p.draft,
    createdAt: Date.parse(p.created_at),
    url: p.html_url,
    reviewers
  }
}

function reviewerList(p: GhPr, reviews: GhReview[]): PullRequestReviewer[] {
  const latest = new Map<string, GhReview>()
  for (const r of reviews) {
    if (r.state === 'COMMENTED' && latest.get(r.user.login)?.state && latest.get(r.user.login)!.state !== 'COMMENTED') continue
    const prev = latest.get(r.user.login)
    if (!prev || Date.parse(r.submitted_at) >= Date.parse(prev.submitted_at)) latest.set(r.user.login, r)
  }
  const out: PullRequestReviewer[] = []
  for (const [login, r] of latest) {
    const vote = r.state === 'APPROVED' ? 10 : r.state === 'CHANGES_REQUESTED' ? -10 : r.state === 'COMMENTED' ? 1 : 0
    out.push({ name: login, vote, required: false })
  }
  for (const u of p.requested_reviewers ?? []) {
    if (!latest.has(u.login)) out.push({ name: u.login, vote: 0, required: true })
  }
  return out
}

export async function validateToken(baseUrl: string, token: string): Promise<string> {
  const user = await call<GhUser>(token, `${apiBase(baseUrl)}/user`)
  return user.name ? `${user.name} (${user.login})` : user.login
}

export async function listPullRequests(info: HostInfo, token: string): Promise<PullRequest[]> {
  const list = await call<GhPr[]>(token, `${repoApi(info)}/pulls?state=open&per_page=100&sort=updated&direction=desc`)
  return list.map((p) => toPr(p, (p.requested_reviewers ?? []).map((u) => ({ name: u.login, vote: 0, required: true }))))
}

interface GhCheckRun {
  name: string
  status: string
  conclusion: string | null
  html_url?: string
}

interface GhStatus {
  context: string
  state: string
  target_url?: string
}

export async function getPullRequest(info: HostInfo, token: string, id: number): Promise<PullRequestDetails> {
  const p = await call<GhPr>(token, `${repoApi(info)}/pulls/${id}`)
  const reviews = await call<GhReview[]>(token, `${repoApi(info)}/pulls/${id}/reviews?per_page=100`).catch(() => [] as GhReview[])
  const base = toPr(p, reviewerList(p, reviews))
  const checks: PullRequestCheck[] = []
  try {
    const runs = await call<{ check_runs: GhCheckRun[] }>(token, `${repoApi(info)}/commits/${p.head.sha}/check-runs?per_page=100`)
    for (const r of runs.check_runs) {
      const state: PullRequestCheck['state'] =
        r.status !== 'completed' ? 'pending' : r.conclusion === 'success' || r.conclusion === 'neutral' || r.conclusion === 'skipped' ? 'succeeded' : r.conclusion ? 'failed' : 'unknown'
      checks.push({ name: r.name, state, url: r.html_url })
    }
  } catch {
    /* checks need extra scope on some tokens */
  }
  try {
    const combined = await call<{ statuses: GhStatus[] }>(token, `${repoApi(info)}/commits/${p.head.sha}/status`)
    for (const s of combined.statuses) {
      const state: PullRequestCheck['state'] = s.state === 'success' ? 'succeeded' : s.state === 'pending' ? 'pending' : s.state === 'failure' || s.state === 'error' ? 'failed' : 'unknown'
      checks.push({ name: s.context, state, url: s.target_url })
    }
  } catch {
    /* ignore */
  }
  const mergeStatus = p.mergeable === true ? 'succeeded' : p.mergeable === false ? 'conflicts' : p.mergeable_state && p.mergeable_state !== 'unknown' ? p.mergeable_state : 'unknown'
  return { ...base, description: p.body ?? '', mergeStatus, checks }
}

export async function createPullRequest(
  info: HostInfo,
  token: string,
  source: string,
  target: string,
  title: string,
  description: string,
  draft: boolean
): Promise<PullRequest> {
  const p = await call<GhPr>(token, `${repoApi(info)}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, head: source, base: target, body: description, draft })
  })
  return toPr(p)
}
