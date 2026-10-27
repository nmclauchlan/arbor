import { expect, test } from '@playwright/test'
import { git, initRepo, launch, tempDir, view, write } from './helpers'

const body = [
  '## Summary',
  'Port of PR 5789 to `main-ng22`, see [the original](https://dev.azure.com/contoso/Ministers/_git/ui/pullrequest/5789).',
  '',
  '- `table` inserts a 3x3 table with a **header** row',
  '- A second bubble menu, extended under its own name',
  '  so it does not collide with the link menu',
  '  - nested detail',
  '- [x] Defaults are unchanged',
  '',
  '1. First step',
  '2. Second step',
  '',
  '```',
  'npm run lint && npm test',
  '```',
  '',
  '| Check | Result |',
  '| --- | --- |',
  '| lint | passed |',
  '',
  '> Quoted note',
  '',
  'Unsafe: <img src=x onerror="document.body.dataset.pwned=1"> and [click](javascript:alert(1))'
].join('\n')

test('commit messages render as Markdown without running embedded HTML', async () => {
  const repo = initRepo(tempDir())
  write(repo, 'a.txt', 'a\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'Merged PR 5790: add a table toolbar button', '-m', body)
  const { page, close } = await launch(repo)
  try {
    await view(page).locator('.commit-row', { hasText: 'Merged PR 5790' }).click()
    const md = page.locator('.panel-header .markdown')
    await expect(md.locator('h2')).toHaveText('Summary')
    await expect(md.locator('p code').first()).toHaveText('main-ng22')
    await expect(md.locator('a', { hasText: 'the original' })).toHaveAttribute('href', 'https://dev.azure.com/contoso/Ministers/_git/ui/pullrequest/5789')

    const items = md.locator('ul').first().locator(':scope > li')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0).locator('code')).toHaveText('table')
    await expect(items.nth(0).locator('strong')).toHaveText('header')
    await expect(items.nth(1)).toContainText('so it does not collide with the link menu')
    await expect(items.nth(1).locator('ul li')).toHaveText('nested detail')
    await expect(items.nth(2).locator('input[type="checkbox"]')).toBeChecked()

    await expect(md.locator('ol li')).toHaveText(['First step', 'Second step'])
    await expect(md.locator('pre code')).toHaveText('npm run lint && npm test')
    await expect(md.locator('th')).toHaveText(['Check', 'Result'])
    await expect(md.locator('td')).toHaveText(['lint', 'passed'])
    await expect(md.locator('blockquote')).toHaveText('Quoted note')

    await expect(md).toContainText('<img src=x onerror=')
    await expect(md.locator('img')).toHaveCount(0)
    await expect(md.locator('a[href^="javascript:"]')).toHaveCount(0)
    expect(await page.evaluate(() => document.body.dataset.pwned)).toBeUndefined()
  } finally {
    await close()
  }
})

test('long commit messages scroll inside a capped area instead of pushing the panel down', async () => {
  const repo = initRepo(tempDir())
  write(repo, 'a.txt', 'a\n')
  git(repo, 'add', '-A')
  const long = Array.from({ length: 80 }, (_, i) => `- Change number ${i + 1} in this very long pull request description`).join('\n')
  git(repo, 'commit', '-q', '-m', 'Merged PR 6100: a very long description', '-m', long)
  const { page, close } = await launch(repo)
  try {
    await view(page).locator('.commit-row', { hasText: 'Merged PR 6100' }).click()
    const body = page.locator('.panel-header .markdown')
    await expect(body.locator('li')).toHaveCount(80)
    const size = await body.evaluate((e) => ({ client: e.clientHeight, scroll: e.scrollHeight, overflow: getComputedStyle(e).overflowY }))
    expect(size.client).toBeLessThanOrEqual(280)
    expect(size.scroll).toBeGreaterThan(size.client)
    expect(size.overflow).toBe('auto')
    await expect(page.locator('.panel-body .file-group-title').first()).toBeInViewport()
  } finally {
    await close()
  }
})
