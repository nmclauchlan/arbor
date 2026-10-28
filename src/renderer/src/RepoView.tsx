import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Commit, CommitBuild, CommitSearchMode, GraphFilter, RebaseAction, RebaseStep, HostInfo, PullRequest, RepoInfo, RepoRefs, RepoStatus, UndoInfo } from '@shared/types'
import { CreatePrDialog } from './components/CreatePrDialog'
import { Loading } from './components/Spinner'
import { buildRefMenu, type FocusRef } from './refMenu'
import { PrPanel } from './components/PrPanel'
import type { Actions, Shell } from './actions'
import { CommitList } from './components/CommitList'
import { CommitSearch } from './components/CommitSearch'
import { RebaseDialog } from './components/RebaseDialog'
import { CommitPanel } from './components/CommitPanel'
import { FileViewer, type FileViewRequest } from './components/FileViewer'
import { CompareView, type CompareRequest } from './components/CompareView'
import { StashDialog } from './components/StashDialog'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { WorkingTree } from './components/WorkingTree'
import { Splitter } from './components/Splitter'
import { AppVersion, UpdateNotice } from './components/UpdateNotice'
import { setLayout, setPanelCollapsed, useCollapsedPanels, useLayout } from './layout'
import { copyToClipboard, errorMessage, shortHash, WIP_HASH } from './util'
import { currentSettings, useSettings } from './settings'


const BUILD_COMMITS = 50
const BUILD_LOOKUPS = 150

