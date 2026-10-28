import { mkdtempSync, readdirSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const STALE_MS = 12 * 60 * 60 * 1000

const remove = (dir: string): void => {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch (e) {
    console.warn(`Could not remove ${dir}: ${(e as Error).message}`)
  }
}

export default function globalSetup(): () => void {
  const base = tmpdir()
  for (const name of readdirSync(base)) {
    if (!/^arbor-(e2e|profile|rebase)-/.test(name)) continue
    const dir = join(base, name)
    try {
      if (Date.now() - statSync(dir).mtimeMs > STALE_MS) remove(dir)
    } catch {
      continue
    }
  }
  const root = mkdtempSync(join(base, 'arbor-e2e-'))
  process.env.ARBOR_E2E_TMP = root
  return () => remove(root)
}
