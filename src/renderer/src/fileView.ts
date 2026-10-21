import { useSyncExternalStore } from 'react'

export type FileView = 'tree' | 'flat'

const KEY = 'arbor.fileView'

function load(): FileView {
  try {
    return localStorage.getItem(KEY) === 'flat' ? 'flat' : 'tree'
  } catch {
    return 'tree'
  }
}

let current = load()
const listeners = new Set<() => void>()

export function setFileView(view: FileView): void {
  if (view === current) return
  current = view
  try {
    localStorage.setItem(KEY, view)
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

export function useFileView(): FileView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}
