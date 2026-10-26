import { expect, test } from '@playwright/test'
import { launch } from './helpers'

test('shows the welcome screen when no repository is open', async () => {
  const { page, close } = await launch()
  try {
    await expect(page.locator('.welcome-heading')).toHaveText('Arbor')
    await expect(page.getByRole('button', { name: /Open repository/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Clone repository/ })).toBeVisible()
  } finally {
    await close()
  }
})

test('settings open with the keyboard and switch the theme', async () => {
  const { page, close } = await launch()
  try {
    await page.keyboard.press('Control+,')
    const dialog = page.locator('.settings-dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('select').first().selectOption('dracula')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  } finally {
    await close()
  }
})
