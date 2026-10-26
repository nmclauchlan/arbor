import { contextBridge, ipcRenderer } from 'electron'
import type { GitApi, GitMethod, HostApi, MainSettings, SettingsApi, UpdateStatus, UpdaterApi } from '@shared/types'

const methods: GitMethod[] = [
  'selectRepos', 'selectFolder', 'clone', 'gitVersion', 'initialRepo', 'openRepo', 'recentRepos', 'log', 'refs', 'status', 'stage', 'unstage', 'discard',
  'commit', 'fileDiff', 'commitDetails', 'commitFileDiff', 'checkout', 'createBranch', 'deleteBranch',
  'fetch', 'pull', 'pullFastForward', 'undoInfo', 'undo', 'redo', 'repoSummary', 'initRepo', 'removeRecent', 'clearRecent', 'backgroundFetch', 'incoming', 'push', 'merge', 'stashPush', 'stashPop', 'stashDrop', 'resetTo', 'cherryPick', 'revert', 'readFile', 'writeFile',
  'imageDiff', 'resolveFile', 'abortOperation', 'continueOperation'
]

const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
for (const m of methods) {
  api[m] = (...args: unknown[]) => ipcRenderer.invoke(`git:${m}`, ...args)
}

contextBridge.exposeInMainWorld('git', api as unknown as GitApi)

const updater: UpdaterApi = {
  status: () => ipcRenderer.invoke('update:status'),
  check: () => ipcRenderer.invoke('update:check'),
  install: () => ipcRenderer.invoke('update:install'),
  onStatus: (cb) => {
    const handler = (_e: Electron.IpcRendererEvent, status: UpdateStatus): void => cb(status)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  }
}

contextBridge.exposeInMainWorld('updater', updater)

const hostMethods: (keyof HostApi)[] = [
  'detect', 'listRepos', 'cloneFromHost', 'accounts', 'hasAccount', 'addAccount', 'removeAccount', 'pullRequests', 'pullRequest', 'createPullRequest'
]
const host: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
for (const m of hostMethods) {
  host[m] = (...args: unknown[]) => ipcRenderer.invoke(`host:${m}`, ...args)
}
contextBridge.exposeInMainWorld('host', host as unknown as HostApi)

const settings: SettingsApi = {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (patch: Partial<MainSettings>) => ipcRenderer.invoke('settings:set', patch)
}

contextBridge.exposeInMainWorld('settings', settings)

contextBridge.exposeInMainWorld('native', {
  platform: process.platform,
  version: () => ipcRenderer.invoke('native:version'),
  versions: () => ipcRenderer.invoke('native:versions'),
  window: (action: string) => ipcRenderer.invoke('native:window', action),
  setTitleBar: (color: string, symbolColor: string) => ipcRenderer.invoke('native:titleBar', color, symbolColor),
  showInFolder: (repoPath: string, relative: string | null) => ipcRenderer.invoke('native:showInFolder', repoPath, relative),
  onOpenPath: (cb: (path: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: string): void => cb(p)
    ipcRenderer.on('native:openPath', handler)
    return () => ipcRenderer.removeListener('native:openPath', handler)
  }
})
