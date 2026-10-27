import type { BuildFailure, BuildState, CommitBuild, HostInfo, PullRequest, PullRequestCheck, PullRequestDetails, PullRequestReviewer } from '@shared/types'

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

interface GhRepo {
  name: string
  full_name: string
  description: string | null
  clone_url: string
  ssh_url: string
  pushed_at: string | null
  private: boolean
  archived?: boolean
}

export async function listRepos(baseUrl: string, token: string): Promise<import('@shared/types').HostRepo[]> {
  const out: import('@shared/types').HostRepo[] = []
  for (let page = 1; page <= 5; page++) {
    const list = await call<GhRepo[]>(
      token,
      `${apiBase(baseUrl)}/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`
    )
    for (const r of list) {
      if (r.archived) continue
      out.push({
        name: r.name,
        fullName: r.full_name,
        description: r.description ?? '',
        httpsUrl: r.clone_url,
        sshUrl: r.ssh_url,
        updatedAt: r.pushed_at ? Date.parse(r.pushed_at) : 0,
        isPrivate: r.private
      })
    }
    if (list.length < 100) break
  }
  return out
}

export const cloneUser = 'x-access-token'

interface GhRollupNode {
  __typename: 'CheckRun' | 'StatusContext'
  databaseId?: number
  name?: string
  status?: string
  conclusion?: string | null
  detailsUrl?: string | null
  completedAt?: string | null
  checkSuite?: { workflowRun?: { workflow?: { name: string } | null } | null } | null
  context?: string
  state?: string
  targetUrl?: string | null
  description?: string | null
}

interface GhAnnotation {
  path: string
  start_line: number
  annotation_level: string
  message: string
}

const CHECKS_ACCESS = "GitHub didn't return check results. Give the token read access to checks and commit statuses in Settings."

function graphqlUrl(baseUrl: string): string {
  const api = apiBase(baseUrl)
  return api.endsWith('/api/v3') ? api.replace(/\/v3$/, '/graphql') : `${api}/graphql`
}

function checkState(n: GhRollupNode): BuildState {
  if (n.__typename === 'StatusContext') {
    if (n.state === 'SUCCESS') return 'succeeded'
    if (n.state === 'PENDING' || n.state === 'EXPECTED') return 'running'
    return 'failed'
  }
  if (n.status !== 'COMPLETED') return n.status === 'IN_PROGRESS' ? 'running' : 'queued'
  if (n.conclusion === 'SUCCESS' || n.conclusion === 'NEUTRAL') return 'succeeded'
  if (n.conclusion === 'SKIPPED' || n.conclusion === 'STALE') return 'skipped'
  if (n.conclusion === 'CANCELLED') return 'cancelled'
  return 'failed'
}

export async function listBuilds(info: HostInfo, token: string, shas: string[]): Promise<Record<string, CommitBuild[]>> {
  const out: Record<string, CommitBuild[]> = {}
  for (let i = 0; i < shas.length; i += 50) {
    const batch = shas.slice(i, i + 50)
    const fields = batch
      .map(
        (sha, j) => `c${j}: object(oid: "${sha}") { ... on Commit { statusCheckRollup { contexts(first: 50) { nodes { __typename
          ... on CheckRun { databaseId name status conclusion detailsUrl completedAt checkSuite { workflowRun { workflow { name } } } }
          ... on StatusContext { context state targetUrl description } } } } } }`
      )
      .join('\n')
    const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`
    let res: { data?: { repository?: Record<string, { statusCheckRollup?: { contexts: { nodes: GhRollupNode[] } } | null } | null> | null }; errors?: { message: string }[] }
    try {
      res = await call(token, graphqlUrl(info.baseUrl), { method: 'POST', body: JSON.stringify({ query, variables: { owner: info.org, name: info.repo } }) })
    } catch (e) {
      if (e instanceof Error && /\((401|403)\)/.test(e.message)) throw new Error(CHECKS_ACCESS)
      throw e
    }
    if (!res.data?.repository && res.errors?.length) throw new Error(CHECKS_ACCESS)
    batch.forEach((sha, j) => {
      const nodes = res.data?.repository?.[`c${j}`]?.statusCheckRollup?.contexts.nodes ?? []
      if (!nodes.length) return
      out[sha] = nodes.map((n): CommitBuild => {
        if (n.__typename === 'StatusContext') {
          return { id: `status:${n.context}`, name: n.context ?? 'status', state: checkState(n), url: n.targetUrl ?? `${info.webUrl}/commit/${sha}`, summary: n.description ?? undefined }
        }
        const workflow = n.checkSuite?.workflowRun?.workflow?.name
        return {
          id: `check:${n.databaseId}`,
          name: workflow ? `${workflow} / ${n.name}` : n.name ?? 'check',
          state: checkState(n),
          url: n.detailsUrl ?? `${info.webUrl}/commit/${sha}/checks`,
          finishedAt: n.completedAt ? Date.parse(n.completedAt) : undefined
        }
      })
    })
  }
  return out
}

export async function buildFailures(info: HostInfo, token: string, build: CommitBuild): Promise<BuildFailure[]> {
  if (!build.id.startsWith('check:')) return [{ step: build.name, messages: build.summary ? [build.summary] : [], url: build.url }]
  const id = build.id.slice('check:'.length)
  const annotations = await call<GhAnnotation[]>(token, `${repoApi(info)}/check-runs/${id}/annotations?per_page=50`).catch(() => [] as GhAnnotation[])
  let messages = annotations
    .filter((a) => a.annotation_level === 'failure')
    .map((a) => (a.path && a.path !== '.github' ? `${a.path}:${a.start_line} ${a.message}` : a.message))
  if (!messages.length) {
    const run = await call<{ output?: { title?: string | null; summary?: string | null } }>(token, `${repoApi(info)}/check-runs/${id}`).catch(() => null)
    messages = [run?.output?.title, run?.output?.summary].filter((m): m is string => !!m)
  }
  return [{ step: build.name, messages: messages.slice(0, 8), url: build.url }]
}
