import { expect, test, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

function setup(): { repo: string; shas: Record<string, string> } {
  const repo = initRepo(tempDir())
  commit(repo, 'README.md', '# app\n', 'Initial')
  commit(repo, 'one.txt', 'one\n', '#101 Add feature one')
  commit(repo, 'one-fix.txt', 'fix\n', 'Fix typo in feature one')
  commit(repo, 'two.txt', 'two\n', 'Add feature two')
  commit(repo, 'debug.txt', 'debug\n', 'WIP debug logging')
  const subjects = git(repo, 'log', '--format=%H %s').trim().split('\n')
  const shas: Record<string, string> = {}
  for (const line of subjects) shas[line.slice(41)] = line.slice(0, 40)
  return { repo, shas }
}

const subjects = (repo: string): string[] => git(repo, 'log', '--format=%s').trim().split('\n')

async function commitMenu(page: Page, subject: string, item: string): Promise<void> {
  await view(page).locator('.commit-row', { hasText: subject }).locator('.subject').click({ button: 'right' })
  await page.locator('.context-menu-root > .context-menu > .item', { hasText: item }).click()
}

test('interactive rebase reorders, rewords, folds and drops commits, and undo restores the branch', async () => {
  const { repo, shas } = setup()
  const { page, close } = await launch(repo)
  try {
    await commitMenu(page, 'Initial', 'Interactive rebase from here…')
    const dialog = page.getByRole('dialog', { name: 'Interactive rebase' })
    const rows = dialog.locator('.rebase-row .subject')
    await expect(rows).toHaveText(['#101 Add feature one', 'Fix typo in feature one', 'Add feature two', 'WIP debug logging'])
    await expect(dialog.getByRole('button', { name: /Rebase 4 commits/ })).toBeDisabled()

    await dialog.getByRole('button', { name: 'Move Add feature two up' }).click()
    await dialog.getByRole('button', { name: 'Move Add feature two up' }).click()
    await expect(rows).toHaveText(['Add feature two', '#101 Add feature one', 'Fix typo in feature one', 'WIP debug logging'])
    await dialog.getByRole('combobox', { name: 'Action for #101 Add feature one' }).selectOption('reword')
    await dialog.getByRole('textbox', { name: 'New message for #101 Add feature one' }).fill('#101 Add feature one, with the typo fixed')
    await dialog.getByRole('combobox', { name: 'Action for Fix typo in feature one' }).selectOption('fixup')
    await dialog.getByRole('combobox', { name: 'Action for WIP debug logging' }).selectOption('drop')
    await dialog.getByRole('button', { name: /Rebase 4 commits/ }).click()

    await expect(page.locator('.toast')).toContainText('Rebased 4 commits', { timeout: 20_000 })
    expect(subjects(repo)).toEqual(['#101 Add feature one, with the typo fixed', 'Add feature two', 'Initial'])
    expect(existsSync(join(repo, 'one-fix.txt'))).toBe(true)
    expect(existsSync(join(repo, 'debug.txt'))).toBe(false)

    await view(page).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => git(repo, 'rev-parse', 'HEAD').trim()).toBe(shas['WIP debug logging'])
  } finally {
    await close()
  }
})

test('quick reword, squash into parent and drop keep uncommitted work and "#" subject lines', async () => {
  const { repo } = setup()
  write(repo, 'README.md', '# app\nwork in progress\n')
  const { page, close } = await launch(repo)
  try {
    const dialog = page.getByRole('dialog', { name: 'Interactive rebase' })

    await commitMenu(page, 'Fix typo in feature one', 'Squash into parent commit')
    await expect(dialog.getByRole('combobox', { name: 'Action for Fix typo in feature one' })).toHaveValue('squash')
    await dialog.getByRole('button', { name: /Rebase \d+ commits/ }).click()
    await expect.poll(() => subjects(repo)).toEqual(['WIP debug logging', 'Add feature two', '#101 Add feature one', 'Initial'])
    expect(git(repo, 'log', '-1', '--format=%B', 'HEAD~2').trim()).toBe('#101 Add feature one\n\nFix typo in feature one')
    await expect(view(page).locator('.commit-row .subject .text', { hasText: /^Fix typo in feature one$/ })).toHaveCount(0)

    await commitMenu(page, 'WIP debug logging', 'Reword commit message…')
    const message = dialog.getByRole('textbox', { name: 'New message for WIP debug logging' })
    await expect(message).toBeFocused()
    await message.fill('Add debug logging')
    await dialog.getByRole('button', { name: /Rebase 1 commit/ }).click()
    await expect.poll(() => subjects(repo)[0]).toBe('Add debug logging')
    await expect(view(page).locator('.commit-row', { hasText: 'Add debug logging' })).toBeVisible()

    await commitMenu(page, 'Add feature two', 'Drop commit…')
    await expect(dialog.getByRole('combobox', { name: 'Action for Add feature two' })).toHaveValue('drop')
    await dialog.getByRole('button', { name: /Rebase 2 commits/ }).click()
    await expect.poll(() => subjects(repo)).toEqual(['Add debug logging', '#101 Add feature one', 'Initial'])
    expect(existsSync(join(repo, 'two.txt'))).toBe(false)
    expect(readFileSync(join(repo, 'README.md'), 'utf8')).toBe('# app\nwork in progress\n')
  } finally {
    await close()
  }
})
