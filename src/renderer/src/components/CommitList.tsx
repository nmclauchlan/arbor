import { useEffect, useMemo, useRef } from 'react'
import type { Commit, Ref } from '@shared/types'
import { LANE_COLORS, layoutGraph } from '../graph/layout'
import { formatDate, shortHash, WIP_HASH } from '../util'

const ROW_H = 28
const LANE_W = 16
const MAX_LANES = 14

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
  const lanes = Math.min(layout.laneCount, MAX_LANES)
  const graphWidth = lanes * LANE_W + 10

  useEffect(() => {
    if (!scrollTarget || !container.current) return
    const el = container.current.querySelector<HTMLElement>(`[data-hash="${scrollTarget.hash}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [scrollTarget])

  const cx = (lane: number): number => lane * LANE_W + LANE_W / 2 + 4
  const cy = (row: number): number => row * ROW_H + ROW_H / 2

  const headIndex = commits.findIndex((c) => c.refs.some((r) => r.kind === 'head'))

  return (
    <div className="commit-list" ref={container}>
      <div className="rows" style={{ height: commits.length * ROW_H }}>
        <svg className="graph" width={graphWidth} height={commits.length * ROW_H}>
          {layout.edges.map((e, i) => {
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
                key={i}
                d={d}
                stroke={color}
                strokeWidth={2}
                fill="none"
                strokeDasharray={dashed ? '3 3' : undefined}
              />
            )
          })}
          {layout.rows.map((r, i) => {
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
        {commits.map((c) => {
          const isWip = c.hash === WIP_HASH
          const hasHead = c.refs.some((r) => r.kind === 'head')
          const headBranch = hasHead ? c.refs.find((r) => r.kind === 'branch')?.name : undefined
          return (
            <div
              key={c.hash}
              data-hash={c.hash}
              className={`commit-row${selected === c.hash ? ' selected' : ''}${isWip ? ' wip' : ''}`}
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
                  .map((r, i) => (
                    <RefBadge key={i} r={r} isHead={r.kind === 'branch' && r.name === headBranch} />
                  ))}
                {hasHead && !headBranch && (
                  <span className="ref-badge head">HEAD</span>
                )}
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
        })}
      </div>
    </div>
  )
}
