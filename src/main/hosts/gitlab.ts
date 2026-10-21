import type { HostInfo, PullRequest, PullRequestCheck, PullRequestDetails, PullRequestReviewer } from '@shared/types'

export function parseGitlabRemote(remote: string, knownHosts: string[]): HostInfo | null {
  const hosts = ['gitlab.com', ...knownHosts.map((h) => h.toLowerCase())]
  for (const host of hosts) {
    const esc = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const patterns = [
      new RegExp(`^https?://(?:[^@/]+@)?${esc}/(.+?)(?:\\.git)?/?$`, 'i'),
      new RegExp(`^(?:ssh://)?git@${esc}(?::\\d+)?[:/](.+?)(?:\\.git)?/?$`, 'i')
    ]
    for (const re of patterns) {
      const m = re.exec(remote)
      if (!m) continue
      const parts = m[1].split('/').filter(Boolean)
      if (parts.length < 2) continue
      const baseUrl = `https://${host}`
      const fullPath = parts.join('/')
      return {
        kind: 'gitlab',
        baseUrl,
        org: parts[0],
        project: fullPath,
        repo: parts[parts.length - 1],
        webUrl: `${baseUrl}/${fullPath}`,
        remote
      }
    }
  }
  return null
}

function api(info: HostInfo | string): string {
  const base = typeof info === 'string' ? info : info.baseUrl
  return `${base.replace(/\/+$/, '')}/api/v4`
}

function projectApi(info: HostInfo): string {
  return `${api(info)}/projects/${encodeURIComponent(info.project)}`
}

async function call<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json', 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) }
  })
  if (res.status === 401) throw new Error('GitLab rejected the token (401). Check that it is valid and has the api scope.')
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string | string[] | Record<string, string[]>; error?: string }
      const msg = body.message ?? body.error
      detail = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.join('; ') : msg ? JSON.stringify(msg) : ''
    } catch {
      /* no body */
    }
    throw new Error(`GitLab request failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as T
}

interface GlUser {
  name: string
  username: string
}

interface GlMr {
  iid: number
  title: string
  description?: string | null
  state: string
  draft?: boolean
  work_in_progress?: boolean
  created_at: string
  web_url: string
  author: GlUser
  source_branch: string
  target_branch: string
  source_project_id?: number
  project_id?: number
  reviewers?: GlUser[]
  detailed_merge_status?: string
  merge_status?: string
  head_pipeline?: { id: number; status: string; web_url: string } | null
}

function toPr(m: GlMr, reviewers?: PullRequestReviewer[]): PullRequest {
  return {
    id: m.iid,
    title: m.title.replace(/^(Draft|WIP):\s*/i, ''),
    author: m.author?.name || m.author?.username || '',
    sourceBranch: m.source_branch,
    targetBranch: m.target_branch,
    status: m.state === 'merged' ? 'completed' : m.state === 'closed' ? 'abandoned' : 'active',
    isDraft: !!(m.draft || m.work_in_progress || /^(Draft|WIP):/i.test(m.title)),
    createdAt: Date.parse(m.created_at),
    url: m.web_url,
    reviewers: reviewers ?? (m.reviewers ?? []).map((u) => ({ name: u.name || u.username, vote: 0, required: false }))
  }
}

export async function validateToken(baseUrl: string, token: string): Promise<string> {
  const user = await call<GlUser>(token, `${api(baseUrl)}/user`)
  return user.name ? `${user.name} (${user.username})` : user.username
}

export async function listPullRequests(info: HostInfo, token: string): Promise<PullRequest[]> {
  const list = await call<GlMr[]>(token, `${projectApi(info)}/merge_requests?state=opened&per_page=100&order_by=updated_at`)
  return list.map((m) => toPr(m))
}

interface GlJob {
  name: string
  status: string
  web_url: string
}

function jobState(status: string): PullRequestCheck['state'] {
  if (status === 'success' || status === 'skipped' || status === 'manual') return 'succeeded'
  if (status === 'failed' || status === 'canceled') return 'failed'
  if (status === 'pending' || status === 'running' || status === 'created' || status === 'waiting_for_resource' || status === 'preparing' || status === 'scheduled') return 'pending'
  return 'unknown'
}

export async function getPullRequest(info: HostInfo, token: string, id: number): Promise<PullRequestDetails> {
  const m = await call<GlMr>(token, `${projectApi(info)}/merge_requests/${id}`)
  const reviewers: PullRequestReviewer[] = (m.reviewers ?? []).map((u) => ({ name: u.name || u.username, vote: 0, required: false }))
  try {
    const approvals = await call<{ approved_by?: { user: GlUser }[] }>(token, `${projectApi(info)}/merge_requests/${id}/approvals`)
    for (const a of approvals.approved_by ?? []) {
      const name = a.user.name || a.user.username
      const existing = reviewers.find((r) => r.name === name)
      if (existing) existing.vote = 10
      else reviewers.push({ name, vote: 10, required: false })
    }
  } catch {
    /* approvals may be unavailable on this tier */
  }
  const checks: PullRequestCheck[] = []
  if (m.head_pipeline) {
    checks.push({ name: `Pipeline #${m.head_pipeline.id}`, state: jobState(m.head_pipeline.status), url: m.head_pipeline.web_url })
    try {
      const jobs = await call<GlJob[]>(token, `${api(info)}/projects/${encodeURIComponent(info.project)}/pipelines/${m.head_pipeline.id}/jobs?per_page=100`)
      for (const j of jobs) checks.push({ name: j.name, state: jobState(j.status), url: j.web_url })
    } catch {
      /* jobs need extra permissions on some projects */
    }
  }
  const status = m.detailed_merge_status ?? m.merge_status ?? 'unknown'
  const mergeStatus =
    status === 'mergeable' || status === 'can_be_merged' ? 'succeeded' : status === 'conflict' || status === 'cannot_be_merged' ? 'conflicts' : status === 'unchecked' || status === 'checking' ? 'unknown' : status
  return { ...toPr(m, reviewers), description: m.description ?? '', mergeStatus, checks }
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
  const m = await call<GlMr>(token, `${projectApi(info)}/merge_requests`, {
    method: 'POST',
    body: JSON.stringify({
      source_branch: source,
      target_branch: target,
      title: draft ? `Draft: ${title}` : title,
      description,
      remove_source_branch: false
    })
  })
  return toPr(m)
}

interface GlProject {
  name: string
  path_with_namespace: string
  description: string | null
  http_url_to_repo: string
  ssh_url_to_repo: string
  last_activity_at: string
  visibility: string
  archived?: boolean
}

export async function listRepos(baseUrl: string, token: string): Promise<import('@shared/types').HostRepo[]> {
  const out: import('@shared/types').HostRepo[] = []
  for (let page = 1; page <= 5; page++) {
    const list = await call<GlProject[]>(
      token,
      `${api(baseUrl)}/projects?membership=true&archived=false&simple=true&per_page=100&page=${page}&order_by=last_activity_at`
    )
    for (const p of list) {
      out.push({
        name: p.name,
        fullName: p.path_with_namespace,
        description: p.description ?? '',
        httpsUrl: p.http_url_to_repo,
        sshUrl: p.ssh_url_to_repo,
        updatedAt: Date.parse(p.last_activity_at),
        isPrivate: p.visibility !== 'public'
      })
    }
    if (list.length < 100) break
  }
  return out
}

export const cloneUser = 'oauth2'
