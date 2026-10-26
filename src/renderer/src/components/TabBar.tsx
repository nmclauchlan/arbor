import { useEffect, useRef, useState } from 'react'
import type { Shell } from '../actions'
import type { MenuItem } from './ContextMenu'
import type { Tab, TabGroup } from '../tabs'
import { GroupColorDialog } from './GroupColorDialog'
import { revealInFolder, revealLabel } from '../util'

type DropHint = { path: string; after: boolean } | { group: string; after?: boolean } | null
type Dragging = { kind: 'tab'; path: string } | { kind: 'group'; id: string } | null

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
  onPullGroup,
  groupProgress,
  onOpenInto,
  onClone,
  onNewGroup,
  onMoveGroupToTab,
  onMoveGroupToGroup,
  onMoveGroupToEnd
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
  onPullGroup: (id: string) => void
  groupProgress: Record<string, { done: number; total: number }>
  onOpenInto: (group?: string) => void
  onClone: (group?: string) => void
  onNewGroup: () => void
  onMoveGroupToTab: (id: string, targetPath: string, after: boolean) => void
  onMoveGroupToGroup: (id: string, targetId: string, after: boolean) => void
  onMoveGroupToEnd: (id: string) => void
}): React.JSX.Element {
  const [dragging, setDragging] = useState<Dragging>(null)
  const [hint, setHint] = useState<DropHint>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [colorGroupId, setColorGroupId] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const dropdown = useRef<HTMLDivElement>(null)
  const groupChips = useRef(new Map<string, HTMLDivElement>())
  const scroller = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const groupById = new Map(groups.map((g) => [g.id, g]))

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const check = (): void => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [tabs, groups])

  useEffect(() => {
    scroller.current?.querySelector('.tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activePath])

  useEffect(() => {
    if (!openGroup) return
    const close = (e: MouseEvent): void => {
      if (dropdown.current && !dropdown.current.contains(e.target as Node)) setOpenGroup(null)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpenGroup(null)
    }
    const blur = (): void => setOpenGroup(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', blur)
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

  const editGroupColor = (group: TabGroup): void => {
    groupChips.current.get(group.id)?.focus()
    setOpenGroup(null)
    setColorGroupId(group.id)
  }

  const groupMenu = (e: React.MouseEvent, group: TabGroup): void => {
    e.preventDefault()
    const members = tabs.filter((t) => t.group === group.id).map((t) => t.path)
    const pulling = !!groupProgress[group.id]
    shell.openMenu(e, [
      {
        label: pulling ? `Pulling… (${groupProgress[group.id].done}/${groupProgress[group.id].total})` : `Pull all (${members.length})`,
        disabled: pulling || !members.length,
        onClick: () => onPullGroup(group.id)
      },
      { separator: true },
      { label: 'Open repository into group…', onClick: () => onOpenInto(group.id) },
      { label: 'Clone repository into group…', onClick: () => onClone(group.id) },
      {
        label: 'Rename group…',
        onClick: async () => {
          const name = await shell.prompt('Rename group', 'Group name', group.name)
          if (name) onUpdateGroup(group.id, { name })
        }
      },
      { label: 'Color…', onClick: () => editGroupColor(group) },
      { separator: true },
      { label: 'Ungroup', onClick: () => onUngroup(group.id) },
      { label: 'Close group', danger: true, disabled: !members.length, onClick: () => onCloseMany(members) }
    ])
  }

  const toggleGroup = (e: React.MouseEvent | React.KeyboardEvent, id: string): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    setAnchor({ x: rect.left, y: rect.bottom + 2 })
    setOpenGroup((cur) => (cur === id ? null : id))
  }

  const renderTab = (tab: Tab, group: TabGroup | undefined): React.ReactNode => {
    const isHint = hint && 'path' in hint && hint.path === tab.path ? hint : null
    const isDragging = dragging?.kind === 'tab' && dragging.path === tab.path
    return (
      <div
        key={tab.path}
        className={`tab${tab.path === activePath ? ' active' : ''}${group ? ' grouped' : ''}${isDragging ? ' dragging' : ''}${isHint ? (isHint.after ? ' drop-after' : ' drop-before') : ''}`}
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
          setDragging({ kind: 'tab', path: tab.path })
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!dragging) return
          if (dragging.kind === 'tab' && dragging.path === tab.path) return
          if (dragging.kind === 'group' && tab.group === dragging.id) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          const rect = e.currentTarget.getBoundingClientRect()
          setHint({ path: tab.path, after: e.clientX > rect.left + rect.width / 2 })
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragging && isHint) {
            if (dragging.kind === 'tab') onMove(dragging.path, tab.path, isHint.after)
            else onMoveGroupToTab(dragging.id, tab.path, isHint.after)
          }
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

  const renderChip = (group: TabGroup, count: number, hasActive: boolean): React.ReactNode => {
    const isOpen = openGroup === group.id
    const groupHint = hint && 'group' in hint && hint.group === group.id ? hint : null
    const hintCls = groupHint ? (groupHint.after === undefined ? ' drop-target' : groupHint.after ? ' drop-after' : ' drop-before') : ''
    const isDragging = dragging?.kind === 'group' && dragging.id === group.id
    return (
      <div
        key={'g:' + group.id}
        ref={(element) => {
          if (element) groupChips.current.set(group.id, element)
          else groupChips.current.delete(group.id)
        }}
        className={`tab-group${count === 0 ? ' empty' : ''}${isOpen ? ' open' : ''}${hasActive ? ' has-active' : ''}${isDragging ? ' dragging' : ''}${hintCls}`}
        style={{ '--group-color': group.color } as React.CSSProperties}
        title={count === 0 ? `${group.name}: empty group` : `${group.name}: ${count} repositor${count === 1 ? 'y' : 'ies'}`}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        draggable
        onClick={(e) => toggleGroup(e, group.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleGroup(e, group.id)
          }
        }}
        onContextMenu={(e) => {
          setOpenGroup(null)
          groupMenu(e, group)
        }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', 'group:' + group.id)
          setDragging({ kind: 'group', id: group.id })
          setOpenGroup(null)
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!dragging) return
          if (dragging.kind === 'group' && dragging.id === group.id) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dragging.kind === 'tab') setHint({ group: group.id })
          else {
            const rect = e.currentTarget.getBoundingClientRect()
            setHint({ group: group.id, after: e.clientX > rect.left + rect.width / 2 })
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragging?.kind === 'tab') onAssignGroup(dragging.path, group.id)
          else if (dragging?.kind === 'group' && groupHint && groupHint.after !== undefined) {
            onMoveGroupToGroup(dragging.id, group.id, groupHint.after)
          }
          endDrag()
        }}
      >
        {group.name}
        {groupProgress[group.id] ? (
          <span className="count pulling" title="Pulling">
            <span className="spinner" aria-hidden /> {groupProgress[group.id].done}/{groupProgress[group.id].total}
          </span>
        ) : (
          <span className="count">{count}</span>
        )}
        <span className="caret">{isOpen ? '▴' : '▾'}</span>
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
    items.push(renderChip(group, members.length, !!activeMember))
    if (activeMember) items.push(renderTab(activeMember, group))
  }
  for (const group of groups) {
    if (rendered.has(group.id)) continue
    rendered.add(group.id)
    items.push(renderChip(group, 0, false))
  }

  const addMenu = (e: React.MouseEvent): void => {
    shell.openMenu(e, [
      { label: 'Open repository…', onClick: () => onOpenInto() },
      { label: 'Clone repository…', onClick: () => onClone() },
      { separator: true },
      { label: 'New group…', onClick: onNewGroup }
    ])
  }

  const allTabsMenu = (e: React.MouseEvent): void => {
    const menu: MenuItem[] = []
    const seen = new Set<string>()
    for (const t of tabs) {
      const g = t.group ? groupById.get(t.group) : undefined
      if (g && !seen.has(g.id)) {
        seen.add(g.id)
        menu.push({ label: `— ${g.name} —`, disabled: true })
      }
      menu.push({ label: `${t.path === activePath ? '✓ ' : '   '}${t.name}`, onClick: () => onSelect(t.path) })
    }
    shell.openMenu(e, menu)
  }

  const open = openGroup ? groupById.get(openGroup) : undefined
  const openMembers = open ? tabs.filter((t) => t.group === open.id) : []
  const colorGroup = colorGroupId ? groupById.get(colorGroupId) : undefined

  return (
    <div className="tabs">
      <div
        className="tabs-scroll"
        ref={scroller}
        onWheel={(e) => {
          if (e.deltaY && scroller.current) scroller.current.scrollLeft += e.deltaY
        }}
        onDragOver={(e) => {
          if (dragging && e.target === e.currentTarget) e.preventDefault()
        }}
        onDrop={(e) => {
          if (dragging && e.target === e.currentTarget) {
            e.preventDefault()
            if (dragging.kind === 'tab') onMoveToEnd(dragging.path)
            else onMoveGroupToEnd(dragging.id)
          }
          endDrag()
        }}
      >
        {items}
      </div>
      {overflowing && (
        <div className="tab tab-overflow" title="All tabs" onClick={allTabsMenu}>
          ⌄
        </div>
      )}
      <div className="tab tab-add" title="Open, clone or create a group" onClick={addMenu}>
        +
      </div>
      {open && (
        <div
          ref={dropdown}
          className="group-dropdown"
          style={{ left: anchor.x, top: anchor.y, borderTopColor: open.color }}
          onMouseDown={(e) => e.stopPropagation()}
          onDragOver={(e) => {
            if (dragging?.kind !== 'tab') return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setHint({ group: open.id })
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragging?.kind === 'tab') onAssignGroup(dragging.path, open.id)
            endDrag()
          }}
        >
          <div className="group-dropdown-head">
            <button className="icon group-color-trigger" title="Customize group color" aria-label={`Customize color for ${open.name}`} onClick={() => editGroupColor(open)}>
              <span className="swatch" style={{ background: open.color }} />
            </button>
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
          <div
            className="group-row add"
            onClick={() => {
              setOpenGroup(null)
              onOpenInto(open.id)
            }}
          >
            + Open repository into {open.name}…
          </div>
        </div>
      )}
      {colorGroup && (
        <GroupColorDialog
          key={colorGroup.id}
          group={colorGroup}
          onClose={() => setColorGroupId(null)}
          onApply={(color) => onUpdateGroup(colorGroup.id, { color })}
        />
      )}
    </div>
  )
}
