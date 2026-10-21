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
  refs: Ref[]
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
  selectRepo(): Promise<string | null>
  initialRepo(): Promise<string | null>
  openRepo(path: string): Promise<RepoInfo>
  recentRepos(): Promise<RepoInfo[]>
  log(path: string, limit: number): Promise<Commit[]>
  refs(path: string): Promise<RepoRefs>
  status(path: string): Promise<RepoStatus>
  stage(path: string, files: string[]): Promise<void>
  unstage(path: string, files: string[]): Promise<void>
  discard(path: string, files: string[]): Promise<void>
  commit(path: string, message: string, amend: boolean): Promise<void>
  fileDiff(path: string, file: string, staged: boolean, status: FileChange): Promise<string>
  commitDetails(path: string, hash: string): Promise<CommitDetails>
  commitFileDiff(path: string, hash: string, file: string): Promise<string>
  checkout(path: string, ref: string): Promise<void>
  createBranch(path: string, name: string, startPoint: string, checkout: boolean): Promise<void>
  deleteBranch(path: string, name: string, force: boolean): Promise<void>
  fetch(path: string): Promise<void>
  pull(path: string): Promise<void>
  push(path: string, setUpstream: boolean): Promise<void>
  merge(path: string, ref: string): Promise<void>
  stashPush(path: string, message: string): Promise<void>
  stashPop(path: string, index: number): Promise<void>
  stashDrop(path: string, index: number): Promise<void>
  resetTo(path: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void>
  cherryPick(path: string, hash: string): Promise<void>
  revert(path: string, hash: string): Promise<void>
}

export type GitMethod = keyof GitApi
