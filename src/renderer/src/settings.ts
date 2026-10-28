import { useSyncExternalStore } from 'react'
import type { MainSettings, PullMode } from '@shared/types'

export interface Settings extends MainSettings {
  pollInterval: number
  logLimit: number
  showAvatars: boolean
  showBodyPreview: boolean
  backgroundFetch: number
  pullMode: PullMode
}

export const SETTINGS_DEFAULTS: Settings = {
  pollInterval: 3,
  logLimit: 5000,
  showAvatars: true,
  showBodyPreview: true,
  backgroundFetch: 10,
  pullMode: 'git',
  gitPath: '',
  autoUpdate: true
}

export const SETTINGS_LIMITS = {
  pollInterval: { min: 1, max: 60 },
  logLimit: { min: 100, max: 50000 },
  backgroundFetch: { min: 0, max: 120 }
} as const

export const PULL_LABELS: Record<PullMode, string> = {
  git: 'Your git config',
  merge: 'Merge',
  rebase: 'Rebase',
  'ff-only': 'Fast-forward only'
}

const PULL_MODES = Object.keys(PULL_LABELS) as PullMode[]

const KEY = 'arbor.settings'

function load(): Settings {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

let current = load()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

export function setSettings(patch: Partial<Settings>): void {
  const next = { ...current, ...patch }
  next.pollInterval = Math.min(SETTINGS_LIMITS.pollInterval.max, Math.max(SETTINGS_LIMITS.pollInterval.min, Math.round(next.pollInterval) || SETTINGS_DEFAULTS.pollInterval))
  next.backgroundFetch = Math.min(SETTINGS_LIMITS.backgroundFetch.max, Math.max(0, Math.round(Number(next.backgroundFetch)) || 0))
  next.logLimit = Math.min(SETTINGS_LIMITS.logLimit.max, Math.max(SETTINGS_LIMITS.logLimit.min, Math.round(next.logLimit) || SETTINGS_DEFAULTS.logLimit))
  if (!PULL_MODES.includes(next.pullMode)) next.pullMode = SETTINGS_DEFAULTS.pullMode
  const mainChanged = next.gitPath !== current.gitPath || next.autoUpdate !== current.autoUpdate
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage unavailable */
  }
  if (mainChanged) window.settings.set({ gitPath: current.gitPath, autoUpdate: current.autoUpdate }).catch(() => undefined)
  emit()
}

export async function syncSettingsFromMain(): Promise<void> {
  try {
    const main = await window.settings.get()
    if (main.gitPath !== current.gitPath || main.autoUpdate !== current.autoUpdate) {
      current = { ...current, ...main }
      emit()
    }
  } catch {
    /* main unavailable */
  }
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

export function currentSettings(): Settings {
  return current
}
