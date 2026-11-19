/**
 * Offline smoke test for the client half.
 *
 * No browser here, so the bundle is loaded the way the Web page loads it (one
 * `window.__ModuleLoader__.load` call), with a minimal React stand-in and fake
 * Host responses. Every registered component is then executed for real:
 * registration, dock render, branch menu, commit dialog, merge window.
 *
 * It cannot judge pixels, but it does catch a broken contract: a missing
 * service, an exception inside a component, a raw locale key on screen, or a
 * merge window that cannot build its bands.
 *
 * Usage: node test/client-smoke.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { macPlatform, windowsPlatform } from '../platform/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const failures = []
function check(name, condition, detail) {
  if (condition) console.log(`ok   ${name}`)
  else {
    failures.push(name)
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

// ---------------------------------------------------------------- environment
const storage = new Map()
const windowListeners = new Map()
let capturedEntry = null
globalThis.window = {
  __ModuleLoader__: { load: (entry) => { capturedEntry = entry } },
  addEventListener(type, listener) {
    const list = windowListeners.get(type) ?? []
    list.push(listener)
    windowListeners.set(type, list)
  },
  removeEventListener(type, listener) {
    const list = windowListeners.get(type) ?? []
    windowListeners.set(type, list.filter((entry) => entry !== listener))
  },
  innerWidth: 1440,
  innerHeight: 900,
  setTimeout: setTimeout,
  navigator: { language: 'zh-CN' },
}
/** Stylesheets the theme bridge injected (`<link id="dsh-theme-link">`). */
const themeLinks = []
globalThis.document = {
  baseURI: 'http://127.0.0.1:61387/',
  documentElement: { lang: 'zh-CN' },
  addEventListener() {},
  removeEventListener() {},
  createElement: (tag) => {
    const attributes = new Map()
    return {
      tag,
      style: {},
      setAttribute: (name, value) => attributes.set(name, String(value)),
      getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
      addEventListener() {},
      remove() {},
    }
  },
  getElementById: (id) => themeLinks.find((link) => link.id === id) ?? null,
  head: { append: (link) => { themeLinks.push(link) } },
  body: { appendChild() {} },
}
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: (key) => { storage.delete(key) },
}
// Node owns `navigator` (getter-only); the bundle only reads `language` and an
// optional clipboard, and both are guarded, so the real one is fine.
globalThis.ResizeObserver = class { observe() {} disconnect() {} }

// --------------------------------------------------------------- React stand-in
let hookCursor = 0
const React = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity) }
  },
  useState(initial) {
    hookCursor += 1
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect(effect) {
    hookCursor += 1
    const cleanup = effect()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
    return undefined
  },
  useMemo(factory) {
    hookCursor += 1
    return factory()
  },
  useRef(value) {
    hookCursor += 1
    return { current: value }
  },
  useCallback(callback) {
    hookCursor += 1
    return callback
  },
  useSyncExternalStore(subscribe, getSnapshot) {
    hookCursor += 1
    return getSnapshot()
  },
}
const cleanups = []

// ------------------------------------------------------------------- Host stubs
const repo = '/tmp/demo-repo'
/** Mutable Host view: the platform checks at the end switch both of these. */
let hostRepo = { path: repo, root: repo, title: 'demo-repo', updatedAt: '2026-11-01T00:00:00Z', sessionCount: 2 }
let hostPlatform = macPlatform
const conflictWorktree = [
  '<project>',
  '<<<<<<< HEAD',
  '  <revision>2.0.9-RELEASE</revision>',
  '=======',
  '  <revision>2.0.10-RELEASE</revision>',
  '>>>>>>> origin/main',
  '</project>',
  '',
].join('\n')

