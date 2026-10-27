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

const HIDDEN_KEY = 'arbor.columns.hidden'

function loadHidden(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]') as unknown
    return Array.isArray(saved) ? saved.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}

let hidden = loadHidden()
const hiddenListeners = new Set<() => void>()

function storeHidden(next: string[]): void {
  hidden = next
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden))
  } catch {
    /* storage unavailable */
  }
  hiddenListeners.forEach((l) => l())
}

export function setColumnHidden(col: string, hide: boolean): void {
  storeHidden(hide ? [...new Set([...hidden, col])] : hidden.filter((c) => c !== col))
}

export function resetColumns(): void {
  storeHidden([])
}

export function useHiddenColumns(): string[] {
  return useSyncExternalStore(
    (l) => {
      hiddenListeners.add(l)
      return () => hiddenListeners.delete(l)
    },
    () => hidden
  )
}
