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

export const GROUP_COLORS: { name: string; value: string }[] = [
  { name: 'Blue', value: '#3e9cf0' },
  { name: 'Green', value: '#58c36b' },
  { name: 'Orange', value: '#f1a33c' },
  { name: 'Red', value: '#e8534a' },
  { name: 'Purple', value: '#b16df5' },
  { name: 'Teal', value: '#2ec4b6' },
  { name: 'Pink', value: '#f06fa8' }
]

const KEY = 'arbor.tabs'
const ACTIVE_KEY = 'arbor.active'

export interface SavedTabs {
  tabs: { path: string; group?: string }[]
  groups: TabGroup[]
  active: string | null
}

export function loadSavedTabs(): SavedTabs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    const active = localStorage.getItem(ACTIVE_KEY)
    if (Array.isArray(raw)) return { tabs: raw.map((p: string) => ({ path: p })), groups: [], active }
    return { tabs: raw.tabs ?? [], groups: raw.groups ?? [], active }
  } catch {
    return { tabs: [], groups: [], active: null }
  }
}

export function saveTabs(tabs: Tab[], groups: TabGroup[], active: string | null): void {
  try {
    const used = new Set(tabs.map((t) => t.group).filter(Boolean))
    localStorage.setItem(
      KEY,
      JSON.stringify({
        tabs: tabs.map((t) => ({ path: t.path, group: t.group })),
        groups: groups.filter((g) => used.has(g.id))
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
  const used = new Set(groups.map((g) => g.color))
  return GROUP_COLORS.find((c) => !used.has(c.value))?.value ?? GROUP_COLORS[groups.length % GROUP_COLORS.length].value
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
