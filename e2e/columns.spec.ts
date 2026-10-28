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
  const { app, page, close } = await launch(repo)
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1800, 1000))
    await page.evaluate(() => localStorage.setItem('arbor.layout', JSON.stringify({ sidebar: 160, panel: 300, colRefs: 100 })))
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
    await page.locator('.context-menu-root .item', { hasText: 'Reset columns' }).click()
    await expect.poll(() => width(page, 'colAuthor')).toBe(110)
    await expect.poll(() => width(page, 'colDate')).toBe(90)
  } finally {
    await close()
  }
})

test('the header menu hides and shows columns, and the message column stays the widest', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    const header = view(page).locator('.commit-header')
    const message = await header.locator('.hcell.subject').evaluate((e) => e.getBoundingClientRect().width)
    const others = await header.locator('.hcell[data-col]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))
    expect(message).toBeGreaterThan(Math.max(...others))

    const items = page.locator('.context-menu-root .item')
    await header.locator('.hcell.subject').click({ button: 'right' })
    await expect(items.locator('.label')).toHaveText(['Branch / Tag', 'Graph', 'Message', 'Author', 'Date', 'SHA', 'Fit all columns to content', 'Reset columns'])
    await expect(items.filter({ hasText: 'Message' })).toHaveAttribute('aria-disabled', 'true')
    await items.filter({ hasText: 'Author' }).click()
    await expect(header.locator('.hcell[data-col="colAuthor"]')).toHaveCount(0)
    await expect(view(page).locator('.commit-row .author')).toHaveCount(0)

    await header.locator('.hcell.subject').click({ button: 'right' })
    await items.filter({ hasText: 'Graph' }).click()
    await expect(view(page).locator('.graph-clip')).toHaveCount(0)
    await expect(header.locator('.hcell[data-col="colGraph"]')).toHaveCount(0)

    await page.reload()
    await expect(view(page).locator('.commit-row').first()).toBeVisible()
    await expect(header.locator('.hcell[data-col="colAuthor"]')).toHaveCount(0)
    await header.locator('.hcell.subject').click({ button: 'right' })
    await expect(items.filter({ hasText: 'Author' })).toHaveAttribute('aria-checked', 'false')
    await items.filter({ hasText: 'Reset columns' }).click()
    await expect(header.locator('.hcell[data-col="colAuthor"]')).toHaveCount(1)
    await expect(view(page).locator('.graph-clip')).toHaveCount(1)
  } finally {
    await close()
  }
})
