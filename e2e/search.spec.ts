import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

function commitAs(repo: string, author: string, file: string, content: string, message: string): void {
  write(repo, file, content)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '--author', author, '-m', message)
}

test('Ctrl+F searches commits by message, author, SHA, file path and code change', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial commit')
  commitAs(repo, 'Alice Example <alice@example.com>', 'src/login.ts', 'export const login = 1\n', 'Add login page')
  commitAs(repo, 'Bob Builder <bob@example.com>', 'README.md', '# app\nfixed\n', 'Fix typo in README')
  commitAs(repo, 'Alice Example <alice@example.com>', 'src/api/client.ts', 'export const client = 1\n', 'Refactor the api')
  commitAs(repo, 'Bob Builder <bob@example.com>', 'src/login.ts', 'export const login = 1\nconst magicToken = 2\n', 'Tidy login')
  commitAs(repo, 'Alice Example <alice@example.com>', 'src/other.ts', 'export const other = 1\n', 'Add other login helper')
  const typo = git(repo, 'rev-parse', 'HEAD~3').trim()
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const selected = v.locator('.commit-row.selected .subject .text')
    await expect(v.locator('.commit-row', { hasText: 'Initial commit' })).toBeVisible()
    await page.keyboard.press('Control+f')
    const bar = v.locator('.commit-search')
    const input = bar.getByRole('searchbox', { name: 'Search commits' })
    await expect(input).toBeFocused()

    await input.fill('login')
    await expect(bar.locator('.commit-search-count')).toHaveText('1 of 3')
    await expect(selected).toHaveText('Add other login helper')
    await expect(v.locator('.commit-row.match')).toHaveCount(3)
    await expect(v.locator('.commit-list.searching')).toHaveCount(1)
    await input.press('Enter')
    await expect(selected).toHaveText('Tidy login')
    await input.press('Shift+Enter')
    await expect(selected).toHaveText('Add other login helper')

    await bar.getByRole('combobox', { name: 'Search in' }).selectOption('author')
    await input.fill('bob')
    await expect(bar.locator('.commit-search-count')).toHaveText('1 of 2')
    await expect(selected).toHaveText('Tidy login')

    await bar.getByRole('combobox', { name: 'Search in' }).selectOption('file')
    await input.fill('client')
    await expect(bar.locator('.commit-search-count')).toHaveText('1 of 1')
    await expect(selected).toHaveText('Refactor the api')

    await bar.getByRole('combobox', { name: 'Search in' }).selectOption('code')
    await input.fill('magicToken')
    await expect(bar.locator('.commit-search-count')).toHaveText('1 of 1')
    await expect(selected).toHaveText('Tidy login')

    await bar.getByRole('combobox', { name: 'Search in' }).selectOption('all')
    await input.fill(typo.slice(0, 7))
    await expect(bar.locator('.commit-search-count')).toHaveText('1 of 1')
    await expect(selected).toHaveText('Fix typo in README')

    await input.fill('nothing like this')
    await expect(bar.locator('.commit-search-count')).toHaveText('No matches')

    await input.press('Escape')
    await expect(bar).toHaveCount(0)
    await expect(v.locator('.commit-list.searching')).toHaveCount(0)
  } finally {
    await close()
  }
})