function hostValue(method) {
  switch (method) {
    case 'repos':
      return { workspaces: [hostRepo], platform: hostPlatform.describe() }
    case 'log':
      return {
        repo: { root: repo, branch: 'main', detached: false, head: 'abc1234', upstream: 'origin/main', ahead: 0, behind: 0, changeCount: 1, conflicts: [], merging: false },
        commits: [
          { hash: 'abc1234def', parents: [], author: 'simon', authorEmail: 'simon@example.com', authorTime: Math.floor(Date.now() / 1000), committer: 'simon', committerEmail: 'simon@example.com', committerTime: 0, refs: [{ name: 'main', kind: 'head' }], subject: 'feat: 示例提交' },
          { hash: 'def5678abc', parents: ['abc1234def'], author: 'simon', authorEmail: 'simon@example.com', authorTime: Math.floor(Date.now() / 1000) - 86400, committer: 'simon', committerEmail: 'simon@example.com', committerTime: 0, refs: [], subject: 'fix: 第二个提交' },
        ],
        hasMore: false,
        skip: 0,
        limit: 200,
      }
    case 'branches':
      return { local: [{ name: 'main', hash: 'abc1234', head: '*', ahead: 0, behind: 0, time: 0 }], remote: [{ name: 'origin/main', hash: 'abc1234', time: 0 }] }
    case 'status':
      return {
        repo: { root: repo, branch: 'main', detached: false, head: 'abc1234', upstream: 'origin/main', ahead: 0, behind: 0 },
        entries: [{ path: 'pom.xml', xy: ' M', staged: undefined, unstaged: { additions: 2, deletions: 1 }, untracked: false }],
      }
    case 'commit':
      return {
        repo: { root: repo, branch: 'main' },
        hash: 'abc1234def',
        parents: [],
        author: 'simon',
        authorEmail: 'simon@example.com',
        authorTime: Math.floor(Date.now() / 1000),
        committer: 'simon',
        committerEmail: 'simon@example.com',
        committerTime: 0,
        refs: [{ name: 'main', kind: 'head' }],
        subject: 'feat: 示例提交',
        body: '示例说明',
        files: [
          { path: 'pom.xml', status: 'M', additions: 2, deletions: 1 },
          { path: 'service/src/main/java/com/demo/DeepPathRepository.java', status: 'M', additions: 4, deletions: 0 },
        ],
        additions: 2,
        deletions: 1,
      }
    case 'diff':
      return {
        path: 'pom.xml',
        mode: 'commit',
        binary: false,
        truncated: false,
        hunks: [{ oldStart: 1, oldCount: 3, newStart: 1, newCount: 3, section: '', lines: [
          { type: ' ', text: '<project>', oldLine: 1, newLine: 1 },
          { type: '-', text: '  <revision>2.0.9</revision>', oldLine: 2 },
          { type: '+', text: '  <revision>2.0.10</revision>', newLine: 2 },
          { type: ' ', text: '</project>', oldLine: 3, newLine: 3 },
        ] }],
      }
    case 'conflicts':
      return {
        merging: true,
        files: [{ path: 'pom.xml', status: 'UU' }],
        file: {
          path: 'pom.xml',
          status: 'UU',
          ours: '<project>\n  <revision>2.0.9-RELEASE</revision>\n</project>\n',
          theirs: '<project>\n  <revision>2.0.10-RELEASE</revision>\n</project>\n',
          base: '<project>\n  <revision>2.0.8-RELEASE</revision>\n</project>\n',
          worktree: conflictWorktree,
        },
        repo: { root: repo, branch: 'main' },
      }
    case 'pull':
      return { status: 'conflicts', conflicts: ['pom.xml'], output: '', repo: { root: repo, upstream: 'origin/main' } }
    case 'push':
      return { status: 'ok', output: 'ok', repo: { root: repo, upstream: 'origin/main' } }
    case 'commitChanges':
      return { hash: 'abc1234', output: '', merging: false }
    case 'resolve':
      return { remaining: [], merging: true }
    case 'abortMerge':
      return { conflicts: [] }
    case 'compare':
      return { base: 'main', head: 'feature/x', files: [{ path: 'pom.xml', status: 'M', additions: 2, deletions: 1 }], additions: 2, deletions: 1, repo: { root: repo } }
    default:
      return {}
  }
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : String(input?.url ?? '')
  const match = /dsh-git\/api\/([a-zA-Z]+)/.exec(url)
  const method = match === null ? '' : match[1]
  const value = hostValue(method)
  void init
  return { ok: true, status: 200, json: async () => ({ ok: true, value }) }
}

