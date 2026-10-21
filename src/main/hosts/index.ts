import { simpleGit } from 'simple-git'
import type { HostAccount, HostApi, HostInfo, HostKind } from '@shared/types'
import { deleteAccount, findToken, listAccounts, storeAccount } from './accounts'
import * as azure from './azure'

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

export function parseRemote(remote: string): HostInfo | null {
  return azure.parseAzureRemote(remote)
}

export async function detect(repoPath: string): Promise<HostInfo | null> {
  const remote = await remoteUrl(repoPath)
  const info = remote ? parseRemote(remote) : null
  detected.set(repoPath, info)
  return info
}

async function requireHost(repoPath: string): Promise<{ info: HostInfo; token: string }> {
  const info = detected.get(repoPath) ?? (await detect(repoPath))
  if (!info) throw new Error('This repository is not hosted on a supported service')
  const token = findToken(info.kind, info.baseUrl)
  if (!token) throw new Error(`No account for ${info.baseUrl}. Add one in Settings.`)
  return { info, token }
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
    if (kind !== 'azure') throw new Error(`${kind} accounts are not supported yet`)
    const url = baseUrl.trim().replace(/\/+$/, '')
    if (!/^https:\/\/dev\.azure\.com\/[^/]+$|^https:\/\/[^./]+\.visualstudio\.com$/i.test(url)) {
      throw new Error('Enter the organisation URL, for example https://dev.azure.com/my-org')
    }
    const user = await azure.validateToken(url, token.trim())
    return storeAccount(kind, url, user, token.trim())
  },
  async removeAccount(kind, baseUrl) {
    deleteAccount(kind, baseUrl)
  },
  async pullRequests(repoPath) {
    const { info, token } = await requireHost(repoPath)
    return azure.listPullRequests(info, token)
  },
  async pullRequest(repoPath, id) {
    const { info, token } = await requireHost(repoPath)
    return azure.getPullRequest(info, token, id)
  },
  async createPullRequest(repoPath, source, target, title, description, draft) {
    const { info, token } = await requireHost(repoPath)
    return azure.createPullRequest(info, token, source, target, title, description, draft)
  }
}
