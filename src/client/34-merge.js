/**
 * The conflict surface: parsing a conflicted file into bands, and the
 * IDEA-shaped merge window that resolves them.
 *
 * A merged working file is one ordered list of segments — plain text the merge
 * already reconciled, and conflict blocks that carry the two sides. The window
 * aligns the three columns per BAND (its own block of text / Conflict N), which
 * is the same granularity the IDE aligns on: inside a band each column keeps
 * its own lines and numbers, and every column is padded to the tallest one.
 */

/** Marker labels the merge wrote: `<<<<<<< ours`, `=======`, `>>>>>>> theirs`. */
const GW_CONFLICT_START = '<<<<<<<'
const GW_CONFLICT_MIDDLE = '======='
const GW_CONFLICT_END = '>>>>>>>'

/**
 * Split a merged file into text and conflict segments.
 * @param text - the working file as the merge left it.
 * @returns ordered segments; conflict ones carry both sides.
 */
function gwParseConflictMarkers(text) {
  const lines = String(text ?? '').split('\n')
  const segments = []
  let buffer = []
  const flush = () => {
    if (buffer.length === 0) return
    segments.push({ kind: 'text', lines: buffer })
    buffer = []
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.startsWith(GW_CONFLICT_START)) {
      flush()
      const ours = []
      const theirs = []
      let cursor = index + 1
      while (cursor < lines.length && !lines[cursor].startsWith(GW_CONFLICT_MIDDLE)) {
        ours.push(lines[cursor])
        cursor += 1
      }
      cursor += 1
      while (cursor < lines.length && !lines[cursor].startsWith(GW_CONFLICT_END)) {
        theirs.push(lines[cursor])
        cursor += 1
      }
      segments.push({ kind: 'conflict', ours, theirs })
      index = cursor
      continue
    }
    buffer.push(line)
  }
  flush()
  return segments
}

/**
 * Locate one conflict block inside a full file's lines, searching forward from
 * a cursor so two identical blocks resolve to their own occurrences.
 * @returns the half-open range, or the cursor position when it is not found.
 */
function gwFindBlock(lines, block, from) {
  if (block.length === 0) return [from, from]
  for (let start = from; start + block.length <= lines.length; start += 1) {
    let match = true
    for (let offset = 0; offset < block.length; offset += 1) {
      if (lines[start + offset] !== block[offset]) {
        match = false
        break
      }
    }
    if (match) return [start, start + block.length]
  }
  return [from, Math.min(from + block.length, lines.length)]
}

/** Numbered lines for one pane slice. */
function gwNumbered(lines, from, to) {
  const out = []
  for (let index = from; index < to; index += 1) out.push({ text: lines[index], no: index + 1 })
  return out
}

/**
 * Build the whole merge view for one conflicted file.
 *
 * Two passes: first locate every conflict block inside each side's file (so a
 * side's text band is exactly what lies between two conflicts, never a guess),
 * then emit bands whose three columns each keep their own numbered lines. The
 * conflict bands are what align the columns; a text band pads the shorter side.
 *
 * @param file - host payload: path, status, ours, theirs, base, worktree.
 * @param choices - per-conflict choice (`null`, `'ours'`, `'theirs'`).
 * @returns the columns, bands and the pending result.
 */
