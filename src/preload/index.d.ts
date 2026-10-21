import type { GitApi } from '@shared/types'

declare global {
  interface Window {
    git: GitApi
  }
}

export {}
