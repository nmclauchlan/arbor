import type { Commit } from '@shared/types'

export interface GraphEdge {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  color: number
}

export interface GraphRow {
  lane: number
  color: number
  isMerge: boolean
}

export interface GraphLayout {
  rows: GraphRow[]
  edges: GraphEdge[]
  laneCount: number
}

interface Pending {
  fromRow: number
  fromLane: number
  toLane: number
  color: number
}

function firstFree(lanes: (string | null)[]): number {
  const idx = lanes.indexOf(null)
  if (idx !== -1) return idx
  lanes.push(null)
  return lanes.length - 1
}

export function layoutGraph(commits: Commit[]): GraphLayout {
  const lanes: (string | null)[] = []
  const laneColor: number[] = []
  const born = new Map<number, { row: number; lane: number }>()
  const rows: GraphRow[] = []
  const edges: GraphEdge[] = []
  let pending: Pending[] = []
  let nextColor = 0
  let laneCount = 0

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]
    let lane = lanes.indexOf(c.hash)
    if (lane === -1) {
      lane = firstFree(lanes)
      lanes[lane] = c.hash
      laneColor[lane] = nextColor++
    }
    const color = laneColor[lane]

    for (const p of pending) {
      const toLane = lanes[p.toLane] === c.hash ? lane : p.toLane
      edges.push({ fromRow: p.fromRow, fromLane: p.fromLane, toRow: i, toLane, color: p.color })
    }
    pending = []

    for (let j = 0; j < lanes.length; j++) {
      if (lanes[j] === null) continue
      const from = born.get(j) ?? { row: i - 1, lane: j }
      if (from.row < 0) continue
      const toLane = lanes[j] === c.hash ? lane : j
      edges.push({ fromRow: from.row, fromLane: from.lane, toRow: i, toLane, color: laneColor[j] })
    }
    born.clear()

    for (let j = 0; j < lanes.length; j++) {
      if (j !== lane && lanes[j] === c.hash) lanes[j] = null
    }

    const [first, ...rest] = c.parents
    if (first) {
      const existing = lanes.indexOf(first)
      if (existing !== -1 && existing !== lane) {
        lanes[lane] = null
        pending.push({ fromRow: i, fromLane: lane, toLane: existing, color })
      } else {
        lanes[lane] = first
      }
    } else {
      lanes[lane] = null
    }
    for (const p of rest) {
      const existing = lanes.indexOf(p)
      if (existing !== -1) {
        pending.push({ fromRow: i, fromLane: lane, toLane: existing, color: laneColor[existing] })
      } else {
        const nl = firstFree(lanes)
        lanes[nl] = p
        laneColor[nl] = nextColor++
        born.set(nl, { row: i, lane })
      }
    }

    rows.push({ lane, color, isMerge: c.parents.length > 1 })
    laneCount = Math.max(laneCount, lanes.length)
  }

  const last = commits.length
  for (const p of pending) {
    edges.push({ fromRow: p.fromRow, fromLane: p.fromLane, toRow: last, toLane: p.toLane, color: p.color })
  }
  for (let j = 0; j < lanes.length; j++) {
    if (lanes[j] === null) continue
    const from = born.get(j) ?? { row: last - 1, lane: j }
    if (from.row < 0) continue
    edges.push({ fromRow: from.row, fromLane: from.lane, toRow: last, toLane: j, color: laneColor[j] })
  }

  return { rows, edges, laneCount: Math.max(laneCount, 1) }
}

export const LANE_COLORS = [
  '#3e9cf0', '#e8534a', '#58c36b', '#f1a33c', '#b16df5', '#2ec4b6',
  '#f06fa8', '#c6d93b', '#ff8e5a', '#7c8cf0', '#38c9e2', '#e0c341'
]