function gwMergeView(file, choices) {
  if (file !== undefined && file !== null && file.binary === true) {
    return { file, binary: true, bands: [], conflicts: [], unresolved: 1, oursLines: [], theirsLines: [] }
  }
  const oursLines = String(file.ours ?? '').split('\n')
  const theirsLines = String(file.theirs ?? '').split('\n')
  const segments = gwParseConflictMarkers(file.worktree)
  const conflictSegments = segments.filter((segment) => segment.kind === 'conflict')
  const picked = Array.isArray(choices) ? choices.slice() : []
  while (picked.length < conflictSegments.length) picked.push(null)

  // A file without markers (added on both sides, or deleted on one) still needs
  // a decision: present the whole file as one conflict.
  if (conflictSegments.length === 0) {
    segments.length = 0
    segments.push({ kind: 'conflict', ours: oursLines.slice(), theirs: theirsLines.slice() })
    conflictSegments.push(segments[0])
    picked.length = 0
    picked.push(null)
  }

  // Pass 1: where each conflict block sits in each side.
  const ranges = []
  let oursCursor = 0
  let theirsCursor = 0
  for (const segment of conflictSegments) {
    const oursRange = gwFindBlock(oursLines, segment.ours, oursCursor)
    const theirsRange = gwFindBlock(theirsLines, segment.theirs, theirsCursor)
    ranges.push({ oursStart: oursRange[0], oursEnd: oursRange[1], theirsStart: theirsRange[0], theirsEnd: theirsRange[1] })
    oursCursor = oursRange[1]
    theirsCursor = theirsRange[1]
  }

  // Pass 2: bands, with each side's text extent taken from the next conflict.
  const bands = []
  let conflictIndex = 0
  let oursFrom = 0
  let theirsFrom = 0
  for (const segment of segments) {
    if (segment.kind === 'text') {
      const range = ranges[conflictIndex]
      const oursTo = range === undefined ? oursLines.length : range.oursStart
      const theirsTo = range === undefined ? theirsLines.length : range.theirsStart
      bands.push({
        kind: 'text',
        ours: gwNumbered(oursLines, oursFrom, Math.max(oursFrom, oursTo)),
        theirs: gwNumbered(theirsLines, theirsFrom, Math.max(theirsFrom, theirsTo)),
        result: segment.lines.map((line) => ({ text: line })),
      })
      oursFrom = Math.max(oursFrom, oursTo)
      theirsFrom = Math.max(theirsFrom, theirsTo)
      continue
    }
    const range = ranges[conflictIndex]
    bands.push({
      kind: 'conflict',
      id: conflictIndex,
      ours: gwNumbered(oursLines, range.oursStart, range.oursEnd),
      theirs: gwNumbered(theirsLines, range.theirsStart, range.theirsEnd),
      oursText: segment.ours,
      theirsText: segment.theirs,
      choice: picked[conflictIndex] ?? null,
    })
    oursFrom = range.oursEnd
    theirsFrom = range.theirsEnd
    conflictIndex += 1
  }

  const conflicts = bands.filter((band) => band.kind === 'conflict')
  const unresolved = conflicts.filter((band) => band.choice === null).length
  let resultNo = 1
  for (const band of bands) {
    if (band.kind === 'text') {
      band.result = band.result.map((line) => ({ text: line.text, no: resultNo++ }))
      continue
    }
    const lines = band.choice === 'theirs' ? band.theirsText : band.oursText
    band.result = lines.map((text) => ({ text, no: resultNo++ }))
  }
  return { file, bands, conflicts, unresolved, oursLines, theirsLines }
}

/** Join the resolved bands into the file content that will be written back. */
function gwMergeContent(view) {
  const lines = []
  for (const band of view.bands) {
    if (band.kind === 'text') {
      band.ours.forEach((line) => lines.push(line.text))
      continue
    }
    const chosen = band.choice === 'theirs' ? band.theirsText : band.oursText
    chosen.forEach((line) => lines.push(line))
  }
  return lines.join('\n')
}

/** Prev/next conflict within the window. */
function gwStepConflict(store, delta) {
  const merge = store.getState().merge
  if (merge === null) return
  const view = gwMergeView(merge.cache[merge.files[merge.index].path], merge.choices[merge.files[merge.index].path])
  const count = view.conflicts.length
  if (count === 0) return
  store.focusConflict((merge.current + delta + count) % count)
}

