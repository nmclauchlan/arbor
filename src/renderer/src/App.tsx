import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RepoInfo } from '@shared/types'
import type { Shell } from './actions'
import { ContextMenu, type MenuState } from './components/ContextMenu'
import { useDialogs } from './components/Dialog'
import { Welcome } from './components/Welcome'
import { RepoView } from './RepoView'
import { errorMessage } from './util'

const TABS_KEY = 'arbor.tabs'
const ACTIVE_KEY = 'arbor.active'

interface Toast {
  kind: 'error' | 'info'
  text: string
}

function loadSavedTabs(): { paths: string[]; active: string | null } {
  try {
    return {
      paths: JSON.parse(localStorage.getItem(TABS_KEY) ?? '[]'),
      active: localStorage.getItem(ACTIVE_KEY)
    }
  } catch {
    return { paths: [], active: null }
  }
}

export default function App(): React.JSX.Element {
  const [tabs, setTabs] = useState<RepoInfo[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [recent, setRecent] = useState<RepoInfo[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const dialogs = useDialogs()
  const restored = useRef(false)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.kind === 'error' ? 10000 : 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!restored.current) return
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify(tabs.map((t) => t.path)))
      if (activePath) localStorage.setItem(ACTIVE_KEY, activePath)
    } catch {
      /* storage unavailable */
    }
  }, [tabs, activePath])

  const showError = useCallback((text: string) => setToast({ kind: 'error', text }), [])
  const showInfo = useCallback((text: string) => setToast({ kind: 'info', text }), [])

  const loadRecent = useCallback(() => {
    window.git.recentRepos().then(setRecent).catch(() => undefined)
  }, [])

  const openPath = useCallback(
    async (path: string, activate = true): Promise<void> => {
      try {
        const info = await window.git.openRepo(path)
        setTabs((list) => (list.some((t) => t.path === info.path) ? list : [...list, info]))
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
      for (const p of saved.paths) await openPath(p, false)
      restored.current = true
      if (saved.active && saved.paths.includes(saved.active)) setActivePath(saved.active)
      else if (saved.paths.length) setActivePath(saved.paths[0])
      const initial = await window.git.initialRepo()
      if (initial) await openPath(initial)
    })().catch(() => undefined)
  }, [loadRecent, openPath])

  const closeTab = useCallback(
    (path: string) => {
      setTabs((list) => {
        const idx = list.findIndex((t) => t.path === path)
        const next = list.filter((t) => t.path !== path)
        setActivePath((cur) => {
          if (cur !== path) return cur
          if (!next.length) return null
          return next[Math.min(idx, next.length - 1)].path
        })
        return next
      })
    },
    []
  )

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

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === 'w' && activePath) {
        e.preventDefault()
        closeTab(activePath)
      } else if (e.key === 'o') {
        e.preventDefault()
        shell.openRepo()
      } else if (e.key === 'Tab' && tabs.length > 1) {
        e.preventDefault()
        const idx = tabs.findIndex((t) => t.path === activePath)
        const dir = e.shiftKey ? -1 : 1
        setActivePath(tabs[(idx + dir + tabs.length) % tabs.length].path)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [activePath, closeTab, shell, tabs])

  const closeMenu = useCallback(() => setMenu(null), [])

  return (
    <div className="app">
      <div className="titlebar">
        <strong>Arbor</strong>
        <div className="tabs">
          {tabs.map((t) => (
            <div
              key={t.path}
              className={`tab${t.path === activePath ? ' active' : ''}`}
              title={t.path}
              onClick={() => setActivePath(t.path)}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(t.path)
              }}
            >
              <span className="tab-name">{t.name}</span>
              <span
                className="close"
                title="Close (Ctrl+W)"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(t.path)
                }}
              >
                ×
              </span>
            </div>
          ))}
          <div className="tab tab-add" title="Open repository (Ctrl+O)" onClick={shell.openRepo}>
            +
          </div>
        </div>
      </div>
      {tabs.length === 0 ? (
        <Welcome recent={recent} onOpen={shell.openRepo} onOpenRecent={openPath} />
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
