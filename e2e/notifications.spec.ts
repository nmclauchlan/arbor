import { expect, test, type Page } from '@playwright/test'
import { commit, git, initRepo, launch, repoWithRemote, tempDir, view } from './helpers'

function baselines(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('arbor.incomingBaselines') ?? '{}')) as string[])
}

test('the bell lists only commits that arrive after the first check, opens them and pulls them', async () => {
  test.slow()
  const root = tempDir()
  const { repo, other } = repoWithRemote(root)
  commit(other, 'old.txt', 'old\n', 'Remote change from before')
  git(other, 'push', '-q', 'origin', 'main')
  const before = git(other, 'rev-parse', 'HEAD').trim()

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
    await expect.poll(() => baselines(page), { timeout: 20_000 }).toContain(before)
    await expect(panel.locator('.notifications-branch')).toHaveCount(0)
    await expect(panel.locator('.notifications-empty')).toContainText('No new commits')

    commit(other, 'one.txt', '1\n', 'Remote change one')
    commit(other, 'two.txt', '2\n', 'Remote change two')
    git(other, 'push', '-q', 'origin', 'main')
    const latest = git(other, 'rev-parse', 'HEAD').trim()
    await panel.getByRole('button', { name: 'Check now' }).click()

    const entry = panel.locator('.notifications-branch', { hasText: 'origin/main' })
    await expect(entry).toContainText('2 new', { timeout: 20_000 })
    await expect(entry.locator('.notifications-commit')).toHaveCount(2)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page.locator('.notif-badge')).toHaveText('2')

    await bell.click()
    await expect(page.locator('.notif-badge')).toHaveCount(0)
    await panel.locator('.notifications-commit', { hasText: 'Remote change two' }).click()
    await expect(panel).toBeHidden()
    await expect(view(page).locator('.commit-row.selected')).toHaveAttribute('data-hash', latest)

    await bell.click()
    await entry.getByRole('button', { name: 'Pull' }).click()
    await expect(page.locator('.toast')).toContainText('Pulled repo')
    await expect(panel.locator('.notifications-branch')).toHaveCount(0)
    expect(git(repo, 'rev-parse', 'HEAD').trim()).toBe(latest)
  } finally {
    await close()
  }
})

test('cleared remote branches only show later commits, and branches tracking the same remote share an entry', async () => {
  test.slow()
  const { repo, other } = repoWithRemote(tempDir())
  git(repo, 'checkout', '-q', '-b', 'develop')
  commit(repo, 'd.txt', 'd\n', 'Develop start')
  git(repo, 'push', '-q', '-u', 'origin', 'develop')
  git(repo, 'checkout', '-q', 'main')
  git(repo, 'branch', '-q', '--track', 'cve-fix', 'origin/main')

  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('arbor.settings', JSON.stringify({ backgroundFetch: 0 })))
    await page.reload()
    await expect(view(page).locator('.commit-row').first()).toBeVisible()
    const bell = page.getByRole('button', { name: /^Notifications/ })
    const panel = page.locator('.notifications-panel')
    const entry = (upstream: string) => panel.locator('.notifications-branch', { has: page.locator('.ref-badge', { hasText: new RegExp(`^${upstream}$`) }) })
    await bell.click()
    await panel.getByRole('button', { name: 'Check now' }).click()
    await expect.poll(() => baselines(page).then((b) => b.length), { timeout: 20_000 }).toBe(2)

    git(other, 'fetch', '-q', 'origin')
    git(other, 'checkout', '-q', 'develop')
    commit(other, 'd2.txt', 'd2\n', 'Remote develop change')
    git(other, 'push', '-q', 'origin', 'develop')
    git(other, 'checkout', '-q', 'main')
    commit(other, 'm.txt', 'm\n', 'Remote main change')
    git(other, 'push', '-q', 'origin', 'main')
    await panel.getByRole('button', { name: 'Check now' }).click()
    await expect(entry('origin/main')).toContainText('1 new', { timeout: 20_000 })
    await expect(entry('origin/develop')).toContainText('1 new')
    await expect(panel.locator('.notifications-branch')).toHaveCount(2)

    await entry('origin/develop').getByRole('button', { name: 'Clear origin/develop', exact: true }).click()
    await expect(entry('origin/develop')).toHaveCount(0)
    await expect(panel.locator('.notifications-foot')).toContainText('Cleared 1')
    await panel.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(entry('origin/develop')).toContainText('1 new')
    await expect(panel.locator('.notifications-foot')).toHaveCount(0)

    await panel.getByRole('button', { name: 'Clear all', exact: true }).click()
    await expect(panel.locator('.notifications-branch')).toHaveCount(0)
    await expect(panel.locator('.notifications-empty')).toContainText('Nothing new since you cleared them')
    await page.keyboard.press('Escape')
    await bell.click()
    await expect(panel.locator('.notifications-foot')).toHaveCount(0)
    await expect(panel.locator('.notifications-empty')).toContainText('No new commits')

    await page.reload()
    await expect(view(page).locator('.commit-row').first()).toBeVisible()
    git(other, 'checkout', '-q', 'develop')
    commit(other, 'd3.txt', 'd3\n', 'Another develop change')
    git(other, 'push', '-q', 'origin', 'develop')
    await bell.click()
    await panel.getByRole('button', { name: 'Check now' }).click()
    await expect(entry('origin/develop')).toContainText('1 new', { timeout: 20_000 })
    await expect(entry('origin/develop').locator('.notifications-commit')).toHaveCount(1)
    await expect(entry('origin/develop').locator('.notifications-commit')).toContainText('Another develop change')
    await expect(entry('origin/main')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('the notifications panel sits below the bell and closes while a check is still running', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'remote', 'add', 'origin', 'ssh://git@example.invalid/slow.git')
  git(repo, 'config', 'core.sshCommand', 'sleep 4; false')
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
      const check = panel.getByRole('button', { name: /^(Check now|Checking…)$/ })
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
