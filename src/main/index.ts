import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import * as gitService from './git'
import { setupUpdater } from './updater'
import * as journal from './undo'
import { getSettings, setSettings } from './settings'
import { hostApi } from './hosts'
import type { MainSettings } from '@shared/types'
import type { GitApi, RepoInfo } from '@shared/types'

if (process.env['ARBOR_USER_DATA']) app.setPath('userData', process.env['ARBOR_USER_DATA'])
else if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'Arbor Dev'))

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
  await writeFile(recentFile(), JSON.stringify(list.slice(0, 50), null, 2))
}

async function writeRecent(list: RepoInfo[]): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(recentFile(), JSON.stringify(list, null, 2))
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
    titleBarOverlay: { color: '#1b1d23', symbolColor: '#c9ccd3', height: 32 },
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

function firstLine(message: string): string {
  const line = message.split('\n')[0].trim()
  return line.length > 60 ? line.slice(0, 59) + '…' : line
}

function shortRef(ref: string): string {
  return /^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 7) : ref
}

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
  searchCommits: gitService.searchCommits,
  refs: gitService.refs,
  status: gitService.status,
  stage: gitService.stage,
  applyPatch: gitService.applyPatch,
  unstage: gitService.unstage,
  discard: gitService.discard,
  commit: (path, message, amend) =>
    journal.record(path, amend ? 'amend' : 'commit', `${amend ? 'Amend' : 'Commit'} “${firstLine(message)}”`, () =>
      gitService.commit(path, message, amend)
    ),
  fileDiff: gitService.fileDiff,
  commitDetails: gitService.commitDetails,
  commitFileDiff: gitService.commitFileDiff,
  checkout: (path, ref) => journal.record(path, 'checkout', `Checkout ${shortRef(ref)}`, () => gitService.checkout(path, ref)),
  createBranch: (path, name, startPoint, co) =>
    journal.record(path, 'createBranch', `Create branch ${name}`, () => gitService.createBranch(path, name, startPoint, co), {
      branchName: name,
      checkedOut: co
    }),
  deleteBranch: (path, name, force) =>
    journal.record(path, 'deleteBranch', `Delete branch ${name}`, () => gitService.deleteBranch(path, name, force), { branchName: name }),
  fetch: gitService.fetch,
  pull: (path) => journal.record(path, 'pull', 'Pull', () => gitService.pull(path)),
  pullFastForward: (path) => journal.record(path, 'pull', 'Pull', () => gitService.pullFastForward(path)),
  undoInfo: async (path) => journal.undoInfo(path),
  async repoSummary(path, withChanges) {
    const summary = await gitService.repoSummary(path, withChanges)
    if (!summary.isRepo) return summary
    const host = await hostApi.detect(path).catch(() => null)
    if (host) {
      summary.host = host.kind
      summary.project = host.kind === 'gitlab' ? host.project.split('/').slice(0, -1).join('/') || host.org : host.kind === 'github' ? host.org : host.project
    }
    return summary
  },
  async initRepo(path) {
    await gitService.initRepo(path)
    const repo = await gitService.openRepo(path)
    await addRecent(repo)
    return repo
  },
  async removeRecent(path) {
    await writeRecent((await readRecent()).filter((r) => r.path !== path))
  },
  async clearRecent() {
    await writeRecent([])
  },
  backgroundFetch: gitService.backgroundFetch,
  incoming: gitService.incoming,
  undo: journal.undo,
  redo: journal.redo,
  push: gitService.push,
  merge: (path, ref) => journal.record(path, 'merge', `Merge ${shortRef(ref)}`, () => gitService.merge(path, ref)),
  updateBranch: gitService.updateBranch,
  pushBranch: gitService.pushBranch,
  setUpstream: gitService.setUpstream,
  fastForward: (path, target) => journal.record(path, 'merge', `Fast-forward to ${shortRef(target)}`, () => gitService.fastForward(path, target)),
  rebase: (path, onto) => journal.record(path, 'merge', `Rebase onto ${shortRef(onto)}`, () => gitService.rebase(path, onto)),
  renameBranch: gitService.renameBranch,
  deleteRemoteBranch: gitService.deleteRemoteBranch,
  createTag: gitService.createTag,
  deleteTag: gitService.deleteTag,
  pushTag: gitService.pushTag,
  deleteRemoteTag: gitService.deleteRemoteTag,
  addWorktree: gitService.addWorktree,
  async savePatch(path, hash) {
    const { text, name } = await gitService.formatPatch(path, hash)
    const win = BrowserWindow.getFocusedWindow()
    const opts = { title: 'Save patch', defaultPath: join(app.getPath('downloads'), name), filters: [{ name: 'Patch files', extensions: ['patch', 'diff'] }] }
    const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, text)
    return result.filePath
  },
  stashPush: gitService.stashPush,
  stashPop: gitService.stashPop,
  stashDrop: gitService.stashDrop,
  resetTo: (path, hash, mode) =>
    journal.record(path, 'reset', `Reset (${mode}) to ${shortRef(hash)}`, () => gitService.resetTo(path, hash, mode), { mode }),
  cherryPick: (path, hash) => journal.record(path, 'cherryPick', `Cherry-pick ${shortRef(hash)}`, () => gitService.cherryPick(path, hash)),
  revert: (path, hash) => journal.record(path, 'revert', `Revert ${shortRef(hash)}`, () => gitService.revert(path, hash)),
  readFile: gitService.readFileContent,
  writeFile: gitService.writeFileContent,
  imageDiff: gitService.imageDiff,
  resolveFile: gitService.resolveFile,
  abortOperation: gitService.abortOperation,
  async continueOperation(path, message) {
    const op = (await gitService.status(path)).operation
    if (!op || op.kind === 'rebase') return gitService.continueOperation(path, message)
    const label = op.kind === 'merge' ? 'Commit merge' : op.kind === 'cherry-pick' ? 'Finish cherry-pick' : 'Finish revert'
    return journal.record(path, op.kind === 'merge' ? 'merge' : op.kind === 'cherry-pick' ? 'cherryPick' : 'revert', label, () =>
      gitService.continueOperation(path, message)
    )
  }
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
ipcMain.handle('native:versions', () => ({
  app: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: `${process.platform} ${process.arch}`
}))
ipcMain.handle('native:window', (event, action: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const wc = event.sender
  switch (action) {
    case 'zoomIn':
      wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 4))
      break
    case 'zoomOut':
      wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3))
      break
    case 'zoomReset':
      wc.setZoomLevel(0)
      break
    case 'fullScreen':
      win?.setFullScreen(!win.isFullScreen())
      break
    case 'devTools':
      wc.toggleDevTools()
      break
    case 'reload':
      wc.reload()
      break
    case 'quit':
      app.quit()
      break
    case 'undo':
    case 'redo':
    case 'cut':
    case 'copy':
    case 'paste':
    case 'selectAll':
      wc[action]()
      break
  }
  return Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100)
})

ipcMain.handle('native:copy', (_event, text: string) => clipboard.writeText(text))

ipcMain.handle('native:showInFolder', async (_event, repoPath: string, relative: string | null) => {
  const target = relative ? join(repoPath, relative) : repoPath
  const isDir = await stat(target).then((s) => s.isDirectory(), () => false)
  if (isDir) await shell.openPath(target)
  else shell.showItemInFolder(target)
})

ipcMain.handle('native:titleBar', (event, color: string, symbolColor: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && process.platform === 'win32') win.setTitleBarOverlay({ color, symbolColor, height: 32 })
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
