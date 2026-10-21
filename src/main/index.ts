import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import * as gitService from './git'
import { setupUpdater } from './updater'
import { getSettings, setSettings } from './settings'
import { hostApi } from './hosts'
import type { MainSettings } from '@shared/types'
import type { GitApi, RepoInfo } from '@shared/types'

if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'Arbor Dev'))

const isPrimary = app.requestSingleInstanceLock()
if (!isPrimary) app.quit()

function pathArg(argv: string[]): string | null {
  return argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-') && a !== '.') ?? null
}

app.on('second-instance', (_event, argv) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
  const p = pathArg(argv)
  if (p) win.webContents.send('native:openPath', p)
})

const recentFile = (): string => join(app.getPath('userData'), 'recent.json')

async function readRecent(): Promise<RepoInfo[]> {
  try {
    return JSON.parse(await readFile(recentFile(), 'utf8'))
  } catch {
    return []
  }
}

async function addRecent(repo: RepoInfo): Promise<void> {
  const list = (await readRecent()).filter((r) => r.path !== repo.path)
  list.unshift(repo)
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(recentFile(), JSON.stringify(list.slice(0, 15), null, 2))
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#1b1d23',
    autoHideMenuBar: true,
    icon: join(app.getAppPath(), 'build/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1b1d23', symbolColor: '#c9ccd3', height: 36 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => win.show())
  const shot = process.env['ARBOR_SCREENSHOT']
  if (shot) {
    win.webContents.on('console-message', (event) => {
      console.log(`[renderer:${event.level}] ${event.message}`)
    })
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const script = process.env['ARBOR_SCREENSHOT_SCRIPT']
        if (script) {
          await win.webContents.executeJavaScript(script).catch((e) => console.error('screenshot script failed', e))
          await new Promise((r) => setTimeout(r, 5000))
        }
        const image = await win.webContents.capturePage()
        win.webContents.session.flushStorageData()
        await writeFile(shot, image.toPNG())
        app.quit()
      }, Number(process.env['ARBOR_SCREENSHOT_DELAY'] ?? 3000))
    })
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

type Handlers = { [K in keyof GitApi]: (...args: Parameters<GitApi[K]>) => ReturnType<GitApi[K]> }

const handlers: Handlers = {
  async selectRepos() {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      properties: ['openDirectory' as const, 'multiSelections' as const],
      title: 'Open repositories',
      buttonLabel: 'Open'
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return result.canceled ? [] : result.filePaths
  },
  async selectFolder(title) {
    const win = BrowserWindow.getFocusedWindow()
    const opts = { properties: ['openDirectory' as const, 'createDirectory' as const], title }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  },
  clone: gitService.clone,
  gitVersion: gitService.gitVersion,
  async initialRepo() {
    return pathArg(process.argv)
  },
  async openRepo(path) {
    const repo = await gitService.openRepo(path)
    await addRecent(repo)
    return repo
  },
  recentRepos: readRecent,
  log: gitService.log,
  refs: gitService.refs,
  status: gitService.status,
  stage: gitService.stage,
  unstage: gitService.unstage,
  discard: gitService.discard,
  commit: gitService.commit,
  fileDiff: gitService.fileDiff,
  commitDetails: gitService.commitDetails,
  commitFileDiff: gitService.commitFileDiff,
  checkout: gitService.checkout,
  createBranch: gitService.createBranch,
  deleteBranch: gitService.deleteBranch,
  fetch: gitService.fetch,
  pull: gitService.pull,
  push: gitService.push,
  merge: gitService.merge,
  stashPush: gitService.stashPush,
  stashPop: gitService.stashPop,
  stashDrop: gitService.stashDrop,
  resetTo: gitService.resetTo,
  cherryPick: gitService.cherryPick,
  revert: gitService.revert,
  readFile: gitService.readFileContent,
  writeFile: gitService.writeFileContent,
  imageDiff: gitService.imageDiff,
  resolveFile: gitService.resolveFile,
  abortOperation: gitService.abortOperation,
  continueOperation: gitService.continueOperation
}

for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(`git:${name}`, async (_event, ...args: unknown[]) => {
    try {
      return await (fn as (...a: unknown[]) => Promise<unknown>)(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(message.replace(/^Error: /, '').trim())
    }
  })
}

for (const [name, fn] of Object.entries(hostApi)) {
  ipcMain.handle(`host:${name}`, async (_event, ...args: unknown[]) => {
    try {
      return await (fn as (...a: unknown[]) => Promise<unknown>)(...args)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(message.replace(/^Error: /, '').trim())
    }
  })
}

ipcMain.handle('settings:get', () => getSettings())
ipcMain.handle('settings:set', (_event, patch: Partial<MainSettings>) => setSettings(patch))
ipcMain.handle('native:version', () => app.getVersion())

ipcMain.handle('native:showInFolder', async (_event, repoPath: string, relative: string | null) => {
  const target = relative ? join(repoPath, relative) : repoPath
  const isDir = await stat(target).then((s) => s.isDirectory(), () => false)
  if (isDir) await shell.openPath(target)
  else shell.showItemInFolder(target)
})

ipcMain.handle('native:titleBar', (event, color: string, symbolColor: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && process.platform === 'win32') win.setTitleBarOverlay({ color, symbolColor, height: 36 })
})

app.whenReady().then(() => {
  setupUpdater()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.session.flushStorageData()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
