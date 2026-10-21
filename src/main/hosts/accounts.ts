import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { HostAccount, HostKind } from '@shared/types'

interface StoredAccount extends HostAccount {
  token: string
}

let cache: StoredAccount[] | null = null

function file(): string {
  return join(app.getPath('userData'), 'accounts.json')
}

function load(): StoredAccount[] {
  if (cache) return cache
  try {
    cache = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    cache = []
  }
  return cache!
}

function save(list: StoredAccount[]): void {
  cache = list
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(list, null, 2))
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function normalise(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').toLowerCase()
}

export function listAccounts(): HostAccount[] {
  return load().map(({ kind, baseUrl, user, encrypted }) => ({ kind, baseUrl, user, encrypted }))
}

export function findToken(kind: HostKind, baseUrl: string): string | null {
  const acc = load().find((a) => a.kind === kind && a.baseUrl === normalise(baseUrl))
  if (!acc) return null
  if (!acc.encrypted) return acc.token
  return safeStorage.decryptString(Buffer.from(acc.token, 'base64'))
}

export function storeAccount(kind: HostKind, baseUrl: string, user: string, token: string): HostAccount {
  const encrypted = canEncrypt()
  const stored = encrypted ? safeStorage.encryptString(token).toString('base64') : token
  const url = normalise(baseUrl)
  const list = load().filter((a) => !(a.kind === kind && a.baseUrl === url))
  list.push({ kind, baseUrl: url, user, encrypted, token: stored })
  save(list)
  return { kind, baseUrl: url, user, encrypted }
}

export function deleteAccount(kind: HostKind, baseUrl: string): void {
  const url = normalise(baseUrl)
  save(load().filter((a) => !(a.kind === kind && a.baseUrl === url)))
}
