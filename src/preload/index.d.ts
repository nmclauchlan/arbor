import type { GitApi, HostApi, SettingsApi, UpdaterApi } from '@shared/types'

declare global {
  interface Window {
    git: GitApi
    updater: UpdaterApi
    settings: SettingsApi
    host: HostApi
    native?: {
      platform: string
      version(): Promise<string>
      setTitleBar(color: string, symbolColor: string): Promise<void>
      showInFolder(repoPath: string, relative: string | null): Promise<void>
      onOpenPath(cb: (path: string) => void): () => void
    }
  }
}

export {}
