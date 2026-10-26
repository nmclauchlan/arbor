import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { commit, git, launch, initRepo, menuItem, tempDir, view } from './helpers'

test('merge a conflicting branch, resolve it in the resolver and commit the merge', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'config.txt', 'colour=blue\nsize=small\n', 'Initial')
  git(repo, 'checkout', '-q', '-b', 'feature')
  commit(repo, 'config.txt', 'colour=green\nsize=small\n', 'Make it green')
  git(repo, 'checkout', '-q', 'main')
  commit(repo, 'config.txt', 'colour=red\nsize=small\n', 'Make it red')

  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.sidebar .ref-item', { hasText: 'feature' }).click({ button: 'right' })
    await menuItem(page, /Merge feature into/)

    const banner = v.locator('.operation-banner')
    await expect(banner).toContainText('Merge in progress', { timeout: 15_000 })
    await expect(banner).toContainText('1 file with conflicts')

    await v.locator('.file-item', { hasText: 'config.txt' }).click()
    const resolver = v.locator('.conflict-resolver')
    await expect(resolver).toBeVisible()
    await expect(resolver.locator('.conflict-side.ours')).toContainText('colour=red')
    await expect(resolver.locator('.conflict-side.theirs')).toContainText('colour=green')
    await resolver.getByRole('button', { name: 'All theirs' }).click()
    await expect(resolver.locator('.conflict-toolbar')).toContainText('1 of 1 conflict resolved')
    await resolver.getByRole('button', { name: 'Mark resolved' }).click()

    await expect(banner).not.toContainText('conflicts to resolve')
    await expect(v.locator('.file-group-title.conflicts')).toHaveCount(0)
    await expect(banner.getByRole('button', { name: 'Commit merge' })).toBeEnabled()
    expect(readFileSync(join(repo, 'config.txt'), 'utf8')).toBe('colour=green\nsize=small\n')
    await banner.getByRole('button', { name: 'Commit merge' }).click()
    await expect(banner).toBeHidden()
    await expect.poll(() => git(repo, 'log', '-1', '--format=%P').trim().split(' ').length).toBe(2)
  } finally {
    await close()
  }
})

test('abort a conflicting merge from the banner', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'x.txt', 'base\n', 'Initial')
  git(repo, 'checkout', '-q', '-b', 'other')
  commit(repo, 'x.txt', 'theirs\n', 'Theirs')
  git(repo, 'checkout', '-q', 'main')
  commit(repo, 'x.txt', 'ours\n', 'Ours')
  const before = git(repo, 'rev-parse', 'HEAD').trim()

  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.sidebar .ref-item', { hasText: 'other' }).click({ button: 'right' })
    await menuItem(page, /Merge other into/)
    const banner = v.locator('.operation-banner')
    await expect(banner).toContainText('Merge in progress', { timeout: 15_000 })
    await banner.getByRole('button', { name: 'Abort' }).click()
    await page.locator('.dialog .buttons button', { hasText: 'OK' }).click()
    await expect(banner).toBeHidden()
    expect(git(repo, 'rev-parse', 'HEAD').trim()).toBe(before)
    expect(readFileSync(join(repo, 'x.txt'), 'utf8')).toBe('ours\n')
  } finally {
    await close()
  }
})
