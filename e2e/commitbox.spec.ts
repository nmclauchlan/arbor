import { expect, test } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

test('the commit box splits summary and description, stages everything when nothing is staged, and amend reuses the last message', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  write(repo, 'a.txt', 'a changed\n')
  write(repo, 'new.txt', 'new\n')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await v.locator('.commit-row.wip').click()
    const summary = v.getByRole('textbox', { name: 'Commit summary' })
    const description = v.getByRole('textbox', { name: 'Commit description' })
    const button = v.locator('.commit-form .commit-button')

    await expect(button).toHaveText('Stage all and commit 2 files to main')
    await expect(button).toBeDisabled()

    await summary.fill('x'.repeat(80))
    await expect(v.locator('.commit-summary-count.over')).toHaveText('-8')
    await summary.fill('Add the feature')
    await expect(button).toBeEnabled()
    await summary.press('Enter')
    await expect(description).toBeFocused()
    await description.fill('Explain why #42 needed it.')
    await description.press('Control+Enter')
    await expect.poll(() => git(repo, 'log', '-1', '--format=%B').trim()).toBe('Add the feature\n\nExplain why #42 needed it.')
    expect(git(repo, 'status', '--porcelain').trim()).toBe('')
    await expect(summary).toHaveValue('')

    write(repo, 'later.txt', 'later\n')
    git(repo, 'add', 'later.txt')
    await expect(v.locator('.commit-row.wip')).toContainText('1 uncommitted')
    await v.locator('.commit-row.wip').click()
    const amend = v.getByRole('checkbox', { name: 'Amend' })
    await amend.check()
    await expect(summary).toHaveValue('Add the feature')
    await expect(description).toHaveValue('Explain why #42 needed it.')
    await expect(button).toHaveText('Amend with 1 file')
    await amend.uncheck()
    await expect(summary).toHaveValue('')
    await amend.check()
    await button.click()
    await expect.poll(() => git(repo, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()).toEqual(['a.txt', 'later.txt', 'new.txt'])
    expect(git(repo, 'rev-list', '--count', 'HEAD').trim()).toBe('2')
    expect(git(repo, 'log', '-1', '--format=%B').trim()).toBe('Add the feature\n\nExplain why #42 needed it.')
  } finally {
    await close()
  }
})
