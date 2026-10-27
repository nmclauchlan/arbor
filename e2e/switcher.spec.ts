import { expect, test } from '@playwright/test'
import { commit, initRepo, launch, tempDir, view } from './helpers'

test('Ctrl+P finds a repository by name, group or path and switches to it or opens it', async () => {
  const root = tempDir()
  const alpha = initRepo(root, 'alpha-service')
  commit(alpha, 'a.txt', 'a\n', 'Alpha start')
  const billing = initRepo(root, 'billing-ui')
  commit(billing, 'b.txt', 'b\n', 'Billing start')
  const ledger = initRepo(root, 'ledger-tools')
  commit(ledger, 'l.txt', 'l\n', 'Ledger start')

  const { page, close } = await launch()
  try {
    await page.evaluate((p) => (window as unknown as { git: { openRepo(path: string): Promise<unknown> } }).git.openRepo(p), ledger)
    const saved = {
      tabs: [{ path: alpha.replace(/\\/g, '/'), group: 'g1' }, { path: billing.replace(/\\/g, '/') }],
      groups: [{ id: 'g1', name: 'Platform', color: '#4f8cff' }]
    }
    await page.evaluate((value) => localStorage.setItem('arbor.tabs', value), JSON.stringify(saved))
    await page.reload()
    await expect(view(page).locator('.commit-row', { hasText: 'Alpha start' })).toBeVisible()

    const switcher = page.getByRole('dialog', { name: 'Go to repository' })
    const input = switcher.getByRole('combobox')
    const options = switcher.getByRole('option')

    await page.keyboard.press('Control+p')
    await expect(input).toBeFocused()
    await expect(options).toHaveCount(3)
    await expect(options.nth(0)).toContainText('alpha-service')
    await expect(options.nth(0)).toContainText('Platform')
    await expect(options.nth(0).locator('.open-badge')).toBeVisible()
    await expect(options.nth(2)).toContainText('ledger-tools')
    await expect(options.nth(2).locator('.open-badge')).toHaveCount(0)

    await input.fill('bil')
    await expect(options).toHaveCount(1)
    await expect(options.first().locator('mark')).toHaveText('bil')
    await input.press('Enter')
    await expect(switcher).toBeHidden()
    await expect(view(page).locator('.commit-row', { hasText: 'Billing start' })).toBeVisible()

    await page.keyboard.press('Control+p')
    await input.fill('platform')
    await expect(options).toHaveCount(1)
    await expect(options.first()).toContainText('alpha-service')
    await input.press('Escape')
    await expect(switcher).toBeHidden()

    await page.getByRole('button', { name: 'Go to repository' }).click()
    await expect(input).toBeFocused()
    await input.fill('ldgr')
    await expect(options.first()).toContainText('ledger-tools')
    await input.press('Enter')
    await expect(view(page).locator('.commit-row', { hasText: 'Ledger start' })).toBeVisible()
    await expect(page.locator('.tabs .tab', { hasText: 'ledger-tools' })).toBeVisible()

    await page.keyboard.press('Control+p')
    await input.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
    await input.press('ArrowUp')
    await input.press('ArrowUp')
    await expect(options.nth(2)).toHaveAttribute('aria-selected', 'true')
    await input.press('ArrowDown')
    await input.press('ArrowDown')
    await input.press('Enter')
    await expect(view(page).locator('.commit-row', { hasText: 'Billing start' })).toBeVisible()

    await page.keyboard.press('Control+p')
    await expect(switcher).toBeVisible()
    await page.mouse.click(20, 700)
    await expect(switcher).toBeHidden()
  } finally {
    await close()
  }
})
