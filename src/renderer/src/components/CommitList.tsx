import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Commit, CommitBuild, Ref } from '@shared/types'
import { LANE_COLORS, layoutGraph } from '../graph/layout'
import { formatDate, shortHash, WIP_HASH } from '../util'
import { resetColumns, resetLayout, setColumnHidden, setLayout, useHiddenColumns, useLayout, type Layout } from '../layout'
import { useSettings } from '../settings'
import { Avatar } from '../avatars'
import { Loading } from './Spinner'
import { BuildMarker } from './BuildStatus'
import type { MenuItem } from './ContextMenu'

const ROW_H = 28
const MAX_LANES = 14
const OVERSCAN = 12
const NODE = 22
const GAP = 8
const AUTO_LANES = 6

type ColKey = 'colRefs' | 'colGraph' | 'colAuthor' | 'colDate' | 'colSha'

interface RefGroup {
  key: string
  name: string
  kind: 'branch' | 'remote' | 'tag' | 'detached'
  local: boolean
  remotes: string[]
  isHead: boolean
}

function groupRefs(refs: Ref[]): RefGroup[] {
  const headIdx = refs.findIndex((r) => r.kind === 'head')
  const headBranch = headIdx !== -1 && refs[headIdx + 1]?.kind === 'branch' ? refs[headIdx + 1].name : null
  const remotes = refs
    .filter((r) => r.kind === 'remote')
    .map((r) => {
      const slash = r.name.indexOf('/')
      return { remote: r.name.slice(0, slash), short: r.name.slice(slash + 1), full: r.name }
    })
    .filter((r) => r.short !== 'HEAD')
  const used = new Set<string>()
  const groups: RefGroup[] = []
  for (const r of refs) {
    if (r.kind !== 'branch') continue
    const matching = remotes.filter((x) => x.short === r.name)
    matching.forEach((x) => used.add(x.full))
    groups.push({ key: 'b:' + r.name, name: r.name, kind: 'branch', local: true, remotes: matching.map((x) => x.remote), isHead: r.name === headBranch })
  }
  const remoteOnly = new Map<string, string[]>()
  for (const x of remotes) {
    if (used.has(x.full)) continue
    remoteOnly.set(x.short, [...(remoteOnly.get(x.short) ?? []), x.remote])
  }
  for (const [short, list] of remoteOnly) {
    groups.push({ key: 'r:' + short, name: short, kind: 'remote', local: false, remotes: list, isHead: false })
  }
  for (const r of refs) if (r.kind === 'tag') groups.push({ key: 't:' + r.name, name: r.name, kind: 'tag', local: false, remotes: [], isHead: false })
  if (headIdx !== -1 && !headBranch) groups.unshift({ key: 'HEAD', name: 'HEAD', kind: 'detached', local: true, remotes: [], isHead: true })
  groups.sort((a, b) => Number(b.isHead) - Number(a.isHead))
  return groups
}

function refTitle(g: RefGroup): string {
  if (g.kind === 'tag') return `Tag ${g.name}`
  if (g.kind === 'detached') return 'HEAD (detached)'
  const where = [g.local ? 'local' : '', ...g.remotes.map((r) => `${r}/${g.name}`)].filter(Boolean)
  return `${g.name}${g.isHead ? ' (checked out)' : ''}\n${where.join(', ')}`
}

const LaptopIcon = (): React.JSX.Element => (
  <svg className="ref-icon" viewBox="0 0 16 16" aria-label="local" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <rect x="3" y="3.5" width="10" height="7" rx="1" />
    <path d="M1.5 12.5h13" strokeLinecap="round" />
  </svg>
)

const CloudIcon = (): React.JSX.Element => (
  <svg className="ref-icon" viewBox="0 0 16 16" aria-label="remote" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M4.5 12.5h7a3 3 0 0 0 .4-5.97A4 4 0 0 0 4.2 7.6 2.5 2.5 0 0 0 4.5 12.5Z" />
  </svg>
)

const TagIcon = (): React.JSX.Element => (
  <svg className="ref-icon" viewBox="0 0 16 16" aria-label="tag" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M2.5 2.5h5l6 6-5 5-6-6Z" />
    <circle cx="5.5" cy="5.5" r="1" />
  </svg>
)