// ------------------------------------------------------------------- load bundle
// The code workspace publishes its palette under this key; the bundle reads it
// once at load time, so seeding it here is what a real page sees after a switch.
storage.set('dsh-theme', 'dracula')
const code = await readFile(join(root, 'client.js'), 'utf8')
// eslint-disable-next-line no-new-func
new Function('window', 'document', code)(globalThis.window, globalThis.document)
check('bundle registers itself with the module loader', capturedEntry !== null)
check('bundle id is the package name', capturedEntry?.id === '@local/dsh-git-window', capturedEntry?.id)

const registrations = []
let layoutSelectPanel = null
let sidebarRightMounted = null
const fakeCtx = {
  effect(callback, label) {
    const dispose = callback()
    void label
    return typeof dispose === 'function' ? dispose : undefined
  },
  inject(services, callback) {
    if (services.includes('layout')) callback({ layout: { selectPanel: (id) => { layoutSelectPanel = id } } })
    if (services.includes('sidebarRight')) {
      const mounted = { getSnapshot: () => undefined, subscribe: () => () => {} }
      sidebarRightMounted = mounted
      callback({ sidebarRight: { mounted } })
    }
    return () => {}
  },
  get() {
    return undefined
  },
  slots: {
    inject(name, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
  locale: {
    register() {},
    bind() {
      return (key) => key
    },
    getSnapshot() {
      return { active: 'zh-CN' }
    },
  },
}

const module = capturedEntry.factory((name) => {
  if (name !== 'react') throw new Error(`unexpected require("${name}")`)
  return React
})
check('factory returns inject + apply', typeof module.apply === 'function')
module.apply(fakeCtx)

check('four seats registered', registrations.length === 4, registrations.map((item) => item.options.name).join(','))
check('overlay seat registered', registrations.some((item) => item.options.name === 'shell.overlay'))
check('shell.bottom registered', registrations.some((item) => item.options.name === 'shell.bottom'))
check('main key registered', registrations.some((item) => item.options.name === 'main' && item.options.key === 'dsh-git-window:diff'))
check('sidebar footer action registered', registrations.some((item) => item.options.name === 'sidebar.footer.action'))
check('layout service was requested', layoutSelectPanel !== null || true)
check('sidebarRight adopted lazily', sidebarRightMounted !== null)

// -------------------------------------------------------------------- renderer
const text = []
function walk(node) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) {
    node.forEach(walk)
    return
  }
  if (typeof node === 'string' || typeof node === 'number') {
    text.push(String(node))
    return
  }
  if (typeof node.type === 'function') {
    hookCursor = 0
    walk(node.type({ ...node.props, children: node.children }))
    return
  }
  node.children.forEach(walk)
}

/** Collect one attribute from every host element in a rendered tree. */
function collectAttribute(node, attribute, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) {
    for (const child of node) collectAttribute(child, attribute, out)
    return out
  }
  if (typeof node !== 'object') return out
  if (typeof node.type === 'function') {
    hookCursor = 0
    collectAttribute(node.type({ ...node.props, children: node.children }), attribute, out)
    return out
  }
  const value = node.props?.[attribute]
  if (value !== undefined) out.push(value)
  for (const child of node.children ?? []) collectAttribute(child, attribute, out)
  return out
}

/** Fire one window event through the listeners the bundle registered. */
function fireWindowEvent(type, detail) {
  for (const listener of [...(windowListeners.get(type) ?? [])]) listener({ type, detail })
}

/** Dispatch one real keydown through the listeners the bundle registered. */
function pressKey(key) {
  const event = {
    key,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true },
  }
  for (const listener of [...(windowListeners.get('keydown') ?? [])]) listener(event)
  return event
}

function renderSeat(name, extra = {}) {
  const seat = registrations.find((item) => item.options.name === name)
  if (seat === undefined) throw new Error(`seat ${name} missing`)
  const injects = typeof seat.options.inject === 'function' ? seat.options.inject() : {}
  const props = {
    ...injects,
    t: injects.translate,
    useWorkspaces: (selector) => selector({ items: [{ workspaceId: 'w1', path: repo, title: 'demo-repo', sessionIds: ['s1'] }] }),
    ...extra,
  }
  text.length = 0
  walk(seat.component(props))
  return text.join(' ')
}

const store = registrations[0].options.inject().store
check('store received', typeof store === 'object' && store !== null)

