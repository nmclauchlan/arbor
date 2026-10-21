import type { GitApi, UpdaterApi } from '@shared/types'

declare global {
  interface Window {
    git: GitApi
    updater: UpdaterApi
    native?: {
      platform: string
      setTitleBar(color: string, symbolColor: string): Promise<void>
      showInFolder(repoPath: string, relative: string | null): Promise<void>
    }
  }
}

export {}
