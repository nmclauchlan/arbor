import type { MenuItem } from './components/ContextMenu'

export interface Actions {
  openRepo(): void
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
  openMenu(e: React.MouseEvent, items: MenuItem[]): void
  confirm(title: string, message: string, danger?: boolean): Promise<boolean>
  showError(message: string): void
}
