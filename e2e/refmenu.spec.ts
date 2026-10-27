import { expect, test, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { answerPrompt, commit, confirmDialog, git, launch, repoWithRemote, tempDir, view } from './helpers'

function sha(repo: string, ref: string): string {
  try {
    return git(repo, 'rev-parse', '--verify', '-q', ref).trim()
  } catch {
    return ''
  }
}

function setup(): { root: string; repo: string; remote: string; other: string } {
  const root = tempDir()
  const r = repoWithRemote(root)
  git(r.repo, 'checkout', '-q', '-b', 'develop')
  commit(r.repo, 'feature.txt', 'f\n', 'Develop work')
  git(r.repo, 'push', '-q', '-u', 'origin', 'develop')
  git(r.repo, 'checkout', '-q', 'main')
  return { root, ...r }
}

async function badgeMenu(page: Page, name: string): Promise<void> {
  await view(page).locator('.refs-cell > .ref-badge', { hasText: name }).first().click({ button: 'right' })
  await expect(page.locator('.context-menu-root')).toBeVisible()
}

async function choose(page: Page, label: string | RegExp, submenu?: string | RegExp): Promise<void> {
  const root = page.locator('.context-menu-root > .context-menu > .item')
  if (submenu) {
    await root.filter({ hasText: label }).first().hover()
    const item = page.locator('.submenu-layer .item', { hasText: submenu }).first()
    await expect(item).toBeInViewport()
    await item.click()
  } else {
    await root.filter({ has: page.locator('.label', { hasText: label }) }).first().click()
  }
}

test('the branch menu offers GitKraken-style actions and fast-forwards with undo', async () => {
  const { repo } = setup()
  const { page, close } = await launch(repo)
  try {
    await badgeMenu(page, 'develop')
    const labels = await page.locator('.context-menu-root > .context-menu > .item .label').allTextContents()
    for (const expected of [
      'Pull (fast-forward)', 'Push', 'Set upstream…', 'Fast-forward main to develop', 'Merge develop into main', 'Rebase main onto develop',
      'Checkout', 'Create worktree from', 'Create branch here…', 'Cherry-pick commit', 'Reset main to this commit', 'Revert commit',
      'Rename develop…', 'Delete develop', 'Delete origin/develop', 'Delete develop and origin/develop',
      'Copy branch name', 'Copy commit SHA', 'Create patch from commit…', 'Solo', 'Hide', 'Create tag here…', 'Create annotated tag here…'
    ]) {
      expect(labels, `menu should include ${expected}`).toContain(expected)
    }
    await choose(page, /^Fast-forward main to develop$/)
    await expect.poll(() => sha(repo, 'main')).toBe(sha(repo, 'develop'))
    await view(page).getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => sha(repo, 'main')).not.toBe(sha(repo, 'develop'))
  } finally {
    await close()
  }
})

test('rebase the current branch onto another from the menu', async () => {
  const { repo } = setup()
  commit(repo, 'main.txt', 'm\n', 'Main work')
  const { page, close } = await launch(repo)
  try {
    await badgeMenu(page, 'develop')
    await choose(page, /^Rebase main onto develop$/)
    await expect(page.locator('.toast')).toContainText('Rebased onto develop')
    expect(git(repo, 'merge-base', 'main', 'develop').trim()).toBe(sha(repo, 'develop'))
    expect(git(repo, 'log', '-1', '--format=%s', 'main').trim()).toBe('Main work')
  } finally {
    await close()
  }
})

