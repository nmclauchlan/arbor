import { useSyncExternalStore } from 'react'

export interface DiffPrefs {
  split: boolean
  wrap: boolean
}

const KEY = 'arbor.diff'

function load(): DiffPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<DiffPrefs>
    return { split: saved.split === true, wrap: saved.wrap === true }
  } catch {
    return { split: false, wrap: false }
  }
}

let current = load()
const listeners = new Set<() => void>()

export function setDiffPrefs(patch: Partial<DiffPrefs>): void {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function useDiffPrefs(): DiffPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
