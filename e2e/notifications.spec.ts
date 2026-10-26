import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, repoWithRemote, tempDir, view } from './helpers'

test('the bell lists incoming commits after a fetch, opens them and pulls them', async () => {
  const root = tempDir()
  const { repo, other } = repoWithRemote(root)
  commit(other, 'one.txt', '1\n', 'Remote change one')
  commit(other, 'two.txt', '2\n', 'Remote change two')
  git(other, 'push', '-q', 'origin', 'main')
  const latest = git(other, 'rev-parse', 'HEAD').trim()

  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('arbor.settings', JSON.stringify({ pollInterval: 60 })))
    await page.reload()
    await expect(view(page).locator('.commit-row').first()).toBeVisible()
    const bell = page.getByRole('button', { name: /^Notifications/ })
    await bell.click()
    const panel = page.locator('.notifications-panel')
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: 'Check now' }).click()

    const branch = panel.locator('.notifications-branch', { hasText: 'main' })
    await expect(branch).toContainText('2 new from origin/main', { timeout: 20_000 })
    await expect(branch.locator('.notifications-commit')).toHaveCount(2)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page.locator('.notif-badge')).toHaveText('2')

    await bell.click()
    await expect(page.locator('.notif-badge')).toHaveCount(0)
    await panel.locator('.notifications-commit', { hasText: 'Remote change two' }).click()
    await expect(panel).toBeHidden()
    await expect(view(page).locator('.commit-row.selected')).toHaveAttribute('data-hash', latest)

    await bell.click()
    await panel.locator('.notifications-branch', { hasText: 'main' }).getByRole('button', { name: 'Pull' }).click()
    await expect(page.locator('.toast')).toContainText('Pulled repo')
    await expect(panel.locator('.notifications-branch')).toHaveCount(0)
    expect(git(repo, 'rev-parse', 'HEAD').trim()).toBe(latest)
  } finally {
    await close()
  }
})

test('the notifications panel sits below the bell and closes while a check is still running', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'remote', 'add', 'origin', 'http://10.255.255.1/unreachable.git')
  const { page, close } = await launch(repo)
  try {
    const bell = page.getByRole('button', { name: /^Notifications/ })
    const panel = page.locator('.notifications-panel')
    for (const method of ['bell', 'outside', 'escape'] as const) {
      await bell.click()
      await expect(panel).toBeVisible()
      const bellBox = (await bell.boundingBox())!
      const panelBox = (await panel.boundingBox())!
      expect(panelBox.y).toBeGreaterThanOrEqual(bellBox.y + bellBox.height)
      const check = panel.locator('.notifications-head button')
      if (await check.isEnabled()) await check.click()
      await expect(panel.getByRole('button', { name: /Checking/ })).toBeVisible()
      if (method === 'bell') await bell.click()
      if (method === 'outside') await page.mouse.click(300, 500)
      if (method === 'escape') await page.keyboard.press('Escape')
      await expect(panel, `closing with ${method} while checking`).toBeHidden()
    }
  } finally {
    await close()
  }
})
