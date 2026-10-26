import { expect, test } from '@playwright/test'
import { answerPrompt, commit, git, launch, menuItem, recordBusy, busySeen, repoWithRemote, tempDir } from './helpers'

function seed(paths: string[], groups: { id: string; name: string; color: string }[] = [], groupOf: Record<string, string> = {}): string {
  return JSON.stringify({
    tabs: paths.map((p) => ({ path: p.replace(/\\/g, '/'), group: groupOf[p] })),
    groups
  })
}

test('repositories open as tabs and can be filed into a new group', async () => {
  const root = tempDir()
  const a = repoWithRemote(root, 'alpha').repo
  const b = repoWithRemote(root, 'beta').repo
  const { page, close } = await launch()
  try {
    await page.evaluate((value) => localStorage.setItem('arbor.tabs', value), seed([a, b]))
    await page.reload()
    const tabs = page.locator('.tabs .tab:not(.tab-add):not(.tab-overflow) .tab-name')
    await expect(tabs).toHaveText(['alpha', 'beta'])

    await page.locator('.tabs .tab', { hasText: 'beta' }).click({ button: 'right' })
    await menuItem(page, 'Move to new group…')
    await answerPrompt(page, 'Services')
    const chip = page.locator('.tab-group', { hasText: 'Services' })
    await expect(chip).toBeVisible()
    await expect(chip.locator('.count')).toHaveText('1')

    await chip.click()
    await expect(page.locator('.group-dropdown .group-row', { hasText: 'beta' })).toBeVisible()
  } finally {
    await close()
  }
})

test('pull all fast-forwards every repository in a group and reports the outcome', async () => {
  const root = tempDir()
  const one = repoWithRemote(root, 'one')
  const two = repoWithRemote(root, 'two')
  commit(one.other, 'remote.txt', 'new\n', 'Remote change for one')
  git(one.other, 'push', '-q', 'origin', 'main')
  const { page, close } = await launch()
  try {
    const group = { id: 'g1', name: 'Services', color: '#3e9cf0' }
    await page.evaluate(
      (value) => localStorage.setItem('arbor.tabs', value),
      seed([one.repo, two.repo], [group], { [one.repo]: 'g1', [two.repo]: 'g1' })
    )
    await page.reload()
    await recordBusy(page)
    const chip = page.locator('.tab-group', { hasText: 'Services' })
    await expect(chip.locator('.count')).toHaveText('2')
    await chip.click({ button: 'right' })
    await menuItem(page, 'Pull all (2)')

    const toast = page.locator('.toast')
    await expect(toast).toContainText('Pulled Services', { timeout: 20_000 })
    await expect(toast).toContainText('Updated 1: one')
    await expect(toast).toContainText('Already up to date: 1')
    expect(git(one.repo, 'log', '-1', '--format=%s').trim()).toBe('Remote change for one')
  } finally {
    await close()
  }
})

test('the toolbar Fetch button shows a spinner while it runs', async () => {
  const root = tempDir()
  const { repo, other } = repoWithRemote(root)
  commit(other, 'b.txt', 'b\n', 'Remote work')
  git(other, 'push', '-q', 'origin', 'main')
  const { page, close } = await launch(repo)
  try {
    await recordBusy(page)
    await page.locator('.repo-view:not([hidden]) .toolbar').getByRole('button', { name: /Fetch/ }).click()
    await expect(page.locator('.toast')).toContainText('Fetched', { timeout: 15_000 })
    expect((await busySeen(page)).some((t) => /Fetch/.test(t))).toBe(true)
    await expect(page.locator('.repo-view:not([hidden]) .toolbar button[aria-busy="true"]')).toHaveCount(0)
  } finally {
    await close()
  }
})
