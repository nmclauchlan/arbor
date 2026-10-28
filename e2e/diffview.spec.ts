import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

test('diffs highlight changed words, wrap long lines, and switch to a split view that still stages single lines', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'greet.ts', "const greeting = 'hello'\nexport default greeting\n", 'Initial')
  write(repo, 'greet.ts', `const greeting = 'goodbye'\nexport default greeting\nexport const long = '${'x'.repeat(400)}'\n`)
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.commit-row.wip').click()
    await v.locator('.panel .file-item', { hasText: 'greet.ts' }).click()
    const diff = v.locator('.file-viewer .diff')

    await expect(diff.locator('tr.del .intra')).toHaveText('hello')
    await expect(diff.locator('tr.add .intra')).toHaveText('goodbye')
    await expect(diff.locator('.diff-stats')).toHaveText('+2 −1')

    const longCell = diff.locator('tr.add', { hasText: 'export const long' }).locator('td').last()
    expect(await longCell.evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('pre')
    await diff.getByRole('checkbox', { name: 'Wrap' }).check()
    await expect(diff).toHaveClass(/\bwrap\b/)
    expect(await longCell.evaluate((e) => getComputedStyle(e).whiteSpace)).toBe('pre-wrap')

    await diff.getByRole('tab', { name: 'Split' }).click()
    await expect(diff).toHaveClass(/\bsplit\b/)
    const changed = diff.locator('tr.pair', { has: page.locator('td.code.del') }).first()
    await expect(changed.locator('td.code.del')).toContainText("const greeting = 'hello'")
    await expect(changed.locator('td.code.add')).toContainText("const greeting = 'goodbye'")
    await expect(changed.locator('td.code.add .intra')).toHaveText('goodbye')
    const added = diff.locator('tr.pair', { hasText: 'export const long' })
    await expect(added.locator('td.code.empty')).toHaveCount(1)

    await added.locator('td.code.add').click()
    await expect(diff.locator('.diff-selection')).toContainText('1 line selected')
    await diff.locator('.diff-selection').getByRole('button', { name: 'Stage lines' }).click()
    await expect.poll(() => git(repo, 'diff', '--cached')).toContain("+export const long = 'xxx")
    expect(git(repo, 'diff', '--cached')).not.toContain('goodbye')
  } finally {
    await close()
  }
})
