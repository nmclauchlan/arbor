import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

test('tags list newest version first and collapse past ten, and the current branch name fits in the graph', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial')
  for (const t of ['v0.1.0', 'v0.2.0', 'v0.3.0', 'v0.4.0', 'v0.5.0', 'v0.6.0', 'v0.7.0', 'v0.8.0', 'v0.9.0', 'v0.10.0', 'v1.0.0-rc.1', 'v1.0.0']) {
    git(repo, 'tag', t)
  }
  git(repo, 'checkout', '-q', '-b', 'feature/ux-polish')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const tags = v.locator('.sidebar .ref-item:has-text("v0."), .sidebar .ref-item:has-text("v1.")')
    await expect(tags).toHaveCount(10)
    await expect(tags.first()).toHaveText(/v1\.0\.0$/)
    await expect(tags.nth(1)).toHaveText(/v1\.0\.0-rc\.1$/)
    await expect(tags.nth(2)).toHaveText(/v0\.10\.0$/)
    await expect(tags.nth(3)).toHaveText(/v0\.9\.0$/)
    await v.getByRole('button', { name: 'Show all 12' }).click()
    await expect(tags).toHaveCount(12)
    await expect(tags.last()).toHaveText(/v0\.1\.0$/)

    const name = v.locator('.commit-row .refs-cell > .ref-badge .ref-name', { hasText: 'feature/ux-polish' }).first()
    await expect(name).toBeVisible()
    await expect.poll(() => name.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true)
  } finally {
    await close()
  }
})

test('narrow windows shrink the side panels so the graph keeps its room', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('arbor.layout', JSON.stringify({ sidebar: 300, panel: 600 })))
    await page.reload()
    await page.setViewportSize({ width: 1024, height: 700 })
    const v = view(page)
    await expect(v.locator('.commit-row').first()).toBeVisible()
    const list = await v.locator('.commit-list').evaluate((e) => e.getBoundingClientRect().width)
    const panel = await v.locator('.panel').evaluate((e) => e.getBoundingClientRect().width)
    expect(list).toBeGreaterThanOrEqual(455)
    expect(panel).toBeGreaterThanOrEqual(240)
    await page.setViewportSize({ width: 1800, height: 900 })
    await expect.poll(() => v.locator('.panel').evaluate((e) => e.getBoundingClientRect().width)).toBe(600)
  } finally {
    await close()
  }
})

test('diffs hide git header lines and describe renames and new files instead', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial')
  commit(repo, 'old-name.txt', 'one\ntwo\nthree\nfour\nfive\n', 'Add a file')
  git(repo, 'mv', 'old-name.txt', 'new-name.txt')
  write(repo, 'new-name.txt', 'one\ntwo\nthree\nfour\nfive\nsix\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'Rename and extend the file')
  write(repo, 'fresh.txt', 'hello\n')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.commit-row', { hasText: 'Rename and extend the file' }).click()
    await v.locator('.panel .file-item', { hasText: 'new-name.txt' }).click()
    const diff = v.locator('.file-viewer .diff')
    await expect(diff).toContainText('+six')
    await expect(diff).toContainText('Renamed from old-name.txt')
    await expect(diff).not.toContainText('diff --git')
    await expect(diff).not.toContainText('index ')
    await expect(diff).not.toContainText('+++ ')
    await page.keyboard.press('Escape')

    await v.locator('.commit-row.wip').click()
    await v.locator('.panel .file-item', { hasText: 'fresh.txt' }).click()
    await expect(diff).toContainText('+hello')
    await expect(diff).toContainText('New file')
    await expect(diff).not.toContainText('/dev/null')
  } finally {
    await close()
  }
})
