import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { commit, git, headSubject, launch, initRepo, tempDir, view, write } from './helpers'

test('stage and commit changes, then undo and redo the commit', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'one\n', 'First commit')
  const { page, close } = await launch(repo)
  try {
    write(repo, 'a.txt', 'one\ntwo\n')
    write(repo, 'src/new.ts', 'export const x = 1\n')
    const v = view(page)
    const wip = v.locator('.commit-row.wip')
    await expect(wip).toContainText('2 uncommitted changes', { timeout: 15_000 })
    await wip.click()

    await v.getByRole('button', { name: 'Stage all', exact: true }).click()
    await expect(v.locator('.file-group-title', { hasText: 'Staged (2)' })).toBeVisible()

    await v.locator('.commit-form textarea').fill('Add the second line')
    await v.locator('.commit-form textarea').press('Control+Enter')
    await expect.poll(() => headSubject(page)).toBe('Add the second line')
    expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe('Add the second line')

    const undo = v.getByRole('button', { name: 'Undo' })
    await expect(undo).toBeEnabled()
    await expect(undo).toHaveAttribute('title', /Commit “Add the second line”/)
    await undo.click()
    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('First commit')
    expect(git(repo, 'diff', '--cached', '--name-only').trim().split('\n').sort()).toEqual(['a.txt', 'src/new.ts'])

    await v.getByRole('button', { name: 'Redo' }).click()
    await expect.poll(() => git(repo, 'log', '-1', '--format=%s').trim()).toBe('Add the second line')
  } finally {
    await close()
  }
})

test('changed files switch between tree and flat views and discard restores a file', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'src/lib/util.ts', 'export const a = 1\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    write(repo, 'src/lib/util.ts', 'export const a = 2\n')
    const v = view(page)
    await v.locator('.commit-row.wip').click({ timeout: 15_000 })
    await v.getByRole('button', { name: 'Tree' }).first().click()
    await expect(v.locator('.dir-item', { hasText: 'src/lib' })).toBeVisible()
    await v.getByRole('button', { name: 'Flat' }).first().click()
    await expect(v.locator('.file-item', { hasText: 'src/lib/util.ts' })).toBeVisible()

    await v.locator('.file-item', { hasText: 'util.ts' }).hover()
    await v.locator('.file-item', { hasText: 'util.ts' }).getByTitle('Discard').click()
    await page.locator('.dialog .buttons button', { hasText: 'OK' }).click()
    await expect.poll(() => readFileSync(join(repo, 'src/lib/util.ts'), 'utf8')).toBe('export const a = 1\n')
  } finally {
    await close()
  }
})

test('clicking a changed file previews its diff in the main view', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'notes.md', 'hello\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    write(repo, 'notes.md', 'hello\nworld\n')
    const v = view(page)
    await v.locator('.commit-row.wip').click({ timeout: 15_000 })
    await v.locator('.file-item', { hasText: 'notes.md' }).click()
    await expect(v.locator('.file-viewer')).toBeVisible()
    await expect(v.locator('.file-viewer .diff tr.add')).toContainText('world')
    await v.locator('.file-item', { hasText: 'notes.md' }).click()
    await expect(v.locator('.file-viewer')).toBeHidden()
    await v.locator('.file-item', { hasText: 'notes.md' }).click()
    await expect(v.locator('.file-viewer')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(v.locator('.file-viewer')).toBeHidden()
    await v.locator('.file-item', { hasText: 'notes.md' }).dblclick()
    await expect(v.locator('.file-viewer .cm-editor')).toBeVisible()
    await page.keyboard.press('Escape')
    await v.locator('.file-viewer-bar > button', { hasText: '✕ Close' }).click()
    await v.locator('.commit-row', { hasText: 'Initial' }).click()
    const committed = v.locator('.panel .file-item', { hasText: 'notes.md' })
    await committed.click()
    await expect(v.locator('.file-viewer')).toBeVisible()
    await committed.click()
    await expect(v.locator('.file-viewer')).toBeHidden()
    expect(existsSync(join(repo, 'notes.md'))).toBe(true)
  } finally {
    await close()
  }
})