function RefPill({ g }: { g: RefGroup }): React.JSX.Element {
  const cls = g.isHead ? 'branch head' : g.kind === 'detached' ? 'head' : g.kind
  return (
    <span
      className={`ref-badge ${cls}`}
      title={refTitle(g)}
      data-ref-kind={g.kind === 'detached' ? undefined : g.kind === 'branch' ? 'branch' : g.kind === 'remote' ? 'remote' : 'tag'}
      data-ref-name={g.kind === 'remote' ? `${g.remotes[0]}/${g.name}` : g.name}
    >
      {g.kind === 'tag' && <TagIcon />}
      <span className="ref-name">{g.name}</span>
      {g.kind !== 'tag' && g.kind !== 'detached' && (
        <span className="ref-icons">
          {g.local && <LaptopIcon />}
          {g.remotes.length > 0 && <CloudIcon />}
        </span>
      )}
    </span>
  )
}

function RefsCell({ refs, width }: { refs: Ref[]; width: number }): React.JSX.Element {
  const groups = useMemo(() => groupRefs(refs), [refs])
  return (
    <div className="refs-cell" style={{ width }}>
      {groups.length > 0 && (
        <>
          <RefPill g={groups[0]} />
          {groups.length > 1 && (
            <>
              <span className="ref-more">+{groups.length - 1}</span>
              <div className="refs-pop">
                {groups.map((g) => (
                  <RefPill key={g.key} g={g} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

const MIN_MESSAGE = 120
const MESSAGE_SHARE = 0.35
const COLUMN_LABELS: Record<ColKey, string> = { colRefs: 'Branch / Tag', colGraph: 'Graph', colAuthor: 'Author', colDate: 'Date', colSha: 'SHA' }

function messageRoom(header: Element | null | undefined): number {
  const message = header?.querySelector<HTMLElement>('.hcell.subject')
  if (!header || !message) return 0
  return message.offsetWidth - Math.max(MIN_MESSAGE, MESSAGE_SHARE * (header as HTMLElement).clientWidth)
}
const FIT_SLACK = 6
const COLS: ColKey[] = ['colRefs', 'colGraph', 'colAuthor', 'colDate', 'colSha']

let measureCtx: CanvasRenderingContext2D | null = null

function fontOf(style: CSSStyleDeclaration): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
}

function textWidth(text: string, font: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return 0
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

function labelWidth(cell: HTMLElement): number {
  const style = getComputedStyle(cell)
  let width = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  for (const node of cell.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    width += range.getBoundingClientRect().width
  }
  return width
}

function refsWidth(cell: HTMLElement): number {
  const style = getComputedStyle(cell)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  let width = padding
  let first = 0
  let items = 0
  for (const child of cell.children) {
    const el = child as HTMLElement
    const cs = getComputedStyle(el)
    if (cs.position === 'absolute' || cs.display === 'none') continue
    const name = el.querySelector<HTMLElement>('.ref-name')
    const natural = el.offsetWidth + (name ? textWidth(name.textContent ?? '', fontOf(getComputedStyle(name))) - name.clientWidth : 0)
    if (!items) first = natural
    width += natural
    items++
  }
  width += Math.max(0, items - 1) * (parseFloat(style.columnGap) || 0)
  return items > 1 ? Math.max(width, padding + first + 34) : width
}

function ColHandle({ col, width, side, onFit }: { col: ColKey; width: number; side: 'left' | 'right'; onFit: (col: ColKey) => void }): React.JSX.Element {
  return (
    <span
      className={`col-resize ${side}`}
      title="Drag to resize, double-click to fit the content"
      onDoubleClick={(e) => {
        e.stopPropagation()
        onFit(col)
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const origin = e.clientX
        const base = Math.round(e.currentTarget.parentElement?.getBoundingClientRect().width ?? width)
        const room = Math.max(0, messageRoom(e.currentTarget.closest('.commit-header')))
        let next = base
        let frame = 0
        document.body.style.cursor = 'col-resize'
        document.body.classList.add('resizing')
        const move = (ev: MouseEvent): void => {
          const dx = ev.clientX - origin
          next = Math.min(side === 'right' ? base + dx : base - dx, base + room)
          if (!frame) {
            frame = requestAnimationFrame(() => {
              frame = 0
              setLayout(col, next, false)
            })
          }
        }
        const up = (): void => {
          if (frame) cancelAnimationFrame(frame)
          setLayout(col, next)
          document.body.style.cursor = ''
          document.body.classList.remove('resizing')
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }}
    />
  )
}

function Header({
  graphCol,
  cols,
  shown,
  onFit,
  onMenu
}: {
  graphCol: number
  cols: Layout
  shown: (col: ColKey) => boolean
  onFit: (col: ColKey) => void
  onMenu: (e: React.MouseEvent) => void
}): React.JSX.Element {
  return (
    <div className="commit-header" onContextMenu={onMenu}>
      {shown('colRefs') && (
        <div className="hcell refs" data-col="colRefs" style={{ width: cols.colRefs }}>
          Branch / Tag
          <ColHandle col="colRefs" width={cols.colRefs} side="right" onFit={onFit} />
        </div>
      )}
      {shown('colGraph') && (
        <div className="hcell graph" data-col="colGraph" style={{ width: graphCol }}>
          Graph
          <ColHandle col="colGraph" width={graphCol} side="right" onFit={onFit} />
        </div>
      )}
      <div className="hcell subject">Message</div>
      {shown('colAuthor') && (
        <div className="hcell" data-col="colAuthor" style={{ width: cols.colAuthor }}>
          <ColHandle col="colAuthor" width={cols.colAuthor} side="left" onFit={onFit} />
          Author
        </div>
      )}
      {shown('colDate') && (
        <div className="hcell" data-col="colDate" style={{ width: cols.colDate }}>
          <ColHandle col="colDate" width={cols.colDate} side="left" onFit={onFit} />
          Date
        </div>
      )}
      {shown('colSha') && (
        <div className="hcell" data-col="colSha" style={{ width: cols.colSha }}>
          <ColHandle col="colSha" width={cols.colSha} side="left" onFit={onFit} />
          SHA
        </div>
      )}
    </div>
  )
}

export function CommitList({
  commits,
  selected,
  onSelect,
  onContextMenu,
  scrollTarget,
  loading = false,
  filterNote,
  builds,
  onHeaderMenu
}: {
  commits: Commit[]
  selected: string | null
  onSelect: (hash: string) => void
  onContextMenu: (commit: Commit, e: React.MouseEvent, focus?: { kind: 'branch' | 'remote' | 'tag'; name: string } | null) => void
  filterNote?: React.ReactNode
  scrollTarget: { hash: string; n: number } | null
  loading?: boolean
  builds?: Record<string, CommitBuild[]>
  onHeaderMenu?: (e: React.MouseEvent, items: MenuItem[]) => void
}): React.JSX.Element {
  const layout = useMemo(() => layoutGraph(commits), [commits])
  const container = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: 50 })
  const cols = useLayout()
  const hiddenCols = useHiddenColumns()
  const shown = (col: ColKey): boolean => !hiddenCols.includes(col)
  const { showAvatars, showBodyPreview } = useSettings()
  const laneW = showAvatars ? 24 : 16
  const lanes = Math.min(layout.laneCount, MAX_LANES)
  const graphWidth = lanes * laneW + 10
  const graphCol = cols.colGraph || Math.max(Math.min(lanes, AUTO_LANES) * laneW + 10, 60)
  const total = commits.length

  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    let frame = 0
    const update = (): void => {
      frame = 0
      const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - OVERSCAN)
      const end = Math.min(total, Math.ceil((el.scrollTop + el.clientHeight) / ROW_H) + OVERSCAN)
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }))
    }
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [total])

  useEffect(() => {
    if (!scrollTarget || !container.current) return
    const idx = commits.findIndex((c) => c.hash === scrollTarget.hash)
    if (idx === -1) return
    const el = container.current
    el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2 + ROW_H / 2)
  }, [scrollTarget, commits])

  const cx = (lane: number): number => lane * laneW + laneW / 2 + 4
  const cy = (row: number): number => row * ROW_H + ROW_H / 2

  const headIndex = useMemo(() => commits.findIndex((c) => c.refs.some((r) => r.kind === 'head')), [commits])

  const { start, end } = range
  const visibleEdges = useMemo(
    () => layout.edges.filter((e) => e.toRow >= start && e.fromRow <= end),
    [layout.edges, start, end]
  )

  const fitWidth = (col: ColKey): number => {
    const root = listRef.current
    if (!root) return cols[col]
    const head = root.querySelector<HTMLElement>(`.commit-header .hcell[data-col="${col}"]`)
    let width = head ? labelWidth(head) : 0
    if (col === 'colGraph') return Math.max(width, graphWidth)
    if (col === 'colRefs') {
      for (const cell of root.querySelectorAll<HTMLElement>('.commit-row .refs-cell')) width = Math.max(width, refsWidth(cell))
      return width
    }
    const cls = col === 'colAuthor' ? 'author' : col === 'colDate' ? 'date' : 'sha'
    const sample = root.querySelector<HTMLElement>(`.commit-row .${cls}`)
    if (!sample) return width
    const style = getComputedStyle(sample)
    const font = fontOf(style)
    const values = new Set(
      commits.filter((c) => c.hash !== WIP_HASH).map((c) => (col === 'colAuthor' ? c.author : col === 'colDate' ? formatDate(c.date) : shortHash(c.hash)))
    )
    for (const v of values) width = Math.max(width, textWidth(v, font) + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight))
    return width
  }

  const fitColumns = (list: ColKey[]): void => {
    const header = listRef.current?.querySelector('.commit-header')
    let room = messageRoom(header)
    const targets = list.map((c) => {
      const cell = header?.querySelector<HTMLElement>(`.hcell[data-col="${c}"]`)
      const from = Math.round(cell?.getBoundingClientRect().width ?? (c === 'colGraph' ? graphCol : cols[c]))
      return { c, from, to: Math.ceil(fitWidth(c)) + FIT_SLACK }
    })
    for (const t of targets) if (t.to < t.from) room += t.from - t.to
    for (const t of targets) {
      if (t.to > t.from) {
        const grow = Math.min(t.to - t.from, Math.max(0, room))
        room -= grow
        t.to = t.from + grow
      }
      setLayout(t.c, t.to)
    }
  }

  const rows: React.ReactNode[] = []
  const nodes: React.ReactNode[] = []
  for (let i = start; i < end; i++) {
    const c = commits[i]
    if (!c) break
    const isWip = c.hash === WIP_HASH
    rows.push(
      <div
        key={c.hash}
        data-hash={c.hash}
        className={`commit-row${selected === c.hash ? ' selected' : ''}${isWip ? ' wip' : ''}`}
        style={{ top: i * ROW_H }}
        onClick={() => onSelect(c.hash)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (isWip) return
          const pill = (e.target as HTMLElement).closest<HTMLElement>('[data-ref-kind]')
          const focus = pill ? { kind: pill.dataset.refKind as 'branch' | 'remote' | 'tag', name: pill.dataset.refName! } : null
          onContextMenu(c, e, focus)
        }}
      >
        {shown('colRefs') && <RefsCell refs={c.refs} width={cols.colRefs} />}
        {shown('colGraph') && <div className="graph-space" style={{ width: graphCol }} />}
        <div className="subject">
          {builds?.[c.hash] && <BuildMarker builds={builds[c.hash]} />}
          <span className="text" title={c.subject}>{c.subject}</span>
          {showBodyPreview && c.body && !isWip && (
            <span className="body-preview" title={c.body}>
              {c.body}
            </span>
          )}
        </div>
        {!isWip && (
          <>
            {shown('colAuthor') && <div className="author" style={{ width: cols.colAuthor }} title={`${c.author} <${c.email}>`}>{c.author}</div>}
            {shown('colDate') && <div className="date" style={{ width: cols.colDate }} title={new Date(c.date).toLocaleString()}>{formatDate(c.date)}</div>}
            {shown('colSha') && <div className="sha" style={{ width: cols.colSha }}>{shortHash(c.hash)}</div>}
          </>
        )}
      </div>
    )
    const r = layout.rows[i]
    if (showAvatars && r && r.lane < MAX_LANES && !isWip && !r.isMerge) {
      nodes.push(
        <div
          key={'n' + c.hash}
          className={`graph-node${i === headIndex ? ' head' : ''}`}
          style={{
            left: cx(r.lane) - NODE / 2,
            top: cy(i) - NODE / 2,
            borderColor: LANE_COLORS[r.color % LANE_COLORS.length],
            color: LANE_COLORS[r.color % LANE_COLORS.length]
          }}
        >
          <Avatar email={c.email} name={c.author} enabled={showAvatars} />
        </div>
      )
    }
  }

  return (
    <div className="commit-list" ref={listRef}>
      <Header
        graphCol={graphCol}
        cols={cols}
        shown={shown}
        onFit={(col) => fitColumns([col])}
        onMenu={(e) => {
          if (!onHeaderMenu) return
          e.preventDefault()
          const toggle = (c: ColKey): MenuItem => ({ label: COLUMN_LABELS[c], checked: shown(c), onClick: () => setColumnHidden(c, shown(c)) })
          onHeaderMenu(e, [
            toggle('colRefs'),
            toggle('colGraph'),
            { label: 'Message', checked: true, disabled: true },
            toggle('colAuthor'),
            toggle('colDate'),
            toggle('colSha'),
            { separator: true },
            { label: 'Fit all columns to content', onClick: () => fitColumns(COLS.filter(shown)) },
            {
              label: 'Reset columns',
              onClick: () => {
                COLS.forEach((c) => resetLayout(c))
                resetColumns()
              }
            }
          ])
        }}
      />
      {filterNote}
      <div className="commit-scroll" ref={container}>
        {loading && total === 0 && <Loading label="Loading history…" />}
        <div className="rows" style={{ height: total * ROW_H }}>
          {shown('colGraph') && (
          <div className="graph-clip" style={{ left: shown('colRefs') ? cols.colRefs + GAP : 0, width: graphCol, height: total * ROW_H }}>
            <svg className="graph" width={graphWidth} height={total * ROW_H}>
              {visibleEdges.map((e, i) => {
                if (e.fromLane >= MAX_LANES && e.toLane >= MAX_LANES) return null
                const x1 = cx(Math.min(e.fromLane, MAX_LANES - 1))
                const y1 = cy(e.fromRow)
                const x2 = cx(Math.min(e.toLane, MAX_LANES - 1))
                const y2 = cy(e.toRow)
                const color = LANE_COLORS[e.color % LANE_COLORS.length]
                const dashed = e.fromRow === 0 && commits[0]?.hash === WIP_HASH
                const d =
                  x1 === x2
                    ? `M${x1},${y1} L${x2},${y2}`
                    : `M${x1},${y1} C${x1},${y1 + ROW_H * 0.6} ${x2},${y2 - ROW_H * 0.6} ${x2},${y2}`
                return (
                  <path
                    key={`${e.fromRow}-${e.fromLane}-${e.toRow}-${e.toLane}-${i}`}
                    d={d}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray={dashed ? '3 3' : undefined}
                  />
                )
              })}
              {layout.rows.slice(start, end).map((r, k) => {
                const i = start + k
                if (r.lane >= MAX_LANES) return null
                const isWip = commits[i].hash === WIP_HASH
                if (showAvatars && !isWip && !r.isMerge) return null
                const color = LANE_COLORS[r.color % LANE_COLORS.length]
                const isHead = i === headIndex
                return (
                  <circle
                    key={i}
                    cx={cx(r.lane)}
                    cy={cy(i)}
                    r={isWip ? (showAvatars ? 8 : 5) : isHead ? 6 : r.isMerge ? (showAvatars ? 5 : 4) : 5}
                    fill={isWip || r.isMerge ? 'var(--bg)' : color}
                    stroke={color}
                    strokeWidth={isWip ? 1.5 : 2}
                    strokeDasharray={isWip ? '2 2' : undefined}
                  />
                )
              })}
            </svg>
            {nodes}
          </div>
          )}
          {rows}
        </div>
      </div>
    </div>
  )
}
