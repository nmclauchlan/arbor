import { expect, test } from '@playwright/test'
import { commit, git, launch, repoWithRemote, tempDir, view } from './helpers'

test('graph shows the branch column, merged local and remote badges, tags and body previews', async () => {
  const root = tempDir()
  const { repo } = repoWithRemote(root)
  git(repo, 'checkout', '-q', '-b', 'feature/login')
  commit(repo, 'login.ts', 'export {}\n', 'Add login form')
  git(repo, 'push', '-q', '-u', 'origin', 'feature/login')
  git(repo, 'checkout', '-q', 'main')
  commit(repo, 'app.ts', 'export {}\n', 'Add app shell')
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'Explain the release', '-m', 'First body line\nSecond body line')
  git(repo, 'tag', 'v1.0.0')

  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    await expect(v.locator('.commit-header .hcell').first()).toHaveText(/Branch \/ Tag/)
    await expect(v.locator('.commit-row')).toHaveCount(4)

    const feature = v.locator('.refs-cell > .ref-badge', { hasText: 'feature/login' })
    await expect(feature).toBeVisible()
    await expect(feature.locator('svg[aria-label="local"]')).toHaveCount(1)
    await expect(feature.locator('svg[aria-label="remote"]')).toHaveCount(1)

    const top = v.locator('.commit-row').first()
    await expect(top.locator('.subject .text')).toHaveText('Explain the release')
    await expect(top.locator('.body-preview')).toHaveText('First body line | Second body line')
    await expect(top.locator('.refs-cell > .ref-badge.branch.head')).toHaveText(/main/)
    await expect(top.locator('.refs-cell .ref-more')).toHaveText('+1')
    await top.locator('.refs-cell').hover()
    await expect(top.locator('.refs-pop .ref-badge.tag')).toHaveText(/v1\.0\.0/)

    await expect(v.locator('.graph-node').first()).toBeVisible()
    await expect(v.locator('.graph-node .avatar-initials, .graph-node img').first()).toBeVisible()
  } finally {
    await close()
  }
})

test('graph columns resize by dragging the header handle', async () => {
  const root = tempDir()
  const { repo } = repoWithRemote(root)
  const { page, close } = await launch(repo)
  try {
    const author = view(page).locator('.commit-header .hcell').nth(3)
    const before = (await author.boundingBox())!.width
    const handle = author.locator('.col-resize')
    const box = (await handle.boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx - 40, cy, { steps: 4 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await author.boundingBox())!.width)).toBe(Math.round(before + 40))
  } finally {
    await close()
  }
})
