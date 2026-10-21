import { simpleGit } from 'simple-git'
import type { HostAccount, HostApi, HostInfo, HostKind, PullRequest, PullRequestDetails } from '@shared/types'
import { deleteAccount, findToken, listAccounts, storeAccount } from './accounts'
import * as azure from './azure'
import * as github from './github'

interface Adapter {
  validateToken(baseUrl: string, token: string): Promise<string>
  listPullRequests(info: HostInfo, token: string): Promise<PullRequest[]>
  getPullRequest(info: HostInfo, token: string, id: number): Promise<PullRequestDetails>
  createPullRequest(
    info: HostInfo,
    token: string,
    source: string,
    target: string,
    title: string,
    description: string,
    draft: boolean
  ): Promise<PullRequest>
}

const adapters: Record<HostKind, Adapter | null> = { azure, github, gitlab: null }

const detected = new Map<string, HostInfo | null>()

async function remoteUrl(repoPath: string): Promise<string | null> {
  try {
    const g = simpleGit({ baseDir: repoPath })
    const remotes = await g.getRemotes(true)
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0]
    return origin?.refs.fetch ?? origin?.refs.push ?? null
  } catch {
    return null
  }
}

function enterpriseHosts(): string[] {
  return listAccounts()
    .filter((a) => a.kind === 'github')
    .map((a) => a.baseUrl.replace(/^https?:\/\//i, ''))
    .filter((h) => h !== 'github.com')
}

export function parseRemote(remote: string): HostInfo | null {
  return azure.parseAzureRemote(remote) ?? github.parseGithubRemote(remote, enterpriseHosts())
}

export async function detect(repoPath: string): Promise<HostInfo | null> {
  const remote = await remoteUrl(repoPath)
  const info = remote ? parseRemote(remote) : null
  detected.set(repoPath, info)
  return info
}

function adapterFor(kind: HostKind): Adapter {
  const a = adapters[kind]
  if (!a) throw new Error(`${kind} is not supported yet`)
  return a
}

async function requireHost(repoPath: string): Promise<{ info: HostInfo; token: string; adapter: Adapter }> {
  const info = detected.get(repoPath) ?? (await detect(repoPath))
  if (!info) throw new Error('This repository is not hosted on a supported service')
  const token = findToken(info.kind, info.baseUrl)
  if (!token) throw new Error(`No account for ${info.baseUrl}. Add one in Settings.`)
  return { info, token, adapter: adapterFor(info.kind) }
}

function normaliseBaseUrl(kind: HostKind, baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  if (kind === 'azure') {
    if (!/^https:\/\/dev\.azure\.com\/[^/]+$|^https:\/\/[^./]+\.visualstudio\.com$/i.test(url)) {
      throw new Error('Enter the organisation URL, for example https://dev.azure.com/my-org')
    }
    return url
  }
  if (kind === 'github') {
    const u = url || 'https://github.com'
    if (!/^https:\/\/[^/]+$/i.test(u)) throw new Error('Enter the host URL, for example https://github.com or https://github.my-company.com')
    return u
  }
  throw new Error(`${kind} is not supported yet`)
}

export const hostApi: HostApi = {
  detect,
  async accounts() {
    return listAccounts()
  },
  async hasAccount(repoPath) {
    const info = detected.get(repoPath) ?? (await detect(repoPath))
    return !!info && !!findToken(info.kind, info.baseUrl)
  },
  async addAccount(kind: HostKind, baseUrl: string, token: string): Promise<HostAccount> {
    const url = normaliseBaseUrl(kind, baseUrl)
    const user = await adapterFor(kind).validateToken(url, token.trim())
    const account = storeAccount(kind, url, user, token.trim())
    detected.clear()
    return account
  },
  async removeAccount(kind, baseUrl) {
    deleteAccount(kind, baseUrl)
    detected.clear()
  },
  async pullRequests(repoPath) {
    const { info, token, adapter } = await requireHost(repoPath)
    return adapter.listPullRequests(info, token)
  },
  async pullRequest(repoPath, id) {
    const { info, token, adapter } = await requireHost(repoPath)
    return adapter.getPullRequest(info, token, id)
  },
  async createPullRequest(repoPath, source, target, title, description, draft) {
    const { info, token, adapter } = await requireHost(repoPath)
    return adapter.createPullRequest(info, token, source, target, title, description, draft)
  }
}
