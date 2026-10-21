import { useSyncExternalStore } from 'react'

export interface Layout {
  sidebar: number
  panel: number
}

export const LIMITS = {
  sidebar: { min: 160, max: 600 },
  panel: { min: 300, max: 1200 }
} as const

const KEY = 'arbor.layout'
const DEFAULTS: Layout = { sidebar: 250, panel: 440 }

function load(): Layout {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Layout>
    return { ...DEFAULTS, ...saved }
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()

function clamp(key: keyof Layout, value: number): number {
  return Math.min(LIMITS[key].max, Math.max(LIMITS[key].min, Math.round(value)))
}

export function setLayout(key: keyof Layout, value: number): void {
  const next = clamp(key, value)
  if (next === current[key]) return
  current = { ...current, [key]: next }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
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
