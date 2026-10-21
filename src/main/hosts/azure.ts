import type { HostInfo, PullRequest, PullRequestCheck, PullRequestDetails, PullRequestReviewer } from '@shared/types'

const API = 'api-version=7.1'

export function parseAzureRemote(remote: string): HostInfo | null {
  let m = /^(?:https?:\/\/)(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/i.exec(remote)
  if (m) return build(m[1], m[2], m[3], remote)
  m = /^(?:https?:\/\/)(?:[^@/]+@)?([^.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/i.exec(remote)
  if (m) return build(m[1], m[2], m[3], remote)
  m = /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(remote)
  if (m) return build(m[1], m[2], m[3], remote)
  m = /^(?:ssh:\/\/)?[^@]+@vs-ssh\.visualstudio\.com(?::22)?\/v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(remote)
  if (m) return build(m[1], m[2], m[3], remote)
  return null
}

function build(org: string, project: string, repo: string, remote: string): HostInfo {
  const o = decodeURIComponent(org)
  const p = decodeURIComponent(project)
  const r = decodeURIComponent(repo)
  return {
    kind: 'azure',
    baseUrl: `https://dev.azure.com/${o}`,
    org: o,
    project: p,
    repo: r,
    webUrl: `https://dev.azure.com/${encodeURIComponent(o)}/${encodeURIComponent(p)}/_git/${encodeURIComponent(r)}`,
    remote
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
}

async function call<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...headers(token), ...(init?.headers as Record<string, string> | undefined) } })
  if (res.status === 401) throw new Error('Azure DevOps rejected the token (401). Check the PAT and that it has Code (read & write) scope.')
  if (res.status === 203) throw new Error('Azure DevOps asked for interactive sign-in; the PAT is invalid or expired.')
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string }
      detail = body.message ? `: ${body.message}` : ''
    } catch {
      /* no body */
    }
    throw new Error(`Azure DevOps request failed (${res.status})${detail}`)
  }
  return (await res.json()) as T
}

function repoApi(info: HostInfo): string {
  return `${info.baseUrl}/${encodeURIComponent(info.project)}/_apis/git/repositories/${encodeURIComponent(info.repo)}`
}

function short(ref: string): string {
  return ref.replace(/^refs\/heads\//, '')
}

interface AdoIdentity {
  displayName: string
}

interface AdoReviewer extends AdoIdentity {
  vote: number
  isRequired?: boolean
}

interface AdoPr {
  pullRequestId: number
  title: string
  description?: string
  status: string
  isDraft: boolean
  createdBy: AdoIdentity
  creationDate: string
  sourceRefName: string
  targetRefName: string
  reviewers: AdoReviewer[]
  mergeStatus?: string
  repository: { project: { id: string } }
}

function toPr(info: HostInfo, p: AdoPr): PullRequest {
  const status = p.status === 'completed' ? 'completed' : p.status === 'abandoned' ? 'abandoned' : 'active'
  return {
    id: p.pullRequestId,
    title: p.title,
    author: p.createdBy?.displayName ?? '',
    sourceBranch: short(p.sourceRefName),
    targetBranch: short(p.targetRefName),
    status,
    isDraft: !!p.isDraft,
    createdAt: Date.parse(p.creationDate),
    url: `${info.webUrl}/pullrequest/${p.pullRequestId}`,
    reviewers: (p.reviewers ?? []).map(
      (r): PullRequestReviewer => ({ name: r.displayName, vote: r.vote, required: !!r.isRequired })
    )
  }
}

export async function validateToken(baseUrl: string, token: string): Promise<string> {
  const data = await call<{ authenticatedUser?: { providerDisplayName?: string; customDisplayName?: string } }>(
    token,
    `${baseUrl.replace(/\/+$/, '')}/_apis/connectionData?api-version=7.1-preview`
  )
  const user = data.authenticatedUser
  return user?.customDisplayName || user?.providerDisplayName || 'Azure DevOps user'
}

export async function listPullRequests(info: HostInfo, token: string): Promise<PullRequest[]> {
  const data = await call<{ value: AdoPr[] }>(
    token,
    `${repoApi(info)}/pullrequests?searchCriteria.status=active&$top=100&${API}`
  )
  return data.value.map((p) => toPr(info, p))
}

interface AdoEvaluation {
  status: string
  configuration: { type: { displayName: string }; settings?: { displayName?: string } }
  context?: { buildId?: number }
}

export async function getPullRequest(info: HostInfo, token: string, id: number): Promise<PullRequestDetails> {
  const p = await call<AdoPr>(token, `${repoApi(info)}/pullrequests/${id}?${API}`)
  const base = toPr(info, p)
  const checks: PullRequestCheck[] = []
  try {
    const artifact = encodeURIComponent(`vstfs:///CodeReview/CodeReviewId/${p.repository.project.id}/${id}`)
    const evals = await call<{ value: AdoEvaluation[] }>(
      token,
      `${info.baseUrl}/${encodeURIComponent(info.project)}/_apis/policy/evaluations?artifactId=${artifact}&api-version=7.1-preview.1`
    )
    for (const e of evals.value) {
      const name = e.configuration.settings?.displayName || e.configuration.type.displayName
      const state: PullRequestCheck['state'] =
        e.status === 'approved' ? 'succeeded' : e.status === 'rejected' || e.status === 'broken' ? 'failed' : e.status === 'queued' || e.status === 'running' ? 'pending' : 'unknown'
      const url = e.context?.buildId
        ? `${info.baseUrl}/${encodeURIComponent(info.project)}/_build/results?buildId=${e.context.buildId}`
        : undefined
      checks.push({ name, state, url })
    }
  } catch {
    /* policy evaluations need extra scope; show the PR without checks */
  }
  return { ...base, description: p.description ?? '', mergeStatus: p.mergeStatus ?? 'unknown', checks }
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
  const p = await call<AdoPr>(token, `${repoApi(info)}/pullrequests?${API}`, {
    method: 'POST',
    body: JSON.stringify({
      sourceRefName: `refs/heads/${source}`,
      targetRefName: `refs/heads/${target}`,
      title,
      description,
      isDraft: draft
    })
  })
  return toPr(info, p)
}

interface AdoRepo {
  name: string
  remoteUrl: string
  sshUrl: string
  webUrl: string
  isDisabled?: boolean
  project: { name: string; description?: string; lastUpdateTime?: string; visibility?: string }
}

export async function listRepos(baseUrl: string, token: string): Promise<import('@shared/types').HostRepo[]> {
  const data = await call<{ value: AdoRepo[] }>(token, `${baseUrl.replace(/\/+$/, '')}/_apis/git/repositories?${API}`)
  return data.value
    .filter((r) => !r.isDisabled)
    .map((r) => ({
      name: r.name,
      fullName: `${r.project.name}/${r.name}`,
      description: r.project.description ?? '',
      httpsUrl: r.remoteUrl,
      sshUrl: r.sshUrl,
      updatedAt: r.project.lastUpdateTime ? Date.parse(r.project.lastUpdateTime) : 0,
      isPrivate: r.project.visibility !== 'public'
    }))
}

export const cloneUser = ''
