import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import * as gitService from './git'
import type { GitApi, RepoInfo } from '@shared/types'

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
          await win.webContents.executeJavaScript(script)
          await new Promise((r) => setTimeout(r, 5000))
        }
        const image = await win.webContents.capturePage()
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
  async selectRepo() {
    const win = BrowserWindow.getFocusedWindow()
    const opts = { properties: ['openDirectory' as const], title: 'Open repository' }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  },
  async initialRepo() {
    const arg = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => !a.startsWith('-'))
    return arg ?? null
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
  revert: gitService.revert
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

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
