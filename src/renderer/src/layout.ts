import { useSyncExternalStore } from 'react'

export interface Layout {
  sidebar: number
  panel: number
  colRefs: number
  colGraph: number
  colAuthor: number
  colDate: number
  colSha: number
}

export const LIMITS = {
  sidebar: { min: 160, max: 600 },
  panel: { min: 300, max: 1200 },
  colRefs: { min: 40, max: 400 },
  colGraph: { min: 30, max: 600 },
  colAuthor: { min: 50, max: 400 },
  colDate: { min: 60, max: 300 },
  colSha: { min: 50, max: 200 }
} as const

const KEY = 'arbor.layout'
export const LAYOUT_DEFAULTS: Layout = { sidebar: 250, panel: 440, colRefs: 130, colGraph: 0, colAuthor: 110, colDate: 90, colSha: 64 }

function load(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Layout>
    return { ...LAYOUT_DEFAULTS, ...saved }
  } catch {
    return LAYOUT_DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()

function clamp(key: keyof Layout, value: number): number {
  return Math.min(LIMITS[key].max, Math.max(LIMITS[key].min, Math.round(value)))
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
}

function store(next: Layout, persist = true): void {
  current = next
  if (persist) save()
  listeners.forEach((l) => l())
}

export function setLayout(key: keyof Layout, value: number, persist = true): void {
  const next = clamp(key, value)
  if (next === current[key]) {
    if (persist) save()
    return
  }
  store({ ...current, [key]: next }, persist)
}

export function resetLayout(key: keyof Layout): void {
  if (current[key] === LAYOUT_DEFAULTS[key]) return
  store({ ...current, [key]: LAYOUT_DEFAULTS[key] })
}

export function useLayout(): Layout {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

function flagStore(key: string): { set(flag: string, on: boolean): void; reset(): void; use(): string[] } {
  const load = (): string[] => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
      return Array.isArray(saved) ? saved.filter((f): f is string => typeof f === 'string') : []
    } catch {
      return []
    }
  }
  let flags = load()
  const subscribers = new Set<() => void>()
  const subscribe = (l: () => void): (() => void) => {
    subscribers.add(l)
    return () => subscribers.delete(l)
  }
  const store = (next: string[]): void => {
    flags = next
    try {
      localStorage.setItem(key, JSON.stringify(flags))
    } catch {
      /* storage unavailable */
    }
    subscribers.forEach((l) => l())
  }
  return {
    set: (flag, on) => store(on ? [...new Set([...flags, flag])] : flags.filter((f) => f !== flag)),
    reset: () => store([]),
    use: () => useSyncExternalStore(subscribe, () => flags)
  }
}

const hiddenColumns = flagStore('arbor.columns.hidden')
export const setColumnHidden = (col: string, hide: boolean): void => hiddenColumns.set(col, hide)
export const resetColumns = (): void => hiddenColumns.reset()
export const useHiddenColumns = (): string[] => hiddenColumns.use()

export type PanelName = 'sidebar' | 'details'
const collapsedPanels = flagStore('arbor.panels.collapsed')
export const setPanelCollapsed = (panel: PanelName, collapsed: boolean): void => collapsedPanels.set(panel, collapsed)
export const useCollapsedPanels = (): string[] => collapsedPanels.use()
