import { useState } from 'react'
import type { Branch, RemoteBranch, RepoRefs, Stash, Tag } from '@shared/types'
import type { Actions } from '../actions'

function Section({
  title,
  count,
  children
}: {
  title: string
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <div className="section-title" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} {title}</span>
        <span>{count}</span>
      </div>
      {open && children}
    </div>
  )
}

export function Sidebar({ refs, actions }: { refs: RepoRefs; actions: Actions }): React.JSX.Element {
  const current = refs.branches.find((b) => b.current)

  const branchMenu = (e: React.MouseEvent, b: Branch): void => {
    e.preventDefault()
    actions.openMenu(e, [
      { label: `Checkout ${b.name}`, disabled: b.current, onClick: () => actions.checkout(b.name) },
      { label: `Merge ${b.name} into ${current?.name ?? 'HEAD'}`, disabled: b.current, onClick: () => actions.merge(b.name) },
      { label: 'Create branch here…', onClick: () => actions.createBranch(b.name) },
      { separator: true },
      { label: `Delete ${b.name}`, danger: true, disabled: b.current, onClick: () => actions.deleteBranch(b.name) }
    ])
  }

  const remoteMenu = (e: React.MouseEvent, r: RemoteBranch): void => {
    e.preventDefault()
    const full = `${r.remote}/${r.name}`
    actions.openMenu(e, [
      { label: `Checkout ${r.name}`, onClick: () => actions.checkout(r.name) },
      { label: `Merge ${full} into ${current?.name ?? 'HEAD'}`, onClick: () => actions.merge(full) },
      { label: 'Create branch here…', onClick: () => actions.createBranch(full) }
    ])
  }

  const tagMenu = (e: React.MouseEvent, t: Tag): void => {
    e.preventDefault()
    actions.openMenu(e, [
      { label: `Checkout ${t.name}`, onClick: () => actions.checkout(t.name) },
      { label: 'Create branch here…', onClick: () => actions.createBranch(t.name) }
    ])
  }

  const stashMenu = (e: React.MouseEvent, s: Stash): void => {
    e.preventDefault()
    actions.openMenu(e, [
      { label: 'Pop stash', onClick: () => actions.stashPop(s.index) },
      { separator: true },
      { label: 'Drop stash', danger: true, onClick: () => actions.stashDrop(s.index) }
    ])
  }

  const remotes = new Map<string, RemoteBranch[]>()
  for (const r of refs.remotes) {
    if (!remotes.has(r.remote)) remotes.set(r.remote, [])
    remotes.get(r.remote)!.push(r)
  }

  return (
    <div className="sidebar">
      <Section title="Local" count={refs.branches.length}>
        {refs.branches.map((b) => (
          <div
            key={b.name}
            className={`ref-item${b.current ? ' current' : ''}`}
            title={b.name}
            onClick={() => actions.selectHash(b.hash)}
            onDoubleClick={() => !b.current && actions.checkout(b.name)}
            onContextMenu={(e) => branchMenu(e, b)}
          >
            <span className="name">{b.name}</span>
            {(b.ahead || b.behind) ? (
              <span className="track">
                {b.ahead ? `↑${b.ahead}` : ''} {b.behind ? `↓${b.behind}` : ''}
              </span>
            ) : null}
          </div>
        ))}
        {refs.branches.length === 0 && <div className="empty">No branches</div>}
      </Section>
      <Section title="Remote" count={refs.remotes.length}>
        {[...remotes.entries()].map(([remote, list]) => (
          <div key={remote}>
            <div className="remote-group">☁ {remote}</div>
            {list.map((r) => (
              <div
                key={r.name}
                className="ref-item"
                style={{ paddingLeft: 30 }}
                title={`${remote}/${r.name}`}
                onClick={() => actions.selectHash(r.hash)}
                onDoubleClick={() => actions.checkout(r.name)}
                onContextMenu={(e) => remoteMenu(e, r)}
              >
                <span className="name">{r.name}</span>
              </div>
            ))}
          </div>
        ))}
        {refs.remotes.length === 0 && <div className="empty">No remote branches</div>}
      </Section>
      <Section title="Tags" count={refs.tags.length}>
        {refs.tags.map((t) => (
          <div
            key={t.name}
            className="ref-item"
            title={t.name}
            onClick={() => actions.selectHash(t.hash)}
            onContextMenu={(e) => tagMenu(e, t)}
          >
            <span className="name">🏷 {t.name}</span>
          </div>
        ))}
        {refs.tags.length === 0 && <div className="empty">No tags</div>}
      </Section>
      <Section title="Stashes" count={refs.stashes.length}>
        {refs.stashes.map((s) => (
          <div
            key={s.index}
            className="ref-item"
            title={s.message}
            onDoubleClick={() => actions.stashPop(s.index)}
            onContextMenu={(e) => stashMenu(e, s)}
          >
            <span className="name">{s.message}</span>
          </div>
        ))}
        {refs.stashes.length === 0 && <div className="empty">No stashes</div>}
      </Section>
    </div>
  )
}
