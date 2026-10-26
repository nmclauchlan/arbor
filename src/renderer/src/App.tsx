import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RepoInfo } from '@shared/types'
import type { Shell } from './actions'
import { ContextMenu, type MenuState } from './components/ContextMenu'
import { useDialogs } from './components/Dialog'
import { TabBar } from './components/TabBar'
import { SettingsDialog } from './components/SettingsDialog'
import { CloneDialog } from './components/CloneDialog'
import { UpdateNotice } from './components/UpdateNotice'
import { Welcome } from './components/Welcome'
import { BrandIcon } from './components/BrandIcon'
import { RepoView } from './RepoView'
import { errorMessage } from './util'
import { applyTheme, currentTheme, setTheme, THEMES, useTheme } from './themes'
import { syncSettingsFromMain, useSettings } from './settings'
import { BellIcon, NotificationsPanel, type RepoIncoming } from './components/Notifications'
import {
  assignGroup, loadSavedTabs, moveGroupToEnd, moveGroupToGroup, moveGroupToTab, moveTab, moveToEnd,
  newGroupId, nextGroupColor, reorderGroups, saveTabs,
  type Tab, type TabGroup
} from './tabs'

interface Toast {
  kind: 'error' | 'info'
  text: string
}

export default function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [groups, setGroups] = useState<TabGroup[]>([])
  const [groupProgress, setGroupProgress] = useState<Record<string, { done: number; total: number }>>({})
  const [activePath, setActivePath] = useState<string | null>(null)
  const [recent, setRecent] = useState<RepoInfo[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const dialogs = useDialogs()
  const restored = useRef(false)
  const { backgroundFetch } = useSettings()
  const [incoming, setIncoming] = useState<Record<string, RepoIncoming>>({})
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState<number | null>(null)
  const [notifOpen, setNotifOpen] = useState<Set<string> | null>(null)
  const [pullingRepo, setPullingRepo] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ path: string; hash: string; n: number } | null>(null)
  const [seen, setSeen] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('arbor.seenIncoming') ?? '{}')
    } catch {
      return {}
    }
  })
  const tabsRef = useRef<{ path: string; name: string }[]>([])
  const checkingRef = useRef(false)
  const theme = useTheme()
  const [settingsOpen, setSettingsOpen] = useState<false | { suggestBaseUrl?: string }>(false)
  const [cloneOpen, setCloneOpen] = useState<false | { group?: string }>(false)

  useEffect(() => {
    applyTheme(currentTheme())
    void syncSettingsFromMain()
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 10000 : 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (restored.current) saveTabs(tabs, groups, activePath)
  }, [tabs, groups, activePath])

  const showError = useCallback((text: string) => setToast({ kind: 'error', text }), [])
  const showInfo = useCallback((text: string) => setToast({ kind: 'info', text }), [])

  const loadRecent = useCallback(() => {
    window.git.recentRepos().then(setRecent).catch(() => undefined)
  }, [])

  const openPath = useCallback(
    async (path: string, activate = true, group?: string): Promise<void> => {
      try {
        const info = await window.git.openRepo(path)
        setTabs((list) => (list.some((t) => t.path === info.path) ? list : [...list, { ...info, group }]))
        if (activate) setActivePath(info.path)
        loadRecent()
      } catch (e) {
        showError(errorMessage(e))
      }
    },
    [loadRecent, showError]
  )

  useEffect(() => {
    loadRecent()
    const saved = loadSavedTabs()
    setGroups(saved.groups)
    setTabs(saved.tabs)
    const paths = saved.tabs.map((t) => t.path)
    if (saved.active && paths.includes(saved.active)) setActivePath(saved.active)
    else if (paths.length) setActivePath(paths[0])
    restored.current = true
    window.git
      .initialRepo()
      .then((initial) => {
        if (initial) openPath(initial)
      })
      .catch(() => undefined)
  }, [loadRecent, openPath])

  useEffect(() => window.native?.onOpenPath((p) => void openPath(p)), [openPath])

  const closeMany = useCallback((paths: string[]) => {
    const gone = new Set(paths)
    setTabs((list) => {
      const idx = list.findIndex((t) => gone.has(t.path))
      const next = list.filter((t) => !gone.has(t.path))
      setActivePath((cur) => {
        if (cur && !gone.has(cur)) return cur
        if (!next.length) return null
        return next[Math.min(Math.max(idx, 0), next.length - 1)].path
      })
      return next
    })
  }, [])

  const closeTab = useCallback((path: string) => closeMany([path]), [closeMany])

  tabsRef.current = tabs

  const refreshIncoming = useCallback(async (path: string, name: string, error?: string) => {
    try {
      const branches = await window.git.incoming(path)
      setIncoming((m) => ({ ...m, [path]: { path, name, branches, error } }))
    } catch {
      setIncoming((m) => {
        const next = { ...m }
        delete next[path]
        return next
      })
    }
  }, [])

  const checkIncoming = useCallback(
    async (doFetch: boolean) => {
      if (checkingRef.current) return
      checkingRef.current = true
      setChecking(true)
      const queue = [...new Map(tabsRef.current.map((t) => [t.path, t])).values()]
      const worker = async (): Promise<void> => {
        for (let t = queue.shift(); t; t = queue.shift()) {
          let error: string | undefined
          if (doFetch) {
            try {
              await window.git.backgroundFetch(t.path)
            } catch (e) {
              error = errorMessage(e).split('\n').find((l) => l.trim())?.replace(/^.*?(fatal|error):\s*/i, '')
            }
          }
          await refreshIncoming(t.path, t.name, error)
        }
      }
      await Promise.all([worker(), worker()])
      checkingRef.current = false
      setChecking(false)
      setLastChecked(Date.now())
    },
    [refreshIncoming]
  )

  useEffect(() => {
    const first = setTimeout(() => void checkIncoming(backgroundFetch > 0), 15_000)
    const id = backgroundFetch > 0 ? setInterval(() => void checkIncoming(true), backgroundFetch * 60_000) : undefined
    return () => {
      clearTimeout(first)
      if (id) clearInterval(id)
    }
  }, [backgroundFetch, checkIncoming])

  useEffect(() => {
    const onSynced = (e: Event): void => {
      const path = (e as CustomEvent<string>).detail
      const tab = tabsRef.current.find((t) => t.path === path)
      if (tab) void refreshIncoming(tab.path, tab.name)
    }
    window.addEventListener('arbor:synced', onSynced)
    return () => window.removeEventListener('arbor:synced', onSynced)
  }, [refreshIncoming])

  const openPaths = new Set(tabs.map((t) => t.path))
  const incomingList = Object.values(incoming).filter((r) => openPaths.has(r.path))
  const unseenKeys = new Set<string>()
  let unseenCount = 0
  for (const r of incomingList) {
    for (const b of r.branches) {
      const key = `${r.path}::${b.branch}`
      if (seen[key] !== b.upstreamSha) {
        unseenKeys.add(key)
        unseenCount += b.behind
      }
    }
  }

  const openNotifications = (): void => {
    if (notifOpen) {
      setNotifOpen(null)
      return
    }
    setNotifOpen(new Set(unseenKeys))
    const next = { ...seen }
    for (const r of incomingList) for (const b of r.branches) next[`${r.path}::${b.branch}`] = b.upstreamSha
    setSeen(next)
    try {
      localStorage.setItem('arbor.seenIncoming', JSON.stringify(next))
    } catch {
      /* storage unavailable */
    }
  }

  const pullIncoming = async (path: string): Promise<void> => {
    const tab = tabsRef.current.find((t) => t.path === path)
    setPullingRepo(path)
    try {
      const result = await window.git.pullFastForward(path)
      showInfo(result === 'updated' ? `Pulled ${tab?.name ?? path}` : `${tab?.name ?? path} is already up to date`)
    } catch (e) {
      showError(errorMessage(e))
    } finally {
      setPullingRepo(null)
      if (tab) await refreshIncoming(tab.path, tab.name)
    }
  }

  const shell = useMemo<Shell>(
    () => ({
      openRepo: async () => {
        const paths = await window.git.selectRepos()
        for (const p of paths) await openPath(p, p === paths[paths.length - 1])
      },
      openMenu: (e, items) => setMenu({ x: e.clientX, y: e.clientY, items }),
      confirm: dialogs.confirm,
      prompt: dialogs.prompt,
      showError,
      showInfo,
      openSettings: (suggestBaseUrl) => setSettingsOpen({ suggestBaseUrl })
    }),
    [dialogs.confirm, dialogs.prompt, openPath, showError, showInfo]
  )

  const visibleTabs = tabs

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'w' && activePath) {
        e.preventDefault()
        closeTab(activePath)
      } else if (e.key === 'o') {
        e.preventDefault()
        shell.openRepo()
      } else if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen({})
      } else if (e.key === 'Tab' && visibleTabs.length > 1) {
        e.preventDefault()
        const idx = visibleTabs.findIndex((t) => t.path === activePath)
        const dir = e.shiftKey ? -1 : 1
        setActivePath(visibleTabs[(idx + dir + visibleTabs.length) % visibleTabs.length].path)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [activePath, closeTab, shell, visibleTabs])

  const closeMenu = useCallback(() => setMenu(null), [])

  const themeMenu = (e: React.MouseEvent): void => {
    shell.openMenu(
      e,
      THEMES.map((t) => ({
        label: `${t.id === theme.id ? '✓ ' : '   '}${t.name}`,
        onClick: () => setTheme(t.id)
      }))
    )
  }

  const createGroup = (name: string, paths: string[]): void => {
    const id = newGroupId()
    setGroups((gs) => [...gs, { id, name, color: nextGroupColor(gs) }])
    setTabs((list) => paths.reduce((acc, p) => assignGroup(acc, p, id), list))
  }

  const newGroup = async (): Promise<void> => {
    const name = await dialogs.prompt('New tab group', 'Group name')
    if (name) createGroup(name, [])
  }

  const openInto = async (group?: string): Promise<void> => {
    const paths = await window.git.selectRepos()
    for (const p of paths) await openPath(p, p === paths[paths.length - 1], group)
  }

  const cloneRepo = async (group?: string): Promise<void> => {
    setCloneOpen({ group })
  }

  const updateGroup = (id: string, patch: Partial<TabGroup>): void =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  const pullGroup = async (id: string): Promise<void> => {
    const group = groups.find((g) => g.id === id)
    const members = tabs.filter((t) => t.group === id)
    if (!group || !members.length) return
    const total = members.length
    let done = 0
    setGroupProgress((p) => ({ ...p, [id]: { done, total } }))
    const updated: string[] = []
    const current: string[] = []
    const failed: { name: string; reason: string }[] = []
    const queue = [...members]
    const worker = async (): Promise<void> => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        try {
          const result = await window.git.pullFastForward(t.path)
          ;(result === 'updated' ? updated : current).push(t.name)
        } catch (e) {
          const msg = errorMessage(e)
          const reason = /not possible to fast-forward|diverg/i.test(msg)
            ? 'branch has diverged; pull it on its own to merge or rebase'
            : /no tracking information|no such ref was fetched/i.test(msg)
              ? 'no upstream branch'
              : /would be overwritten|local changes/i.test(msg)
                ? 'local changes would be overwritten'
                : /not a git repository|does not exist|cannot use simple-git/i.test(msg)
                  ? 'repository not found'
                  : msg.split('\n').find((l) => l.trim())?.replace(/^(fatal|error|hint):\s*/i, '') ?? msg
          failed.push({ name: t.name, reason })
        } finally {
          done++
          setGroupProgress((p) => ({ ...p, [id]: { done, total } }))
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, total) }, worker))
    setGroupProgress((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
    const parts: string[] = []
    if (updated.length) parts.push(`Updated ${updated.length}: ${updated.join(', ')}`)
    if (current.length) parts.push(`Already up to date: ${current.length}`)
    if (failed.length) {
      showError(
        [`Pulled ${group.name}: ${total - failed.length} of ${total} succeeded`, ...parts, '', ...failed.map((f) => `${f.name}: ${f.reason}`)].join('\n')
      )
    } else {
      showInfo([`Pulled ${group.name}`, ...parts].join('\n'))
    }
  }

  const ungroup = (id: string): void => {
    setTabs((list) => list.map((t) => (t.group === id ? { ...t, group: undefined } : t)))
    setGroups((gs) => gs.filter((g) => g.id !== id))
  }

  return (
    <div className="app">
      <div className="titlebar">
        <div className="brand-lockup" title="Arbor">
          <BrandIcon size={22} />
          <strong>Arbor</strong>
        </div>
        <TabBar
          tabs={tabs}
          groups={groups}
          activePath={activePath}
          shell={shell}
          onSelect={setActivePath}
          onClose={closeTab}
          onCloseMany={closeMany}
          onMove={(path, target, after) => setTabs((list) => moveTab(list, path, target, after))}
          onMoveToEnd={(path) => setTabs((list) => moveToEnd(list, path))}
          onAssignGroup={(path, group) => setTabs((list) => assignGroup(list, path, group))}
          onCreateGroup={createGroup}
          onUpdateGroup={updateGroup}
          onUngroup={ungroup}
          onPullGroup={(id) => void pullGroup(id)}
          groupProgress={groupProgress}
          onOpenInto={openInto}
          onClone={cloneRepo}
          onNewGroup={newGroup}
          onMoveGroupToTab={(id, target, after) => setTabs((list) => moveGroupToTab(list, id, target, after))}
          onMoveGroupToGroup={(id, target, after) => {
            setTabs((list) => moveGroupToGroup(list, id, target, after))
            setGroups((gs) => reorderGroups(gs, id, target, after))
          }}
          onMoveGroupToEnd={(id) => {
            setTabs((list) => moveGroupToEnd(list, id))
            setGroups((gs) => {
              const g = gs.find((x) => x.id === id)
              return g ? [...gs.filter((x) => x.id !== id), g] : gs
            })
          }}
        />
        <div className="titlebar-spacer" />
        <button className="icon titlebar-btn" title={`Theme: ${theme.name}`} onClick={themeMenu}>
          ◐ {theme.name}
        </button>
        <button
          className={`icon titlebar-btn notifications-btn${unseenCount ? ' has-unseen' : ''}`}
          title={unseenCount ? `${unseenCount} incoming commit${unseenCount === 1 ? '' : 's'}` : 'Incoming commits'}
          aria-label={unseenCount ? `Notifications, ${unseenCount} new` : 'Notifications'}
          aria-expanded={!!notifOpen}
          onClick={openNotifications}
        >
          <BellIcon />
          {unseenCount > 0 && <span className="notif-badge">{unseenCount > 99 ? '99+' : unseenCount}</span>}
        </button>
        <button className="icon titlebar-btn" title="Settings (Ctrl+,)" onClick={() => setSettingsOpen({})}>
          ⚙
        </button>
      </div>
      {tabs.length === 0 ? (
        <>
          <Welcome recent={recent} onOpen={shell.openRepo} onClone={() => setCloneOpen({})} onOpenRecent={openPath} />
          <div className="statusbar">
            <span className="spacer" />
            <UpdateNotice />
          </div>
        </>
      ) : (
        tabs.map((t) => (
          <RepoView
            key={t.path}
            repo={t}
            active={t.path === activePath}
            shell={shell}
            onClose={() => closeTab(t.path)}
            focus={focus && focus.path === t.path ? focus : null}
          />
        ))
      )}
      {notifOpen && (
        <NotificationsPanel
          repos={incomingList}
          unseenKeys={notifOpen}
          checking={checking}
          lastChecked={lastChecked}
          pulling={pullingRepo}
          onOpenCommit={(path, hash) => {
            setNotifOpen(null)
            setActivePath(path)
            setFocus((f) => ({ path, hash, n: (f?.n ?? 0) + 1 }))
          }}
          onPull={(path) => void pullIncoming(path)}
          onCheckNow={() => void checkIncoming(true)}
          onClose={() => setNotifOpen(null)}
        />
      )}
      <ContextMenu menu={menu} onClose={closeMenu} />
      {cloneOpen && (
        <CloneDialog
          onClose={() => setCloneOpen(false)}
          onOpenSettings={() => {
            setCloneOpen(false)
            setSettingsOpen({})
          }}
          onCloned={async (dest) => {
            const group = cloneOpen.group
            setCloneOpen(false)
            await openPath(dest, true, group)
            showInfo(`Cloned into ${dest}`)
          }}
        />
      )}
      {settingsOpen && <SettingsDialog suggestBaseUrl={settingsOpen.suggestBaseUrl} onClose={() => setSettingsOpen(false)} />}
      {dialogs.element}
      {toast && (
        <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
