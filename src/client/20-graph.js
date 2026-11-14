/**
 * Commit graph: lane assignment over one log page, plus the per-row SVG.
 *
 * The algorithm is the classic "expected commit per lane" walk: a lane holds
 * the hash it is waiting to draw. A commit takes the lane already waiting for
 * it, or a freed one, and leaves its first parent in place; every further
 * parent takes the lane already waiting for it or a free one. Rendering only
 * needs each row's lanes before and after the commit, so a page can be drawn
 * without the repository's complete history.
 */

/** Branch hues, stable per commit hash (not per lane index). */
const GW_GRAPH_COLORS = [
  '#5b9cf6',
  '#5fb85f',
  '#d6a04a',
  '#c76b9a',
  '#57c3c9',
  '#a98bf0',
  '#e0725e',
  '#8fbc5a',
  '#c9a3e8',
  '#79b8d1',
]

/**
 * Assign lanes for a commit page.
 * @param commits - newest-first commits, each with `hash` and `parents`.
 * @returns the per-row lane data and the widest lane count.
 */
function gwBuildGraph(commits) {
  const waiting = []
  const colorByHash = new Map()
  let colorCursor = 0
  const colorFor = (hash) => {
    if (hash === undefined) return undefined
    let color = colorByHash.get(hash)
    if (color === undefined) {
      color = GW_GRAPH_COLORS[colorCursor % GW_GRAPH_COLORS.length]
      colorCursor += 1
      colorByHash.set(hash, color)
    }
    return color
  }
  const rows = []
  let lanes = 1
  for (const commit of commits) {
    let lane = waiting.indexOf(commit.hash)
    if (lane < 0) {
      lane = waiting.indexOf(undefined)
      if (lane < 0) lane = waiting.length
    }
    const before = waiting.slice()
    const beforeColors = before.map((hash) => colorFor(hash))
    const color = colorFor(commit.hash)
    const parents = Array.isArray(commit.parents) ? commit.parents : []
    waiting[lane] = parents[0]
    if (parents[0] !== undefined) colorFor(parents[0])
    for (let index = 1; index < parents.length; index += 1) {
      if (waiting.indexOf(parents[index]) >= 0) continue
      let slot = waiting.indexOf(undefined)
      if (slot < 0) slot = waiting.length
      waiting[slot] = parents[index]
      colorFor(parents[index])
    }
    const seen = new Map()
    for (let index = 0; index < waiting.length; index += 1) {
      const hash = waiting[index]
      if (hash === undefined) continue
      if (seen.has(hash)) waiting[index] = undefined
      else seen.set(hash, index)
    }
    while (waiting.length > 0 && waiting[waiting.length - 1] === undefined) waiting.pop()
    const after = waiting.slice()
    const afterColors = after.map((hash) => colorFor(hash))
    const parentLanes = []
    for (const parent of parents) {
      const slot = after.indexOf(parent)
      if (slot >= 0) parentLanes.push(slot)
    }
    lanes = Math.max(lanes, lane + 1, before.length, after.length)
    rows.push({ hash: commit.hash, lane, before, beforeColors, after, afterColors, parentLanes, color })
  }
  return { rows, lanes }
}

/** One commit's graph cell. */
function GwGraphCell({ row, lanes }) {
  const step = 13
  const pad = 7
  const height = 24
  const middle = 12
  const x = (lane) => pad + lane * step
  const width = Math.max(lanes * step + pad, 26)
  const children = []
  const push = (element) => children.push(element)
  row.before.forEach((hash, lane) => {
    if (hash === undefined) return
    push(h('line', {
      key: `b${lane}`,
      x1: x(lane),
      y1: 0,
      x2: x(lane),
      y2: middle,
      stroke: row.beforeColors[lane] ?? row.color,
      strokeWidth: 2,
      strokeLinecap: 'round',
    }))
  })
  row.after.forEach((hash, lane) => {
    if (hash === undefined) return
    push(h('line', {
      key: `a${lane}`,
      x1: x(lane),
      y1: middle,
      x2: x(lane),
      y2: height,
      stroke: row.afterColors[lane] ?? row.color,
      strokeWidth: 2,
      strokeLinecap: 'round',
    }))
  })
  row.parentLanes.forEach((lane, index) => {
    if (lane === row.lane) return
    push(h('line', {
      key: `p${index}`,
      x1: x(row.lane),
      y1: middle,
      x2: x(lane),
      y2: height,
      stroke: row.color,
      strokeWidth: 2,
      strokeLinecap: 'round',
    }))
  })
  push(h('circle', {
    key: 'dot',
    cx: x(row.lane),
    cy: middle,
    r: 4,
    fill: row.color,
    stroke: 'var(--dsw-alias-bg-base, #1e1f22)',
    strokeWidth: 1.5,
  }))
  return h('svg', {
    className: 'gw-graph',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    'aria-hidden': true,
  }, children)
}
