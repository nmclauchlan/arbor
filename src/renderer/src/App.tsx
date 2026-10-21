import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RepoInfo } from '@shared/types'
import type { Shell } from './actions'
import { ContextMenu, type MenuState } from './components/ContextMenu'
import { useDialogs } from './components/Dialog'
import { TabBar } from './components/TabBar'
import { UpdateNotice } from './components/UpdateNotice'
import { Welcome } from './components/Welcome'
import { RepoView } from './RepoView'
import { errorMessage } from './util'
import { applyTheme, currentTheme, setTheme, THEMES, useTheme } from './themes'
import {
  assignGroup, loadSavedTabs, moveTab, moveToEnd, newGroupId, nextGroupColor, saveTabs,
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

  useEffect(() => {
    applyTheme(currentTheme())
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
    ;(async () => {
      const saved = loadSavedTabs()
      setGroups(saved.groups)
      for (const t of saved.tabs) await openPath(t.path, false, t.group)
      restored.current = true
      const paths = saved.tabs.map((t) => t.path)
      if (saved.active && paths.includes(saved.active)) setActivePath(saved.active)
      else if (paths.length) setActivePath(paths[0])
      const initial = await window.git.initialRepo()
      if (initial) await openPath(initial)
    })().catch(() => undefined)
  }, [loadRecent, openPath])

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
        const p = await window.git.selectRepo()
        if (p) openPath(p)
      },
      openMenu: (e, items) => setMenu({ x: e.clientX, y: e.clientY, items }),
      confirm: dialogs.confirm,
      prompt: dialogs.prompt,
      showError,
      showInfo
    }),
    [dialogs.confirm, dialogs.prompt, openPath, showError, showInfo]
  )

  const visibleTabs = useMemo(() => {
    const collapsed = new Set(groups.filter((g) => g.collapsed).map((g) => g.id))
    return tabs.filter((t) => !t.group || !collapsed.has(t.group) || t.path === activePath)
  }, [tabs, groups, activePath])

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'w' && activePath) {
        e.preventDefault()
        closeTab(activePath)
      } else if (e.key === 'o') {
        e.preventDefault()
        shell.openRepo()
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

  const updateGroup = (id: string, patch: Partial<TabGroup>): void =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)))

  const ungroup = (id: string): void => {
    setTabs((list) => list.map((t) => (t.group === id ? { ...t, group: undefined } : t)))
    setGroups((gs) => gs.filter((g) => g.id !== id))
  }

  return (
    <div className="app">
      <div className="titlebar">
        <strong>Arbor</strong>
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
        />
        <div className="titlebar-spacer" />
        <button className="icon titlebar-btn" title={`Theme: ${theme.name}`} onClick={themeMenu}>
          ◐ {theme.name}
        </button>
      </div>
      {tabs.length === 0 ? (
        <>
          <Welcome recent={recent} onOpen={shell.openRepo} onOpenRecent={openPath} />
          <div className="statusbar">
            <span className="spacer" />
            <UpdateNotice />
          </div>
        </>
      ) : (
        tabs.map((t) => <RepoView key={t.path} repo={t} active={t.path === activePath} shell={shell} />)
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
