import { expect, test } from '@playwright/test'
import { commit, confirmDialog, git, launch, repoWithRemote, tempDir, view } from './helpers'

test('a rejected push after rewriting history offers a force push with lease, which refuses to overwrite unseen work', async () => {
  const { repo, remote, other } = repoWithRemote(tempDir())
  commit(repo, 'a.txt', 'a\n', 'First feature')
  git(repo, 'push', '-q', 'origin', 'main')
  git(repo, 'commit', '-q', '--amend', '-m', 'First feature, reworded')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('arbor.settings', JSON.stringify({ backgroundFetch: 0 })))
    await page.reload()
    const v = view(page)
    await expect(v.locator('.commit-row').first()).toBeVisible()

    await v.locator('.toolbar').getByRole('button', { name: /Push/ }).first().click()
    await expect(page.locator('.dialog')).toContainText('Push rejected')
    await expect(page.locator('.dialog')).toContainText('--force-with-lease')
    await confirmDialog(page, true)
    await expect(page.locator('.toast')).toContainText('Pushed')
    expect(git(remote, 'rev-parse', 'main').trim()).toBe(git(repo, 'rev-parse', 'HEAD').trim())

    git(other, 'pull', '-q', '--rebase=false', '--no-edit')
    git(other, 'reset', '-q', '--hard', 'origin/main')
    commit(other, 'b.txt', 'b\n', 'A teammate pushes')
    git(other, 'push', '-q', 'origin', 'main')
    const teammate = git(remote, 'rev-parse', 'main').trim()
    git(repo, 'commit', '-q', '--amend', '-m', 'First feature, reworded again')

    await v.locator('.toolbar').getByRole('button', { name: /Push/ }).first().click()
    await confirmDialog(page, true)
    await expect(page.locator('.toast')).toContainText('Someone else has pushed')
    expect(git(remote, 'rev-parse', 'main').trim()).toBe(teammate)
  } finally {
    await close()
  }
})
