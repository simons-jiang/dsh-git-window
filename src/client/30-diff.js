/**
 * Diff presentation: hunk pairing for side-by-side rows, a deliberately small
 * line tokenizer for syntax colours, and the body both layouts share.
 *
 * The Host sends structured hunks (both-side line numbers), so nothing here
 * guesses at a diff's shape; pairing only decides which removed line sits next
 * to which added one inside a change block, which is what a side-by-side view
 * needs.
 */

/** Tokenizer keywords — the union of the shapes this plugin realistically shows. */
const GW_KEYWORDS = new Set((
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends ' +
  'final finally float for goto if implements import instanceof int interface long native new package private ' +
  'protected public return short static strictfp super switch synchronized this throw throws transient try void ' +
  'volatile while true false null var let function typeof delete in of export async await yield type namespace ' +
  'declare module readonly string number any unknown never object void fun val when is as try catch finally let ' +
  'func go defer chan map range select struct interface package fallthrough pub fn mut impl trait match loop ' +
  'where unsafe use mod crate self Self static ref dyn'
).split(/\s+/).filter(Boolean))

/** Languages whose `#` starts a line comment. */
const GW_HASH_COMMENT = new Set(['py', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'rb', 'toml', 'conf', 'properties', 'dockerfile'])

/** Languages with no useful tokenizer here. */
const GW_PLAIN_LANGS = new Set(['md', 'markdown', 'txt', 'log', 'csv', 'tsv', 'lock'])

/** Extension → language id. */
function gwLangOf(path) {
  const name = String(path ?? '').toLowerCase()
  if (name.endsWith('dockerfile') || name.endsWith('.dockerfile')) return 'dockerfile'
  const index = name.lastIndexOf('.')
  if (index < 0) return ''
  const ext = name.slice(index + 1)
  const map = {
    java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', groovy: 'groovy',
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', mts: 'ts',
    json: 'json', jsonc: 'json', xml: 'xml', html: 'html', htm: 'html', vue: 'html',
    css: 'css', scss: 'css', less: 'css', yml: 'yaml', yaml: 'yaml', toml: 'toml',
    py: 'py', go: 'go', rs: 'rs', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
    cs: 'cs', php: 'php', rb: 'rb', swift: 'swift', sh: 'sh', bash: 'sh', zsh: 'sh',
    sql: 'sql', md: 'md', markdown: 'md', txt: 'txt', properties: 'properties',
    conf: 'conf', ini: 'conf', gradle: 'groovy', proto: 'proto',
  }
  return map[ext] ?? ''
}

/**
 * Split one code line into coloured runs.
 * @param text - the line without its diff marker.
 * @param lang - language id from {@link gwLangOf}.
 * @returns `{ text, cls }` runs; a single plain run when nothing matches.
 */
function gwTokenize(text, lang) {
  if (text === '' || GW_PLAIN_LANGS.has(lang) || text.length > 800) return [{ text, cls: '' }]
  const hashComments = GW_HASH_COMMENT.has(lang)
  const trimmed = text.trimStart()
  if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//') || (hashComments && trimmed.startsWith('#'))) {
    return [{ text, cls: 'gw-com' }]
  }
  const pattern = hashComments
    ? /(\/\/[^\n]*|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d[\d_]*(?:\.\d+)?[fFlLdD]?)\b|(@[A-Za-z_]\w*)|\b([A-Za-z_$][\w$]*)\b|([^\w\s])/g
    : /(\/\/[^\n]*|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d[\d_]*(?:\.\d+)?[fFlLdD]?)\b|(@[A-Za-z_]\w*)|\b([A-Za-z_$][\w$]*)\b|([^\w\s])/g
  const runs = []
  let cursor = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index), cls: '' })
    if (match[1] !== undefined) runs.push({ text: match[1], cls: 'gw-com' })
    else if (match[2] !== undefined) runs.push({ text: match[2], cls: 'gw-str' })
    else if (match[3] !== undefined) runs.push({ text: match[3], cls: 'gw-num' })
    else if (match[4] !== undefined) runs.push({ text: match[4], cls: 'gw-ann' })
    else if (match[5] !== undefined) {
      const word = match[5]
      const cls = GW_KEYWORDS.has(word) ? 'gw-kw' : (/^[A-Z]/.test(word) ? 'gw-type' : '')
      runs.push({ text: word, cls })
    } else runs.push({ text: match[6], cls: 'gw-punc' })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), cls: '' })
  return runs.length === 0 ? [{ text, cls: '' }] : runs
}

/** Render one code line with its token colours. */
function GwCode({ text, lang }) {
  const runs = gwTokenize(text, lang)
  return h('span', { className: 'gw-code' }, runs.map((run, index) => (
    run.cls === '' ? run.text : h('span', { key: index, className: run.cls }, run.text)
  )))
}

/** Unchanged rows shorter than this stay visible; longer runs collapse. */
const GW_COLLAPSE_LINES = 12

/**
 * Turn hunks into side-by-side rows. Inside a change block removed lines pair
 * with added lines positionally, and the longer side fills the remaining rows
 * with an empty placeholder. Hunk headers are deliberately not emitted: the
 * host sends whole-file context, so the view reads as one continuous file.
 */
