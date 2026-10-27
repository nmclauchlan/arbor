import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { commit, confirmDialog, git, initRepo, launch, tempDir, view, write } from './helpers'

const original = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`)

function edited(changes: Record<number, string>): string {
  return original.map((l, i) => changes[i + 1] ?? l).join('\n') + '\n'
}

const diffRow = (page: Page, kind: 'add' | 'del', text: string) =>
  view(page).locator(`.file-viewer .diff tr.${kind}`).filter({ has: page.locator('td:last-child', { hasText: new RegExp(`^.${text}$`) }) })

test('stage and unstage single chunks and individual lines, and discard selected lines', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'notes.txt', original.join('\n') + '\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    write(repo, 'notes.txt', edited({ 3: 'LINE 3 changed', 20: 'LINE 20 changed', 21: 'LINE 21 changed' }))
    const v = view(page)
    await v.locator('.commit-row.wip').click({ timeout: 15_000 })
    await v.locator('.file-item', { hasText: 'notes.txt' }).click()
    const hunks = v.locator('.file-viewer .diff tr.hunk')
    await expect(hunks).toHaveCount(2)
    await expect(v.locator('.file-viewer .muted').first()).toHaveText('unstaged')

    await hunks.first().getByRole('button', { name: 'Stage chunk' }).click()
    await expect(hunks).toHaveCount(1)
    expect(git(repo, 'diff', '--cached')).toContain('+LINE 3 changed')
    expect(git(repo, 'diff', '--cached')).not.toContain('LINE 20')
    expect(git(repo, 'diff')).not.toContain('LINE 3')

    await diffRow(page, 'del', 'line 21').click()
    await diffRow(page, 'add', 'LINE 21 changed').click()
    const bar = v.locator('.diff-selection')
    await expect(bar).toContainText('2 lines selected')
    await bar.getByRole('button', { name: 'Stage lines' }).click()
    await expect(bar).toBeHidden()
    const index = git(repo, 'show', ':notes.txt').split('\n')
    expect(index[19]).toBe('line 20')
    expect(index[20]).toBe('LINE 21 changed')
    expect(index[2]).toBe('LINE 3 changed')
    expect(git(repo, 'diff')).toContain('+LINE 20 changed')
    expect(git(repo, 'diff')).not.toContain('+LINE 21 changed')
    expect(git(repo, 'diff')).not.toContain('-line 21')

    await v.locator('.file-item', { hasText: 'notes.txt' }).last().click()
    await expect(v.locator('.file-viewer .muted').first()).toHaveText('staged')
    await expect(hunks).toHaveCount(2)
    await hunks.last().getByRole('button', { name: 'Unstage chunk' }).click()
    await expect(hunks).toHaveCount(1)
    expect(git(repo, 'diff', '--cached')).not.toContain('LINE 21')
    expect(git(repo, 'diff', '--cached')).toContain('+LINE 3 changed')
    expect(readFileSync(join(repo, 'notes.txt'), 'utf8')).toBe(edited({ 3: 'LINE 3 changed', 20: 'LINE 20 changed', 21: 'LINE 21 changed' }))

    await v.locator('.file-item', { hasText: 'notes.txt' }).first().click()
    await expect(v.locator('.file-viewer .muted').first()).toHaveText('unstaged')
    await diffRow(page, 'del', 'line 20').click()
    await diffRow(page, 'add', 'LINE 21 changed').click({ modifiers: ['Shift'] })
    await expect(bar).toContainText('4 lines selected')
    await diffRow(page, 'del', 'line 21').click()
    await diffRow(page, 'add', 'LINE 21 changed').click()
    await expect(bar).toContainText('2 lines selected')
    await bar.getByRole('button', { name: 'Discard lines' }).click()
    await confirmDialog(page, true)
    await expect.poll(() => readFileSync(join(repo, 'notes.txt'), 'utf8')).toBe(edited({ 3: 'LINE 3 changed', 21: 'LINE 21 changed' }))
    expect(git(repo, 'diff', '--cached')).toContain('+LINE 3 changed')

    await hunks.first().getByRole('button', { name: 'Stage chunk' }).click()
    await expect(v.locator('.file-viewer .muted').first()).toHaveText('staged')
    expect(git(repo, 'diff').trim()).toBe('')
  } finally {
    await close()
  }
})