test('checkout from the submenu and pull a branch that is not checked out', async () => {
  const { repo, other } = setup()
  git(other, 'fetch', '-q', 'origin')
  git(other, 'checkout', '-q', 'develop')
  commit(other, 'more.txt', 'more\n', 'More develop work')
  git(other, 'push', '-q', 'origin', 'develop')
  const remoteTip = sha(other, 'HEAD')
  const { page, close } = await launch(repo)
  try {
    await badgeMenu(page, 'develop')
    await choose(page, /^Pull \(fast-forward\)$/)
    await expect.poll(() => sha(repo, 'refs/heads/develop')).toBe(remoteTip)
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main')

    await badgeMenu(page, 'develop')
    await choose(page, 'Checkout', /^develop$/)
    await expect.poll(() => git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('develop')
  } finally {
    await close()
  }
})

test('check out a remote branch whose local copy is behind it', async () => {
  const { repo, other } = setup()
  git(other, 'fetch', '-q', 'origin')
  git(other, 'checkout', '-q', 'develop')
  commit(other, 'more.txt', 'more\n', 'More develop work')
  git(other, 'push', '-q', 'origin', 'develop')
  git(repo, 'fetch', '-q', 'origin')
  const remoteTip = sha(repo, 'refs/remotes/origin/develop')
  const { page, close } = await launch(repo)
  try {
    await view(page).locator('.ref-badge[data-ref-kind="remote"][data-ref-name="origin/develop"]').first().click({ button: 'right' })
    await page.locator('.context-menu-root > .context-menu > .item', { hasText: /^Checkout/ }).first().hover()
    const item = page.locator('.submenu-layer .item', { hasText: 'origin/develop' })
    await expect(item).toBeInViewport()
    await expect(item.locator('.hint')).toHaveText('as develop, fast-forwarded')
    await item.click()
    await expect.poll(() => sha(repo, 'refs/heads/develop')).toBe(remoteTip)
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('develop')
    await expect(page.locator('.toast')).toContainText('Checked out develop at origin/develop')
  } finally {
    await close()
  }
})

test('rename a branch and delete its remote copy', async () => {
  const { repo, remote } = setup()
  const { page, close } = await launch(repo)
  try {
    await badgeMenu(page, 'develop')
    await choose(page, /^Delete origin\/develop$/)
    await confirmDialog(page, true)
    await expect.poll(() => git(remote, 'branch', '--list', 'develop').trim()).toBe('')

    await badgeMenu(page, 'develop')
    await choose(page, /^Rename develop…$/)
    await answerPrompt(page, 'development')
    await expect.poll(() => sha(repo, 'refs/heads/development')).not.toBe('')
    expect(sha(repo, 'refs/heads/develop')).toBe('')
  } finally {
    await close()
  }
})

test('create, push and delete tags from the commit menu', async () => {
  const { repo, remote } = setup()
  const { page, close } = await launch(repo)
  try {
    const row = view(page).locator('.commit-row', { hasText: 'Develop work' })
    await row.locator('.subject').click({ button: 'right' })
    await choose(page, /^Create tag here…$/)
    await answerPrompt(page, 'v2.0.0')
    await expect.poll(() => sha(repo, 'refs/tags/v2.0.0')).toBe(sha(repo, 'develop'))

    await row.locator('.subject').click({ button: 'right' })
    await choose(page, /^Create annotated tag here…$/)
    await answerPrompt(page, 'v2.0.1')
    await answerPrompt(page, 'Second release')
    await expect.poll(() => (sha(repo, 'refs/tags/v2.0.1') ? git(repo, 'cat-file', '-t', 'v2.0.1').trim() : '')).toBe('tag')
    await expect(row.locator('[data-ref-kind="tag"][data-ref-name="v2.0.0"]').first()).toBeAttached()

    await row.locator('.subject').click({ button: 'right' })
    await choose(page, 'Tag v2.0.0', /^Push to origin$/)
    await expect.poll(() => git(remote, 'tag', '--list').trim()).toContain('v2.0.0')

    await row.locator('.subject').click({ button: 'right' })
    await choose(page, 'Tag v2.0.0', /^Delete locally$/)
    await confirmDialog(page, true)
    await expect.poll(() => sha(repo, 'refs/tags/v2.0.0')).toBe('')
  } finally {
    await close()
  }
})

test('solo a branch, then show all branches again', async () => {
  const { repo } = setup()
  git(repo, 'checkout', '-q', '-b', 'other-work')
  commit(repo, 'o.txt', 'o\n', 'Other branch work')
  git(repo, 'checkout', '-q', 'main')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await expect(v.locator('.commit-row', { hasText: 'Other branch work' })).toBeVisible()
    await badgeMenu(page, 'develop')
    await choose(page, 'Solo', /^develop$/)
    await expect(v.locator('.graph-filter-note')).toContainText('Showing only develop')
    await expect(v.locator('.commit-row', { hasText: 'Other branch work' })).toHaveCount(0)
    await v.locator('.graph-filter-note').getByRole('button', { name: 'Show all' }).click()
    await expect(v.locator('.commit-row', { hasText: 'Other branch work' })).toBeVisible()

    await badgeMenu(page, 'other-work')
    await choose(page, 'Hide', /^other-work$/)
    await expect(v.locator('.graph-filter-note')).toContainText('Hiding other-work')
    await expect(v.locator('.commit-row', { hasText: 'Other branch work' })).toHaveCount(0)
    await expect(v.locator('.commit-row', { hasText: 'Develop work' })).toBeVisible()
  } finally {
    await close()
  }
})

test('copy the commit SHA, save a patch and create a worktree', async () => {
  const { root, repo } = setup()
  const patchFile = join(root, 'out.patch')
  const { app, page, close } = await launch(repo)
  try {
    await app.evaluate(({ dialog }, args) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: args.patchFile })) as typeof dialog.showSaveDialog
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [args.root] })) as typeof dialog.showOpenDialog
    }, { patchFile, root })

    const row = view(page).locator('.commit-row', { hasText: 'Develop work' })
    await row.locator('.subject').click({ button: 'right' })
    await choose(page, /^Copy commit SHA$/)
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(sha(repo, 'develop'))

    await row.locator('.subject').click({ button: 'right' })
    await choose(page, /^Create patch from commit…$/)
    await expect(page.locator('.toast')).toContainText('Saved patch')
    expect(readFileSync(patchFile, 'utf8')).toContain('Subject: [PATCH] Develop work')

    await row.locator('.subject').click({ button: 'right' })
    await choose(page, 'Create worktree from', /^develop$/)
    await answerPrompt(page, 'repo-develop-wt')
    await expect(page.locator('.tabs .tab', { hasText: 'repo-develop-wt' })).toBeVisible({ timeout: 15_000 })
    expect(existsSync(join(root, 'repo-develop-wt', 'feature.txt'))).toBe(true)
  } finally {
    await close()
  }
})
