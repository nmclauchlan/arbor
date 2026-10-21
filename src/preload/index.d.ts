import type { GitApi, UpdaterApi } from '@shared/types'

declare global {
  interface Window {
    git: GitApi
    updater: UpdaterApi
    native?: { setTitleBar(color: string, symbolColor: string): Promise<void> }
  }
}

export {}
