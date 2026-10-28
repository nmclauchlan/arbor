import type { RebaseAction } from '@shared/types'
import type { MenuItem } from './components/ContextMenu'

export interface Shell {
  openRepo(): void
  openMenu(e: React.MouseEvent, items: MenuItem[]): void
  confirm(title: string, message: string, danger?: boolean): Promise<boolean>
  prompt(title: string, label: string, defaultValue?: string): Promise<string | null>
  showError(message: string): void
  showInfo(message: string): void
  openSettings(suggestBaseUrl?: string): void
  openPath(path: string): void
}

export interface Actions extends Shell {
  refresh(): void
  selectHash(hash: string): void
  checkout(ref: string): void
  checkoutTracking(local: string, remote: string): void
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
  copyText(text: string, what: string): void
  updateBranch(branch: string): void
  pushBranch(branch: string): void
  forcePush(branch: string): void
  setUpstream(branch: string): void
  fastForward(target: string): void
  rebase(onto: string): void
  interactiveRebase(base: string, preset?: Record<string, RebaseAction>): void
  renameBranch(branch: string): void
  deleteRemoteBranch(remote: string, branch: string): void
  deleteBranchEverywhere(branch: string, remote: string, remoteBranch: string): void
  createTag(target: string, annotated: boolean): void
  deleteTag(name: string): void
  pushTag(remote: string, name: string): void
  deleteRemoteTag(remote: string, name: string): void
  addWorktree(ref: string, newBranch: string | null): void
  savePatch(hash: string): void
  startPullRequest(branch: string): void
  soloRefs(refs: string[]): void
  hideRef(ref: string): void
  showAllRefs(): void
  undo(): void
  redo(): void
}
