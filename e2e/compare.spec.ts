import { expect, test, type Page } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

function setup(): string {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial')
  git(repo, 'checkout', '-q', '-b', 'feature')
  commit(repo, 'feature.txt', 'feature line\n', 'Feature work')
  git(repo, 'checkout', '-q', 'main')
  commit(repo, 'main.txt', 'main line\n', 'Main work')
  return repo
}

async function compareFrom(page: Page, open: () => Promise<void>, item: string | RegExp): Promise<void> {
  await open()
  const entry = page.locator('.submenu-layer .item', { hasText: item }).first()
  await expect(async () => {
    await page.locator('.context-menu-root > .context-menu > .item', { hasText: /^Compare/ }).first().hover()
    await expect(entry).toBeInViewport({ timeout: 1000 })
  }).toPass()
  await entry.click()
}

test('compare a branch since it diverged or directly, swap sides, list commits and compare with the working tree', async () => {
  const repo = setup()
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const compare = v.locator('.compare-view')
    const files = compare.locator('.compare-side-body .file-item')

    await compareFrom(page, () => v.locator('.refs-cell > .ref-badge', { hasText: 'feature' }).first().click({ button: 'right' }), 'feature with main')
    await expect(compare).toBeVisible()
    await expect(v.locator('.commit-list')).toHaveCount(0)
    await expect(files).toHaveCount(1)
    await expect(files.first()).toContainText('feature.txt')
    await expect(compare.locator('.compare-diff')).toContainText('feature line')

    await compare.getByRole('tab', { name: 'Direct' }).click()
    await expect(files).toHaveCount(2)
    await expect(compare.locator('.compare-side-body')).toContainText('main.txt')

    await compare.getByRole('button', { name: 'Swap sides' }).click()
    await expect(compare.locator('.file-viewer-bar .ref-badge').first()).toHaveText('feature')
    await files.filter({ hasText: 'main.txt' }).click()
    await expect(compare.locator('.compare-diff')).toContainText('+main line')

    await compare.getByRole('tab', { name: /Commits \(2\)/ }).click()
    await expect(compare.locator('.compare-group').first()).toContainText('Only on main (1)')
    await expect(compare.locator('.compare-group').first()).toContainText('Main work')
    await compare.locator('.file-history-item', { hasText: 'Feature work' }).click()
    await expect(compare).toHaveCount(0)
    await expect(v.locator('.commit-row.selected')).toContainText('Feature work')

    write(repo, 'README.md', '# app\nuncommitted line\n')
    await compareFrom(page, () => v.locator('.commit-row', { hasText: 'Initial' }).locator('.subject').click({ button: 'right' }), 'with the working tree')
    await expect(compare.locator('.file-viewer-bar')).toContainText('Working tree')
    await expect(compare.getByRole('tab', { name: /Commits/ })).toHaveCount(0)
    await files.filter({ hasText: 'README.md' }).click()
    await expect(compare.locator('.compare-diff')).toContainText('+uncommitted line')

    await page.keyboard.press('Escape')
    await expect(compare).toHaveCount(0)
    await expect(v.locator('.commit-list')).toBeVisible()
  } finally {
    await close()
  }
})
