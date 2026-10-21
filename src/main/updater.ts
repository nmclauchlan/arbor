import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { getSettings } from './settings'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let status: UpdateStatus = { state: 'idle' }

function broadcast(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', status)
  }
}

export function setupUpdater(): void {
  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:install', () => {
    if (status.state === 'downloaded') autoUpdater.quitAndInstall()
  })

  const fake = process.env['ARBOR_FAKE_UPDATE']
  if (fake) {
    const state = fake as UpdateStatus['state']
    broadcast({ state, version: '9.9.9', percent: state === 'downloading' ? 42 : undefined })
    ipcMain.handle('update:check', () => undefined)
    return
  }

  if (!app.isPackaged) {
    ipcMain.handle('update:check', () => undefined)
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => broadcast({ state: 'idle' }))
  autoUpdater.on('update-available', (info) => broadcast({ state: 'available', version: info.version }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', version: status.version, percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => broadcast({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => broadcast({ state: 'error', message: err.message.split('\n')[0] }))

  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => undefined)
  }
  ipcMain.handle('update:check', () => check())
  const auto = (): void => {
    if (getSettings().autoUpdate) check()
  }
  setTimeout(auto, 5000)
  setInterval(auto, CHECK_INTERVAL_MS)
}
