import { expect, test } from '@playwright/test'
import { answerPrompt, commit, confirmDialog, git, launch, initRepo, menuItem, tempDir, view } from './helpers'

function branchSha(repo: string, name: string): string {
  try {
    return git(repo, 'rev-parse', '--verify', '-q', `refs/heads/${name}`).trim()
  } catch {
    return ''
  }
}

function currentBranch(repo: string): string {
  return git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()
}

test('create a branch from the toolbar, filter for it, and undo its creation', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'branch', 'release/1.0')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.getByRole('button', { name: /Branch/ }).first().click()
    await answerPrompt(page, 'feature/search')
    await confirmDialog(page, true)
    await expect.poll(() => currentBranch(repo)).toBe('feature/search')
    await expect(v.locator('.toolbar')).toContainText('on feature/search')

    await page.keyboard.press('Control+b')
    await page.keyboard.type('search')
    const items = v.locator('.sidebar .ref-item')
    await expect(items.filter({ hasText: 'feature/search' })).toBeVisible()
    await expect(items.filter({ hasText: 'release/1.0' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await v.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => currentBranch(repo)).toBe('main')
    await expect.poll(() => git(repo, 'branch', '--list', 'feature/search').trim()).toBe('')
  } finally {
    await close()
  }
})

test('check out a branch by double-clicking it, then undo with Ctrl+Z', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'branch', 'develop')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.sidebar .ref-item', { hasText: 'develop' }).dblclick()
    await expect.poll(() => currentBranch(repo)).toBe('develop')
    await v.locator('.commit-row').first().click()
    await expect(v.getByRole('button', { name: 'Undo' })).toBeEnabled()
    await page.keyboard.press('Control+z')
    await expect.poll(() => currentBranch(repo)).toBe('main')
    await expect(page.locator('.toast')).toContainText('Undid: Checkout develop')
  } finally {
    await close()
  }
})

test('delete a branch from its context menu and restore it with undo', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'checkout', '-q', '-b', 'old-work')
  commit(repo, 'b.txt', 'b\n', 'Unmerged work')
  const sha = git(repo, 'rev-parse', 'HEAD').trim()
  git(repo, 'checkout', '-q', 'main')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.sidebar .ref-item', { hasText: 'old-work' }).click({ button: 'right' })
    await menuItem(page, 'Delete old-work')
    await confirmDialog(page, true)
    await expect(page.locator('.dialog')).toContainText('not fully merged')
    await confirmDialog(page, true)
    await expect.poll(() => git(repo, 'branch', '--list', 'old-work').trim()).toBe('')

    await v.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => branchSha(repo, 'old-work')).toBe(sha)
  } finally {
    await close()
  }
})
