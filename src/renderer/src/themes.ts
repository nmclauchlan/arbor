import { useSyncExternalStore } from 'react'

export interface Theme {
  id: string
  name: string
  dark: boolean
  vars: Record<string, string>
}

const KEY = 'arbor.theme'

function palette(
  dark: boolean,
  bg: [string, string, string, string],
  border: string,
  fg: [string, string, string],
  accent: [string, string],
  colors: { green: string; red: string; yellow: string; purple: string },
  syntax: Record<string, string>
): Record<string, string> {
  return {
    bg: bg[0], 'bg-2': bg[1], 'bg-3': bg[2], 'bg-4': bg[3],
    border,
    fg: fg[0], 'fg-dim': fg[1], 'fg-faint': fg[2],
    accent: accent[0], 'accent-2': accent[1],
    green: colors.green, red: colors.red, yellow: colors.yellow, purple: colors.purple,
    'add-bg': dark ? 'rgba(88, 195, 107, 0.14)' : 'rgba(46, 160, 67, 0.15)',
    'del-bg': dark ? 'rgba(232, 83, 74, 0.14)' : 'rgba(207, 34, 46, 0.14)',
    'select-bg': dark ? 'rgba(62, 156, 240, 0.18)' : 'rgba(9, 105, 218, 0.14)',
    ...syntax
  }
}

