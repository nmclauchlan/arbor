import { contextBridge, ipcRenderer } from 'electron'
import type { GitApi, GitMethod } from '@shared/types'

const methods: GitMethod[] = [
  'selectRepo', 'initialRepo', 'openRepo', 'recentRepos', 'log', 'refs', 'status', 'stage', 'unstage', 'discard',
  'commit', 'fileDiff', 'commitDetails', 'commitFileDiff', 'checkout', 'createBranch', 'deleteBranch',
  'fetch', 'pull', 'push', 'merge', 'stashPush', 'stashPop', 'stashDrop', 'resetTo', 'cherryPick', 'revert', 'readFile', 'writeFile'
]

const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {}
for (const m of methods) {
  api[m] = (...args: unknown[]) => ipcRenderer.invoke(`git:${m}`, ...args)
}

contextBridge.exposeInMainWorld('git', api as unknown as GitApi)
