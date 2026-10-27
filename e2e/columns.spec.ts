import { expect, test, type Locator, type Page } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view, write } from './helpers'

const truncated = (el: Locator): Promise<boolean> => el.evaluate((e) => e.scrollWidth > e.clientWidth + 1)
const handle = (page: Page, col: string): Locator => view(page).locator(`.commit-header .hcell[data-col="${col}"] .col-resize`)
const width = (page: Page, col: string): Promise<number> =>
  view(page).locator(`.commit-header .hcell[data-col="${col}"]`).evaluate((e) => e.getBoundingClientRect().width)

test('double-clicking a column edge fits it, drags never push columns off screen, and the header menu resets widths', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  write(repo, 'b.txt', 'b\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '--author', 'Bartholomew Montgomery-Fitzgerald <bmf@example.com>', '-m', 'Long author')
  git(repo, 'checkout', '-q', '-b', 'feature/22999-remove-plans')
  const { page, close } = await launch(repo)
  try {
    await page.evaluate(() => localStorage.setItem('arbor.layout', JSON.stringify({ sidebar: 160, panel: 300 })))
    await page.reload()
    const authorCell = view(page).locator('.commit-row', { hasText: 'Long author' }).locator('.author')
    await expect(authorCell).toBeVisible()
    expect(await truncated(authorCell)).toBe(true)

    await handle(page, 'colAuthor').dblclick()
    await expect.poll(() => truncated(authorCell)).toBe(false)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arbor.layout') ?? '{}').colAuthor)).toBeGreaterThan(110)

    const badgeName = view(page).locator('.commit-row', { hasText: 'Long author' }).locator('.refs-cell > .ref-badge .ref-name').first()
    expect(await truncated(badgeName)).toBe(true)
    await handle(page, 'colRefs').dblclick()
    await expect.poll(() => truncated(badgeName)).toBe(false)

    const box = (await handle(page, 'colDate').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 3000, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    const list = (await view(page).locator('.commit-list').boundingBox())!
    const sha = (await view(page).locator('.commit-header .hcell[data-col="colSha"]').boundingBox())!
    expect(sha.x + sha.width).toBeLessThanOrEqual(list.x + list.width)
    expect(await view(page).locator('.commit-header .hcell.subject').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(119)

    await view(page).locator('.commit-header .hcell.subject').click({ button: 'right' })
    await page.locator('.context-menu-root .item', { hasText: 'Reset column widths' }).click()
    await expect.poll(() => width(page, 'colAuthor')).toBe(110)
    await expect.poll(() => width(page, 'colDate')).toBe(90)
  } finally {
    await close()
  }
})
