import type { MenuItem } from './components/ContextMenu'

export interface Shell {
  openRepo(): void
  openMenu(e: React.MouseEvent, items: MenuItem[]): void
  confirm(title: string, message: string, danger?: boolean): Promise<boolean>
  prompt(title: string, label: string, defaultValue?: string): Promise<string | null>
  showError(message: string): void
  showInfo(message: string): void
  openSettings(suggestBaseUrl?: string): void
}

export interface Actions extends Shell {
  refresh(): void
  selectHash(hash: string): void
  checkout(ref: string): void
  createBranch(startPoint: string): void
  deleteBranch(name: string): void
  merge(ref: string): void
  fetch(): void
  pull(): void
  push(): void
  stash(): void
  stashPop(index: number): void
  stashDrop(index: number): void
  cherryPick(hash: string): void
  revert(hash: string): void
  resetTo(hash: string, mode: 'soft' | 'mixed' | 'hard'): void
  copyHash(hash: string): void
}