/** The merge window. */
function GwMergeWindow({ store, merge, tr }) {
  const entry = merge.files[merge.index]
  const file = merge.cache[entry.path]
  const choices = merge.choices[entry.path]
  const view = useMemo(() => gwMergeView(file, choices), [file, choices])
  const current = Math.min(merge.current, Math.max(view.conflicts.length - 1, 0))
  const focused = view.conflicts[current]
  const head = `${entry.path}（${merge.cwd ?? ''}）的补丁冲突`
  const binary = file !== undefined && file !== null && file.binary === true
  const statusLabel = binary
    ? tr('mergeBinary')
    : (view.unresolved === 0
      ? tr('mergeAllResolved')
      : String(tr('mergeRemaining')).replace('{count}', String(view.unresolved)))

  const renderPanels = (band) => {
    const rows = Math.max(band.ours.length, band.theirs.length, band.result.length)
    const out = []
    for (let index = 0; index < rows; index += 1) {
      const ours = band.ours[index]
      const theirs = band.theirs[index]
      const result = band.result[index]
      const conflict = band.kind === 'conflict'
      const classes = conflict ? `gw-mrow conflict ${band.choice === null ? 'unresolved' : 'resolved'}` : 'gw-mrow'
      out.push(h('div', { key: `r${index}`, className: classes }, [
        h('div', { key: 'l', className: `gw-mcell${conflict ? ' gw-mside' : ''}` }, [
          h('span', { key: 'n', className: 'gw-mno' }, ours === undefined ? '' : ours.no),
          h('span', { key: 'c', className: 'gw-mcode' }, ours === undefined ? '' : ours.text),
        ]),
        h('div', { key: 'gl', className: 'gw-mgutter' }, index === 0 && conflict
          ? h('button', {
            className: 'gw-marrow',
            title: tr('acceptLeft'),
            disabled: band.choice === 'ours',
            onClick: () => store.chooseConflict(band.id, 'ours'),
          }, '◀')
          : null),
        h('div', { key: 'm', className: 'gw-mcell gw-mresult' }, [
          h('span', { key: 'n', className: 'gw-mno' }, result === undefined ? '' : result.no),
          h('span', { key: 'c', className: 'gw-mcode' }, result === undefined ? '' : result.text),
        ]),
        h('div', { key: 'gr', className: 'gw-mgutter' }, index === 0 && conflict
          ? h('button', {
            className: 'gw-marrow',
            title: tr('acceptRight'),
            disabled: band.choice === 'theirs',
            onClick: () => store.chooseConflict(band.id, 'theirs'),
          }, '▶')
          : null),
        h('div', { key: 'r', className: `gw-mcell${conflict ? ' gw-mside' : ''}` }, [
          h('span', { key: 'n', className: 'gw-mno' }, theirs === undefined ? '' : theirs.no),
          h('span', { key: 'c', className: 'gw-mcode' }, theirs === undefined ? '' : theirs.text),
        ]),
      ]))
    }
    return out
  }

  return h('div', { className: 'gw-modal', role: 'dialog', 'aria-label': head }, [
    h('div', { key: 'win', className: 'gw-mergewin' }, [
      h('div', { key: 'head', className: 'gw-mhead' }, [
        h('div', { key: 'title', className: 'gw-mtitle', title: head }, head),
        h('div', { key: 'tools', className: 'gw-mtools' }, [
          h('button', { key: 'prev', className: 'gw-iconbtn', title: tr('prevConflict'), onClick: () => gwStepConflict(store, -1) }, '↑'),
          h('button', { key: 'next', className: 'gw-iconbtn', title: tr('nextConflict'), onClick: () => gwStepConflict(store, 1) }, '↓'),
          h('button', { key: 'allleft', className: 'gw-btn', onClick: () => store.chooseAll('ours') }, tr('acceptAllLeft')),
          h('button', { key: 'allright', className: 'gw-btn', onClick: () => store.chooseAll('theirs') }, tr('acceptAllRight')),
        ]),
        h('div', { key: 'state', className: `gw-mstate${view.unresolved === 0 ? ' ok' : ''}` }, [
          view.unresolved === 0 ? '✓' : '⨯',
          h('span', { key: 't' }, statusLabel),
        ]),
        h('button', { key: 'close', className: 'gw-iconbtn', title: tr('close'), onClick: () => store.closeMerge() }, h(GwCloseIcon, { size: 11 })),
      ]),
      h('div', { key: 'tabs', className: 'gw-mfiles' }, merge.files.map((item, index) => h('button', {
        key: item.path,
        className: `gw-mfile${index === merge.index ? ' active' : ''}`,
        title: `${item.path} (${item.status})`,
        onClick: () => store.selectMergeFile(index),
      }, [
        h('span', { key: 's', className: 'gw-status', style: { color: gwStatusColor(item.status[0]) } }, item.status),
        h('span', { key: 'n', className: 'gw-name' }, gwSplitPath(item.path).name),
      ]))),
      h('div', { key: 'cols', className: 'gw-mcols' }, [
        h('span', { key: 'l' }, tr('localChangesPane')),
        h('span', { key: 'gl', className: 'gw-mgutter' }, ''),
        h('span', { key: 'm' }, tr('resultPane')),
        h('span', { key: 'gr', className: 'gw-mgutter' }, ''),
        h('span', { key: 'r' }, tr('remotePane')),
      ]),
      h('div', { key: 'scroll', className: 'gw-mbody' }, h('div', { key: 'table', className: 'gw-mtable' }, view.bands.map((band, index) => h('div', {
        key: `b${index}`,
        className: band.kind === 'conflict' && band.choice === null ? 'gw-mband unresolved' : 'gw-mband',
        onClick: band.kind === 'conflict' ? () => store.focusConflict(band.id) : undefined,
      }, renderPanels(band))))),
      h('div', { key: 'foot', className: 'gw-mfoot' }, [
        h('button', {
          key: 'left',
          className: 'gw-btn',
          disabled: focused === undefined,
          onClick: () => { if (focused !== undefined) store.chooseConflict(focused.id, 'ours') },
        }, tr('acceptLeft')),
        h('button', {
          key: 'right',
          className: 'gw-btn',
          disabled: focused === undefined,
          onClick: () => { if (focused !== undefined) store.chooseConflict(focused.id, 'theirs') },
        }, tr('acceptRight')),
        h('div', { key: 'spacer', className: 'gw-tabspacer' }),
        h('button', { key: 'abort', className: 'gw-btn', onClick: () => store.abortMerge() }, tr('mergeAbort')),
        h('button', {
          key: 'apply',
          className: 'gw-btn primary',
          disabled: binary || view.unresolved > 0,
          title: binary ? tr('mergeBinaryHint') : (view.unresolved > 0 ? tr('mergeUnresolvedHint') : undefined),
          onClick: () => store.applyMerge(),
        }, tr('mergeApply')),
      ]),
    ]),
  ])
}
