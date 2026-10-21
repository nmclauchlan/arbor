import { DEFAULT_GROUP_COLORS, normalizeGroupColor } from './tabColors'

export interface Tab {
  path: string
  name: string
  group?: string
}

export interface TabGroup {
  id: string
  name: string
  color: string
  collapsed?: boolean
}

const KEY = 'arbor.tabs'
const ACTIVE_KEY = 'arbor.active'

export interface SavedTabs {
  tabs: Tab[]
  groups: TabGroup[]
  active: string | null
}

function baseName(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
}

export function loadSavedTabs(): SavedTabs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    const active = localStorage.getItem(ACTIVE_KEY)
    const list: { path: string; name?: string; group?: string }[] = Array.isArray(raw)
      ? raw.map((p: string) => ({ path: p }))
      : raw.tabs ?? []
    return {
      tabs: list.map((t) => ({ path: t.path, name: t.name || baseName(t.path), group: t.group })),
      groups: (Array.isArray(raw) ? [] : raw.groups ?? []).map((group: TabGroup, index: number) => ({
        ...group,
        color: normalizeGroupColor(group.color) ?? DEFAULT_GROUP_COLORS[index % DEFAULT_GROUP_COLORS.length].value
      })),
      active
    }
  } catch {
    return { tabs: [], groups: [], active: null }
  }
}

export function saveTabs(tabs: Tab[], groups: TabGroup[], active: string | null): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        tabs: tabs.map((t) => ({ path: t.path, name: t.name, group: t.group })),
        groups
      })
    )
    if (active) localStorage.setItem(ACTIVE_KEY, active)
  } catch {
    /* storage unavailable */
  }
}

export function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function nextGroupColor(groups: TabGroup[]): string {
  const used = new Set(groups.map((g) => normalizeGroupColor(g.color)))
  return DEFAULT_GROUP_COLORS.find((c) => !used.has(c.value))?.value ?? DEFAULT_GROUP_COLORS[groups.length % DEFAULT_GROUP_COLORS.length].value
}

function lastIndexOfGroup(tabs: Tab[], group: string): number {
  for (let i = tabs.length - 1; i >= 0; i--) if (tabs[i].group === group) return i
  return -1
}

export function assignGroup(tabs: Tab[], path: string, group: string | undefined): Tab[] {
  const tab = tabs.find((t) => t.path === path)
  if (!tab) return tabs
  const rest = tabs.filter((t) => t.path !== path)
  const moved = { ...tab, group }
  if (!group) return [...rest, moved]
  const last = lastIndexOfGroup(rest, group)
  if (last === -1) return [...rest, moved]
  return [...rest.slice(0, last + 1), moved, ...rest.slice(last + 1)]
}

export function moveTab(tabs: Tab[], path: string, targetPath: string, after: boolean): Tab[] {
  if (path === targetPath) return tabs
  const tab = tabs.find((t) => t.path === path)
  const target = tabs.find((t) => t.path === targetPath)
  if (!tab || !target) return tabs
  const rest = tabs.filter((t) => t.path !== path)
  const idx = rest.findIndex((t) => t.path === targetPath)
  const moved = { ...tab, group: target.group }
  const at = after ? idx + 1 : idx
  return [...rest.slice(0, at), moved, ...rest.slice(at)]
}

export function moveToEnd(tabs: Tab[], path: string): Tab[] {
  return assignGroup(tabs, path, undefined)
}

function blockOf(tabs: Tab[], group: string): { first: number; last: number } | null {
  const first = tabs.findIndex((t) => t.group === group)
  if (first === -1) return null
  let last = first
  while (last + 1 < tabs.length && tabs[last + 1].group === group) last++
  return { first, last }
}

export function moveGroupToTab(tabs: Tab[], groupId: string, targetPath: string, after: boolean): Tab[] {
  const members = tabs.filter((t) => t.group === groupId)
  const rest = tabs.filter((t) => t.group !== groupId)
  const idx = rest.findIndex((t) => t.path === targetPath)
  if (!members.length || idx === -1) return tabs
  let at = after ? idx + 1 : idx
  const targetGroup = rest[idx].group
  if (targetGroup) {
    const block = blockOf(rest, targetGroup)!
    at = after ? block.last + 1 : block.first
  }
  return [...rest.slice(0, at), ...members, ...rest.slice(at)]
}

export function moveGroupToGroup(tabs: Tab[], groupId: string, targetGroupId: string, after: boolean): Tab[] {
  if (groupId === targetGroupId) return tabs
  const members = tabs.filter((t) => t.group === groupId)
  const rest = tabs.filter((t) => t.group !== groupId)
  const block = blockOf(rest, targetGroupId)
  if (!members.length || !block) return tabs
  const at = after ? block.last + 1 : block.first
  return [...rest.slice(0, at), ...members, ...rest.slice(at)]
}

export function moveGroupToEnd(tabs: Tab[], groupId: string): Tab[] {
  const members = tabs.filter((t) => t.group === groupId)
  return [...tabs.filter((t) => t.group !== groupId), ...members]
}

export function reorderGroups(groups: TabGroup[], id: string, targetId: string, after: boolean): TabGroup[] {
  if (id === targetId) return groups
  const moving = groups.find((g) => g.id === id)
  if (!moving) return groups
  const rest = groups.filter((g) => g.id !== id)
  const idx = rest.findIndex((g) => g.id === targetId)
  if (idx === -1) return groups
  const at = after ? idx + 1 : idx
  return [...rest.slice(0, at), moving, ...rest.slice(at)]
}