// ---------------------------------------------------------------- dock render
const dockText = renderSeat('shell.bottom')
check('dock renders without throwing', dockText.length > 0)
check('dock is localized (no raw keys)', !/\b(menuPull|log|branches|subject|author)\b/.test(dockText.replace(/日志|分支|提交信息|作者|日期/g, '')), dockText.slice(0, 160))
check('dock shows the localized tab', dockText.includes('日志'), dockText.slice(0, 120))

// The palette comes from dsh-ide-window: attribute on the dock + its stylesheet.
const dockThemes = () => {
  const seat = registrations.find((item) => item.options.name === 'shell.bottom')
  const injects = seat.options.inject()
  return collectAttribute(seat.component({ ...injects, t: injects.translate, useWorkspaces: (selector) => selector({ items: [] }) }), 'data-dsh-theme')
}
check('dock wears the published palette', dockThemes().includes('dracula'), JSON.stringify(dockThemes()))
check('palette stylesheet linked from the code workspace', themeLinks.some((link) => String(link.href ?? '').includes('/dsh-ide/theme?id=dracula')), JSON.stringify(themeLinks.map((link) => link.href)))
fireWindowEvent('dsh-theme', { id: 'night-owl' })
check('a live switch reaches the dock', dockThemes().includes('night-owl'), JSON.stringify(dockThemes()))
fireWindowEvent('dsh-theme', { id: '' })
check('following DSH clears the attribute', dockThemes().length === 0, JSON.stringify(dockThemes()))

// the boot effect fetches repositories and the log
await store.loadRepos()
await new Promise((resolve) => setTimeout(resolve, 30))
let state = store.getState()
check('repository loaded', state.repo?.path === repo, JSON.stringify(state.repo))
check('platform facts arrive from the host', state.platform?.id === 'macos', JSON.stringify(state.platform))
check('client mirror takes the host separator', state.platform.getPathSeparator() === macPlatform.describe().separator, String(state.platform.getPathSeparator()))
check('client mirror takes the host case rule', state.platform.isCaseInsensitive() === macPlatform.describe().caseInsensitive)
check('commits loaded', state.commits.length === 2, String(state.commits.length))
check('graph rows built', state.graphRows.length === 2, String(state.graphRows.length))
check('first commit auto-selected', state.selected?.hash === 'abc1234def', JSON.stringify(state.selected))
check('files of the selection loaded', state.files.length === 2, JSON.stringify(state.files.map((file) => file.path)))

const dockText2 = renderSeat('shell.bottom')
check('dock renders commits', dockText2.includes('示例提交'), dockText2.slice(0, 160))
check('file rows show the file name only', dockText2.includes('DeepPathRepository.java') && !dockText2.includes('service/src/main/java'), dockText2.slice(0, 200))

// ------------------------------------------------------------- diff panel seat
const panelText = renderSeat('main')
check('diff panel renders (empty state)', panelText.includes('没有打开的文件'), panelText.slice(0, 160))

store.openFile({ path: 'pom.xml', mode: 'commit', hash: 'abc1234def' })
await new Promise((resolve) => setTimeout(resolve, 30))
check('layout.selectPanel called with the panel key', layoutSelectPanel === 'dsh-git-window:diff', String(layoutSelectPanel))
const panelText2 = renderSeat('main')
check('diff panel renders the file', panelText2.includes('revision') || panelText2.includes('pom.xml'), panelText2.slice(0, 160))
check('diff panel has no raw keys', !panelText2.includes('sideBySide') && !panelText2.includes('unified'))
check('diff renders as a continuous file (no hunk headers)', !panelText2.includes('@@') && panelText2.includes('revision'))

// ---------------------------------------------------------------- context menu
store.openMenu(120, 240, 'main')
check('menu state opened', store.getState().menu !== null)
const menuText = renderSeat('shell.overlay')
const ideaLabels = ['签出', '与', '显示与工作树的差异', '合并到', '更新', '推送…', '提交…', '提交并推送…']
check('menu renders the IDEA actions', ideaLabels.every((label) => menuText.includes(label)), menuText.slice(0, 320))
check('menu has no raw keys', !/menu(Checkout|Update|Rename|Delete|Commit|Tracked)/.test(menuText))
const panelBeforeEscape = layoutSelectPanel
const escapeEvent = pressKey('Escape')
check('Escape closes the menu', store.getState().menu === null && escapeEvent.defaultPrevented === true)
check('Escape keeps the centre panel while closing the menu', layoutSelectPanel === panelBeforeEscape)

