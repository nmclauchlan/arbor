import { useEffect, useRef, useState } from 'react'
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
  onUngroup,
  onOpenInto,
  onClone,
  onNewGroup
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
  onOpenInto: (group?: string) => void
  onClone: (group?: string) => void
  onNewGroup: () => void
}): React.JSX.Element {
  const [dragging, setDragging] = useState<string | null>(null)
  const [hint, setHint] = useState<DropHint>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const dropdown = useRef<HTMLDivElement>(null)
  const groupById = new Map(groups.map((g) => [g.id, g]))

  useEffect(() => {
    if (!openGroup) return
    const close = (e: MouseEvent): void => {
      if (dropdown.current && !dropdown.current.contains(e.target as Node)) setOpenGroup(null)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpenGroup(null)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', () => setOpenGroup(null))
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
    }
  }, [openGroup])

  useEffect(() => {
    if (openGroup && !groupById.has(openGroup)) setOpenGroup(null)
  })

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
        .map((g) => ({ label: `Move to group "${g.name}"`, onClick: () => onAssignGroup(tab.path, g.id) })),
      {
        label: 'Move to new group…',
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
      { label: 'Open repository into group…', onClick: () => onOpenInto(group.id) },
      { label: 'Clone repository into group…', onClick: () => onClone(group.id) },
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
      { label: 'Ungroup', onClick: () => onUngroup(group.id) },
      { label: 'Close group', danger: true, onClick: () => onCloseMany(members) }
    ])
  }

  const toggleGroup = (e: React.MouseEvent, id: string): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchor({ x: rect.left, y: rect.bottom + 2 })
    setOpenGroup((cur) => (cur === id ? null : id))
  }

  const renderTab = (tab: Tab, group: TabGroup | undefined): React.ReactNode => {
    const isHint = hint && 'path' in hint && hint.path === tab.path ? hint : null
    return (
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

  const items: React.ReactNode[] = []
  const rendered = new Set<string>()
  for (const tab of tabs) {
    const group = tab.group ? groupById.get(tab.group) : undefined
    if (!group) {
      items.push(renderTab(tab, undefined))
      continue
    }
    if (rendered.has(group.id)) continue
    rendered.add(group.id)
    const members = tabs.filter((t) => t.group === group.id)
    const activeMember = members.find((t) => t.path === activePath)
    items.push(
      <div
        key={'g:' + group.id}
        className={`tab-group${openGroup === group.id ? ' open' : ''}${activeMember ? ' has-active' : ''}${hint && 'group' in hint && hint.group === group.id ? ' drop-target' : ''}`}
        style={{ background: group.color }}
        title={`${group.name}: ${members.length} repositor${members.length === 1 ? 'y' : 'ies'}`}
        onClick={(e) => toggleGroup(e, group.id)}
        onContextMenu={(e) => groupMenu(e, group)}
        onDragOver={(e) => {
          if (!dragging) return
          e.preventDefault()
          setHint({ group: group.id })
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragging) onAssignGroup(dragging, group.id)
          endDrag()
        }}
      >
        {group.name}
        <span className="count">{members.length}</span>
        <span className="caret">{openGroup === group.id ? '▴' : '▾'}</span>
      </div>
    )
    if (activeMember) items.push(renderTab(activeMember, group))
  }

  for (const group of groups) {
    if (rendered.has(group.id)) continue
    rendered.add(group.id)
    items.push(
      <div
        key={'g:' + group.id}
        className={`tab-group empty${openGroup === group.id ? ' open' : ''}${hint && 'group' in hint && hint.group === group.id ? ' drop-target' : ''}`}
        style={{ background: group.color }}
        title={`${group.name}: empty group`}
        onClick={(e) => toggleGroup(e, group.id)}
        onContextMenu={(e) => groupMenu(e, group)}
        onDragOver={(e) => {
          if (!dragging) return
          e.preventDefault()
          setHint({ group: group.id })
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragging) onAssignGroup(dragging, group.id)
          endDrag()
        }}
      >
        {group.name}
        <span className="count">0</span>
        <span className="caret">{openGroup === group.id ? '▴' : '▾'}</span>
      </div>
    )
  }

  const addMenu = (e: React.MouseEvent): void => {
    shell.openMenu(e, [
      { label: 'Open repository…', onClick: () => onOpenInto() },
      { label: 'Clone repository…', onClick: () => onClone() },
      { separator: true },
      { label: 'New group…', onClick: onNewGroup }
    ])
  }

  const open = openGroup ? groupById.get(openGroup) : undefined
  const openMembers = open ? tabs.filter((t) => t.group === open.id) : []

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
      <div className="tab tab-add" title="Open, clone or create a group" onClick={addMenu}>
        +
      </div>
      {open && (
        <div
          ref={dropdown}
          className="group-dropdown"
          style={{ left: anchor.x, top: anchor.y, borderTopColor: open.color }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="group-dropdown-head">
            <span className="swatch" style={{ background: open.color }} />
            <span className="name">{open.name}</span>
            <button className="icon" title="Group options" onClick={(e) => groupMenu(e, open)}>
              ⋯
            </button>
          </div>
          {openMembers.map((t) => (
            <div
              key={t.path}
              className={`group-row${t.path === activePath ? ' active' : ''}`}
              title={t.path}
              onClick={() => {
                onSelect(t.path)
                setOpenGroup(null)
              }}
              onContextMenu={(e) => tabMenu(e, t)}
            >
              <span className="name">{t.name}</span>
              <span className="path">{t.path}</span>
              <span
                className="close"
                title="Close"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(t.path)
                }}
              >
                ×
              </span>
            </div>
          ))}
          <div className="group-row add" onClick={() => { setOpenGroup(null); onOpenInto(open.id) }}>
            + Open repository into {open.name}…
          </div>
        </div>
      )}
    </div>
  )
}
