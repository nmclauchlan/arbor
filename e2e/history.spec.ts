import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

function commitAs(repo: string, author: string, message: string): void {
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '--author', author, '-m', message)
}

test('file history follows renames and blame attributes each line to its commit', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'notes.md', 'first line\nsecond line\nthird line\n', 'Start the notes')
  write(repo, 'notes.md', 'first line\nsecond line by Bob\nthird line\n')
  commitAs(repo, 'Bob Builder <bob@example.com>', 'Bob edits the notes')
  const bob = git(repo, 'rev-parse', 'HEAD').trim()
  git(repo, 'mv', 'notes.md', 'guide.md')
  commitAs(repo, 'Alice Example <alice@example.com>', 'Rename notes to guide')
  write(repo, 'guide.md', 'first line\nsecond line by Bob\nthird line by Alice\n')
  commitAs(repo, 'Alice Example <alice@example.com>', 'Alice edits the guide')
  write(repo, 'guide.md', 'first line, not committed\nsecond line by Bob\nthird line by Alice\n')

  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.commit-row.wip').click({ timeout: 15_000 })
    await v.locator('.file-item', { hasText: 'guide.md' }).click()
    const tabs = v.locator('.file-viewer .view-tabs')
    await tabs.getByRole('tab', { name: 'History' }).click()

    const items = v.locator('.file-history-item')
    await expect(items).toHaveCount(4)
    await expect(items.locator('.subject')).toHaveText(['Alice edits the guide', 'Rename notes to guide', 'Bob edits the notes', 'Start the notes'])
    await expect(items.nth(1)).toContainText('renamed from notes.md')
    await expect(v.locator('.file-history-diff .diff tr.add')).toContainText('third line by Alice')
    await items.nth(2).click()
    await expect(v.locator('.file-history-diff .diff tr.add')).toContainText('second line by Bob')
    await v.locator('.file-history-bar').getByRole('button', { name: 'Show in graph' }).click()
    await expect(v.locator('.file-viewer')).toBeHidden()
    await expect(v.locator('.commit-row.selected')).toHaveAttribute('data-hash', bob)

    await v.locator('.commit-row.wip').click()
    await v.locator('.file-item', { hasText: 'guide.md' }).click({ button: 'right' })
    await page.locator('.context-menu-root .item', { hasText: 'Blame' }).click()
    await expect(tabs.getByRole('tab', { name: 'Blame' })).toHaveAttribute('aria-selected', 'true')
    const rows = v.locator('.blame tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).locator('.blame-info')).toHaveText('Not committed yet')
    await expect(rows.nth(1).locator('.blame-info')).toContainText('Bob Builder')
    await expect(rows.nth(1).locator('.code')).toHaveText('second line by Bob')
    await expect(rows.nth(2).locator('.blame-info')).toContainText('Alice Example')
    await rows.nth(1).locator('.blame-info').click()
    await expect(v.locator('.file-viewer')).toBeHidden()
    await expect(v.locator('.commit-row.selected')).toHaveAttribute('data-hash', bob)

    await v.locator('.panel .file-item', { hasText: 'notes.md' }).click({ button: 'right' })
    await page.locator('.context-menu-root .item', { hasText: 'Blame' }).click()
    await expect(v.locator('.file-viewer .muted').first()).toContainText(bob.slice(0, 7))
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).locator('.blame-info')).toContainText('E2E Tester')
  } finally {
    await close()
  }
})
