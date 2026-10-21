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
import { syncSettingsFromMain } from './settings'
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
  const [activePath, setActivePath] = useState<string | null>(null)
  const [recent, setRecent] = useState<RepoInfo[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const dialogs = useDialogs()
  const restored = useRef(false)
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
          <RepoView key={t.path} repo={t} active={t.path === activePath} shell={shell} onClose={() => closeTab(t.path)} />
        ))
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
