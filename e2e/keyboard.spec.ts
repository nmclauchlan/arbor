import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

test('arrow keys and j/k move through the graph, and Space stages the open file then opens the next', async () => {
  const repo = initRepo(tempDir())
  for (const n of ['one', 'two', 'three', 'four']) commit(repo, `${n}.txt`, `${n}\n`, `Commit ${n}`)
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const selected = v.locator('.commit-row.selected .subject')
    await expect(selected).toContainText('Commit four')
    await page.keyboard.press('ArrowDown')
    await expect(selected).toContainText('Commit three')
    await page.keyboard.press('j')
    await expect(selected).toContainText('Commit two')
    await page.keyboard.press('k')
    await expect(selected).toContainText('Commit three')
    await page.keyboard.press('End')
    await expect(selected).toContainText('Commit one')
    await page.keyboard.press('Home')
    await expect(selected).toContainText('Commit four')

    write(repo, 'one.txt', 'one changed\n')
    write(repo, 'two.txt', 'two changed\n')
    await expect(v.locator('.commit-row.wip')).toBeVisible()
    await v.locator('.commit-row.wip').click()
    await v.locator('.panel .file-item', { hasText: 'one.txt' }).click()
    await expect(v.locator('.file-viewer')).toContainText('one changed')
    await page.keyboard.press('Space')
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim()).toBe('one.txt')
    await expect(v.locator('.file-viewer')).toContainText('two changed')
    await page.keyboard.press('Space')
    await expect.poll(() => git(repo, 'diff', '--cached', '--name-only').trim().split('\n')).toEqual(['one.txt', 'two.txt'])
    await expect(v.locator('.file-viewer')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('the command palette runs actions and checks out branches by name', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  git(repo, 'branch', 'develop')
  git(repo, 'branch', 'release/2026-10')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await expect(v.locator('.commit-row').first()).toBeVisible()
    await page.keyboard.press('Control+Shift+P')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await expect(palette.getByRole('option', { name: /Pull with rebase/ })).toBeVisible()
    await palette.getByRole('combobox').fill('checkout dev')
    await expect(palette.getByRole('option').first()).toContainText('Checkout develop')
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect.poll(() => git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('develop')

    await page.keyboard.press('Control+Shift+P')
    await palette.getByRole('combobox').fill('hide branch')
    await expect(palette.getByRole('option').first()).toContainText('Hide branch panel')
    await page.keyboard.press('Enter')
    await expect(v.locator('.sidebar')).toBeHidden()
  } finally {
    await close()
  }
})