function gwPairRows(hunks) {
  const rows = []
  for (const hunk of hunks) {
    const lines = hunk.lines
    let index = 0
    while (index < lines.length) {
      const line = lines[index]
      if (line.type === ' ') {
        rows.push({ left: line, right: line })
        index += 1
        continue
      }
      if (line.type === '-') {
        const removed = []
        const added = []
        while (index < lines.length && lines[index].type === '-') {
          removed.push(lines[index])
          index += 1
        }
        while (index < lines.length && lines[index].type === '+') {
          added.push(lines[index])
          index += 1
        }
        const count = Math.max(removed.length, added.length)
        for (let offset = 0; offset < count; offset += 1) {
          rows.push({ left: removed[offset] ?? null, right: added[offset] ?? null })
        }
        continue
      }
      rows.push({ left: null, right: line })
      index += 1
    }
  }
  return rows
}

/** Flatten hunks into unified rows (one line each). */
function gwUnifiedRows(hunks) {
  const rows = []
  for (const hunk of hunks) {
    for (const line of hunk.lines) rows.push({ line })
  }
  return rows
}

/**
 * Collapse long unchanged runs into one gap row the reader can expand. Gap ids
 * are assigned per run, so expanding one keeps the others stable.
 */
function gwCollapseRuns(rows, isContext, expanded) {
  const out = []
  let run = []
  let gap = 0
  const flush = () => {
    if (run.length === 0) return
    if (run.length > GW_COLLAPSE_LINES && !expanded.has(gap)) {
      out.push({ kind: 'gap', count: run.length, id: gap })
    } else {
      for (const row of run) out.push({ kind: 'row', row })
    }
    gap += 1
    run = []
  }
  for (const row of rows) {
    if (isContext(row)) {
      run.push(row)
      continue
    }
    flush()
    out.push({ kind: 'row', row })
  }
  flush()
  return out
}

/** One side-by-side cell. */
function GwLine({ line, side, lang }) {
  if (line === null || line === undefined) {
    return h('div', { className: 'gw-dline placeholder' }, [
      h('span', { key: 'ln', className: 'gw-ln' }, ''),
      h('span', { key: 'sign', className: 'gw-sign' }, ''),
      h('span', { key: 'code', className: 'gw-code' }, ''),
    ])
  }
  const number = side === 'left' ? line.oldLine : line.newLine
  const kind = line.type === ' ' ? 'ctx' : line.type === '+' ? 'add' : 'del'
  return h('div', { className: `gw-dline ${kind}` }, [
    h('span', { key: 'ln', className: 'gw-ln' }, number ?? ''),
    h('span', { key: 'sign', className: 'gw-sign' }, line.type === ' ' ? '' : line.type),
    h(GwCode, { key: 'code', text: line.text, lang }),
  ])
}

/** One unified row: both gutters, the marker, then the code. */
function GwUnifiedLine({ line, lang }) {
  const kind = line.type === ' ' ? 'ctx' : line.type === '+' ? 'add' : 'del'
  return h('div', { className: `gw-dline ${kind}` }, [
    h('span', { key: 'old', className: 'gw-ln' }, line.oldLine ?? ''),
    h('span', { key: 'new', className: 'gw-ln' }, line.newLine ?? ''),
    h('span', { key: 'sign', className: 'gw-sign' }, line.type === ' ' ? '' : line.type),
    h(GwCode, { key: 'code', text: line.text, lang }),
  ])
}

/** Track the rendered width of an element's parent, for equal side-by-side halves. */
function gwUseElementWidth(ref) {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current?.parentElement
    if (node === null || node === undefined) return undefined
    const update = () => setWidth(node.clientWidth)
    update()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}

/** The diff body for one file in one revision: one continuous file, IDEA style. */
function GwDiffBody({ diff, mode }) {
  const lang = gwLangOf(diff.path)
  const gridRef = useRef(null)
  const containerWidth = gwUseElementWidth(gridRef)
  const half = Math.max(220, Math.floor(containerWidth / 2) - 1)
  const [expanded, setExpanded] = useState(() => new Set())
  useEffect(() => {
    setExpanded(new Set())
  }, [diff])
  const reveal = (id) => setExpanded((current) => {
    const next = new Set(current)
    next.add(id)
    return next
  })
  return useMemo(() => {
    const gapRow = (entry, key) => h('div', {
      key,
      className: 'gw-gap',
      style: mode === 'unified' ? undefined : { gridColumn: '1 / -1' },
      onClick: () => reveal(entry.id),
    }, `⋯ ${entry.count} 行未修改`)
    if (mode === 'unified') {
      const entries = gwCollapseRuns(gwUnifiedRows(diff.hunks), (row) => row.line.type === ' ', expanded)
      const items = entries.map((entry, index) => (entry.kind === 'gap'
        ? gapRow(entry, `g-${entry.id}`)
        : h(GwUnifiedLine, { key: `l-${index}`, line: entry.row.line, lang })))
      return h('div', { ref: gridRef, className: 'gw-diffgrid unified' }, items)
    }
    const entries = gwCollapseRuns(gwPairRows(diff.hunks), (row) => row.left !== null && row.left === row.right, expanded)
    const items = []
    entries.forEach((entry, index) => {
      if (entry.kind === 'gap') {
        items.push(gapRow(entry, `g-${entry.id}`))
        return
      }
      items.push(h(GwLine, { key: `l-${index}`, line: entry.row.left, side: 'left', lang }))
      items.push(h(GwLine, { key: `r-${index}`, line: entry.row.right, side: 'right', lang }))
    })
    return h('div', {
      ref: gridRef,
      className: 'gw-diffgrid side',
      style: { gridTemplateColumns: `minmax(${half}px, max-content) minmax(${half}px, max-content)` },
    }, items)
  }, [diff, mode, lang, half, expanded])
}
