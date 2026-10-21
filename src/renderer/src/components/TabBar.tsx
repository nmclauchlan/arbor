import { useState } from 'react'
import type { Shell } from '../actions'
import type { MenuItem } from './ContextMenu'
import { GROUP_COLORS, type Tab, type TabGroup } from '../tabs'
import { revealInFolder, revealLabel } from '../util'

type DropHint = { path: string; after: boolean } | { group: string } | null

export function TabBar({
  tabs,
  groups,
  activePath,
  shell,
  onSelect,
  onClose,
  onCloseMany,
  onMove,
  onMoveToEnd,
  onAssignGroup,
  onCreateGroup,
  onUpdateGroup,
  onUngroup
}: {
  tabs: Tab[]
  groups: TabGroup[]
  activePath: string | null
  shell: Shell
  onSelect: (path: string) => void
  onClose: (path: string) => void
  onCloseMany: (paths: string[]) => void
  onMove: (path: string, targetPath: string, after: boolean) => void
  onMoveToEnd: (path: string) => void
  onAssignGroup: (path: string, group: string | undefined) => void
  onCreateGroup: (name: string, paths: string[]) => void
  onUpdateGroup: (id: string, patch: Partial<TabGroup>) => void
  onUngroup: (id: string) => void
}): React.JSX.Element {
  const [dragging, setDragging] = useState<string | null>(null)
  const [hint, setHint] = useState<DropHint>(null)
  const groupById = new Map(groups.map((g) => [g.id, g]))

  const endDrag = (): void => {
    setDragging(null)
    setHint(null)
  }

  const tabMenu = (e: React.MouseEvent, tab: Tab): void => {
    e.preventDefault()
    const idx = tabs.findIndex((t) => t.path === tab.path)
    const others = tabs.filter((t) => t.path !== tab.path).map((t) => t.path)
    const right = tabs.slice(idx + 1).map((t) => t.path)
    const items: MenuItem[] = [
      ...groups
        .filter((g) => g.id !== tab.group)
        .map((g) => ({ label: `Add to group "${g.name}"`, onClick: () => onAssignGroup(tab.path, g.id) })),
      {
        label: 'Add to new group…',
        onClick: async () => {
          const name = await shell.prompt('New tab group', 'Group name')
          if (name) onCreateGroup(name, [tab.path])
        }
      },
      ...(tab.group ? [{ label: 'Remove from group', onClick: () => onAssignGroup(tab.path, undefined) }] : []),
      { separator: true },
      { label: 'Close', onClick: () => onClose(tab.path) },
      { label: 'Close others', disabled: !others.length, onClick: () => onCloseMany(others) },
      { label: 'Close tabs to the right', disabled: !right.length, onClick: () => onCloseMany(right) },
      { separator: true },
      { label: revealLabel(), onClick: () => revealInFolder(tab.path, null) },
      {
        label: 'Copy path',
        onClick: () => {
          navigator.clipboard.writeText(tab.path)
          shell.showInfo(`Copied ${tab.path}`)
        }
      }
    ]
    shell.openMenu(e, items)
  }

  const groupMenu = (e: React.MouseEvent, group: TabGroup): void => {
    e.preventDefault()
    const members = tabs.filter((t) => t.group === group.id).map((t) => t.path)
    shell.openMenu(e, [
      {
        label: 'Rename group…',
        onClick: async () => {
          const name = await shell.prompt('Rename group', 'Group name', group.name)
          if (name) onUpdateGroup(group.id, { name })
        }
      },
      ...GROUP_COLORS.map((c) => ({
        label: `${c.value === group.color ? '✓ ' : '   '}${c.name}`,
        onClick: () => onUpdateGroup(group.id, { color: c.value })
      })),
      { separator: true },
      { label: group.collapsed ? 'Expand group' : 'Collapse group', onClick: () => onUpdateGroup(group.id, { collapsed: !group.collapsed }) },
      { label: 'Ungroup', onClick: () => onUngroup(group.id) },
      { label: 'Close group', danger: true, onClick: () => onCloseMany(members) }
    ])
  }

  const items: React.ReactNode[] = []
  let prevGroup: string | undefined
  for (const tab of tabs) {
    const group = tab.group ? groupById.get(tab.group) : undefined
    if (group && tab.group !== prevGroup) {
      const g = group
      items.push(
        <div
          key={'g:' + g.id}
          className={`tab-group${g.collapsed ? ' collapsed' : ''}${hint && 'group' in hint && hint.group === g.id ? ' drop-target' : ''}`}
          style={{ background: g.color }}
          title={g.collapsed ? 'Expand group' : 'Collapse group'}
          onClick={() => onUpdateGroup(g.id, { collapsed: !g.collapsed })}
          onContextMenu={(e) => groupMenu(e, g)}
          onDragOver={(e) => {
            if (!dragging) return
            e.preventDefault()
            setHint({ group: g.id })
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragging) onAssignGroup(dragging, g.id)
            endDrag()
          }}
        >
          {g.name}
          {g.collapsed && <span className="muted">({tabs.filter((t) => t.group === g.id).length})</span>}
        </div>
      )
    }
    prevGroup = tab.group
    if (group?.collapsed && tab.path !== activePath) continue
    const isHint = hint && 'path' in hint && hint.path === tab.path ? hint : null
    items.push(
      <div
        key={tab.path}
        className={`tab${tab.path === activePath ? ' active' : ''}${group ? ' grouped' : ''}${dragging === tab.path ? ' dragging' : ''}${isHint ? (isHint.after ? ' drop-after' : ' drop-before') : ''}`}
        style={group ? ({ '--group-color': group.color } as React.CSSProperties) : undefined}
        title={tab.path}
        draggable
        onClick={() => onSelect(tab.path)}
        onAuxClick={(e) => {
          if (e.button === 1) onClose(tab.path)
        }}
        onContextMenu={(e) => tabMenu(e, tab)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', tab.path)
          setDragging(tab.path)
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!dragging || dragging === tab.path) return
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          setHint({ path: tab.path, after: e.clientX > rect.left + rect.width / 2 })
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragging && isHint) onMove(dragging, tab.path, isHint.after)
          endDrag()
        }}
      >
        <span className="tab-name">{tab.name}</span>
        <span
          className="close"
          title="Close (Ctrl+W)"
          onClick={(e) => {
            e.stopPropagation()
            onClose(tab.path)
          }}
        >
          ×
        </span>
      </div>
    )
  }

  return (
    <div
      className="tabs"
      onDragOver={(e) => {
        if (dragging && e.target === e.currentTarget) e.preventDefault()
      }}
      onDrop={(e) => {
        if (dragging && e.target === e.currentTarget) {
          e.preventDefault()
          onMoveToEnd(dragging)
        }
        endDrag()
      }}
    >
      {items}
      <div className="tab tab-add" title="Open repository (Ctrl+O)" onClick={shell.openRepo}>
        +
      </div>
    </div>
  )
}
