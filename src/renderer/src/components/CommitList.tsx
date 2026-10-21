import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Commit, Ref } from '@shared/types'
import { LANE_COLORS, layoutGraph } from '../graph/layout'
import { formatDate, shortHash, WIP_HASH } from '../util'

const ROW_H = 28
const LANE_W = 16
const MAX_LANES = 14
const OVERSCAN = 12

function RefBadge({ r, isHead }: { r: Ref; isHead: boolean }): React.JSX.Element {
  const cls = isHead ? 'branch head' : r.kind
  return (
    <span className={`ref-badge ${cls}`} title={r.name}>
      {r.kind === 'tag' ? '🏷 ' : r.kind === 'remote' ? '☁ ' : ''}
      {r.name}
    </span>
  )
}

export function CommitList({
  commits,
  selected,
  onSelect,
  onContextMenu,
  scrollTarget
}: {
  commits: Commit[]
  selected: string | null
  onSelect: (hash: string) => void
  onContextMenu: (commit: Commit, e: React.MouseEvent) => void
  scrollTarget: { hash: string; n: number } | null
}): React.JSX.Element {
  const layout = useMemo(() => layoutGraph(commits), [commits])
  const container = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState({ start: 0, end: 50 })
  const lanes = Math.min(layout.laneCount, MAX_LANES)
  const graphWidth = lanes * LANE_W + 10
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

  const cx = (lane: number): number => lane * LANE_W + LANE_W / 2 + 4
  const cy = (row: number): number => row * ROW_H + ROW_H / 2

  const headIndex = useMemo(() => commits.findIndex((c) => c.refs.some((r) => r.kind === 'head')), [commits])

  const { start, end } = range
  const visibleEdges = useMemo(
    () => layout.edges.filter((e) => e.toRow >= start && e.fromRow <= end),
    [layout.edges, start, end]
  )

  const rows: React.ReactNode[] = []
  for (let i = start; i < end; i++) {
    const c = commits[i]
    if (!c) break
    const isWip = c.hash === WIP_HASH
    const hasHead = c.refs.some((r) => r.kind === 'head')
    const headBranch = hasHead ? c.refs.find((r) => r.kind === 'branch')?.name : undefined
    rows.push(
      <div
        key={c.hash}
        data-hash={c.hash}
        className={`commit-row${selected === c.hash ? ' selected' : ''}${isWip ? ' wip' : ''}`}
        style={{ top: i * ROW_H }}
        onClick={() => onSelect(c.hash)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (!isWip) onContextMenu(c, e)
        }}
      >
        <div className="graph-space" style={{ width: graphWidth }} />
        <div className="subject">
          {c.refs
            .filter((r) => r.kind !== 'head')
            .map((r, k) => (
              <RefBadge key={k} r={r} isHead={r.kind === 'branch' && r.name === headBranch} />
            ))}
          {hasHead && !headBranch && <span className="ref-badge head">HEAD</span>}
          <span className="text" title={c.subject}>{c.subject}</span>
        </div>
        {!isWip && (
          <>
            <div className="author" title={c.email}>{c.author}</div>
            <div className="date" title={new Date(c.date).toLocaleString()}>{formatDate(c.date)}</div>
            <div className="sha">{shortHash(c.hash)}</div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="commit-list" ref={container}>
      <div className="rows" style={{ height: total * ROW_H }}>
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
            const color = LANE_COLORS[r.color % LANE_COLORS.length]
            const isWip = commits[i].hash === WIP_HASH
            const isHead = i === headIndex
            return (
              <circle
                key={i}
                cx={cx(r.lane)}
                cy={cy(i)}
                r={isHead ? 6 : r.isMerge ? 4 : 5}
                fill={isWip ? 'var(--bg)' : r.isMerge ? 'var(--bg)' : color}
                stroke={color}
                strokeWidth={isWip ? 1.5 : 2}
                strokeDasharray={isWip ? '2 2' : undefined}
              />
            )
          })}
        </svg>
        {rows}
      </div>
    </div>
  )
}
