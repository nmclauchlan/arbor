import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Commit, RepoInfo, RepoRefs, RepoStatus } from '@shared/types'
import type { Actions } from './actions'
import { CommitList } from './components/CommitList'
import { CommitPanel } from './components/CommitPanel'
import { ContextMenu, type MenuItem, type MenuState } from './components/ContextMenu'
import { useDialogs } from './components/Dialog'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { Welcome } from './components/Welcome'
import { WorkingTree } from './components/WorkingTree'
import { errorMessage, shortHash, WIP_HASH } from './util'

const LOG_LIMIT = 1500
const POLL_MS = 3000

interface Toast {
  kind: 'error' | 'info'
  text: string
}

export default function App(): React.JSX.Element {
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [recent, setRecent] = useState<RepoInfo[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [refs, setRefs] = useState<RepoRefs | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ hash: string; n: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const dialogs = useDialogs()
  const repoPath = useRef<string | null>(null)
  const lastRefsJson = useRef('')
  const lastStatusJson = useRef('')

  useEffect(() => {
    window.git.recentRepos().then(setRecent).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 10000 : 3000)
    return () => clearTimeout(t)
  }, [toast])

  const showError = useCallback((text: string) => setToast({ kind: 'error', text }), [])
  const showInfo = useCallback((text: string) => setToast({ kind: 'info', text }), [])

  const loadAll = useCallback(async (path: string) => {
    const [log, r, s] = await Promise.all([
      window.git.log(path, LOG_LIMIT),
      window.git.refs(path),
      window.git.status(path)
    ])
    if (repoPath.current !== path) return
    lastRefsJson.current = JSON.stringify(r)
    lastStatusJson.current = JSON.stringify(s)
    setCommits(log)
    setRefs(r)
    setStatus(s)
  }, [])

  const refresh = useCallback(() => {
    const path = repoPath.current
    if (!path) return
    loadAll(path).catch((e) => showError(errorMessage(e)))
  }, [loadAll, showError])

  const openPath = useCallback(
    async (path: string) => {
      try {
        const info = await window.git.openRepo(path)
        repoPath.current = info.path
        setRepo(info)
        setSelected(null)
        setCommits([])
        setRefs(null)
        setStatus(null)
        await loadAll(info.path)
        window.git.recentRepos().then(setRecent).catch(() => undefined)
      } catch (e) {
        showError(errorMessage(e))
      }
    },
    [loadAll, showError]
  )

  useEffect(() => {
    window.git
      .initialRepo()
      .then((p) => {
        if (p) openPath(p)
      })
      .catch(() => undefined)
  }, [openPath])

  useEffect(() => {
    if (!repo) return
    const tick = async (): Promise<void> => {
      const path = repoPath.current
      if (!path || busy) return
      try {
        const [r, s] = await Promise.all([window.git.refs(path), window.git.status(path)])
        if (repoPath.current !== path) return
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
    const id = setInterval(tick, POLL_MS)
    const onFocus = (): void => void tick()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [repo, busy])

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
        if (successMessage) showInfo(successMessage)
      } catch (e) {
        showError(errorMessage(e))
      } finally {
        setBusy(null)
        refresh()
      }
    },
    [refresh, showError, showInfo]
  )

  const actions = useMemo<Actions>(() => {
    const path = (): string => repoPath.current!
    return {
      openRepo: async () => {
        const p = await window.git.selectRepo()
        if (p) openPath(p)
      },
      refresh,
      selectHash: (hash) => {
        setSelected(hash)
        setScrollTarget((t) => ({ hash, n: (t?.n ?? 0) + 1 }))
      },
      checkout: (ref) => run('Checking out', () => window.git.checkout(path(), ref)),
      createBranch: async (startPoint) => {
        const name = await dialogs.prompt('Create branch', `Branch name (from ${startPoint === 'HEAD' ? 'HEAD' : shortHash(startPoint)})`)
        if (!name) return
        const co = await dialogs.confirm('Create branch', `Check out "${name}" after creating it?`)
        run('Creating branch', () => window.git.createBranch(path(), name, startPoint, co))
      },
      deleteBranch: async (name) => {
        const ok = await dialogs.confirm('Delete branch', `Delete local branch "${name}"?`, true)
        if (!ok) return
        run('Deleting branch', async () => {
          try {
            await window.git.deleteBranch(path(), name, false)
          } catch (e) {
            const msg = errorMessage(e)
            if (!/not fully merged/i.test(msg)) throw e
            const force = await dialogs.confirm('Branch not merged', `${msg}\n\nForce delete?`, true)
            if (force) await window.git.deleteBranch(path(), name, true)
          }
        })
      },
      merge: (ref) => run('Merging', () => window.git.merge(path(), ref), `Merged ${ref}`),
      fetch: () => run('Fetching', () => window.git.fetch(path()), 'Fetched'),
      pull: () => run('Pulling', () => window.git.pull(path()), 'Pulled'),
      push: () =>
        run('Pushing', async () => {
          const current = refs?.branches.find((b) => b.current)
          if (current && !current.upstream) {
            const ok = await dialogs.confirm('Push', `"${current.name}" has no upstream. Push to origin/${current.name} and set upstream?`)
            if (!ok) return
            await window.git.push(path(), true)
          } else {
            await window.git.push(path(), false)
          }
        }, 'Pushed'),
      stash: async () => {
        const msg = await dialogs.prompt('Stash changes', 'Stash message', 'WIP')
        if (msg === null) return
        run('Stashing', () => window.git.stashPush(path(), msg))
      },
      stashPop: (index) => run('Popping stash', () => window.git.stashPop(path(), index)),
      stashDrop: async (index) => {
        const ok = await dialogs.confirm('Drop stash', `Drop stash@{${index}}?`, true)
        if (ok) run('Dropping stash', () => window.git.stashDrop(path(), index))
      },
      cherryPick: (hash) => run('Cherry-picking', () => window.git.cherryPick(path(), hash)),
      revert: (hash) => run('Reverting', () => window.git.revert(path(), hash)),
      resetTo: async (hash, mode) => {
        const ok = await dialogs.confirm(
          `Reset (${mode})`,
          `Reset current branch to ${shortHash(hash)} (--${mode})?${mode === 'hard' ? '\n\nUncommitted changes will be lost.' : ''}`,
          mode === 'hard'
        )
        if (ok) run('Resetting', () => window.git.resetTo(path(), hash, mode))
      },
      copyHash: (hash) => {
        navigator.clipboard.writeText(hash)
        showInfo(`Copied ${hash}`)
      },
      openMenu: (e, items) => setMenu({ x: e.clientX, y: e.clientY, items }),
      confirm: dialogs.confirm,
      showError
    }
  }, [dialogs, openPath, refresh, refs, run, showError, showInfo])

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

  const closeMenu = useCallback(() => setMenu(null), [])

  return (
    <div className="app">
      <div className="titlebar">
        <strong>Arbor</strong>
        {repo && <span title={repo.path}>— {repo.name}</span>}
      </div>
      {!repo ? (
        <Welcome recent={recent} onOpen={actions.openRepo} onOpenRecent={openPath} />
      ) : (
        <>
          <Toolbar repo={repo} refs={refs} busy={!!busy} actions={actions} />
          {refs ? <Sidebar refs={refs} actions={actions} /> : <div className="sidebar" />}
          <CommitList
            commits={rows}
            selected={selected}
            onSelect={setSelected}
            onContextMenu={commitMenu}
            scrollTarget={scrollTarget}
          />
          {selected === WIP_HASH && status ? (
            <WorkingTree repoPath={repo.path} status={status} actions={actions} />
          ) : selected ? (
            <CommitPanel repoPath={repo.path} hash={selected} />
          ) : (
            <div className="panel"><div className="center">{commits.length ? 'Select a commit' : 'No commits yet'}</div></div>
          )}
          <div className="statusbar">
            <span>{commits.length} commits{commits.length >= LOG_LIMIT ? ` (showing first ${LOG_LIMIT})` : ''}</span>
            {status && <span>{status.staged.length} staged · {status.unstaged.length} unstaged</span>}
            {busy && <span className="spin">{busy}…</span>}
          </div>
        </>
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
      {dialogs.element}
      {toast && (
        <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
