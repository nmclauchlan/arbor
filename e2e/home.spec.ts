import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { commit, git, launch, repoWithRemote, tempDir, view } from './helpers'

const version = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version as string

test('repository management lists open repositories with their branch and sync state', async () => {
  const root = tempDir()
  const { repo, other } = repoWithRemote(root, 'service-api')
  commit(other, 'remote.txt', 'r\n', 'Remote work')
  git(other, 'push', '-q', 'origin', 'main')
  commit(repo, 'local.txt', 'l\n', 'Local work')
  const { page, close } = await launch(repo)
  try {
    await page.keyboard.press('Control+t')
    const home = page.locator('.repo-manager')
    await expect(home.getByRole('heading', { name: 'Repository Management' })).toBeVisible()
    await expect(view(page)).toHaveCount(0)

    const row = home.locator('.repo-section').first().locator('.repo-row', { hasText: 'service-api' })
    await expect(row.locator('.repo-chip.branch')).toHaveText('main')
    await expect(row.locator('.repo-chip.ahead')).toHaveText('↑1')

    await home.getByRole('button', { name: 'Fetch all' }).click()
    await expect(page.locator('.toast')).toContainText('Fetched 1 repository')
    await expect(row.locator('.repo-chip.behind')).toHaveText('↓1')

    await home.getByRole('searchbox').fill('nothing-matches')
    await expect(home.locator('.repo-row')).toHaveCount(0)
    await home.getByRole('searchbox').fill('service')
    await expect(row).toBeVisible()

    await row.getByRole('button', { name: 'Favorite service-api' }).click()
    const favorites = home.locator('.repo-section', { hasText: 'Favorites' })
    await expect(favorites.locator('.repo-row', { hasText: 'service-api' })).toBeVisible()

    await page.getByRole('button', { name: 'Repository Management' }).click()
    await expect(home).toBeHidden()
    await expect(view(page).locator('.commit-row').first()).toBeVisible()
  } finally {
    await close()
  }
})

test('recent repositories can be removed from the home screen', async () => {
  const root = tempDir()
  const a = repoWithRemote(root, 'alpha').repo
  const { page, close } = await launch(a)
  try {
    await page.keyboard.press('Control+w')
    const home = page.locator('.repo-manager')
    await expect(home).toBeVisible()
    const recent = home.locator('.repo-section', { hasText: 'Recent repositories' })
    await expect(recent.locator('.repo-row', { hasText: 'alpha' })).toBeVisible()
    await recent.getByRole('button', { name: 'Remove alpha' }).click()
    await expect(recent.locator('.repo-row')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('the menu bar opens About, shortcuts and zoom', async () => {
  const root = tempDir()
  const { repo } = repoWithRemote(root)
  const { page, close } = await launch(repo)
  try {
    const menubar = page.getByRole('menubar', { name: 'Application menu' })
    await menubar.getByRole('menuitem', { name: 'Help' }).click()
    await page.getByRole('menu', { name: 'Help' }).getByRole('menuitem', { name: 'About Arbor' }).click()
    const about = page.getByRole('dialog', { name: 'About Arbor' })
    await expect(about).toContainText(version)
    await page.keyboard.press('Escape')
    await expect(about).toBeHidden()

    await menubar.getByRole('menuitem', { name: 'Help' }).click()
    await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click()
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('Repository Management')
    await page.keyboard.press('Escape')

    await menubar.getByRole('menuitem', { name: 'View' }).click()
    await page.getByRole('menuitem', { name: 'Zoom in' }).click()
    await expect(page.locator('.toast')).toContainText('Zoom 110%')
    await page.keyboard.press('Control+0')
    await expect(page.locator('.toast')).toContainText('Zoom 100%')

    await menubar.getByRole('menuitem', { name: 'File' }).click()
    await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Repository Management' }).click()
    await expect(page.locator('.repo-manager')).toBeVisible()
  } finally {
    await close()
  }
})