export const THEMES: Theme[] = [
  {
    id: 'arbor-dark', name: 'Arbor Dark', dark: true,
    vars: palette(true, ['#1b1d23', '#22252c', '#2a2e37', '#343945'], '#30343d', ['#d7dae0', '#8b909c', '#5d626d'], ['#3e9cf0', '#2f7fc9'],
      { green: '#58c36b', red: '#e8534a', yellow: '#f1a33c', purple: '#b16df5' },
      { 'syn-keyword': '#c678dd', 'syn-string': '#98c379', 'syn-comment': '#6b717d', 'syn-number': '#d19a66', 'syn-type': '#e5c07b', 'syn-function': '#61afef', 'syn-property': '#e06c75', 'syn-tag': '#e06c75', 'syn-operator': '#56b6c2' })
  },
  {
    id: 'midnight', name: 'Midnight', dark: true,
    vars: palette(true, ['#0d1117', '#161b22', '#21262d', '#30363d'], '#30363d', ['#e6edf3', '#8b949e', '#6e7681'], ['#58a6ff', '#388bfd'],
      { green: '#3fb950', red: '#f85149', yellow: '#d29922', purple: '#bc8cff' },
      { 'syn-keyword': '#ff7b72', 'syn-string': '#a5d6ff', 'syn-comment': '#8b949e', 'syn-number': '#79c0ff', 'syn-type': '#ffa657', 'syn-function': '#d2a8ff', 'syn-property': '#79c0ff', 'syn-tag': '#7ee787', 'syn-operator': '#ff7b72' })
  },
  {
    id: 'dracula', name: 'Dracula', dark: true,
    vars: palette(true, ['#282a36', '#21222c', '#343746', '#44475a'], '#44475a', ['#f8f8f2', '#a7abbe', '#6272a4'], ['#bd93f9', '#a97ee8'],
      { green: '#50fa7b', red: '#ff5555', yellow: '#f1fa8c', purple: '#ff79c6' },
      { 'syn-keyword': '#ff79c6', 'syn-string': '#f1fa8c', 'syn-comment': '#6272a4', 'syn-number': '#bd93f9', 'syn-type': '#8be9fd', 'syn-function': '#50fa7b', 'syn-property': '#66d9ef', 'syn-tag': '#ff79c6', 'syn-operator': '#ff79c6' })
  },
  {
    id: 'nord', name: 'Nord', dark: true,
    vars: palette(true, ['#2e3440', '#3b4252', '#434c5e', '#4c566a'], '#4c566a', ['#eceff4', '#aab1be', '#7b8494'], ['#88c0d0', '#81a1c1'],
      { green: '#a3be8c', red: '#bf616a', yellow: '#ebcb8b', purple: '#b48ead' },
      { 'syn-keyword': '#81a1c1', 'syn-string': '#a3be8c', 'syn-comment': '#7b8494', 'syn-number': '#b48ead', 'syn-type': '#8fbcbb', 'syn-function': '#88c0d0', 'syn-property': '#d8dee9', 'syn-tag': '#81a1c1', 'syn-operator': '#81a1c1' })
  },
  {
    id: 'solarized-dark', name: 'Solarized Dark', dark: true,
    vars: palette(true, ['#002b36', '#073642', '#0b4552', '#15545f'], '#15545f', ['#eee8d5', '#93a1a1', '#657b83'], ['#268bd2', '#1f78b8'],
      { green: '#859900', red: '#dc322f', yellow: '#b58900', purple: '#6c71c4' },
      { 'syn-keyword': '#859900', 'syn-string': '#2aa198', 'syn-comment': '#657b83', 'syn-number': '#d33682', 'syn-type': '#b58900', 'syn-function': '#268bd2', 'syn-property': '#93a1a1', 'syn-tag': '#268bd2', 'syn-operator': '#859900' })
  },
  {
    id: 'gruvbox', name: 'Gruvbox Dark', dark: true,
    vars: palette(true, ['#282828', '#32302f', '#3c3836', '#504945'], '#504945', ['#ebdbb2', '#a89984', '#7c6f64'], ['#83a598', '#689d6a'],
      { green: '#b8bb26', red: '#fb4934', yellow: '#fabd2f', purple: '#d3869b' },
      { 'syn-keyword': '#fb4934', 'syn-string': '#b8bb26', 'syn-comment': '#928374', 'syn-number': '#d3869b', 'syn-type': '#fabd2f', 'syn-function': '#8ec07c', 'syn-property': '#83a598', 'syn-tag': '#8ec07c', 'syn-operator': '#fe8019' })
  },
  {
    id: 'monokai', name: 'Monokai', dark: true,
    vars: palette(true, ['#272822', '#1e1f1c', '#32332b', '#3e3f37'], '#3e3f37', ['#f8f8f2', '#a6a69c', '#75715e'], ['#66d9ef', '#4fb8d0'],
      { green: '#a6e22e', red: '#f92672', yellow: '#e6db74', purple: '#ae81ff' },
      { 'syn-keyword': '#f92672', 'syn-string': '#e6db74', 'syn-comment': '#75715e', 'syn-number': '#ae81ff', 'syn-type': '#66d9ef', 'syn-function': '#a6e22e', 'syn-property': '#f8f8f2', 'syn-tag': '#f92672', 'syn-operator': '#f92672' })
  },
  {
    id: 'arbor-light', name: 'Arbor Light', dark: false,
    vars: palette(false, ['#ffffff', '#f6f8fa', '#eaeef2', '#d0d7de'], '#d0d7de', ['#1f2328', '#656d76', '#8c959f'], ['#0969da', '#0550ae'],
      { green: '#1a7f37', red: '#cf222e', yellow: '#bf8700', purple: '#8250df' },
      { 'syn-keyword': '#cf222e', 'syn-string': '#0a3069', 'syn-comment': '#6e7781', 'syn-number': '#0550ae', 'syn-type': '#953800', 'syn-function': '#8250df', 'syn-property': '#0550ae', 'syn-tag': '#116329', 'syn-operator': '#cf222e' })
  },
  {
    id: 'solarized-light', name: 'Solarized Light', dark: false,
    vars: palette(false, ['#fdf6e3', '#eee8d5', '#e4ddc8', '#d3ccb7'], '#d3ccb7', ['#073642', '#586e75', '#93a1a1'], ['#268bd2', '#1f78b8'],
      { green: '#859900', red: '#dc322f', yellow: '#b58900', purple: '#6c71c4' },
      { 'syn-keyword': '#859900', 'syn-string': '#2aa198', 'syn-comment': '#93a1a1', 'syn-number': '#d33682', 'syn-type': '#b58900', 'syn-function': '#268bd2', 'syn-property': '#586e75', 'syn-tag': '#268bd2', 'syn-operator': '#859900' })
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', dark: true,
    vars: palette(true, ['#191724', '#1f1d2e', '#26233a', '#403d52'], '#403d52', ['#e0def4', '#908caa', '#6e6a86'], ['#c4a7e7', '#9ccfd8'],
      { green: '#31748f', red: '#eb6f92', yellow: '#f6c177', purple: '#c4a7e7' },
      { 'syn-keyword': '#31748f', 'syn-string': '#f6c177', 'syn-comment': '#6e6a86', 'syn-number': '#ebbcba', 'syn-type': '#9ccfd8', 'syn-function': '#ebbcba', 'syn-property': '#c4a7e7', 'syn-tag': '#eb6f92', 'syn-operator': '#908caa' })
  }
]

function load(): Theme {
  try {
    const id = localStorage.getItem(KEY)
    return THEMES.find((t) => t.id === id) ?? THEMES[0]
  } catch {
    return THEMES[0]
  }
}

let current = load()
const listeners = new Set<() => void>()

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(`--${k}`, v)
  root.dataset.theme = theme.id
  root.dataset.dark = String(theme.dark)
  root.style.colorScheme = theme.dark ? 'dark' : 'light'
  window.native?.setTitleBar(theme.vars.bg, theme.vars.fg)
}

export function setTheme(id: string): void {
  const theme = THEMES.find((t) => t.id === id)
  if (!theme || theme === current) return
  current = theme
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* storage unavailable */
  }
  applyTheme(theme)
  listeners.forEach((l) => l())
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

export function subscribeTheme(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function currentTheme(): Theme {
  return current
}
