import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Commit, HostInfo, PullRequest, RepoInfo, RepoRefs, RepoStatus, UndoInfo } from '@shared/types'
import { CreatePrDialog } from './components/CreatePrDialog'
import { Loading } from './components/Spinner'
import { PrPanel } from './components/PrPanel'
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
import { useSettings } from './settings'


export function RepoView({
  repo,
  active,
  shell,
  onClose
}: {
  repo: RepoInfo
  active: boolean
  shell: Shell
  onClose: () => void
}): React.JSX.Element {
  const [loadError, setLoadError] = useState<string | null>(null)
  const { pollInterval, logLimit } = useSettings()
  const LOG_LIMIT = logLimit
  const POLL_MS = pollInterval * 1000
  const [commits, setCommits] = useState<Commit[]>([])
  const [refs, setRefs] = useState<RepoRefs | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [scrollTarget, setScrollTarget] = useState<{ hash: string; n: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [viewing, setViewing] = useState<FileViewRequest | null>(null)
  const [undoInfo, setUndoInfo] = useState<UndoInfo>({ undo: null, redo: null })
  const undoRef = useRef(undoInfo)
  undoRef.current = undoInfo
  const busyRef = useRef(busy)
  busyRef.current = busy
  const actionsRef = useRef<Actions | null>(null)
  const [host, setHost] = useState<HostInfo | null>(null)
  const [hasAccount, setHasAccount] = useState(false)
  const [prs, setPrs] = useState<PullRequest[]>([])
  const [prError, setPrError] = useState<string | null>(null)
  const [prsLoaded, setPrsLoaded] = useState(false)
  const [selectedPr, setSelectedPr] = useState<PullRequest | null>(null)
  const [prRefresh, setPrRefresh] = useState(0)
  const [creatingPr, setCreatingPr] = useState(false)

  const refreshPrs = useCallback(async () => {
    try {
      const info = await window.host.detect(repo.path)
      setHost(info)
      if (!info) return
      const ok = await window.host.hasAccount(repo.path)
      setHasAccount(ok)
      if (!ok) return
      setPrs(await window.host.pullRequests(repo.path))
      setPrError(null)
      setPrRefresh((n) => n + 1)
    } catch (e) {
      setPrError(errorMessage(e))
    } finally {
      setPrsLoaded(true)
    }
  }, [repo.path])
  const lastRefsJson = useRef('')
  const lastStatusJson = useRef('')
  const path = repo.path
  const layout = useLayout()

  const loadAll = useCallback(async () => {
    const [log, r, s, u] = await Promise.all([
      window.git.log(path, LOG_LIMIT),
      window.git.refs(path),
      window.git.status(path),
      window.git.undoInfo(path)
    ])
    setUndoInfo(u)
    lastRefsJson.current = JSON.stringify(r)
    lastStatusJson.current = JSON.stringify(s)
    setCommits(log)
    setRefs(r)
    setStatus(s)
  }, [path, LOG_LIMIT])

  const refresh = useCallback(() => {
    loadAll()
      .then(() => setLoadError(null))
      .catch((e) => {
        if (!lastRefsJson.current) setLoadError(errorMessage(e))
        else shell.showError(errorMessage(e))
      })
  }, [loadAll, shell])

  const loaded = useRef(false)
  useEffect(() => {
    if (active && !loaded.current) {
      loaded.current = true
      refresh()
      void refreshPrs()
    }
  }, [active, refresh, refreshPrs])

  useEffect(() => {
    if (!active || !host || !hasAccount) return
    const id = setInterval(() => void refreshPrs(), 60000)
    const onFocus = (): void => void refreshPrs()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [active, host, hasAccount, refreshPrs])

  useEffect(() => {
    if (!active) return
    const onSettings = (): void => void refreshPrs()
    window.addEventListener('arbor:accounts-changed', onSettings)
    return () => window.removeEventListener('arbor:accounts-changed', onSettings)
  }, [active, refreshPrs])

  useEffect(() => {
    if (!active || loadError) return
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
          setUndoInfo(await window.git.undoInfo(path))
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
  }, [path, active, busy, loadError, LOG_LIMIT, POLL_MS])

  useEffect(() => {
    setViewing(null)
  }, [selected])

  useEffect(() => {
    if (!active) return
    const key = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return
      if (document.querySelector('.overlay, .dialog')) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        actionsRef.current?.undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        actionsRef.current?.redo()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active])

  useEffect(() => {
    if (!active || !viewing) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLElement && e.target.closest('.cm-editor, input, textarea'))) setViewing(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [active, viewing])

  const hasWip = !!status && (status.staged.length > 0 || status.unstaged.length > 0 || !!status.operation)

  const rows = useMemo<Commit[]>(() => {
    if (!hasWip || !refs) return commits
    const wip: Commit = {
      hash: WIP_HASH,
      parents: refs.headHash ? [refs.headHash] : [],
      author: '',
      email: '',
      date: Date.now(),
      subject: status?.operation
        ? `${{ merge: 'Merging', 'cherry-pick': 'Cherry-picking', revert: 'Reverting', rebase: 'Rebasing' }[status.operation.kind]}${status.conflicted.length ? ` · ${status.conflicted.length} conflict${status.conflicted.length === 1 ? '' : 's'}` : ''}`
        : `${(status?.staged.length ?? 0) + (status?.unstaged.length ?? 0)} uncommitted changes`,
      refs: []
    }
    return [wip, ...commits]
  }, [commits, hasWip, refs, status])

  const wantWip = useRef(false)
  useEffect(() => {
    if (!rows.length) return
    if (wantWip.current && rows[0].hash === WIP_HASH) {
      wantWip.current = false
      if (selected !== WIP_HASH) setSelected(WIP_HASH)
      return
    }
    if (selected && rows.some((c) => c.hash === selected)) return
    if (wantWip.current) return
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
        if (/Push|Fetch|Pull/.test(label)) void refreshPrs()
      }
    },
    [refresh, refreshPrs, shell]
  )

  const conflictAware = async (fn: () => Promise<void>): Promise<void> => {
    try {
      await fn()
    } catch (e) {
      if (!/CONFLICT|could not apply/i.test(errorMessage(e))) throw e
      shell.showInfo('There are conflicts to resolve')
      wantWip.current = true
      setSelected(WIP_HASH)
    }
  }

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
      merge: (ref) =>
        run('Merging', async () => {
          try {
            await window.git.merge(path, ref)
            shell.showInfo(`Merged ${ref}`)
          } catch (e) {
            if (!/CONFLICT/.test(errorMessage(e))) throw e
            shell.showInfo(`Merge of ${ref} has conflicts to resolve`)
            wantWip.current = true
            setSelected(WIP_HASH)
          }
        }),
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
      cherryPick: (hash) => run('Cherry-picking', () => conflictAware(() => window.git.cherryPick(path, hash))),
      revert: (hash) => run('Reverting', () => conflictAware(() => window.git.revert(path, hash))),
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
      },
      undo: () => {
        if (!undoRef.current.undo || busyRef.current) return
        void run('Undoing', async () => {
          const label = await window.git.undo(path)
          shell.showInfo(`Undid: ${label}`)
        })
      },
      redo: () => {
        if (!undoRef.current.redo || busyRef.current) return
        void run('Redoing', async () => {
          const label = await window.git.redo(path)
          shell.showInfo(`Redid: ${label}`)
        })
      }
    }),
    [path, refresh, refs, run, shell]
  )
  actionsRef.current = actions

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

  if (!active) return <div className="repo-view" hidden />

  if (loadError) {
    return (
      <div className="repo-view error-view">
        <div className="center">
          <div className="error-box">
            <h3>Could not open {repo.name}</h3>
            <p className="muted" title={repo.path}>{repo.path}</p>
            <pre>{loadError}</pre>
            <div className="row">
              <button onClick={() => { loaded.current = true; refresh() }}>Try again</button>
              <button className="danger" onClick={onClose}>Close tab</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="repo-view"
      style={{ gridTemplateColumns: `${layout.sidebar}px 4px 1fr 4px ${layout.panel}px` }}
    >
      <Toolbar
        repo={repo}
        refs={refs}
        busy={!!busy}
        busyLabel={busy}
        actions={actions}
        host={host}
        prs={prs}
        onCreatePr={() => setCreatingPr(true)}
        onViewPr={(pr) => setSelectedPr(pr)}
        undoInfo={undoInfo}
      />
      {refs ? (
        <Sidebar
          refs={refs}
          actions={actions}
          active={active}
          host={host}
          hasAccount={hasAccount}
          prs={prs}
          prError={prError}
          prsLoaded={prsLoaded}
          selectedPr={selectedPr?.id ?? null}
          onSelectPr={(pr) => setSelectedPr(pr)}
        />
      ) : (
        <div className="sidebar" />
      )}
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
          onSelect={(hash) => {
            setSelectedPr(null)
            setSelected(hash)
          }}
          onContextMenu={commitMenu}
          scrollTarget={scrollTarget}
          loading={!refs}
        />
      )}
      <Splitter
        direction="vertical"
        value={layout.panel}
        onChange={(v) => setLayout('panel', v)}
        invert
        onReset={() => setLayout('panel', 440)}
      />
      {selectedPr && host ? (
        <PrPanel repoPath={path} host={host} pr={selectedPr} actions={actions} refreshKey={prRefresh} />
      ) : selected === WIP_HASH && status ? (
        <WorkingTree repoPath={path} status={status} actions={actions} viewing={viewing} onView={setViewing} />
      ) : selected ? (
        <CommitPanel repoPath={path} hash={selected} shell={shell} viewing={viewing} onView={setViewing} />
      ) : (
        <div className="panel">
          {refs && !commits.length ? <div className="center">No commits yet</div> : <Loading />}
        </div>
      )}
      {creatingPr && host && refs && (
        <CreatePrDialog
          repoPath={path}
          host={host}
          refs={refs}
          source={refs.branches.find((b) => b.current)?.name ?? ''}
          defaultTitle={commits.find((c) => c.refs.some((r) => r.kind === 'head'))?.subject ?? ''}
          onCreated={(pr) => {
            setCreatingPr(false)
            shell.showInfo(`Created ${host.kind === 'gitlab' ? 'merge' : 'pull'} request ${host.kind === 'github' ? '#' : '!'}${pr.id}`)
            setPrs((list) => [pr, ...list])
            setSelectedPr(pr)
          }}
          onClose={() => setCreatingPr(false)}
        />
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
        {busy && <span className="spin" role="status">{busy}…</span>}
        <span className="spacer" />
        <UpdateNotice />
      </div>
    </div>
  )
}
