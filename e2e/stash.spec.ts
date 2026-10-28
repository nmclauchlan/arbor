import { expect, test } from '@playwright/test'
import { answerPrompt, commit, git, initRepo, launch, menuItem, tempDir, view, write } from './helpers'

const stashes = (repo: string): string[] => git(repo, 'stash', 'list', '--format=%gs').split('\n').filter(Boolean)
const changed = (repo: string): string[] =>
  git(repo, 'status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
    .sort()

test('stash with a message and untracked files, inspect it, apply it, branch from it and stash a single file', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial')
  commit(repo, 'a.txt', 'a\n', 'Add a')
  write(repo, 'a.txt', 'a changed\n')
  write(repo, 'notes.txt', 'a note\n')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const dialog = page.getByRole('dialog', { name: 'Stash changes' })

    await v.locator('.toolbar').getByRole('button', { name: /Stash/ }).click()
    await expect(dialog.getByRole('checkbox', { name: 'Include untracked files' })).toBeChecked()
    await dialog.getByRole('textbox', { name: 'Stash message' }).fill('Half-done work')
    await dialog.getByRole('button', { name: 'Stash', exact: true }).click()
    await expect.poll(() => stashes(repo)).toEqual(['On main: Half-done work'])
    expect(changed(repo)).toEqual([])

    const item = v.locator('.sidebar .ref-item', { hasText: 'Half-done work' })
    await item.click()
    await expect(v.locator('.panel .file-item', { hasText: 'a.txt' })).toBeVisible()
    await v.locator('.panel .file-item', { hasText: 'notes.txt' }).click()
    await expect(v.locator('.file-viewer')).toContainText('+a note')
    await page.keyboard.press('Escape')

    await item.click({ button: 'right' })
    await menuItem(page, 'Apply stash')
    await expect.poll(() => changed(repo)).toEqual(['a.txt', 'notes.txt'])
    expect(stashes(repo)).toHaveLength(1)

    git(repo, 'checkout', '-q', '--', '.')
    git(repo, 'clean', '-fdq')
    await item.click({ button: 'right' })
    await menuItem(page, 'Create branch from stash')
    await answerPrompt(page, 'rescued')
    await expect(page.locator('.toast')).toContainText('Created rescued from stash@{0}')
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('rescued')
    expect(stashes(repo)).toEqual([])
    expect(changed(repo)).toEqual(['a.txt', 'notes.txt'])

    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', 'Rescued work')
    write(repo, 'a.txt', 'a again\n')
    write(repo, 'README.md', '# app\nmore\n')
    await v.locator('.commit-row.wip').click()
    await v.locator('.panel .file-item', { hasText: 'a.txt' }).click({ button: 'right' })
    await menuItem(page, 'Stash file')
    await expect(dialog.getByRole('heading')).toHaveText('Stash a.txt')
    await dialog.getByRole('button', { name: 'Stash', exact: true }).click()
    await expect.poll(() => changed(repo)).toEqual(['README.md'])
    expect(stashes(repo)).toHaveLength(1)

    await v.locator('.toolbar').getByRole('button', { name: /Pop/ }).click()
    await expect.poll(() => changed(repo)).toEqual(['README.md', 'a.txt'])
    expect(stashes(repo)).toEqual([])
  } finally {
    await close()
  }
})
