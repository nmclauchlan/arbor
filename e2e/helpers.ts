import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const MAIN = join(__dirname, '..')

let clock = Date.parse('2026-01-01T09:00:00Z')

export function git(cwd: string, ...args: string[]): string {
  const env = { ...process.env }
  if (args.includes('commit') || args.includes('merge')) {
    clock += 60_000
    const stamp = new Date(clock).toISOString()
    env.GIT_AUTHOR_DATE = stamp
    env.GIT_COMMITTER_DATE = stamp
  }
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export function tempDir(prefix = 'arbor-e2e-'): string {
  return mkdtempSync(join(process.env.ARBOR_E2E_TMP ?? tmpdir(), prefix))
}

export function write(repo: string, file: string, content: string): void {
  const p = join(repo, file)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content)
}

function configure(repo: string): void {
  git(repo, 'config', 'user.name', 'E2E Tester')
  git(repo, 'config', 'user.email', 'e2e@example.com')
  git(repo, 'config', 'core.autocrlf', 'false')
  git(repo, 'config', 'commit.gpgsign', 'false')
}

export function commit(repo: string, file: string, content: string, message: string): void {
  write(repo, file, content)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', message)
}

export function initRepo(root: string, name = 'repo'): string {
  const repo = join(root, name)
  mkdirSync(repo, { recursive: true })
  git(repo, 'init', '-q', '-b', 'main')
  configure(repo)
  return repo
}

export function repoWithRemote(root: string, name = 'repo'): { repo: string; remote: string; other: string } {
  const remote = join(root, `${name}.git`)
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  const repo = join(root, name)
  git(root, 'clone', '-q', remote, repo)
  configure(repo)
  commit(repo, 'README.md', '# readme\n', 'Initial commit')
  git(repo, 'push', '-q', 'origin', 'main')
  const other = join(root, `${name}-other`)
  git(root, 'clone', '-q', remote, other)
  configure(other)
  return { repo, remote, other }
}

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
  close: () => Promise<void>
}

export async function launch(repoPath?: string, userData = tempDir('arbor-profile-')): Promise<Launched> {
  const args = [MAIN]
  if (process.platform === 'linux') args.push('--no-sandbox')
  if (repoPath) args.push(repoPath)
  const scratch = process.env.ARBOR_E2E_TMP
  const app = await electron.launch({
    args,
    env: { ...process.env, ...(scratch && { TMP: scratch, TEMP: scratch, TMPDIR: scratch }), ARBOR_USER_DATA: userData, NODE_ENV: 'production' } as Record<string, string>
  })
  const page = await app.firstWindow()
  await page.waitForSelector('.app')
  if (repoPath) await expect(page.locator('.repo-view:not([hidden]) .commit-row').first()).toBeVisible({ timeout: 20_000 })
  return {
    app,
    page,
    userData,
    close: async () => {
      await app.close().catch(() => undefined)
      try {
        rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      } catch {
        // Windows can keep Electron's helper processes alive briefly; the run's teardown removes it later.
      }
    }
  }
}

export function view(page: Page) {
  return page.locator('.repo-view:not([hidden])')
}

export async function headSubject(page: Page): Promise<string> {
  return (await view(page).locator('.commit-row:not(.wip) .subject .text').first().textContent()) ?? ''
}

export async function answerPrompt(page: Page, value: string): Promise<void> {
  const input = page.locator('.dialog input').first()
  await expect(input).toBeVisible()
  await input.fill(value)
  await page.locator('.dialog .buttons button', { hasText: 'OK' }).click()
}

export async function confirmDialog(page: Page, ok = true): Promise<void> {
  const button = page.locator('.dialog .buttons button', { hasText: ok ? 'OK' : 'Cancel' })
  await expect(button).toBeVisible()
  await button.click()
}

export async function menuItem(page: Page, text: string | RegExp): Promise<void> {
  await page.locator('.context-menu .item', { hasText: text }).first().click()
}

export async function recordBusy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __busy: string[] }
    w.__busy = []
    new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target as HTMLElement
        if (el.getAttribute('aria-busy') === 'true') w.__busy.push(el.textContent?.trim() ?? '')
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-busy'] })
  })
}

export async function busySeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __busy: string[] }).__busy)
}
