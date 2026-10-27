import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { commit, initRepo, launch, tempDir, view } from './helpers'

const version = (JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }).version

test('the status bar shows the version, with update options on right-click', async () => {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'Initial')
  const { app, page, close } = await launch(repo)
  try {
    const label = view(page).locator('.statusbar .app-version')
    await expect(label).toHaveText(`v${version}`)

    await label.click({ button: 'right' })
    const items = page.locator('.context-menu-root .item')
    await expect(items.locator('.label')).toHaveText(['Check for updates', 'Release notes', 'Copy version'])
    await items.filter({ hasText: 'Copy version' }).click()
    await expect(page.locator('.toast')).toContainText(`Copied ${version}`)
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe(version)

    await label.click({ button: 'right' })
    await items.filter({ hasText: 'Check for updates' }).click()
    await expect(page.locator('.toast')).toContainText('Updates are only checked in installed builds')

    await page.keyboard.press('Control+t')
    await expect(page.locator('.repo-manager .statusbar .app-version')).toHaveText(`v${version}`)
  } finally {
    await close()
  }
})
