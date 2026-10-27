import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { commit, git, initRepo, launch, tempDir, view } from './helpers'

interface FakeHost {
  json: [string, unknown][]
  text?: [string, string][]
  status?: [string, number][]
  graphql?: Record<string, unknown[]>
}

async function fakeHost(app: ElectronApplication, spec: FakeHost): Promise<void> {
  await app.evaluate((_electron, s) => {
    globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
      const url = String(typeof input === 'object' && input && 'url' in input ? (input as { url: string }).url : input)
      for (const [pattern, code] of s.status ?? []) if (url.includes(pattern)) return Response.json({ message: 'denied' }, { status: code })
      if (s.graphql && url.endsWith('/graphql')) {
        const query = (JSON.parse(String(init?.body)) as { query: string }).query
        const repository: Record<string, unknown> = {}
        for (const m of query.matchAll(/(c\d+): object\(oid: "([0-9a-f]+)"\)/g)) {
          const nodes = s.graphql[m[2]]
          repository[m[1]] = { statusCheckRollup: nodes ? { contexts: { nodes } } : null }
        }
        return Response.json({ data: { repository } })
      }
      for (const [pattern, body] of s.text ?? []) if (url.includes(pattern)) return new Response(body)
      for (const [pattern, body] of s.json) if (url.includes(pattern)) return Response.json(body)
      return Response.json({ message: 'Not found' }, { status: 404 })
    }) as typeof fetch
  }, spec)
}

async function connect(app: ElectronApplication, page: Page, kind: string, baseUrl: string, spec: FakeHost): Promise<void> {
  await fakeHost(app, spec)
  await page.evaluate(
    ([k, u]) => (window as unknown as { host: { addAccount(k: string, u: string, t: string): Promise<unknown> } }).host.addAccount(k, u, 'test-token'),
    [kind, baseUrl]
  )
  await page.evaluate(() => localStorage.setItem('arbor.settings', JSON.stringify({ backgroundFetch: 0 })))
  await page.reload()
  await expect(view(page).locator('.commit-row').first()).toBeVisible()
}

function repoWithHost(remoteUrl: string): { repo: string; head: string; parent: string } {
  const repo = initRepo(tempDir())
  commit(repo, 'a.txt', 'a\n', 'First change')
  commit(repo, 'b.txt', 'b\n', 'Second change')
  git(repo, 'remote', 'add', 'origin', remoteUrl)
  return { repo, head: git(repo, 'rev-parse', 'HEAD').trim(), parent: git(repo, 'rev-parse', 'HEAD~1').trim() }
}

const row = (page: Page, subject: string) => view(page).locator('.commit-row', { hasText: subject })

const failedCheck = {
  __typename: 'CheckRun',
  databaseId: 11,
  name: 'test',
  status: 'COMPLETED',
  conclusion: 'FAILURE',
  detailsUrl: 'https://github.com/acme/widgets/actions/runs/1/job/11',
  checkSuite: { workflowRun: { workflow: { name: 'CI' } } }
}

const githubRoutes: [string, unknown][] = [
  ['/check-runs/11/annotations', [{ path: 'src/app.test.ts', start_line: 12, annotation_level: 'failure', message: 'expected 2 to be 3' }]],
  ['/pulls', []],
  ['/user', { login: 'tester' }]
]

