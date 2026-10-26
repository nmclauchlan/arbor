import type { UndoInfo } from '@shared/types'
import { gitFor } from './git'

type Kind = 'commit' | 'amend' | 'checkout' | 'createBranch' | 'deleteBranch' | 'reset' | 'merge' | 'pull' | 'cherryPick' | 'revert'

interface Snap {
  head: string
  branch: string | null
}

interface BranchInfo {
  name: string
  sha: string
  upstream: string
  checkedOut: boolean
}

interface Op {
  kind: Kind
  label: string
  before: Snap
  after: Snap
  mode?: 'soft' | 'mixed' | 'hard'
  branch?: BranchInfo
}

const LIMIT = 50
const journals = new Map<string, { undo: Op[]; redo: Op[] }>()

function journal(path: string): { undo: Op[]; redo: Op[] } {
  let j = journals.get(path)
  if (!j) {
    j = { undo: [], redo: [] }
    journals.set(path, j)
  }
  return j
}

async function snap(path: string): Promise<Snap> {
  const g = gitFor(path)
  const head = (await g.raw(['rev-parse', '--verify', '-q', 'HEAD']).catch(() => '')).trim()
  const branch = (await g.raw(['symbolic-ref', '-q', '--short', 'HEAD']).catch(() => '')).trim() || null
  return { head, branch }
}

async function branchSha(path: string, name: string): Promise<string> {
  return (await gitFor(path).raw(['rev-parse', '--verify', '-q', `refs/heads/${name}`]).catch(() => '')).trim()
}

function sameSnap(a: Snap, b: Snap): boolean {
  return a.head === b.head && a.branch === b.branch
}

function changed(label: string): Error {
  return new Error(`Can't safely reverse ${label}: the repository has changed since then.`)
}

export interface RecordOptions {
  mode?: 'soft' | 'mixed' | 'hard'
  branchName?: string
  checkedOut?: boolean
}

export async function record<T>(path: string, kind: Kind, label: string, fn: () => Promise<T>, opts: RecordOptions = {}): Promise<T> {
  const before = await snap(path)
  let branch: BranchInfo | undefined
  if (kind === 'deleteBranch' && opts.branchName) {
    const sha = await branchSha(path, opts.branchName)
    const upstream = (
      await gitFor(path)
        .raw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${opts.branchName}`])
        .catch(() => '')
    ).trim()
    branch = { name: opts.branchName, sha, upstream, checkedOut: false }
  }
  const result = await fn()
  const after = await snap(path)
  if (kind === 'createBranch' && opts.branchName) {
    branch = { name: opts.branchName, sha: await branchSha(path, opts.branchName), upstream: '', checkedOut: !!opts.checkedOut }
  }
  const movesHead = kind !== 'createBranch' && kind !== 'deleteBranch'
  if (movesHead && sameSnap(before, after)) return result
  if (!movesHead && !branch?.sha) return result
  const j = journal(path)
  j.undo.push({ kind, label, before, after, mode: opts.mode, branch })
  if (j.undo.length > LIMIT) j.undo.shift()
  j.redo = []
  return result
}

async function reverse(path: string, op: Op): Promise<void> {
  const g = gitFor(path)
  const now = await snap(path)
  switch (op.kind) {
    case 'createBranch': {
      const b = op.branch!
      if ((await branchSha(path, b.name)) !== b.sha) throw changed(op.label)
      if (b.checkedOut) {
        if (now.branch !== b.name) throw changed(op.label)
        await g.raw(['checkout', op.before.branch ?? op.before.head])
      }
      await g.raw(['branch', '-D', b.name])
      return
    }
    case 'deleteBranch': {
      const b = op.branch!
      if (await branchSha(path, b.name)) throw new Error(`A branch named ${b.name} already exists.`)
      await g.raw(['branch', b.name, b.sha])
      if (b.upstream) await g.raw(['branch', `--set-upstream-to=${b.upstream}`, b.name]).catch(() => undefined)
      return
    }
  }
  if (!sameSnap(now, op.after)) throw changed(op.label)
  switch (op.kind) {
    case 'commit':
    case 'amend':
      if (op.before.head) await g.raw(['reset', '--soft', op.before.head])
      else await g.raw(['update-ref', '-d', 'HEAD'])
      return
    case 'checkout':
      await g.raw(['checkout', op.before.branch ?? op.before.head])
      return
    case 'reset':
      await g.raw(['reset', op.mode === 'soft' ? '--soft' : op.mode === 'mixed' ? '--mixed' : '--keep', op.before.head])
      return
    default:
      await g.raw(['reset', '--keep', op.before.head])
  }
}

async function replay(path: string, op: Op): Promise<void> {
  const g = gitFor(path)
  const now = await snap(path)
  switch (op.kind) {
    case 'createBranch': {
      const b = op.branch!
      if (await branchSha(path, b.name)) throw new Error(`A branch named ${b.name} already exists.`)
      if (b.checkedOut && !sameSnap(now, op.before)) throw changed(op.label)
      await g.raw(['branch', b.name, b.sha])
      if (b.checkedOut) await g.raw(['checkout', b.name])
      return
    }
    case 'deleteBranch': {
      const b = op.branch!
      if ((await branchSha(path, b.name)) !== b.sha) throw changed(op.label)
      await g.raw(['branch', '-D', b.name])
      return
    }
  }
  if (!sameSnap(now, op.before)) throw changed(op.label)
  switch (op.kind) {
    case 'commit':
    case 'amend':
      if (op.before.head) await g.raw(['reset', '--soft', op.after.head])
      else await g.raw(['update-ref', `refs/heads/${op.after.branch}`, op.after.head])
      return
    case 'checkout':
      await g.raw(['checkout', op.after.branch ?? op.after.head])
      return
    case 'reset':
      await g.raw(['reset', op.mode === 'soft' ? '--soft' : op.mode === 'mixed' ? '--mixed' : '--keep', op.after.head])
      return
    default:
      await g.raw(['reset', '--keep', op.after.head])
  }
}

export function undoInfo(path: string): UndoInfo {
  const j = journal(path)
  return { undo: j.undo.at(-1)?.label ?? null, redo: j.redo.at(-1)?.label ?? null }
}

export async function undo(path: string): Promise<string> {
  const j = journal(path)
  const op = j.undo.at(-1)
  if (!op) throw new Error('Nothing to undo')
  await reverse(path, op)
  j.undo.pop()
  j.redo.push(op)
  return op.label
}

export async function redo(path: string): Promise<string> {
  const j = journal(path)
  const op = j.redo.at(-1)
  if (!op) throw new Error('Nothing to redo')
  await replay(path, op)
  j.redo.pop()
  j.undo.push(op)
  return op.label
}
