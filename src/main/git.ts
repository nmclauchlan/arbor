import { simpleGit, SimpleGit } from 'simple-git'
import { readFile, writeFile, access } from 'fs/promises'
import { basename, join } from 'path'
import { getSettings } from './settings'
import {
  imageMime,
  type Commit, type CommitDetails, type FileChange, type ImageDiffResult, type ImageSource,
  type OperationState, type IncomingUpstream, type Ref, type RepoSummary, type GraphFilter, type RepoInfo, type RepoRefs, type RepoStatus, type StatusFile
} from '@shared/types'

const FIELD = '\x1f'
const RECORD = '\x1e'
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

function binary(): string {
  return getSettings().gitPath.trim() || 'git'
}

function git(path: string): SimpleGit {
  return simpleGit({ baseDir: path, binary: binary(), maxConcurrentProcesses: 4 })
}

const GUARDED_NON_GIT = new Set(['EDITOR', 'VISUAL', 'PAGER', 'PREFIX', 'SSH_ASKPASS'])

export function gitWithEnv(extra: Record<string, string>, baseDir?: string, blockTimeoutMs?: number): SimpleGit {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    const upper = k.toUpperCase()
    if (upper.startsWith('GIT_') || GUARDED_NON_GIT.has(upper)) continue
    env[k] = v
  }
  Object.assign(env, extra)
  return simpleGit({
    ...(baseDir ? { baseDir } : {}),
    binary: binary(),
    allowEnvironment: Object.keys(extra),
    ...(blockTimeoutMs ? { timeout: { block: blockTimeoutMs } } : {}),
    unsafe: { allowUnsafeEditor: true, allowUnsafeConfigEnvCount: true }
  }).env(env)
}

export async function gitVersion(): Promise<string> {
  return simpleGit({ binary: binary() }).raw(['--version'])
}

export async function clone(url: string, dest: string): Promise<string> {
  await simpleGit({ binary: binary() }).clone(url, dest)
  return dest
}

export async function openRepo(path: string): Promise<RepoInfo> {
  const g = git(path)
  const isRepo = await g.checkIsRepo()
  if (!isRepo) throw new Error(`${path} is not a git repository`)
  const root = (await g.revparse(['--show-toplevel'])).trim()
  return { path: root, name: basename(root) }
}

function parseRefs(decorations: string): Ref[] {
  if (!decorations.trim()) return []
  const refs: Ref[] = []
  for (let part of decorations.split(',')) {
    part = part.trim()
    if (!part) continue
    if (part.startsWith('HEAD -> ')) {
      refs.push({ kind: 'head', name: 'HEAD' })
      part = part.slice(8)
    } else if (part === 'HEAD') {
      refs.push({ kind: 'head', name: 'HEAD' })
      continue
    }
    if (part.startsWith('tag: ')) part = part.slice(5)
    if (part.startsWith('refs/heads/')) refs.push({ kind: 'branch', name: part.slice(11) })
    else if (part.startsWith('refs/remotes/')) refs.push({ kind: 'remote', name: part.slice(13) })
    else if (part.startsWith('refs/tags/')) refs.push({ kind: 'tag', name: part.slice(10) })
    else if (part.startsWith('refs/stash')) refs.push({ kind: 'stash', name: 'stash' })
  }
  return refs
}

function logSelection(filter?: GraphFilter): string[] {
  if (filter?.solo?.length) return filter.solo
  const hide = filter?.hide ?? []
  const args: string[] = []
  for (const r of hide) if (r.startsWith('refs/heads/')) args.push(`--exclude=${r.slice(11)}`)
  args.push('--branches')
  for (const r of hide) if (r.startsWith('refs/remotes/')) args.push(`--exclude=${r.slice(13)}`)
  args.push('--remotes')
  for (const r of hide) if (r.startsWith('refs/tags/')) args.push(`--exclude=${r.slice(10)}`)
  args.push('--tags', 'HEAD')
  return args
}

