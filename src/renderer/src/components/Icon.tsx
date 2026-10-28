const dot = (cx: number, cy: number, r = 1): React.JSX.Element => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />

const ICONS = {
  folder: <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />,
  undo: <path d="M6 3.5 3 6.5l3 3M3 6.5h6.5a3.5 3.5 0 0 1 0 7H7" />,
  redo: <path d="m10 3.5 3 3-3 3M13 6.5H6.5a3.5 3.5 0 0 0 0 7H9" />,
  fetch: (
    <path d="M2.5 8A5.5 5.5 0 0 1 8 2.5a6 6 0 0 1 4.1 1.7l1.4 1.3M13.5 2.5v3h-3M13.5 8A5.5 5.5 0 0 1 8 13.5a6 6 0 0 1-4.1-1.7l-1.4-1.3M5.5 10.5h-3v3" />
  ),
  pull: <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />,
  push: <path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13.5h10" />,
  branch: (
    <>
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="5" r="1.5" />
      <path d="M4.5 5v6M11.5 6.5c0 3-7 1.5-7 4.5" />
    </>
  ),
  merge: (
    <>
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="9" r="1.5" />
      <path d="M4.5 5v6M4.5 5c0 3.5 3 4 5.5 4" />
    </>
  ),
  rebase: (
    <>
      <circle cx="4" cy="12.5" r="1.5" />
      <path d="M4 11V8.5a4 4 0 0 1 4-4h4.5M10 2l2.5 2.5L10 7" />
    </>
  ),
  pr: (
    <>
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="4" cy="12.5" r="1.5" />
      <circle cx="12" cy="12.5" r="1.5" />
      <path d="M4 5v6M12 11V6.5a2 2 0 0 0-2-2H7M8.5 3 7 4.5 8.5 6" />
    </>
  ),
  stash: <path d="M2.5 9v3.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9M8 2.5v7M5 6.5l3 3 3-3" />,
  pop: <path d="M2.5 9v3.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9M8 9.5v-7M5 5.5l3-3 3 3" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </>
  ),
  chevronDown: <path d="m4 6 4 4 4-4" />,
  chevronUp: <path d="m4 10 4-4 4 4" />,
  chevronRight: <path d="m6 4 4 4-4 4" />,
  edit: <path d="m10.5 2.5 3 3L6 13H3v-3z" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  swap: <path d="M3 5.5h10M10.5 3 13 5.5 10.5 8M13 10.5H3M5.5 8 3 10.5 5.5 13" />,
  tag: (
    <>
      <path d="M2.5 2.5h5l6 6-5 5-6-6z" />
      {dot(5.25, 5.25, 0.9)}
    </>
  ),
  cloud: <path d="M4.5 12.5h7a2.75 2.75 0 0 0 .4-5.47A4 4 0 0 0 4.2 7.6a2.5 2.5 0 0 0 .3 4.9z" />,
  check: <path d="m3 8.5 3.5 3.5L13 4.5" />,
  settings: (
    <>
      <circle cx="8" cy="8" r="4" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </>
  ),
  theme: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2 14.5 13.5h-13zM8 6.5v3.5" />
      {dot(8, 11.9, 0.8)}
    </>
  ),
  conflict: <path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" />,
  more: (
    <>
      {dot(3.5, 8)}
      {dot(8, 8)}
      {dot(12.5, 8)}
    </>
  ),
  grip: (
    <>
      {dot(6, 4)}
      {dot(10, 4)}
      {dot(6, 8)}
      {dot(10, 8)}
      {dot(6, 12)}
      {dot(10, 12)}
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
      <path d="M3.5 10.5H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v.5" />
    </>
  ),
  trash: <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4.5" />,
  cherry: (
    <>
      <circle cx="4.5" cy="11.5" r="2.5" />
      <circle cx="11.5" cy="11.5" r="2.5" />
      <path d="M4.5 9c1-4 3-6 5.5-7M11.5 9c0-3-.7-5-1.5-7" />
    </>
  ),
  reset: <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2.5 5.5M2.5 2.5v3h3" />,
  fastForward: <path d="m2.5 4 4.5 4-4.5 4zM8.5 4 13 8l-4.5 4z" />,
  checkout: <path d="M2.5 8h8M7.5 4.5 11 8l-3.5 3.5M13.5 3v10" />,
  compare: (
    <>
      <rect x="1.5" y="2.5" width="5.5" height="11" rx="1" />
      <rect x="9" y="2.5" width="5.5" height="11" rx="1" />
    </>
  ),
  squash: <path d="m4 2.5 4 4 4-4M4 13.5l4-4 4 4" />,
  file: <path d="M4 1.5h5l3.5 3.5v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM9 1.5V5h3.5" />,
  eye: (
    <>
      <path d="M1.5 8S4 3 8 3s6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  eyeOff: <path d="M1.5 8S4 3 8 3s6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5zM2.5 2.5l11 11" />,
  link: <path d="m6.5 9.5 3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" />,
  star: <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />,
  starFilled: <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="currentColor" />,
  external: <path d="M9 2.5h4.5V7M13.5 2.5l-6 6M12 9.5v4H2.5V4h4" />
} satisfies Record<string, React.JSX.Element>

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }): React.JSX.Element {
  return (
    <svg
      className={className ? `icon-svg ${className}` : 'icon-svg'}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  )
}
