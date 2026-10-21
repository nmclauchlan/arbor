import { contextBridge, ipcRenderer } from 'electron'
import type { GitApi, GitMethod, UpdateStatus, UpdaterApi } from '@shared/types'

const methods: GitMethod[] = [
  'selectRepo', 'initialRepo', 'openRepo', 'recentRepos', 'log', 'refs', 'status', 'stage', 'unstage', 'discard',
  'commit', 'fileDiff', 'commitDetails', 'commitFileDiff', 'checkout', 'createBranch', 'deleteBranch',
  'fetch', 'pull', 'push', 'merge', 'stashPush', 'stashPop', 'stashDrop', 'resetTo', 'cherryPick', 'revert', 'readFile', 'writeFile',
  'imageDiff'
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

contextBridge.exposeInMainWorld('native', {
  setTitleBar: (color: string, symbolColor: string) => ipcRenderer.invoke('native:titleBar', color, symbolColor)
})
