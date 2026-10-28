import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { commit, git, initRepo, launch, menuItem, repoWithRemote, tempDir, view, write } from './helpers'

const parents = (repo: string, rev = 'HEAD'): string[] => git(repo, 'rev-list', '--parents', '-n', '1', rev).trim().split(' ').slice(1)

async function submenu(page: Page, parent: string | RegExp, item: string | RegExp): Promise<void> {
  const entry = page.locator('.submenu-layer .item', { hasText: item }).first()
  await expect(async () => {
    await page.locator('.context-menu-root > .context-menu > .item', { hasText: parent }).first().hover()
    await expect(entry).toBeInViewport({ timeout: 1000 })
  }).toPass()
  await entry.click()
}

test('pull with rebase from the Pull menu, and the fast-forward-only setting explains a diverged branch', async () => {
  const { repo, other } = repoWithRemote(tempDir())
  commit(repo, 'mine.txt', 'mine\n', 'My local work')
  commit(other, 'theirs.txt', 'theirs\n', 'Their pushed work')
  git(other, 'push', '-q', 'origin', 'main')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('arbor.settings', JSON.stringify({ backgroundFetch: 0, pullMode: 'ff-only' })))
    await page.reload()
    const v = view(page)
    await expect(v.locator('.commit-row').first()).toBeVisible()

    await v.getByRole('button', { name: /^⇣ Pull/ }).click()
    await expect(page.locator('.toast')).toContainText("Can't fast-forward")

    await v.getByRole('button', { name: 'Pull options' }).click()
    await menuItem(page, /^Rebase/)
    await expect(page.locator('.toast')).toContainText('Pulled')
    expect(git(repo, 'log', '--format=%s').trim().split('\n')).toEqual(['My local work', 'Their pushed work', 'Initial commit'])
    expect(parents(repo)).toHaveLength(1)
  } finally {
    await close()
  }
})

test('merge without fast-forward, squash merge into staged changes, and ignore untracked files', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial')
  git(repo, 'checkout', '-q', '-b', 'quick')
  commit(repo, 'quick.txt', 'quick\n', 'Quick fix')
  git(repo, 'checkout', '-q', 'main')
  git(repo, 'checkout', '-q', '-b', 'feature')
  commit(repo, 'one.txt', 'one\n', 'Feature part one')
  commit(repo, 'two.txt', 'two\n', 'Feature part two')
  git(repo, 'checkout', '-q', 'main')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const badge = (name: string) => v.locator('.refs-cell > .ref-badge', { hasText: new RegExp(`^${name}$`) }).first()

    await badge('quick').click({ button: 'right' })
    await submenu(page, /^Merge options/, 'Merge quick (no fast-forward)')
    await expect.poll(() => parents(repo)).toHaveLength(2)
    expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe("Merge branch 'quick'")

    const head = git(repo, 'rev-parse', 'HEAD').trim()
    await badge('feature').click({ button: 'right' })
    await submenu(page, /^Merge options/, 'Squash feature into main')
    await expect(page.locator('.toast')).toContainText('Review them, then commit')
    expect(git(repo, 'rev-parse', 'HEAD').trim()).toBe(head)
    expect(git(repo, 'diff', '--cached', '--name-only').trim().split('\n')).toEqual(['one.txt', 'two.txt'])
    await expect(v.getByRole('textbox', { name: 'Commit summary' })).toHaveValue('Merge feature (squashed)')
    await v.getByRole('textbox', { name: 'Commit summary' }).press('Control+Enter')
    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('Merge feature (squashed)')
    expect(parents(repo)).toHaveLength(1)

    write(repo, 'logs/build.log', 'noise\n')
    write(repo, 'secret[1].txt', 'shh\n')
    await expect(v.locator('.commit-row.wip')).toBeVisible()
    await v.locator('.commit-row.wip').click()
    await v.locator('.panel .file-item', { hasText: 'build.log' }).click({ button: 'right' })
    await menuItem(page, 'Ignore all .log files')
    await expect(page.locator('.toast')).toContainText('Added *.log to .gitignore')
    await v.locator('.panel .file-item', { hasText: 'secret[1].txt' }).click({ button: 'right' })
    await menuItem(page, 'Ignore file')
    await expect(v.locator('.panel .file-item', { hasText: 'secret[1].txt' })).toHaveCount(0)
    expect(readFileSync(join(repo, '.gitignore'), 'utf8')).toBe('*.log\n/secret\\[1\\].txt\n')
    expect(git(repo, 'status', '--porcelain', '--untracked-files=all').trim()).toBe('?? .gitignore')
  } finally {
    await close()
  }
})
