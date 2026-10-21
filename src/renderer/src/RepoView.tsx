import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Commit, RepoInfo, RepoRefs, RepoStatus } from '@shared/types'
import type { Actions, Shell } from './actions'
import { CommitList } from './components/CommitList'
import { CommitPanel } from './components/CommitPanel'
import { FileViewer, type FileViewRequest } from './components/FileViewer'
import type { MenuItem } from './components/ContextMenu'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { WorkingTree } from './components/WorkingTree'
import { Splitter } from './components/Splitter'
import { UpdateNotice } from './components/UpdateNotice'
import { setLayout, useLayout } from './layout'
import { errorMessage, shortHash, WIP_HASH } from './util'

const LOG_LIMIT = 1500
const POLL_MS = 3000

export function RepoView({
  repo,
  active,
  shell
}: {
  repo: RepoInfo
  active: boolean
  shell: Shell
}): React.JSX.Element {
  const [commits, setCommits] = useState<Commit[]>([])
  const [refs, setRefs] = useState<RepoRefs | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ hash: string; n: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [viewing, setViewing] = useState<FileViewRequest | null>(null)
  const lastRefsJson = useRef('')
  const lastStatusJson = useRef('')
  const path = repo.path
  const layout = useLayout()

  const loadAll = useCallback(async () => {
    const [log, r, s] = await Promise.all([
      window.git.log(path, LOG_LIMIT),
      window.git.refs(path),
      window.git.status(path)
    ])
    lastRefsJson.current = JSON.stringify(r)
    lastStatusJson.current = JSON.stringify(s)
    setCommits(log)
    setRefs(r)
    setStatus(s)
  }, [path])

  const refresh = useCallback(() => {
    loadAll().catch((e) => shell.showError(errorMessage(e)))
  }, [loadAll, shell])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!active) return
    const tick = async (): Promise<void> => {
      if (busy) return
      try {
        const [r, s] = await Promise.all([window.git.refs(path), window.git.status(path)])
        const rj = JSON.stringify(r)
        const sj = JSON.stringify(s)
        if (sj !== lastStatusJson.current) {
          lastStatusJson.current = sj
          setStatus(s)
        }
        if (rj !== lastRefsJson.current) {
          lastRefsJson.current = rj
          setRefs(r)
          setCommits(await window.git.log(path, LOG_LIMIT))
        }
      } catch {
        /* transient, e.g. git lock during an operation */
      }
    }
    void tick()
    const id = setInterval(tick, POLL_MS)
    const onFocus = (): void => void tick()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [path, active, busy])

  useEffect(() => {
    setViewing(null)
  }, [selected])

  useEffect(() => {
    if (!active || !viewing) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLElement && e.target.closest('.cm-editor, input, textarea'))) setViewing(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active, viewing])

  const hasWip = !!status && (status.staged.length > 0 || status.unstaged.length > 0)

  const rows = useMemo<Commit[]>(() => {
    if (!hasWip || !refs) return commits
    const wip: Commit = {
      hash: WIP_HASH,
      parents: refs.headHash ? [refs.headHash] : [],
      author: '',
      email: '',
      date: Date.now(),
      subject: `${(status?.staged.length ?? 0) + (status?.unstaged.length ?? 0)} uncommitted changes`,
      refs: []
    }
    return [wip, ...commits]
  }, [commits, hasWip, refs, status])

  useEffect(() => {
    if (!rows.length) return
    if (selected && rows.some((c) => c.hash === selected)) return
    setSelected(rows[0].hash)
  }, [rows, selected])

  const run = useCallback(
    async (label: string, fn: () => Promise<void>, successMessage?: string) => {
      setBusy(label)
      try {
        await fn()
        if (successMessage) shell.showInfo(successMessage)
      } catch (e) {
        shell.showError(errorMessage(e))
      } finally {
        setBusy(null)
        refresh()
      }
    },
    [refresh, shell]
  )

  const actions = useMemo<Actions>(
    () => ({
      ...shell,
      refresh,
      selectHash: (hash) => {
        setSelected(hash)
        setScrollTarget((t) => ({ hash, n: (t?.n ?? 0) + 1 }))
      },
      checkout: (ref) => run('Checking out', () => window.git.checkout(path, ref)),
      createBranch: async (startPoint) => {
        const name = await shell.prompt(
          'Create branch',
          `Branch name (from ${startPoint === 'HEAD' ? 'HEAD' : shortHash(startPoint)})`
        )
        if (!name) return
        const co = await shell.confirm('Create branch', `Check out "${name}" after creating it?`)
        run('Creating branch', () => window.git.createBranch(path, name, startPoint, co))
      },
      deleteBranch: async (name) => {
        const ok = await shell.confirm('Delete branch', `Delete local branch "${name}"?`, true)
        if (!ok) return
        run('Deleting branch', async () => {
          try {
            await window.git.deleteBranch(path, name, false)
          } catch (e) {
            const msg = errorMessage(e)
            if (!/not fully merged/i.test(msg)) throw e
            const force = await shell.confirm('Branch not merged', `${msg}\n\nForce delete?`, true)
            if (force) await window.git.deleteBranch(path, name, true)
          }
        })
      },
      merge: (ref) => run('Merging', () => window.git.merge(path, ref), `Merged ${ref}`),
      fetch: () => run('Fetching', () => window.git.fetch(path), 'Fetched'),
      pull: () => run('Pulling', () => window.git.pull(path), 'Pulled'),
      push: () =>
        run(
          'Pushing',
          async () => {
            const current = refs?.branches.find((b) => b.current)
            if (current && !current.upstream) {
              const ok = await shell.confirm(
                'Push',
                `"${current.name}" has no upstream. Push to origin/${current.name} and set upstream?`
              )
              if (!ok) return
              await window.git.push(path, true)
            } else {
              await window.git.push(path, false)
            }
          },
          'Pushed'
        ),
      stash: async () => {
        const msg = await shell.prompt('Stash changes', 'Stash message', 'WIP')
        if (msg === null) return
        run('Stashing', () => window.git.stashPush(path, msg))
      },
      stashPop: (index) => run('Popping stash', () => window.git.stashPop(path, index)),
      stashDrop: async (index) => {
        const ok = await shell.confirm('Drop stash', `Drop stash@{${index}}?`, true)
        if (ok) run('Dropping stash', () => window.git.stashDrop(path, index))
      },
      cherryPick: (hash) => run('Cherry-picking', () => window.git.cherryPick(path, hash)),
      revert: (hash) => run('Reverting', () => window.git.revert(path, hash)),
      resetTo: async (hash, mode) => {
        const ok = await shell.confirm(
          `Reset (${mode})`,
          `Reset current branch to ${shortHash(hash)} (--${mode})?${mode === 'hard' ? '\n\nUncommitted changes will be lost.' : ''}`,
          mode === 'hard'
        )
        if (ok) run('Resetting', () => window.git.resetTo(path, hash, mode))
      },
      copyHash: (hash) => {
        navigator.clipboard.writeText(hash)
        shell.showInfo(`Copied ${hash}`)
      }
    }),
    [path, refresh, refs, run, shell]
  )

  const commitMenu = (c: Commit, e: React.MouseEvent): void => {
    const branches = c.refs.filter((r) => r.kind === 'branch').map((r) => r.name)
    const items: MenuItem[] = [
      ...branches.map((b) => ({ label: `Checkout ${b}`, onClick: () => actions.checkout(b) })),
      { label: `Checkout ${shortHash(c.hash)} (detached)`, onClick: () => actions.checkout(c.hash) },
      { label: 'Create branch here…', onClick: () => actions.createBranch(c.hash) },
      { separator: true },
      { label: 'Cherry-pick commit', onClick: () => actions.cherryPick(c.hash) },
      { label: 'Revert commit', onClick: () => actions.revert(c.hash) },
      { separator: true },
      { label: 'Reset to here (soft)', onClick: () => actions.resetTo(c.hash, 'soft') },
      { label: 'Reset to here (mixed)', onClick: () => actions.resetTo(c.hash, 'mixed') },
      { label: 'Reset to here (hard)', danger: true, onClick: () => actions.resetTo(c.hash, 'hard') },
      { separator: true },
      { label: 'Copy SHA', onClick: () => actions.copyHash(c.hash) }
    ]
    actions.openMenu(e, items)
  }

  return (
    <div
      className="repo-view"
      hidden={!active}
      style={{ gridTemplateColumns: `${layout.sidebar}px 4px 1fr 4px ${layout.panel}px` }}
    >
      <Toolbar repo={repo} refs={refs} busy={!!busy} actions={actions} />
      {refs ? <Sidebar refs={refs} actions={actions} active={active} /> : <div className="sidebar" />}
      <Splitter
        direction="vertical"
        value={layout.sidebar}
        onChange={(v) => setLayout('sidebar', v)}
        onReset={() => setLayout('sidebar', 250)}
      />
      {viewing ? (
        <FileViewer
          repoPath={path}
          request={viewing}
          shell={shell}
          onChange={setViewing}
          onClose={() => setViewing(null)}
          onSaved={refresh}
        />
      ) : (
        <CommitList
          commits={rows}
          selected={selected}
          onSelect={setSelected}
          onContextMenu={commitMenu}
          scrollTarget={scrollTarget}
        />
      )}
      <Splitter
        direction="vertical"
        value={layout.panel}
        onChange={(v) => setLayout('panel', v)}
        invert
        onReset={() => setLayout('panel', 440)}
      />
      {selected === WIP_HASH && status ? (
        <WorkingTree repoPath={path} status={status} actions={actions} viewing={viewing} onView={setViewing} />
      ) : selected ? (
        <CommitPanel repoPath={path} hash={selected} viewing={viewing} onView={setViewing} />
      ) : (
        <div className="panel">
          <div className="center">{refs && !commits.length ? 'No commits yet' : 'Loading…'}</div>
        </div>
      )}
      <div className="statusbar">
        <span>
          {commits.length} commits{commits.length >= LOG_LIMIT ? ` (showing first ${LOG_LIMIT})` : ''}
        </span>
        {status && (
          <span>
            {status.staged.length} staged · {status.unstaged.length} unstaged
          </span>
        )}
        {busy && <span className="spin">{busy}…</span>}
        <span className="spacer" />
        <UpdateNotice />
      </div>
    </div>
  )
}
