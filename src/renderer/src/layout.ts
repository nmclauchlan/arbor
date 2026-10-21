import { useSyncExternalStore } from 'react'

export interface Layout {
  sidebar: number
  panel: number
  colGraph: number
  colAuthor: number
  colDate: number
  colSha: number
}

export const LIMITS = {
  sidebar: { min: 160, max: 600 },
  panel: { min: 300, max: 1200 },
  colGraph: { min: 30, max: 600 },
  colAuthor: { min: 50, max: 400 },
  colDate: { min: 60, max: 300 },
  colSha: { min: 50, max: 200 }
} as const

const KEY = 'arbor.layout'
export const LAYOUT_DEFAULTS: Layout = { sidebar: 250, panel: 440, colGraph: 0, colAuthor: 130, colDate: 110, colSha: 64 }

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

function store(next: Layout): void {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function setLayout(key: keyof Layout, value: number): void {
  const next = clamp(key, value)
  if (next === current[key]) return
  store({ ...current, [key]: next })
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
