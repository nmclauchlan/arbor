import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MainSettings } from '@shared/types'

const DEFAULTS: MainSettings = { gitPath: '', autoUpdate: true }
let cached: MainSettings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): MainSettings {
  if (cached) return cached
  let loaded: MainSettings
  try {
    loaded = { ...DEFAULTS, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    loaded = { ...DEFAULTS }
  }
  cached = loaded
  return loaded
}

export function setSettings(patch: Partial<MainSettings>): MainSettings {
  cached = { ...getSettings(), ...patch }
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file(), JSON.stringify(cached, null, 2))
  } catch {
    /* best effort */
  }
  return cached
}