export async function log(path: string, limit: number, filter?: GraphFilter): Promise<Commit[]> {
  const format = ['%H', '%P', '%an', '%ae', '%at', '%s', '%D', '%b'].join(FIELD) + RECORD
  const out = await git(path).raw([
    'log', ...logSelection(filter), '--topo-order', '--decorate=full', `--format=${format}`, '-n', String(limit), '--'
  ]).catch(() => '')
  const commits: Commit[] = []
  for (const rec of out.split(RECORD)) {
    const line = rec.replace(/^\n/, '')
    if (!line.trim()) continue
    const [hash, parents, author, email, date, subject, refs, body] = line.split(FIELD)
    const preview = (body ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(' | ')
    commits.push({
      body: preview.length > 240 ? preview.slice(0, 239) + '…' : preview || undefined,
      hash,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      author,
      email,
      date: Number(date) * 1000,
      subject,
      refs: parseRefs(refs ?? '')
    })
  }
  return commits
}

export async function refs(path: string): Promise<RepoRefs> {
  const g = git(path)
  const out = await g.raw([
    'for-each-ref',
    `--format=%(refname)${FIELD}%(objectname)${FIELD}%(upstream:short)${FIELD}%(upstream:track)${FIELD}%(HEAD)${FIELD}%(*objectname)`
  ])
  const result: RepoRefs = { branches: [], remotes: [], tags: [], stashes: [], headHash: '', detached: false }
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [refname, hash, upstream, track, head, peeled] = line.split(FIELD)
    if (refname.startsWith('refs/heads/')) {
      const a = /ahead (\d+)/.exec(track ?? '')
      const b = /behind (\d+)/.exec(track ?? '')
      result.branches.push({
        name: refname.slice(11),
        current: head === '*',
        hash,
        upstream: upstream || undefined,
        ahead: a ? Number(a[1]) : 0,
        behind: b ? Number(b[1]) : 0
      })
    } else if (refname.startsWith('refs/remotes/')) {
      const full = refname.slice(13)
      const slash = full.indexOf('/')
      const name = full.slice(slash + 1)
      if (name === 'HEAD') continue
      result.remotes.push({ remote: full.slice(0, slash), name, hash })
    } else if (refname.startsWith('refs/tags/')) {
      result.tags.push({ name: refname.slice(10), hash: peeled || hash })
    }
  }
  result.headHash = (await g.revparse(['HEAD']).catch(() => '')).trim()
  result.detached = !result.branches.some((b) => b.current)
  const stashOut = await g.raw(['stash', 'list', `--format=%gd${FIELD}%H${FIELD}%gs`]).catch(() => '')
  for (const line of stashOut.split('\n')) {
    if (!line.trim()) continue
    const [ref, hash, message] = line.split(FIELD)
    const idx = /stash@\{(\d+)\}/.exec(ref)
    result.stashes.push({ index: idx ? Number(idx[1]) : 0, hash, message })
  }
  return result
}

function mapStatus(code: string): FileChange {
  switch (code) {
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case 'C': return 'C'
    case 'U': return 'U'
    case '?': return '?'
    default: return 'M'
  }
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true, () => false)
}

async function operationState(path: string): Promise<OperationState | null> {
  const g = git(path)
  const gitDir = (await g.revparse(['--git-dir'])).trim()
  const abs = (p: string): string => join(path, gitDir, p)
  const firstLine = async (p: string): Promise<string> =>
    readFile(abs(p), 'utf8').then((s) => s.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '', () => '')
  if (await exists(abs('MERGE_HEAD'))) return { kind: 'merge', message: await firstLine('MERGE_MSG') }
  if (await exists(abs('CHERRY_PICK_HEAD'))) return { kind: 'cherry-pick', message: await firstLine('MERGE_MSG') }
  if (await exists(abs('REVERT_HEAD'))) return { kind: 'revert', message: await firstLine('MERGE_MSG') }
  if ((await exists(abs('rebase-merge'))) || (await exists(abs('rebase-apply')))) {
    return { kind: 'rebase', message: await firstLine('rebase-merge/message') }
  }
  return null
}

