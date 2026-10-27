import { expect, test } from '@playwright/test'
import { commit, initRepo, launch, tempDir, view } from './helpers'

test('the branch and commit panels collapse from the toolbar, the View menu and by dragging, and stay collapsed', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  const { page, close } = await launch(repo)
  try {
    const v = view(page)
    const sidebar = v.locator('.sidebar')
    const details = v.locator('.panel')
    const listWidth = (): Promise<number> => v.locator('.commit-list').evaluate((e) => e.getBoundingClientRect().width)
    await expect(sidebar).toBeVisible()
    await expect(details).toBeVisible()
    const full = await listWidth()

    await v.getByRole('button', { name: 'Hide the branch panel' }).click()
    await expect(sidebar).toBeHidden()
    expect(await listWidth()).toBeGreaterThan(full + 150)
    await v.getByRole('button', { name: 'Hide the commit panel' }).click()
    await expect(details).toBeHidden()
    expect(await listWidth()).toBeGreaterThan(full + 500)

    await page.reload()
    await expect(v.locator('.commit-row').first()).toBeVisible()
    await expect(sidebar).toBeHidden()
    await expect(details).toBeHidden()

    await page.keyboard.press('Control+b')
    await expect(sidebar).toBeVisible()
    await expect(sidebar.locator('input').first()).toBeFocused()

    await page.getByRole('menubar', { name: 'Application menu' }).getByRole('menuitem', { name: 'View' }).click()
    await page.getByRole('menu', { name: 'View' }).getByRole('menuitem', { name: /Commit panel/ }).click()
    await expect(details).toBeVisible()

    const handle = (await v.locator('.splitter-sidebar').boundingBox())!
    await page.mouse.move(handle.x + 2, handle.y + 200)
    await page.mouse.down()
    await page.mouse.move(handle.x - 300, handle.y + 200, { steps: 5 })
    await page.mouse.up()
    await expect(sidebar).toBeHidden()
    await v.getByRole('button', { name: 'Show the branch panel' }).click()
    await expect(sidebar).toBeVisible()
    expect(await sidebar.evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(150)
  } finally {
    await close()
  }
})