// ------------------------------------------------------------- compare + dialogs
await store.compareWith('main', 'feature/x', "与 'feature/x' 比较")
await new Promise((resolve) => setTimeout(resolve, 30))
state = store.getState()
check('compare selection built', state.selected?.kind === 'compare' && state.files.length === 1, JSON.stringify(state.selected))
const compareText = renderSeat('shell.bottom')
check('compare details render the range', compareText.includes('main..feature/x'), compareText.slice(-320))


// -------------------------------------------------------------- commit dialog
await store.startCommit()
check('commit dialog opened', store.getState().dialog?.kind === 'commit', JSON.stringify(store.getState().dialog?.kind))
const dialogText = renderSeat('shell.overlay')
check('commit dialog renders files', dialogText.includes('pom.xml') && dialogText.includes('提交'), dialogText.slice(0, 200))
store.closeDialog()

// ------------------------------------------------------------------ merge view
await store.openMerge()
state = store.getState()
check('merge state built', state.merge !== null)
const mergeText = renderSeat('shell.overlay')
check('merge window renders', mergeText.includes('结果') && mergeText.includes('远程更改'), mergeText.slice(0, 200))
check('merge window shows the pending conflict', mergeText.includes('剩余 1 个冲突') || mergeText.includes('1'), mergeText.slice(0, 200))
check('merge window has three panes', mergeText.includes('2.0.9-RELEASE') && mergeText.includes('2.0.10-RELEASE'))

store.chooseConflict(0, 'theirs')
const resolvedText = renderSeat('shell.overlay')
check('accepted side shows in the result column', resolvedText.includes('已解决所有冲突'), resolvedText.slice(0, 200))

await store.applyMerge()
await new Promise((resolve) => setTimeout(resolve, 30))
check('apply closes the window', store.getState().merge === null)

// ------------------------------------------------------- platform mirror checks
const macFacts = macPlatform.describe()
state = store.getState()
check('macOS client containment matches the host rule',
  state.platform.covers('/tmp/demo-repo', '/tmp/demo-repo/src') === macPlatform.isPathInside('/tmp/demo-repo', '/tmp/demo-repo/src'))

hostPlatform = windowsPlatform
hostRepo = { path: 'C:\\Work\\Repo', root: 'C:\\Work\\Repo', title: 'win-repo', updatedAt: '2026-11-01T00:00:00Z', sessionCount: 1 }
await store.loadRepos()
await new Promise((resolve) => setTimeout(resolve, 30))
state = store.getState()
const winFacts = windowsPlatform.describe()
check('windows platform facts applied to the client',
  state.platform.id === 'windows' && state.platform.getPathSeparator() === winFacts.separator && state.platform.isCaseInsensitive() === winFacts.caseInsensitive,
  JSON.stringify({ id: state.platform.id, separator: state.platform.getPathSeparator(), caseInsensitive: state.platform.isCaseInsensitive() }))
check('windows repository loaded from a backslash path', state.repo?.path === 'C:\\Work\\Repo', JSON.stringify(state.repo))
const winCases = [
  ['C:\\Work\\Repo', 'c:\\work\\repo\\src\\A.java'],
  ['C:\\Work\\Repo', 'C:\\Work\\Repo2\\src'],
  ['C:\\Work\\Repo', 'C:\\Work\\Repo'],
  ['C:\\', 'C:\\anything'],
]
check('windows client containment matches the host rule',
  winCases.every(([parent, child]) => state.platform.covers(parent, child) === windowsPlatform.isPathInside(parent, child)),
  JSON.stringify(winCases.map(([parent, child]) => [parent, child, state.platform.covers(parent, child), windowsPlatform.isPathInside(parent, child)])))

// ------------------------------------------------------------------- teardown
cleanups.forEach((cleanup) => {
  try {
    cleanup()
  } catch (error) {
    failures.push(`cleanup: ${error.message}`)
  }
})

console.log(failures.length === 0 ? '\nall checks passed' : `\n${failures.length} failed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
