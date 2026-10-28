export interface RepoInfo {
  path: string
  name: string
}

export interface Commit {
  hash: string
  parents: string[]
  author: string
  email: string
  date: number
  subject: string
  body?: string
  refs: Ref[]
}

export interface IncomingCommit {
  hash: string
  subject: string
  author: string
  date: number
}

export interface IncomingUpstream {
  upstream: string
  upstreamSha: string
  since: string | null
  count: number
  branches: { name: string; current: boolean; ahead: number; behind: number }[]
  commits: IncomingCommit[]
}

export interface RepoSummary {
  path: string
  exists: boolean
  isRepo: boolean
  branch: string | null
  detached: boolean
  upstream: string | null
  ahead: number
  behind: number
  changes: { staged: number; modified: number; untracked: number; conflicted: number } | null
  project: string | null
  host: HostKind | null
}

export interface GraphFilter {
  solo?: string[]
  hide?: string[]
}

export interface UndoInfo {
  undo: string | null
  redo: string | null
}

export type RefKind = 'head' | 'branch' | 'remote' | 'tag' | 'stash'

export interface Ref {
  kind: RefKind
  name: string
}

export interface Branch {
  name: string
  current: boolean
  hash: string
  upstream?: string
  ahead?: number
  behind?: number
}

export interface RemoteBranch {
  remote: string
  name: string
  hash: string
}

export interface Tag {
  name: string
  hash: string
}

export interface Stash {
  index: number
  message: string
  hash: string
}

export type CommitSearchMode = 'all' | 'message' | 'author' | 'sha' | 'file' | 'code'

export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'

export interface RebaseCommit {
  hash: string
  subject: string
  message: string
  author: string
  date: number
  merge: boolean
}

export interface RebaseStep {
  hash: string
  action: RebaseAction
  message?: string
}

export interface FileHistoryEntry {
  hash: string
  author: string
  email: string
  date: number
  subject: string
  path: string
  oldPath?: string
  status: FileChange
}

export interface BlameLine {
  sha: string
  line: number
  text: string
}

export interface BlameCommit {
  author: string
  email: string
  time: number
  summary: string
}

export interface BlameResult {
  lines: BlameLine[]
  commits: Record<string, BlameCommit>
}

export interface RepoRefs {
  branches: Branch[]
  remotes: RemoteBranch[]
  tags: Tag[]
  stashes: Stash[]
  headHash: string
  detached: boolean
}

export type FileChange = 'A' | 'M' | 'D' | 'R' | 'C' | 'U' | '?'

export interface StatusFile {
  path: string
  status: FileChange
  oldPath?: string
}

export interface RepoStatus {
  staged: StatusFile[]
  unstaged: StatusFile[]
  conflicted: string[]
  operation: OperationState | null
}

export interface OperationState {
  kind: 'merge' | 'cherry-pick' | 'revert' | 'rebase'
  message: string
}

export interface CommitDetails {
  hash: string
  author: string
  email: string
  date: number
  subject: string
  body: string
  parents: string[]
  files: StatusFile[]
}

export interface GitApi {
  selectRepos(): Promise<string[]>
  gitVersion(): Promise<string>
  selectFolder(title: string): Promise<string | null>
  clone(url: string, dest: string): Promise<string>
  initialRepo(): Promise<string | null>
  openRepo(path: string): Promise<RepoInfo>
  recentRepos(): Promise<RepoInfo[]>
  log(path: string, limit: number, filter?: GraphFilter): Promise<Commit[]>
  searchCommits(path: string, query: string, mode: CommitSearchMode, filter?: GraphFilter): Promise<string[]>
  updateBranch(path: string, branch: string): Promise<void>
  pushBranch(path: string, branch: string): Promise<void>
  setUpstream(path: string, branch: string, upstream: string): Promise<void>
  fastForward(path: string, target: string): Promise<void>
  rebase(path: string, onto: string): Promise<void>
  rebaseCommits(path: string, base: string): Promise<RebaseCommit[]>
  interactiveRebase(path: string, base: string, steps: RebaseStep[]): Promise<void>
  renameBranch(path: string, from: string, to: string): Promise<void>
  deleteRemoteBranch(path: string, remote: string, branch: string): Promise<void>
  createTag(path: string, name: string, target: string, message: string | null): Promise<void>
  deleteTag(path: string, name: string): Promise<void>
  pushTag(path: string, remote: string, name: string): Promise<void>
  deleteRemoteTag(path: string, remote: string, name: string): Promise<void>
  addWorktree(path: string, dest: string, ref: string, newBranch: string | null): Promise<string>
  savePatch(path: string, hash: string): Promise<string | null>
  refs(path: string): Promise<RepoRefs>
  status(path: string): Promise<RepoStatus>
  stage(path: string, files: string[]): Promise<void>
  applyPatch(path: string, patch: string, mode: 'stage' | 'unstage' | 'discard'): Promise<void>
  unstage(path: string, files: string[]): Promise<void>
  discard(path: string, files: string[]): Promise<void>
  commit(path: string, message: string, amend: boolean): Promise<void>
  fileDiff(path: string, file: string, staged: boolean, status: FileChange): Promise<string>
  commitDetails(path: string, hash: string): Promise<CommitDetails>
  commitFileDiff(path: string, hash: string, file: string): Promise<string>
  fileHistory(path: string, file: string): Promise<FileHistoryEntry[]>
  blame(path: string, file: string, rev?: string): Promise<BlameResult>
  checkout(path: string, ref: string): Promise<void>
  createBranch(path: string, name: string, startPoint: string, checkout: boolean): Promise<void>
  deleteBranch(path: string, name: string, force: boolean): Promise<void>
  fetch(path: string): Promise<void>
  pull(path: string): Promise<void>
  pullFastForward(path: string): Promise<'updated' | 'up-to-date'>
  undoInfo(path: string): Promise<UndoInfo>
  repoSummary(path: string, withChanges: boolean): Promise<RepoSummary>
  initRepo(path: string): Promise<RepoInfo>
  removeRecent(path: string): Promise<void>
  clearRecent(): Promise<void>
  backgroundFetch(path: string): Promise<void>
  incoming(path: string, since: Record<string, string>): Promise<IncomingUpstream[]>
  undo(path: string): Promise<string>
  redo(path: string): Promise<string>
  push(path: string, setUpstream: boolean): Promise<void>
  merge(path: string, ref: string): Promise<void>
  stashPush(path: string, message: string): Promise<void>
  stashPop(path: string, index: number): Promise<void>
  stashDrop(path: string, index: number): Promise<void>
  resetTo(path: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void>
  cherryPick(path: string, hash: string): Promise<void>
  revert(path: string, hash: string): Promise<void>
  readFile(path: string, file: string): Promise<string>
  writeFile(path: string, file: string, content: string): Promise<void>
  imageDiff(path: string, file: string, oldPath: string | undefined, source: ImageSource): Promise<ImageDiffResult>
  resolveFile(path: string, file: string, content: string | null, side: 'ours' | 'theirs' | null): Promise<void>
  abortOperation(path: string): Promise<void>
  continueOperation(path: string, message: string): Promise<void>
}

export type ImageSource =
  | { kind: 'commit'; hash: string }
  | { kind: 'worktree'; staged: boolean; status: FileChange }

export interface ImageDiffResult {
  mime: string
  oldData: string | null
  newData: string | null
}

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif']

export function isImageFile(file: string): boolean {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

export function imageMime(file: string): string {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'svg':
      return 'image/svg+xml'
    case 'ico':
      return 'image/x-icon'
    default:
      return `image/${ext}`
  }
}

export type GitMethod = keyof GitApi

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  percent?: number
  message?: string
}