test('GitHub checks show on the graph and failed annotations show in the commit panel', async () => {
  const { repo, head, parent } = repoWithHost('https://github.com/acme/widgets.git')
  git(repo, 'branch', 'feature/table-menu', 'HEAD~1')
  git(repo, 'tag', '-a', 'v1.0.0', '-m', 'Release 1.0.0', 'HEAD')
  const pr = {
    number: 42,
    title: 'Add the table menu',
    state: 'open',
    created_at: '2026-10-01T00:00:00Z',
    html_url: 'https://github.com/acme/widgets/pull/42',
    user: { login: 'tester' },
    head: { ref: 'feature/table-menu', sha: parent, label: 'acme:feature/table-menu', repo: { full_name: 'acme/widgets' } },
    base: { ref: 'main', repo: { full_name: 'acme/widgets' } }
  }
  const { app, page, close } = await launch(repo)
  try {
    await connect(app, page, 'github', 'https://github.com', {
      json: [['/pulls', [pr]], ...githubRoutes],
      graphql: {
        [head]: [failedCheck],
        [parent]: [
          { __typename: 'CheckRun', databaseId: 10, name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS', checkSuite: { workflowRun: { workflow: { name: 'CI' } } } },
          { __typename: 'StatusContext', context: 'deploy/preview', state: 'SUCCESS', targetUrl: 'https://example.com/preview' }
        ]
      }
    })
    await expect(row(page, 'Second change').locator('.build-marker')).toHaveAttribute('data-build-state', 'failed', { timeout: 15_000 })
    await expect(row(page, 'First change').locator('.build-marker')).toHaveAttribute('data-build-state', 'succeeded')
    const sidebar = view(page).locator('.sidebar')
    await expect(sidebar.locator('.ref-item', { hasText: /^main/ }).locator('.build-marker')).toHaveAttribute('data-build-state', 'failed')
    await expect(sidebar.locator('.ref-item', { hasText: 'feature/table-menu' }).locator('.build-marker')).toHaveAttribute('data-build-state', 'succeeded')
    await expect(sidebar.locator('.pr-item', { hasText: 'Add the table menu' }).locator('.build-marker')).toHaveAttribute('data-build-state', 'succeeded')
    await expect(sidebar.locator('.ref-item', { hasText: 'v1.0.0' }).locator('.build-marker')).toHaveAttribute('data-build-state', 'failed')

    await row(page, 'Second change').click()
    const section = page.locator('.builds-section')
    await expect(section).toContainText('CI / test')
    await expect(section.locator('.build-step pre')).toContainText('src/app.test.ts:12 expected 2 to be 3')

    await row(page, 'First change').click()
    await expect(section.locator('.build-row')).toHaveCount(2)
    await expect(section).toContainText('deploy/preview')
  } finally {
    await close()
  }
})

test('Azure DevOps builds show on the graph and failed steps show in the commit panel', async () => {
  const { repo, head, parent } = repoWithHost('https://dev.azure.com/contoso/Ministers/_git/widgets')
  const { app, page, close } = await launch(repo)
  try {
    await connect(app, page, 'azure', 'https://dev.azure.com/contoso', {
      json: [
        ['/builds/77/timeline', { records: [
          { type: 'Job', name: 'Build', result: 'failed' },
          { type: 'Task', name: 'Run tests', result: 'failed', issues: [{ type: 'error', message: '3 tests failed in MinistersApi.Tests' }] },
          { type: 'Task', name: 'Restore', result: 'succeeded' }
        ] }],
        ['/_apis/build/builds?', { value: [
          { id: 77, status: 'completed', result: 'failed', sourceVersion: head, sourceBranch: 'refs/heads/main', definition: { name: 'Ministers CI' }, _links: { web: { href: 'https://dev.azure.com/contoso/Ministers/_build/results?buildId=77' } } },
          { id: 76, status: 'inProgress', sourceVersion: parent, sourceBranch: 'refs/heads/main', definition: { name: 'Ministers CI' } }
        ] }],
        ['repositories/widgets?', { id: 'b2c7e3a0-0000-0000-0000-000000000000' }],
        ['/pullrequests', { value: [] }],
        ['connectionData', { authenticatedUser: { providerDisplayName: 'Tester' } }]
      ]
    })
    await expect(row(page, 'Second change').locator('.build-marker')).toHaveAttribute('data-build-state', 'failed', { timeout: 15_000 })
    await expect(row(page, 'First change').locator('.build-marker')).toHaveAttribute('data-build-state', 'running')

    await row(page, 'Second change').click()
    const section = page.locator('.builds-section')
    await expect(section).toContainText('Ministers CI')
    await expect(section).toContainText('main')
    await expect(section.locator('.build-step')).toHaveCount(1)
    await expect(section.locator('.build-step')).toContainText('Run tests')
    await expect(section.locator('.build-step pre')).toContainText('3 tests failed in MinistersApi.Tests')
  } finally {
    await close()
  }
})

test('a token without build access shows a scope hint in the commit panel', async () => {
  const { repo } = repoWithHost('https://dev.azure.com/contoso/Ministers/_git/widgets')
  const { app, page, close } = await launch(repo)
  try {
    await connect(app, page, 'azure', 'https://dev.azure.com/contoso', {
      status: [['/_apis/build/builds', 401]],
      json: [
        ['repositories/widgets?', { id: 'b2c7e3a0-0000-0000-0000-000000000000' }],
        ['/pullrequests', { value: [] }],
        ['connectionData', { authenticatedUser: { providerDisplayName: 'Tester' } }]
      ]
    })
    await row(page, 'Second change').click()
    await expect(page.locator('.builds-note')).toContainText('Add the Build (Read) scope', { timeout: 15_000 })
    await expect(view(page).locator('.build-marker')).toHaveCount(0)
  } finally {
    await close()
  }
})

test('GitLab pipelines show on the graph and failed job logs show in the commit panel', async () => {
  const { repo, head } = repoWithHost('https://gitlab.com/acme/widgets.git')
  const { app, page, close } = await launch(repo)
  try {
    await connect(app, page, 'gitlab', 'https://gitlab.com', {
      text: [['/jobs/9001/trace', '\u001b[32mRunning tests\u001b[0m\nFAIL src/app.test.ts\nError: expected 2 to be 3\n']],
      json: [
        ['/pipelines/501/jobs', [{ id: 9001, name: 'unit', stage: 'test', failure_reason: 'script_failure', web_url: 'https://gitlab.com/acme/widgets/-/jobs/9001' }]],
        ['/pipelines?', [{ id: 501, sha: head, ref: 'main', status: 'failed', web_url: 'https://gitlab.com/acme/widgets/-/pipelines/501', name: null }]],
        ['/merge_requests', []],
        ['/api/v4/user', { username: 'tester', name: 'Tester' }]
      ]
    })
    await expect(row(page, 'Second change').locator('.build-marker')).toHaveAttribute('data-build-state', 'failed', { timeout: 15_000 })
    await expect(row(page, 'First change').locator('.build-marker')).toHaveCount(0)

    await row(page, 'Second change').click()
    const step = page.locator('.builds-section .build-step')
    await expect(step).toContainText('test: unit')
    await expect(step.locator('pre')).toContainText('Error: expected 2 to be 3')
    await expect(step.locator('pre')).not.toContainText('[32m')
  } finally {
    await close()
  }
})

test('a failed build on a tracked remote branch shows in notifications and opens its commit', async () => {
  const { repo, head } = repoWithHost('https://github.com/acme/widgets.git')
  git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(repo, 'config', 'branch.main.remote', 'origin')
  git(repo, 'config', 'branch.main.merge', 'refs/heads/main')
  const { app, page, close } = await launch(repo)
  try {
    await connect(app, page, 'github', 'https://github.com', { json: githubRoutes, graphql: { [head]: [failedCheck] } })
    await expect(page.locator('.notif-badge')).toHaveText('1', { timeout: 30_000 })
    await page.getByRole('button', { name: /^Notifications/ }).click()
    const panel = page.locator('.notifications-panel')
    const failure = panel.locator('.notifications-build')
    await expect(failure).toContainText('CI / test failed')
    await expect(failure).toContainText('origin/main')
    await expect(panel.locator('.notifications-head')).toContainText('1 failed build')

    await failure.getByRole('button', { name: 'Clear CI / test on origin/main' }).click()
    await expect(failure).toHaveCount(0)
    await panel.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(failure).toHaveCount(1)

    await failure.getByRole('button', { name: 'CI / test failed' }).click()
    await expect(panel).toBeHidden()
    await expect(view(page).locator('.commit-row.selected')).toHaveAttribute('data-hash', head)
    await expect(page.locator('.builds-section .build-step pre')).toContainText('expected 2 to be 3')
  } finally {
    await close()
  }
})