export async function status(path: string): Promise<RepoStatus> {
  const out = await git(path).raw(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const result: RepoStatus = { staged: [], unstaged: [], conflicted: [], operation: await operationState(path) }
  const entries = out.split('\0')
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    const x = entry[0]
    const y = entry[1]
    const file = entry.slice(3)
    let oldPath: string | undefined
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      oldPath = entries[++i]
    }
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      result.conflicted.push(file)
      result.unstaged.push({ path: file, status: 'U' })
      continue
    }
    if (x === '?' && y === '?') {
      result.unstaged.push({ path: file, status: '?' })
      continue
    }
    if (x !== ' ' && x !== '?') result.staged.push({ path: file, status: mapStatus(x), oldPath })
    if (y !== ' ' && y !== '?') result.unstaged.push({ path: file, status: mapStatus(y), oldPath })
  }
  return result
}

export async function stage(path: string, files: string[]): Promise<void> {
  if (!files.length) return
  await git(path).raw(['add', '-A', '--', ...files])
}

export async function unstage(path: string, files: string[]): Promise<void> {
  if (!files.length) return
  const g = git(path)
  const hasHead = await g.revparse(['--verify', 'HEAD']).then(() => true).catch(() => false)
  if (hasHead) await g.raw(['reset', '-q', 'HEAD', '--', ...files])
  else await g.raw(['rm', '--cached', '-r', '-q', '--', ...files])
}

export async function discard(path: string, files: string[]): Promise<void> {
  if (!files.length) return
  const g = git(path)
  const st = await status(path)
  const untracked = new Set(st.unstaged.filter((f) => f.status === '?').map((f) => f.path))
  const tracked = files.filter((f) => !untracked.has(f))
  const un = files.filter((f) => untracked.has(f))
  if (tracked.length) await g.raw(['checkout', '--', ...tracked])
  if (un.length) await g.raw(['clean', '-f', '-q', '--', ...un])
}

export async function commit(path: string, message: string, amend: boolean): Promise<void> {
  const args = ['commit', '-m', message]
  if (amend) args.push('--amend')
  await git(path).raw(args)
}

async function untrackedAsDiff(path: string, file: string): Promise<string> {
  let content: string
  try {
    content = await readFile(join(path, file), 'utf8')
  } catch {
    return `diff --git a/${file} b/${file}\nBinary or unreadable file\n`
  }
  if (content.includes('\0')) return `diff --git a/${file} b/${file}\nBinary file\n`
  const lines = content.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  const body = lines.map((l) => '+' + l).join('\n')
  return `diff --git a/${file} b/${file}\nnew file\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${body}\n`
}

export async function fileDiff(path: string, file: string, staged: boolean, st: FileChange): Promise<string> {
  if (st === '?') return untrackedAsDiff(path, file)
  const args = ['diff', '--no-color', '--no-ext-diff']
  if (staged) args.push('--cached')
  args.push('--', file)
  return git(path).raw(args)
}

export async function commitDetails(path: string, hash: string): Promise<CommitDetails> {
  const g = git(path)
  const format = ['%H', '%P', '%an', '%ae', '%at', '%s', '%b'].join(FIELD)
  const out = await g.raw(['show', '-s', `--format=${format}`, hash])
  const [h, parents, author, email, date, subject, body] = out.split(FIELD)
  const parentList = parents ? parents.split(' ').filter(Boolean) : []
  const base = parentList[0] ?? EMPTY_TREE
  const statOut = await g.raw(['diff', '--name-status', '-z', '-M', base, hash])
  const parts = statOut.split('\0')
  const files: StatusFile[] = []
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i]
    if (!code) continue
    const kind = code[0]
    if (kind === 'R' || kind === 'C') {
      const oldPath = parts[++i]
      const newPath = parts[++i]
      files.push({ path: newPath, oldPath, status: mapStatus(kind) })
    } else {
      files.push({ path: parts[++i], status: mapStatus(kind) })
    }
  }
  return {
    hash: h.trim(), parents: parentList, author, email, date: Number(date) * 1000,
    subject, body: (body ?? '').trim(), files
  }
}

export async function commitFileDiff(path: string, hash: string, file: string): Promise<string> {
  const g = git(path)
  const parents = (await g.raw(['rev-list', '--parents', '-n', '1', hash])).trim().split(' ')
  const base = parents.length > 1 ? parents[1] : EMPTY_TREE
  return g.raw(['diff', '--no-color', '--no-ext-diff', '-M', base, hash, '--', file])
}

