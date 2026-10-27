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
      versions(): Promise<{ app: string; electron: string; chrome: string; node: string; platform: string }>
      window(action: 'zoomIn' | 'zoomOut' | 'zoomReset' | 'fullScreen' | 'devTools' | 'reload' | 'quit' | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'): Promise<number>
      setTitleBar(color: string, symbolColor: string): Promise<void>
      copy(text: string): Promise<void>
      showInFolder(repoPath: string, relative: string | null): Promise<void>
      onOpenPath(cb: (path: string) => void): () => void
    }
  }
}

export {}
