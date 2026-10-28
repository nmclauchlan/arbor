import type { HostInfo, Ref, RepoRefs } from '@shared/types'
import type { Actions } from './actions'
import type { MenuItem } from './components/ContextMenu'
import { shortHash } from './util'

export type FocusRef = { kind: 'branch' | 'remote' | 'tag'; name: string }

interface RemoteRef {
  remote: string
  name: string
}

function splitRemote(full: string): RemoteRef {
  const i = full.indexOf('/')
  return { remote: full.slice(0, i), name: full.slice(i + 1) }
}

export function branchUrl(host: HostInfo, branch: string): string {
  if (host.kind === 'github') return `${host.webUrl}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
  if (host.kind === 'gitlab') return `${host.webUrl}/-/tree/${branch.split('/').map(encodeURIComponent).join('/')}`
  return `${host.webUrl}?version=GB${encodeURIComponent(branch)}`
}

export function commitUrl(host: HostInfo, sha: string): string {
  if (host.kind === 'gitlab') return `${host.webUrl}/-/commit/${sha}`
  return `${host.webUrl}/commit/${sha}`
}

export interface RefMenuInput {
  sha: string
  refs: Ref[]
  focus?: FocusRef | null
  repoRefs: RepoRefs
  host: HostInfo | null
  actions: Actions
  filtered: boolean
  history?: { onHeadBranch: boolean; isHead: boolean; merge: boolean; parent?: string; grandparent?: string }
}

export function buildRefMenu({ sha, refs, focus, repoRefs, host, actions, filtered, history }: RefMenuInput): MenuItem[] {
  const current = repoRefs.branches.find((b) => b.current) ?? null
  const cur = current?.name ?? null
  const locals = refs.filter((r) => r.kind === 'branch').map((r) => r.name)
  const remotes = refs.filter((r) => r.kind === 'remote').map((r) => splitRemote(r.name)).filter((r) => r.name !== 'HEAD')
  const tags = refs.filter((r) => r.kind === 'tag').map((r) => r.name)

  let branch: string | null = null
  let remote: RemoteRef | null = null
  if (focus?.kind === 'branch') branch = focus.name
  else if (focus?.kind === 'remote') remote = splitRemote(focus.name)
  else if (!focus || focus.kind !== 'tag') {
    branch = locals.find((b) => b !== cur) ?? locals[0] ?? null
    if (!branch) remote = remotes[0] ?? null
  }

  const info = branch ? repoRefs.branches.find((b) => b.name === branch) ?? null : null
  if (branch && !remote) {
    if (info?.upstream) remote = splitRemote(info.upstream)
    else remote = remotes.find((r) => r.name === branch) ?? null
  }
  const remoteFull = remote ? `${remote.remote}/${remote.name}` : null
  const remoteExists = !!remoteFull && repoRefs.remotes.some((r) => `${r.remote}/${r.name}` === remoteFull)
  const target = branch ?? remoteFull
  const isCurrent = !!branch && branch === cur
  const items: MenuItem[] = []

  if (branch) {
    items.push(
      isCurrent
        ? { label: 'Pull (fast-forward if possible)', onClick: () => actions.pull() }
        : { label: 'Pull (fast-forward)', disabled: !info?.upstream, onClick: () => actions.updateBranch(branch!) },
      { label: 'Push', onClick: () => (isCurrent ? actions.push() : actions.pushBranch(branch!)) },
      { label: 'Force push (with lease)…', danger: true, disabled: !info?.upstream, onClick: () => actions.forcePush(branch!) },
      { label: 'Set upstream…', onClick: () => actions.setUpstream(branch!) },
      { separator: true }
    )
  }

  if (target && cur && !isCurrent) {
    items.push(
      { label: `Fast-forward ${cur} to ${target}`, onClick: () => actions.fastForward(target) },
      { label: `Merge ${target} into ${cur}`, onClick: () => actions.merge(target) },
      { label: `Rebase ${cur} onto ${target}`, onClick: () => actions.rebase(target) },
      { separator: true }
    )
  }

  const checkoutItems: MenuItem[] = [
    ...locals.filter((b) => b !== cur).map((b) => ({ label: b, onClick: () => actions.checkout(b) })),
    ...remotes.flatMap((r): MenuItem[] => {
      const local = repoRefs.branches.find((b) => b.name === r.name)
      const full = `${r.remote}/${r.name}`
      if (!local) return [{ label: full, hint: `new local ${r.name}`, onClick: () => actions.checkout(r.name) }]
      if (local.current) return []
      if (local.hash === sha) return locals.includes(r.name) ? [] : [{ label: full, hint: `as ${r.name}`, onClick: () => actions.checkout(r.name) }]
      return [{ label: full, hint: `as ${r.name}, fast-forwarded`, onClick: () => actions.checkoutTracking(r.name, full) }]
    }),
    { label: `${shortHash(sha)} (detached HEAD)`, onClick: () => actions.checkout(sha) }
  ]
  const worktreeItems: MenuItem[] = [
    ...locals.filter((b) => b !== cur).map((b) => ({ label: b, onClick: () => actions.addWorktree(b, null) })),
    ...remotes
      .filter((r) => !repoRefs.branches.some((b) => b.name === r.name))
      .map((r) => ({ label: `${r.remote}/${r.name}`, hint: `new local ${r.name}`, onClick: () => actions.addWorktree(`${r.remote}/${r.name}`, r.name) })),
    { label: `${shortHash(sha)} (detached HEAD)`, onClick: () => actions.addWorktree(sha, null) }
  ]
  items.push({ label: 'Checkout', items: checkoutItems }, { label: 'Create worktree from', items: worktreeItems }, { separator: true })

  items.push(
    { label: 'Create branch here…', onClick: () => actions.createBranch(sha) },
    { label: 'Cherry-pick commit', onClick: () => actions.cherryPick(sha) },
    {
      label: cur ? `Reset ${cur} to this commit` : 'Reset to this commit',
      items: [
        { label: 'Soft', hint: 'keep changes staged', onClick: () => actions.resetTo(sha, 'soft') },
        { label: 'Mixed', hint: 'keep changes unstaged', onClick: () => actions.resetTo(sha, 'mixed') },
        { label: 'Hard', hint: 'discard changes', danger: true, onClick: () => actions.resetTo(sha, 'hard') }
      ]
    },
    { label: 'Revert commit', onClick: () => actions.revert(sha) },
    { separator: true }
  )

  if (history?.onHeadBranch && !history.merge) {
    const { parent, grandparent, isHead } = history
    items.push(
      { label: 'Reword commit message…', disabled: !parent, onClick: () => actions.interactiveRebase(parent!, { [sha]: 'reword' }) },
      { label: 'Squash into parent commit', disabled: !grandparent, onClick: () => actions.interactiveRebase(grandparent!, { [sha]: 'squash' }) },
      { label: 'Drop commit…', danger: true, disabled: !parent, onClick: () => actions.interactiveRebase(parent!, { [sha]: 'drop' }) },
      { label: 'Interactive rebase from here…', disabled: isHead, onClick: () => actions.interactiveRebase(sha) },
      { separator: true }
    )
  }

  if (host && remoteExists && remote) {
    const noun = host.kind === 'gitlab' ? 'merge request' : 'pull request'
    items.push({ label: `Start a ${noun} from ${remoteFull}`, onClick: () => actions.startPullRequest(remote!.name) }, { separator: true })
  }

  if (branch) {
    items.push(
      { label: `Rename ${branch}…`, onClick: () => actions.renameBranch(branch!) },
      { label: `Delete ${branch}`, danger: true, disabled: isCurrent, onClick: () => actions.deleteBranch(branch!) }
    )
  }
  if (remote && remoteExists) {
    items.push({ label: `Delete ${remoteFull}`, danger: true, onClick: () => actions.deleteRemoteBranch(remote!.remote, remote!.name) })
  }
  if (branch && remote && remoteExists) {
    items.push({ label: `Delete ${branch} and ${remoteFull}`, danger: true, disabled: isCurrent, onClick: () => actions.deleteBranchEverywhere(branch!, remote!.remote, remote!.name) })
  }
  items.push({ separator: true })

  if (target) items.push({ label: 'Copy branch name', onClick: () => actions.copyText(branch ?? remote!.name, 'branch name') })
  items.push({ label: 'Copy commit SHA', onClick: () => actions.copyHash(sha) })
  if (host && remote && remoteExists) {
    items.push({ label: `Copy link to branch: ${remoteFull}`, onClick: () => actions.copyText(branchUrl(host, remote!.name), 'branch link') })
  }
  if (host) items.push({ label: `Copy link to this commit on ${host.kind === 'azure' ? 'Azure DevOps' : host.kind === 'github' ? 'GitHub' : 'GitLab'}`, onClick: () => actions.copyText(commitUrl(host, sha), 'commit link') })
  items.push({ label: 'Create patch from commit…', onClick: () => actions.savePatch(sha) }, { separator: true })

  const soloRefs: MenuItem[] = [
    ...locals.map((b) => ({ label: b, onClick: () => actions.soloRefs([`refs/heads/${b}`]) })),
    ...remotes.map((r) => ({ label: `${r.remote}/${r.name}`, onClick: () => actions.soloRefs([`refs/remotes/${r.remote}/${r.name}`]) }))
  ]
  if (branch && remoteExists && remote) soloRefs.unshift({ label: `${branch} and ${remoteFull}`, onClick: () => actions.soloRefs([`refs/heads/${branch}`, `refs/remotes/${remoteFull}`]) })
  const hideRefs: MenuItem[] = [
    ...locals.filter((b) => b !== cur).map((b) => ({ label: b, onClick: () => actions.hideRef(`refs/heads/${b}`) })),
    ...remotes.map((r) => ({ label: `${r.remote}/${r.name}`, onClick: () => actions.hideRef(`refs/remotes/${r.remote}/${r.name}`) })),
    ...tags.map((t) => ({ label: t, hint: 'tag', onClick: () => actions.hideRef(`refs/tags/${t}`) }))
  ]
  items.push({ label: 'Solo', items: soloRefs }, { label: 'Hide', items: hideRefs })
  if (filtered) items.push({ label: 'Show all branches', onClick: () => actions.showAllRefs() })
  items.push({ separator: true })

  items.push(
    { label: 'Create tag here…', onClick: () => actions.createTag(sha, false) },
    { label: 'Create annotated tag here…', onClick: () => actions.createTag(sha, true) }
  )
  const tagRemote = remote?.remote ?? repoRefs.remotes[0]?.remote ?? 'origin'
  const tagFocus = focus?.kind === 'tag' ? [focus.name] : tags
  for (const t of tagFocus) {
    items.push({
      label: `Tag ${t}`,
      items: [
        { label: `Push to ${tagRemote}`, onClick: () => actions.pushTag(tagRemote, t) },
        { label: 'Copy tag name', onClick: () => actions.copyText(t, 'tag name') },
        { separator: true },
        { label: 'Delete locally', danger: true, onClick: () => actions.deleteTag(t) },
        { label: `Delete from ${tagRemote}`, danger: true, onClick: () => actions.deleteRemoteTag(tagRemote, t) }
      ]
    })
  }
  return items
}