export async function checkout(path: string, ref: string): Promise<void> {
  await git(path).raw(['checkout', ref])
}

export async function createBranch(path: string, name: string, startPoint: string, co: boolean): Promise<void> {
  const g = git(path)
  if (co) await g.raw(['checkout', '-b', name, startPoint])
  else await g.raw(['branch', name, startPoint])
}

export async function deleteBranch(path: string, name: string, force: boolean): Promise<void> {
  await git(path).raw(['branch', force ? '-D' : '-d', name])
}

export async function fetch(path: string): Promise<void> {
  await git(path).raw(['fetch', '--all', '--prune'])
}

export async function pull(path: string): Promise<void> {
  await git(path).raw(['pull'])
}

export async function pullFastForward(path: string): Promise<'updated' | 'up-to-date'> {
  const g = git(path)
  const before = (await g.revparse(['HEAD']).catch(() => '')).trim()
  await g.raw(['pull', '--ff-only'])
  const after = (await g.revparse(['HEAD']).catch(() => '')).trim()
  return before === after ? 'up-to-date' : 'updated'
}

export async function push(path: string, setUpstream: boolean): Promise<void> {
  const g = git(path)
  if (setUpstream) {
    const branch = (await g.revparse(['--abbrev-ref', 'HEAD'])).trim()
    await g.raw(['push', '-u', 'origin', branch])
  } else {
    await g.raw(['push'])
  }
}

async function failOnConflict(path: string, what: string): Promise<void> {
  if (!(await operationState(path))) return
  const n = (await status(path)).conflicted.length
  throw new Error(`CONFLICT: ${what} stopped with ${n} conflicted file${n === 1 ? '' : 's'} to resolve`)
}

export async function merge(path: string, ref: string): Promise<void> {
  await git(path).raw(['merge', ref])
  await failOnConflict(path, 'Merge')
}

export async function stashPush(path: string, message: string): Promise<void> {
  const args = ['stash', 'push', '--include-untracked']
  if (message) args.push('-m', message)
  await git(path).raw(args)
}

export async function stashPop(path: string, index: number): Promise<void> {
  await git(path).raw(['stash', 'pop', `stash@{${index}}`])
}

export async function stashDrop(path: string, index: number): Promise<void> {
  await git(path).raw(['stash', 'drop', `stash@{${index}}`])
}

export async function resetTo(path: string, hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
  await git(path).raw(['reset', `--${mode}`, hash])
}

export async function cherryPick(path: string, hash: string): Promise<void> {
  await git(path).raw(['cherry-pick', hash])
  await failOnConflict(path, 'Cherry-pick')
}

export async function revert(path: string, hash: string): Promise<void> {
  await git(path).raw(['revert', '--no-edit', hash])
  await failOnConflict(path, 'Revert')
}

export async function readFileContent(path: string, file: string): Promise<string> {
  return readFile(join(path, file), 'utf8')
}