export type UpdateCheckOutcome = 'available' | 'current' | 'unavailable' | 'error'

export interface MainSettings {
  gitPath: string
  autoUpdate: boolean
}

export interface SettingsApi {
  get(): Promise<MainSettings>
  set(patch: Partial<MainSettings>): Promise<MainSettings>
}

export interface UpdaterApi {
  status(): Promise<UpdateStatus>
  check(): Promise<UpdateCheckOutcome>
  install(): Promise<void>
  onStatus(cb: (status: UpdateStatus) => void): () => void
}

export type HostKind = 'azure' | 'github' | 'gitlab'

export interface HostInfo {
  kind: HostKind
  baseUrl: string
  org: string
  project: string
  repo: string
  webUrl: string
  remote: string
}

export interface HostAccount {
  kind: HostKind
  baseUrl: string
  user: string
  encrypted: boolean
}

export interface PullRequestReviewer {
  name: string
  vote: number
  required: boolean
}

export interface PullRequest {
  id: number
  title: string
  author: string
  sourceBranch: string
  targetBranch: string
  status: 'active' | 'completed' | 'abandoned'
  isDraft: boolean
  createdAt: number
  url: string
  reviewers: PullRequestReviewer[]
  headSha?: string
  mergeSha?: string
}

export interface PullRequestCheck {
  name: string
  state: 'succeeded' | 'failed' | 'pending' | 'unknown'
  url?: string
}

export type BuildState = 'succeeded' | 'failed' | 'partial' | 'running' | 'queued' | 'cancelled' | 'skipped'

export interface CommitBuild {
  id: string
  name: string
  state: BuildState
  url: string
  ref?: string
  pullRequest?: number
  summary?: string
  finishedAt?: number
}

export interface BuildFailure {
  step: string
  messages: string[]
  url?: string
}

export interface PullRequestDetails extends PullRequest {
  description: string
  mergeStatus: string
  checks: PullRequestCheck[]
}

export interface HostRepo {
  name: string
  fullName: string
  description: string
  httpsUrl: string
  sshUrl: string
  updatedAt: number
  isPrivate: boolean
}

export interface HostApi {
  detect(repoPath: string): Promise<HostInfo | null>
  listRepos(kind: HostKind, baseUrl: string): Promise<HostRepo[]>
  cloneFromHost(kind: HostKind, baseUrl: string, url: string, dest: string): Promise<string>
  accounts(): Promise<HostAccount[]>
  hasAccount(repoPath: string): Promise<boolean>
  addAccount(kind: HostKind, baseUrl: string, token: string): Promise<HostAccount>
  removeAccount(kind: HostKind, baseUrl: string): Promise<void>
  pullRequests(repoPath: string): Promise<PullRequest[]>
  pullRequest(repoPath: string, id: number): Promise<PullRequestDetails>
  builds(repoPath: string, shas: string[]): Promise<Record<string, CommitBuild[]>>
  buildFailures(repoPath: string, build: CommitBuild): Promise<BuildFailure[]>
  createPullRequest(
    repoPath: string,
    source: string,
    target: string,
    title: string,
    description: string,
    draft: boolean
  ): Promise<PullRequest>
}