export function RepoView({
  repo,
  active,
  shell,
  onClose,
  focus
}: {
  repo: RepoInfo
  active: boolean
  shell: Shell
  onClose: () => void
  focus?: { hash: string; n: number } | null
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
  const [search, setSearch] = useState<{ query: string; mode: CommitSearchMode; focus: number } | null>(null)
  const [searchHits, setSearchHits] = useState<string[]>([])
  const [searching, setSearching] = useState(false)
  const rowsRef = useRef<Commit[]>([])
  const [rebasing, setRebasing] = useState<{ base: string; preset?: Record<string, RebaseAction> } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [viewing, setViewing] = useState<FileViewRequest | null>(null)
  const [comparing, setComparing] = useState<CompareRequest | null>(null)
  const [stashing, setStashing] = useState<{ paths?: string[] } | null>(null)
  const [commitDraft, setCommitDraft] = useState<string | null>(null)
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
  const [creatingPr, setCreatingPr] = useState<string | false>(false)
  const [graphFilter, setGraphFilter] = useState<GraphFilter>({})
  const filtered = !!graphFilter.solo?.length || !!graphFilter.hide?.length

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

  const [builds, setBuilds] = useState<Record<string, CommitBuild[]>>({})
  const [buildsError, setBuildsError] = useState<string | null>(null)
  const buildShas = [
    ...new Set([
      ...commits.filter((c) => c.hash !== WIP_HASH).slice(0, BUILD_COMMITS).map((c) => c.hash),
      ...(refs?.branches ?? []).map((b) => b.hash),
      ...prs.flatMap((p) => [p.headSha, p.mergeSha].filter((s): s is string => !!s)),
      ...(refs?.remotes ?? []).map((r) => r.hash),
      ...(refs?.tags ?? []).map((t) => t.hash)
    ])
  ]
    .slice(0, BUILD_LOOKUPS)
    .join(',')
  const refreshBuilds = useCallback(async () => {
    if (!buildShas) return
    try {
      setBuilds(await window.host.builds(repo.path, buildShas.split(',')))
      setBuildsError(null)
    } catch (e) {
      setBuildsError(errorMessage(e))
    }
  }, [repo.path, buildShas])
  const buildsRunning = Object.values(builds).some((list) => list.some((b) => b.state === 'running' || b.state === 'queued'))
  const lastRefsJson = useRef('')
  const lastStatusJson = useRef('')
  const path = repo.path
  const layout = useLayout()
  const collapsedPanels = useCollapsedPanels()
  const sidebarOpen = !collapsedPanels.includes('sidebar')
  const detailsOpen = !collapsedPanels.includes('details')

  const loadAll = useCallback(async () => {
    const [log, r, s, u] = await Promise.all([
      window.git.log(path, LOG_LIMIT, graphFilter),
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
  }, [path, LOG_LIMIT, graphFilter])

  const refresh = useCallback(() => {
    loadAll()
      .then(() => setLoadError(null))
      .catch((e) => {
        if (!lastRefsJson.current) setLoadError(errorMessage(e))
        else shell.showError(errorMessage(e))
      })
  }, [loadAll, shell])

  const loaded = useRef(false)
  const filterKey = JSON.stringify(graphFilter)
  const lastFilterKey = useRef(filterKey)
  useEffect(() => {
    if (lastFilterKey.current === filterKey) return
    lastFilterKey.current = filterKey
    if (loaded.current) refresh()
  }, [filterKey, refresh])
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
    if (!active || !host || !hasAccount) return
    void refreshBuilds()
    const id = setInterval(() => void refreshBuilds(), buildsRunning ? 20_000 : 120_000)
    return () => clearInterval(id)
  }, [active, host, hasAccount, buildsRunning, refreshBuilds])

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
          setCommits(await window.git.log(path, LOG_LIMIT, graphFilter))
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
  }, [path, active, busy, loadError, LOG_LIMIT, POLL_MS, graphFilter])

  useEffect(() => {
    setViewing(null)
    setComparing(null)
  }, [selected])

  const openSearch = useCallback(() => {
    setViewing(null)
    setComparing(null)
    setSearch((s) => ({ query: s?.query ?? '', mode: s?.mode ?? 'all', focus: (s?.focus ?? 0) + 1 }))
  }, [])

  const searchKey = search ? `${search.mode}\u0000${search.query.trim()}` : ''
  useEffect(() => {
    const [mode, query] = searchKey.split('\u0000') as [CommitSearchMode, string]
    if (!query) {
      setSearchHits([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      window.git
        .searchCommits(path, query, mode, graphFilter)
        .then((found) => {
          if (cancelled) return
          setSearchHits(found)
          const hits = new Set(found)
          const first = rowsRef.current.find((c) => hits.has(c.hash))
          if (first) {
            wantHash.current = null
            setSelectedPr(null)
            setSelected(first.hash)
            setScrollTarget((t) => ({ hash: first.hash, n: (t?.n ?? 0) + 1 }))
          }
        })
        .catch(() => !cancelled && setSearchHits([]))
        .finally(() => !cancelled && setSearching(false))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchKey, path, graphFilter])

  useEffect(() => {
    if (!active) return
    const key = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const t = e.target
      if (t instanceof HTMLElement && t.closest('input, textarea, select, [contenteditable="true"], .cm-editor')) return
      if (document.querySelector('.overlay, .dialog')) return
      const k = e.key.toLowerCase()
      if (k === 'f' && !e.shiftKey) {
        e.preventDefault()
        openSearch()
      } else if (k === 'z' && !e.shiftKey) {
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

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const wantHash = useRef<string | null>(null)
  useEffect(() => {
    if (!focus) return
    setSelectedPr(null)
    setViewing(null)
    setComparing(null)
    wantHash.current = focus.hash
    setSelected(focus.hash)
    setScrollTarget((t) => ({ hash: focus.hash, n: (t?.n ?? 0) + 1 }))
    refresh()
  }, [focus, refresh])

  const wantWip = useRef(false)
  useEffect(() => {
    if (!rows.length) return
    if (wantHash.current) {
      const h = wantHash.current
      if (!rows.some((c) => c.hash === h)) return
      wantHash.current = null
      if (selected !== h) setSelected(h)
      setScrollTarget((t) => ({ hash: h, n: (t?.n ?? 0) + 1 }))
      return
    }
    if (wantWip.current && rows[0].hash === WIP_HASH) {
      wantWip.current = false
      if (selected !== WIP_HASH) setSelected(WIP_HASH)
      return
    }
    if (selected && (rows.some((c) => c.hash === selected) || refs?.stashes.some((s) => s.hash === selected))) return
    if (wantWip.current) return
    setSelected(rows[0].hash)
  }, [rows, selected, refs?.stashes])

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
        if (/Push|Fetch|Pull/.test(label)) {
          void refreshPrs()
          void refreshBuilds()
          window.dispatchEvent(new CustomEvent('arbor:synced', { detail: path }))
        }
      }
    },
    [refresh, refreshPrs, refreshBuilds, shell]
  )

  const forcePushWarning = (branch: string): string =>
    `Force pushing replaces the remote copy of ${branch} with yours. Arbor uses --force-with-lease, so it refuses if someone else has pushed there since you last fetched.`

  const leased = async (branch: string, push: () => Promise<void>): Promise<void> => {
    try {
      await push()
    } catch (e) {
      if (/stale info|rejected.*lease/i.test(errorMessage(e))) {
        throw new Error(`Someone else has pushed to the remote copy of ${branch} since your last fetch. Fetch, review their commits, then try again.`)
      }
      throw e
    }
  }

  const pushOrForce = async (branch: string, push: (force: boolean) => Promise<void>): Promise<boolean> => {
    try {
      await push(false)
      return true
    } catch (e) {
      if (!/non-fast-forward|fetch first|Updates were rejected|\[rejected\]/i.test(errorMessage(e))) throw e
      const ok = await shell.confirm(
        'Push rejected',
        `The remote copy of ${branch} has commits your branch doesn't, usually because you rewrote history with a rebase or amend. ${forcePushWarning(branch)}`,
        true
      )
      if (!ok) return false
      await leased(branch, () => push(true))
      return true
    }
  }

  const conflictAware = async (fn: () => Promise<void>, note = 'There are conflicts to resolve'): Promise<void> => {
    try {
      await fn()
    } catch (e) {
      if (!/CONFLICT|could not apply/i.test(errorMessage(e))) throw e
      shell.showInfo(note)
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
      checkoutTracking: (local, remote) =>
        run('Checking out', async () => {
          await window.git.checkout(path, local)
          try {
            await window.git.fastForward(path, remote)
            shell.showInfo(`Checked out ${local} at ${remote}`)
          } catch {
            shell.showError(`Checked out ${local}, but it can't fast-forward to ${remote} because it has commits of its own. Pull or rebase to combine them.`)
          }
        }),
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
      merge: (ref, mode = 'default') =>
        run('Merging', async () => {
          const squash = mode === 'squash'
          try {
            await window.git.merge(path, ref, mode)
            if (squash) {
              setCommitDraft(`Merge ${ref} (squashed)`)
              shell.showInfo(`Staged ${ref}'s changes as one commit. Review them, then commit.`)
              wantWip.current = true
              setSelected(WIP_HASH)
            } else {
              shell.showInfo(`Merged ${ref}`)
            }
          } catch (e) {
            if (!/CONFLICT/.test(errorMessage(e))) throw e
            if (squash) setCommitDraft(`Merge ${ref} (squashed)`)
            shell.showInfo(`Merge of ${ref} has conflicts to resolve`)
            wantWip.current = true
            setSelected(WIP_HASH)
          }
        }),
      ignore: (kind, target) =>
        run('Ignoring', async () => {
          const pattern = await window.git.ignore(path, kind, target)
          shell.showInfo(`Added ${pattern} to .gitignore`)
        }),
      fetch: () => run('Fetching', () => window.git.fetch(path), 'Fetched'),
      pull: (mode) =>
        run('Pulling', async () => {
          let conflicted = false
          await conflictAware(async () => {
            try {
              await window.git.pull(path, mode ?? currentSettings().pullMode)
            } catch (e) {
              conflicted = /CONFLICT|could not apply/i.test(errorMessage(e))
              throw e
            }
          }, 'The pull has conflicts to resolve')
          if (!conflicted) shell.showInfo('Pulled')
        }),
      push: () =>
        run('Pushing', async () => {
          const current = refs?.branches.find((b) => b.current)
          if (current && !current.upstream) {
            const ok = await shell.confirm(
              'Push',
              `"${current.name}" has no upstream. Push to origin/${current.name} and set upstream?`
            )
            if (!ok) return
            if (await pushOrForce(current.name, (force) => window.git.push(path, true, force))) shell.showInfo('Pushed')
          } else if (await pushOrForce(current?.name ?? 'HEAD', (force) => window.git.push(path, false, force))) {
            shell.showInfo('Pushed')
          }
        }),
      compare: (request) => {
        setViewing(null)
        setComparing(request)
      },
      forcePush: async (branch) => {
        const ok = await shell.confirm('Force push', forcePushWarning(branch), true)
        if (!ok) return
        const current = refs?.branches.find((b) => b.current)?.name === branch
        run('Pushing', () => leased(branch, () => (current ? window.git.push(path, false, true) : window.git.pushBranch(path, branch, true))), `Force pushed ${branch}`)
      },
      stash: (paths) => setStashing({ paths }),
      stashPop: (index) =>
        run('Popping stash', () =>
          conflictAware(() => window.git.stashPop(path, index), 'The stash conflicts with your changes. Resolve the conflicts; the stash has been kept.')
        ),
      stashApply: (index) =>
        run('Applying stash', () => conflictAware(() => window.git.stashApply(path, index), 'The stash conflicts with your changes. Resolve the conflicts.'), `Applied stash@{${index}}`),
      stashBranch: async (index) => {
        const name = (await shell.prompt('Create branch from stash', `Branch name (starts at the commit stash@{${index}} was made on)`))?.trim()
        if (!name) return
        run('Creating branch', () => window.git.stashBranch(path, index, name), `Created ${name} from stash@{${index}}`)
      },
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
      copyText: (text, what) => {
        void copyToClipboard(text)
        shell.showInfo(`Copied ${what}: ${text}`)
      },
      updateBranch: (branch) => run('Pulling', () => window.git.updateBranch(path, branch), `Updated ${branch} from its upstream`),
      pushBranch: (branch) =>
        run('Pushing', async () => {
          if (await pushOrForce(branch, (force) => window.git.pushBranch(path, branch, force))) shell.showInfo(`Pushed ${branch}`)
        }),
      setUpstream: async (branch) => {
        const current = refs?.branches.find((b) => b.name === branch)?.upstream
        const remote = refs?.remotes[0]?.remote ?? 'origin'
        const upstream = await shell.prompt('Set upstream', `Upstream branch for ${branch}`, current ?? `${remote}/${branch}`)
        if (upstream) run('Setting upstream', () => window.git.setUpstream(path, branch, upstream), `${branch} now tracks ${upstream}`)
      },
      fastForward: (target) => run('Fast-forwarding', () => window.git.fastForward(path, target), `Fast-forwarded to ${target}`),
      rebase: (onto) =>
        run('Rebasing', async () => {
          let conflicted = false
          await conflictAware(async () => {
            try {
              await window.git.rebase(path, onto)
            } catch (e) {
              conflicted = /CONFLICT|could not apply/i.test(errorMessage(e))
              throw e
            }
          })
          if (!conflicted) shell.showInfo(`Rebased onto ${onto}`)
        }),
      interactiveRebase: (base, preset) => setRebasing({ base, preset }),
      renameBranch: async (branch) => {
        const name = await shell.prompt('Rename branch', `New name for ${branch}`, branch)
        if (name && name !== branch) run('Renaming branch', () => window.git.renameBranch(path, branch, name), `Renamed ${branch} to ${name}`)
      },
      deleteRemoteBranch: async (remote, branch) => {
        const ok = await shell.confirm('Delete remote branch', `Delete ${remote}/${branch} from the remote? Anyone else using it will lose it too.`, true)
        if (ok) run('Deleting remote branch', () => window.git.deleteRemoteBranch(path, remote, branch), `Deleted ${remote}/${branch}`)
      },
      deleteBranchEverywhere: async (branch, remote, remoteBranch) => {
        const ok = await shell.confirm('Delete branch everywhere', `Delete ${branch} locally and ${remote}/${remoteBranch} from the remote?`, true)
        if (!ok) return
        run('Deleting branch', async () => {
          await window.git.deleteBranch(path, branch, true)
          await window.git.deleteRemoteBranch(path, remote, remoteBranch)
        }, `Deleted ${branch} and ${remote}/${remoteBranch}`)
      },
      createTag: async (target, annotated) => {
        const name = await shell.prompt(annotated ? 'Create annotated tag' : 'Create tag', `Tag name (at ${shortHash(target)})`)
        if (!name) return
        let message: string | null = null
        if (annotated) {
          message = await shell.prompt('Create annotated tag', 'Tag message', name)
          if (!message) return
        }
        run('Creating tag', () => window.git.createTag(path, name, target, message), `Created tag ${name}`)
      },
      deleteTag: async (name) => {
        const ok = await shell.confirm('Delete tag', `Delete the local tag ${name}?`, true)
        if (ok) run('Deleting tag', () => window.git.deleteTag(path, name), `Deleted tag ${name}`)
      },
      pushTag: (remote, name) => run('Pushing tag', () => window.git.pushTag(path, remote, name), `Pushed tag ${name} to ${remote}`),
      deleteRemoteTag: async (remote, name) => {
        const ok = await shell.confirm('Delete remote tag', `Delete the tag ${name} from ${remote}?`, true)
        if (ok) run('Deleting tag', () => window.git.deleteRemoteTag(path, remote, name), `Deleted tag ${name} from ${remote}`)
      },
      addWorktree: async (ref, newBranch) => {
        const parent = await window.git.selectFolder('Choose where to create the worktree')
        if (!parent) return
        const base = (newBranch ?? (/^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref)).replace(/[^\w.-]+/g, '-')
        const folder = await shell.prompt('Create worktree', 'Folder name', `${repo.name}-${base}`)
        if (!folder) return
        const dest = `${parent.replace(/[\\/]+$/, '')}/${folder}`
        run('Creating worktree', async () => {
          await window.git.addWorktree(path, dest, ref, newBranch)
          shell.openPath(dest)
        }, `Created worktree at ${dest}`)
      },
      savePatch: async (hash) => {
        try {
          const file = await window.git.savePatch(path, hash)
          if (file) shell.showInfo(`Saved patch to ${file}`)
        } catch (e) {
          shell.showError(errorMessage(e))
        }
      },
      startPullRequest: (branch) => setCreatingPr(branch),
      soloRefs: (list) => setGraphFilter({ solo: list }),
      hideRef: (ref) => setGraphFilter((f) => ({ hide: [...new Set([...(f.hide ?? []), ref])] })),
      showAllRefs: () => setGraphFilter({}),
      copyHash: (hash) => {
        void copyToClipboard(hash)
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
    [path, refresh, refs, run, shell, repo.name]
  )
  actionsRef.current = actions

  const headLine = useMemo(() => {
    const byHash = new Map(commits.map((c) => [c.hash, c]))
    const reachable = new Set<string>()
    const stack = refs?.headHash ? [refs.headHash] : []
    while (stack.length) {
      const h = stack.pop()!
      const c = byHash.get(h)
      if (!c || reachable.has(h)) continue
      reachable.add(h)
      stack.push(...c.parents)
    }
    return { byHash, reachable }
  }, [commits, refs?.headHash])

  const startRebase = (base: string, steps: RebaseStep[]): void =>
    void run('Rebasing', async () => {
      let conflicted = false
      await conflictAware(async () => {
        try {
          await window.git.interactiveRebase(path, base, steps)
        } catch (e) {
          conflicted = /CONFLICT|could not apply/i.test(errorMessage(e))
          throw e
        }
      })
      if (!conflicted) shell.showInfo(`Rebased ${steps.length} commit${steps.length === 1 ? '' : 's'}`)
    })

  const commitMenu = (c: Commit, e: React.MouseEvent, focus?: FocusRef | null): void => {
    if (!refs) return
    const parent = c.parents[0]
    const history = {
      onHeadBranch: headLine.reachable.has(c.hash),
      isHead: c.hash === refs.headHash,
      merge: c.parents.length > 1,
      parent,
      grandparent: parent ? headLine.byHash.get(parent)?.parents[0] : undefined
    }
    actions.openMenu(e, buildRefMenu({ sha: c.hash, refs: c.refs, focus, repoRefs: refs, host, actions, filtered, history, selected }))
  }

  const searchQuery = search?.query.trim() ?? ''
  const localSha = search && /^[0-9a-f]{4,}$/i.test(searchQuery) && (search.mode === 'all' || search.mode === 'sha')
    ? commits.filter((c) => c.hash.startsWith(searchQuery.toLowerCase())).map((c) => c.hash)
    : []
  const hitSet = searchQuery ? new Set([...searchHits, ...localSha]) : null
  const loadedHits = hitSet ? rows.filter((c) => hitSet.has(c.hash)).map((c) => c.hash) : []

  const jumpTo = (hash: string): void => {
    wantHash.current = null
    setSelectedPr(null)
    setSelected(hash)
    setScrollTarget((t) => ({ hash, n: (t?.n ?? 0) + 1 }))
  }

  const stepSearch = (direction: 1 | -1): void => {
    if (!loadedHits.length) return
    const at = loadedHits.indexOf(selected ?? '')
    const next = at === -1 ? (direction === 1 ? 0 : loadedHits.length - 1) : (at + direction + loadedHits.length) % loadedHits.length
    jumpTo(loadedHits[next])
  }

  const searchBar = search ? (
    <CommitSearch
      query={search.query}
      mode={search.mode}
      focusKey={search.focus}
      searching={searching}
      total={loadedHits.length}
      position={loadedHits.indexOf(selected ?? '') + 1}
      older={hitSet ? hitSet.size - loadedHits.length : 0}
      onQuery={(query) => setSearch((s) => (s ? { ...s, query } : s))}
      onMode={(mode) => setSearch((s) => (s ? { ...s, mode } : s))}
      onStep={stepSearch}
      onClose={() => setSearch(null)}
    />
  ) : null

  const filterNote = filtered ? (
    <div className="graph-filter-note" role="status">
      {graphFilter.solo?.length
        ? `Showing only ${graphFilter.solo.map((r) => r.replace(/^refs\/(heads|remotes|tags)\//, '')).join(' and ')}`
        : `Hiding ${graphFilter.hide!.map((r) => r.replace(/^refs\/(heads|remotes|tags)\//, '')).join(', ')}`}
      <button onClick={() => setGraphFilter({})}>Show all</button>
    </div>
  ) : null

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
      className={`repo-view${sidebarOpen ? '' : ' sidebar-collapsed'}${detailsOpen ? '' : ' details-collapsed'}${viewing || comparing ? ' viewing' : ''}`}
      style={{ gridTemplateColumns: `${sidebarOpen ? `${layout.sidebar}px 4px` : '0 0'} minmax(0, 1fr) ${detailsOpen ? `4px ${layout.panel}px` : '0 0'}` }}
    >
      <Toolbar
        repo={repo}
        refs={refs}
        busy={!!busy}
        busyLabel={busy}
        actions={actions}
        host={host}
        prs={prs}
        onCreatePr={() => setCreatingPr(refs?.branches.find((b) => b.current)?.name ?? false)}
        onViewPr={(pr) => setSelectedPr(pr)}
        onSearch={openSearch}
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
          graphFiltered={filtered}
          selectedPr={selectedPr?.id ?? null}
          onSelectPr={(pr) => setSelectedPr(pr)}
          builds={builds}
        />
      ) : (
        <div className="sidebar" />
      )}
      <Splitter
        className="splitter-sidebar"
        direction="vertical"
        value={layout.sidebar}
        onChange={(v) => (v < 100 ? setPanelCollapsed('sidebar', true) : setLayout('sidebar', v))}
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
          onShowCommit={(hash) => {
            setViewing(null)
            jumpTo(hash)
          }}
        />
      ) : comparing ? (
        <CompareView
          repoPath={path}
          request={comparing}
          onChange={setComparing}
          onClose={() => setComparing(null)}
          onShowCommit={(hash) => {
            setComparing(null)
            jumpTo(hash)
          }}
        />
      ) : (
        <CommitList
          commits={rows}
          selected={selected}
          onSelect={(hash) => {
            wantHash.current = null
            setSelectedPr(null)
            setSelected(hash)
          }}
          onContextMenu={commitMenu}
          filterNote={filterNote}
          scrollTarget={scrollTarget}
          loading={!refs}
          builds={builds}
          onHeaderMenu={actions.openMenu}
          searchBar={searchBar}
          matches={hitSet}
        />
      )}
      <Splitter
        className="splitter-details"
        direction="vertical"
        value={layout.panel}
        onChange={(v) => (v < 200 ? setPanelCollapsed('details', true) : setLayout('panel', v))}
        invert
        onReset={() => setLayout('panel', 440)}
      />
      {selectedPr && host ? (
        <PrPanel repoPath={path} host={host} pr={selectedPr} actions={actions} refreshKey={prRefresh} />
      ) : selected === WIP_HASH && status ? (
        <WorkingTree repoPath={path} status={status} actions={actions} viewing={viewing} onView={setViewing} draft={commitDraft} onDraftUsed={() => setCommitDraft(null)} />
      ) : selected ? (
        <CommitPanel repoPath={path} hash={selected} shell={shell} viewing={viewing} onView={setViewing} builds={builds[selected]} buildsError={hasAccount ? buildsError : null} />
      ) : (
        <div className="panel">
          {refs && !commits.length ? <div className="center">No commits yet</div> : <Loading />}
        </div>
      )}
      {rebasing && (
        <RebaseDialog
          repoPath={path}
          base={rebasing.base}
          preset={rebasing.preset}
          onStart={(steps) => startRebase(rebasing.base, steps)}
          onClose={() => setRebasing(null)}
        />
      )}
      {stashing && (
        <StashDialog
          paths={stashing.paths}
          onClose={() => setStashing(null)}
          onStash={(options) => {
            setStashing(null)
            const n = options.paths?.length ?? 0
            run('Stashing', () => window.git.stashPush(path, options), n ? `Stashed ${n === 1 ? options.paths![0] : `${n} files`}` : 'Stashed changes')
          }}
        />
      )}
      {creatingPr && host && refs && (
        <CreatePrDialog
          repoPath={path}
          host={host}
          refs={refs}
          source={creatingPr}
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
        <AppVersion />
      </div>
    </div>
  )
}