export async function writeFileContent(path: string, file: string, content: string): Promise<void> {
  await writeFile(join(path, file), content, 'utf8')
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export async function imageDiff(
  path: string,
  file: string,
  oldPath: string | undefined,
  source: ImageSource
): Promise<ImageDiffResult> {
  const g = git(path)
  const blob = async (spec: string): Promise<string | null> => {
    try {
      const buf = await g.binaryCatFile(['-p', spec])
      if (buf.length > MAX_IMAGE_BYTES) throw new Error(`${file} is larger than 25 MB`)
      return buf.toString('base64')
    } catch (e) {
      if (e instanceof Error && e.message.includes('larger than')) throw e
      return null
    }
  }
  const worktree = async (): Promise<string | null> => {
    try {
      const buf = await readFile(join(path, file))
      if (buf.length > MAX_IMAGE_BYTES) throw new Error(`${file} is larger than 25 MB`)
      return buf.toString('base64')
    } catch (e) {
      if (e instanceof Error && e.message.includes('larger than')) throw e
      return null
    }
  }
  const before = oldPath ?? file
  const mime = imageMime(file)
  if (source.kind === 'commit') {
    const parents = (await g.raw(['rev-list', '--parents', '-n', '1', source.hash])).trim().split(' ')
    const parent = parents.length > 1 ? parents[1] : null
    return {
      mime,
      oldData: parent ? await blob(`${parent}:${before}`) : null,
      newData: await blob(`${source.hash}:${file}`)
    }
  }
  if (source.staged) {
    return { mime, oldData: await blob(`HEAD:${before}`), newData: await blob(`:${file}`) }
  }
  return {
    mime,
    oldData: source.status === '?' ? null : await blob(`:${before}`),
    newData: source.status === 'D' ? null : await worktree()
  }
}

export async function resolveFile(
  path: string,
  file: string,
  content: string | null,
  side: 'ours' | 'theirs' | null
): Promise<void> {
  const g = git(path)
  if (side) {
    await g.raw(['checkout', '--' + side, '--', file])
  } else if (content !== null) {
    await writeFile(join(path, file), content, 'utf8')
  }
  await g.raw(['add', '--', file])
}

export async function abortOperation(path: string): Promise<void> {
  const op = await operationState(path)
  if (!op) return
  await git(path).raw([op.kind, '--abort'])
}

export async function continueOperation(path: string, message: string): Promise<void> {
  const op = await operationState(path)
  if (!op) return
  const g = git(path)
  if (op.kind === 'merge') {
    await g.raw(message.trim() ? ['commit', '-m', message] : ['commit', '--no-edit'])
  } else {
    await gitWithEnv({ GIT_EDITOR: 'true' }, path).raw([op.kind, '--continue'])
  }
}

export const gitFor = git

export async function backgroundFetch(path: string): Promise<void> {
  await gitWithEnv({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, path, 45_000).raw(['fetch', '--all', '--prune', '--quiet'])
}

export async function incoming(path: string, since: Record<string, string> = {}): Promise<IncomingUpstream[]> {
  const g = git(path)
  const r = await refs(path)
  const tracking = new Map<string, typeof r.branches>()
  for (const b of r.branches) if (b.upstream) tracking.set(b.upstream, [...(tracking.get(b.upstream) ?? []), b])
  const out: IncomingUpstream[] = []
  for (const [upstream, locals] of tracking) {
    const upstreamSha = (await g.revparse(['--verify', '-q', `${upstream}^{commit}`]).catch(() => '')).trim()
    if (!upstreamSha) continue
    const branches = locals.map((b) => ({ name: b.name, current: b.current, ahead: b.ahead ?? 0, behind: b.behind ?? 0 }))
    const base = since[upstream] ? (await g.revparse(['--verify', '-q', `${since[upstream]}^{commit}`]).catch(() => '')).trim() : ''
    if (!base || base === upstreamSha) {
      out.push({ upstream, upstreamSha, since: base || null, count: 0, branches, commits: [] })
      continue
    }
    const range = [upstreamSha, `^${base}`, ...locals.map((b) => `^refs/heads/${b.name}`)]
    const count = Number((await g.raw(['rev-list', '--count', ...range]).catch(() => '0')).trim()) || 0
    const log = count ? await g.raw(['log', ...range, '-n', '10', `--format=%H${FIELD}%an${FIELD}%at${FIELD}%s${RECORD}`]).catch(() => '') : ''
    const commits = log
      .split(RECORD)
      .map((l) => l.replace(/^\n/, ''))
      .filter((l) => l.trim())
      .map((l) => {
        const [hash, author, at, subject] = l.split(FIELD)
        return { hash, author, date: Number(at) * 1000, subject }
      })
    out.push({ upstream, upstreamSha, since: base, count, branches, commits })
  }
  const tracksCurrent = (u: IncomingUpstream): number => Number(u.branches.some((b) => b.current))
  return out.sort((a, b) => tracksCurrent(b) - tracksCurrent(a))
}

export async function repoSummary(path: string, withChanges: boolean): Promise<RepoSummary> {
  const empty: RepoSummary = {
    path, exists: false, isRepo: false, branch: null, detached: false, upstream: null,
    ahead: 0, behind: 0, changes: null, project: null, host: null
  }
  const exists = await access(path).then(() => true, () => false)
  if (!exists) return empty
  let out: string
  try {
    out = await git(path).raw(['status', '--porcelain=v2', '--branch', withChanges ? '--untracked-files=normal' : '--untracked-files=no'])
  } catch {
    return { ...empty, exists: true }
  }
  const summary: RepoSummary = { ...empty, exists: true, isRepo: true }
  const changes = { staged: 0, modified: 0, untracked: 0, conflicted: 0 }
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice(14).trim()
      summary.detached = head === '(detached)'
      summary.branch = summary.detached ? null : head
    } else if (line.startsWith('# branch.upstream ')) {
      summary.upstream = line.slice(18).trim()
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        summary.ahead = Number(m[1])
        summary.behind = Number(m[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      if (line[2] !== '.') changes.staged++
      if (line[3] !== '.') changes.modified++
    } else if (line.startsWith('u ')) {
      changes.conflicted++
    } else if (line.startsWith('? ')) {
      changes.untracked++
    }
  }
  if (withChanges) summary.changes = changes
  return summary
}

export async function initRepo(path: string): Promise<void> {
  await simpleGit({ baseDir: path, binary: binary() }).raw(['init'])
}

async function upstreamOf(path: string, branch: string): Promise<{ remote: string; ref: string } | null> {
  const out = (await git(path).raw(['for-each-ref', `--format=%(upstream:remotename)${FIELD}%(upstream:remoteref)`, `refs/heads/${branch}`]).catch(() => '')).trim()
  const [remote, ref] = out.split(FIELD)
  return remote && ref ? { remote, ref } : null
}

export async function updateBranch(path: string, branch: string): Promise<void> {
  const up = await upstreamOf(path, branch)
  if (!up) throw new Error(`${branch} has no upstream branch to pull from`)
  await git(path).raw(['fetch', up.remote, `${up.ref}:refs/heads/${branch}`])
}

export async function pushBranch(path: string, branch: string): Promise<void> {
  const up = await upstreamOf(path, branch)
  if (up) await git(path).raw(['push', up.remote, `refs/heads/${branch}:${up.ref}`])
  else await git(path).raw(['push', '-u', 'origin', branch])
}

export async function setUpstream(path: string, branch: string, upstream: string): Promise<void> {
  await git(path).raw(['branch', `--set-upstream-to=${upstream}`, branch])
}

export async function fastForward(path: string, target: string): Promise<void> {
  await git(path).raw(['merge', '--ff-only', target])
}

export async function rebase(path: string, onto: string): Promise<void> {
  try {
    await git(path).raw(['rebase', onto])
  } catch (e) {
    await failOnConflict(path, 'Rebase')
    throw e
  }
  await failOnConflict(path, 'Rebase')
}

export async function renameBranch(path: string, from: string, to: string): Promise<void> {
  await git(path).raw(['branch', '-m', from, to])
}

export async function deleteRemoteBranch(path: string, remote: string, branch: string): Promise<void> {
  await git(path).raw(['push', remote, '--delete', branch])
}

export async function createTag(path: string, name: string, target: string, message: string | null): Promise<void> {
  if (message) await git(path).raw(['tag', '-a', name, '-m', message, target])
  else await git(path).raw(['tag', name, target])
}

export async function deleteTag(path: string, name: string): Promise<void> {
  await git(path).raw(['tag', '-d', name])
}

export async function pushTag(path: string, remote: string, name: string): Promise<void> {
  await git(path).raw(['push', remote, `refs/tags/${name}`])
}

export async function deleteRemoteTag(path: string, remote: string, name: string): Promise<void> {
  await git(path).raw(['push', remote, '--delete', `refs/tags/${name}`])
}

export async function addWorktree(path: string, dest: string, ref: string, newBranch: string | null): Promise<string> {
  const args = ['worktree', 'add']
  if (newBranch) args.push('-b', newBranch, dest, ref)
  else if (/^[0-9a-f]{40}$/i.test(ref)) args.push('--detach', dest, ref)
  else args.push(dest, ref)
  await git(path).raw(args)
  return dest
}

export async function formatPatch(path: string, hash: string): Promise<{ text: string; name: string }> {
  const g = git(path)
  const text = await g.raw(['format-patch', '-1', '--stdout', hash])
  const subject = (await g.raw(['log', '-1', '--format=%s', hash])).trim()
  const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'commit'
  return { text, name: `${hash.slice(0, 7)}-${slug}.patch` }
}
