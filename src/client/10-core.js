/**
 * Store and Host API for the Git tool window.
 *
 * One store instance is created in `apply` and shared by the three entries the
 * plugin registers (the bottom dock, the centre diff panel, and the sidebar
 * footer toggle), so opening a file in the dock selects a tab in the panel and
 * closing the dock can retire the panel. All Host access goes through the
 * plugin's own `/dsh-git/api/*` routes.
 */

/**
 * Build the plugin's translator.
 *
 * The framework's `t` (from the `locale` registration option) is preferred, but
 * a locale id the plugin has no dictionary for makes it echo the key back. A
 * raw key in the UI is never acceptable, so the bundle's own dictionaries are
 * the guaranteed last resort: the active locale id from the locale service,
 * then the page language, decides between Chinese and English.
 */
function gwMakeTranslator(ctx, boundT) {
  const localeId = () => {
    try {
      const snapshot = ctx?.locale?.getSnapshot?.()
      if (typeof snapshot?.active === 'string' && snapshot.active !== '') return snapshot.active
    } catch (error) {
      void error
    }
    if (typeof document !== 'undefined' && typeof document.documentElement?.lang === 'string') {
      return document.documentElement.lang
    }
    return typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : ''
  }
  const dictionary = () => (/^zh/i.test(localeId()) ? GW_TEXT_ZH : GW_TEXT_EN)
  const translate = (key) => {
    if (typeof boundT === 'function') {
      const value = boundT(key)
      if (typeof value === 'string' && value !== '' && value !== key) return value
    }
    const table = dictionary()
    return table[key] ?? GW_TEXT_EN[key] ?? key
  }
  return translate
}

/** Keyed main-panel id of the diff surface. */
const GW_PANEL_ID = 'dsh-git-window:diff'

/** Preference key (tool window geometry and diff presentation). */
const GW_PREFS_KEY = 'dsh-git-window:v1'

/** Rows loaded per `git log` page. */
const GW_LOG_PAGE = 200

/** Resolve one route against the page base, keeping reverse-proxy prefixes. */
function gwApiUrl(method) {
  const base = typeof document !== 'undefined' && typeof document.baseURI === 'string' ? document.baseURI : 'http://dsh.internal/'
  return new URL(`dsh-git/api/${method}`, base).href
}

/** Call one Host method and unwrap its `{ ok, value }` envelope. */
async function gwCall(method, payload, signal) {
  let response
  try {
    response = await fetch(gwApiUrl(method), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    const failure = new Error(error instanceof Error ? error.message : String(error))
    failure.code = 'network'
    throw failure
  }
  const parsed = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true) {
    const failure = new Error(parsed?.error?.message ?? `HTTP ${response.status}`)
    failure.code = parsed?.error?.code ?? `http-${response.status}`
    throw failure
  }
  return parsed.value
}

/** Persisted preferences, tolerant of a corrupt or unavailable store. */
function gwReadPrefs() {
  try {
    const raw = globalThis.localStorage?.getItem(GW_PREFS_KEY)
    if (typeof raw !== 'string' || raw === '') return {}
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Merge a partial preference document back into storage. */
function gwWritePrefs(patch) {
  try {
    const next = { ...gwReadPrefs(), ...patch }
    globalThis.localStorage?.setItem(GW_PREFS_KEY, JSON.stringify(next))
  } catch {
    /* a browser with storage disabled simply forgets geometry */
  }
}

/**
 * The tallest the dock may get. The shell's left sidebar keeps its own regions
 * (navigation, workspace list, footer) in the height the dock leaves; past
 * roughly half the viewport the workspace region collapses to nothing, which
 * would hide the projects the user navigates by.
 */
function gwMaxHeight() {
  const viewport = Number(globalThis.innerHeight) || 900
  return Math.max(180, Math.floor(viewport * 0.45))
}

/** Clamp a number into a range. */
function gwClamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/** Two-digit zero pad. */
function gwPad(value) {
  return value < 10 ? `0${value}` : String(value)
}

/** `今天 12:00` / `昨天 19:24` / `11-12 14:05` / `2025-11-12 14:05`. */
function gwRelativeDate(seconds, t) {
  if (!seconds) return ''
  const date = new Date(seconds * 1000)
  const now = new Date()
  const clock = `${gwPad(date.getHours())}:${gwPad(date.getMinutes())}`
  if (date.toDateString() === now.toDateString()) return `${t('today')} ${clock}`
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `${t('yesterday')} ${clock}`
  const monthDay = `${gwPad(date.getMonth() + 1)}-${gwPad(date.getDate())}`
  return date.getFullYear() === now.getFullYear() ? `${monthDay} ${clock}` : `${date.getFullYear()}-${monthDay} ${clock}`
}

/** The full timestamp the details pane shows: `2026/11/12 14:05`. */
function gwFullDate(seconds) {
  if (!seconds) return ''
  const date = new Date(seconds * 1000)
  return `${date.getFullYear()}/${gwPad(date.getMonth() + 1)}/${gwPad(date.getDate())} ${gwPad(date.getHours())}:${gwPad(date.getMinutes())}`
}

/** Split a repository path into its dimmed directory and the file name. */
function gwSplitPath(path) {
  const index = path.lastIndexOf('/')
  return index < 0 ? { dir: '', name: path } : { dir: path.slice(0, index + 1), name: path.slice(index + 1) }
}

/**
 * The repository a directory belongs to: the longest configured root that
 * contains it. Used to follow the project the user is working in.
 */
function gwRepoForPath(repos, path) {
  let best
  let bestLength = -1
  for (const repo of repos) {
    for (const candidate of [repo.path, repo.root]) {
      if (typeof candidate !== 'string' || candidate === '') continue
      if (path !== candidate && !path.startsWith(`${candidate}/`)) continue
      if (candidate.length > bestLength) {
        best = repo
        bestLength = candidate.length
      }
    }
  }
  return best === undefined ? null : best
}

/** Tab identity for one file in one revision. */
function gwTabId(file) {
  return `${file.mode}:${file.hash ?? ''}:${file.path}`
}

/**
 * Build the store. `layout` is resolved lazily so the store can exist before
 * the layout service is reachable.
 */
function gwCreateStore(layoutRef) {
  const prefs = gwReadPrefs()
  let state = {
    open: prefs.open !== false,
    height: gwClamp(Number(prefs.height) || 340, 150, gwMaxHeight()),
    branchesWidth: gwClamp(Number(prefs.branchesWidth) || 218, 150, 460),
    detailWidth: gwClamp(Number(prefs.detailWidth) || 372, 240, 720),
    diffMode: prefs.diffMode === 'unified' ? 'unified' : 'side',
    repoPath: typeof prefs.repoPath === 'string' ? prefs.repoPath : null,
    /** Directory of the project the user is currently in (the mounted session's workspace). */
    sessionProject: null,
    /** Project for which the user picked a repository by hand; suppresses following until the project changes. */
    suppressedFor: null,
    repos: [],
    reposLoading: false,
    repo: null,
    repoInfo: null,
    ref: null,
    branches: { local: [], remote: [] },
    commits: [],
    graphRows: [],
    lanes: 1,
    hasMore: false,
    logLoading: false,
    logError: null,
    selected: null,
    detail: null,
    detailLoading: false,
    files: [],
    tabs: [],
    activeTabId: null,
    diff: null,
    diffLoading: false,
    diffError: null,
    filter: '',
    toast: null,
    /** Branch context menu: `{ x, y, branch }`. */
    menu: null,
    /** Commit or "local changes" dialog. */
    dialog: null,
    /** Open merge window state (see 34-merge.js). */
    merge: null,
    /** Last git-operation notice: `{ tone, code, params }`. */
    notice: null,
    /** Operation in flight ('pull' | 'push' | 'commit' | 'merge' | 'abort'). */
    busy: null,
    conflictCount: 0,
    mergeInProgress: false,
  }
  const listeners = new Set()
  /**
   * The right-Sidebar controller, attached lazily: it publishes the session
   * whose conversation seat is on screen, which is the only sanctioned
   * "which project is the user in" signal in the page.
   */
  let sidebarRight
  let logToken = 0
  let detailToken = 0
  let diffToken = 0

  const emit = () => {
    for (const listener of listeners) listener()
  }
  const patch = (next) => {
    state = { ...state, ...next }
    emit()
  }

  /**
   * Re-read the repository list and keep the active repository when it still
   * exists. A Workspace added in the sidebar shows up here without a page
   * reload, and a Workspace removed from the profile drops out.
   * @returns whether the active repository changed (and was re-loaded).
   */
  async function refreshRepos() {
    let value
    try {
      value = await gwCall('repos', {})
    } catch (error) {
      if (state.repo === null) patch({ logError: error })
      return false
    }
    const repos = Array.isArray(value?.workspaces) ? value.workspaces : []
    const projectRepo = state.sessionProject === null ? null : gwRepoForPath(repos, state.sessionProject)
    const kept = state.repo === null ? null : (repos.find((entry) => entry.path === state.repo.path) ?? null)
    const next = projectRepo ?? kept
    patch({ repos })
    if (next === null) {
      if (state.repo === null) return false
      layoutRef.current?.selectPanel?.(null)
      patch({
        repo: null, repoInfo: null, commits: [], graphRows: [], selected: null,
        detail: null, files: [], tabs: [], activeTabId: null, diff: null,
      })
      return true
    }
    if (next.path === state.repo?.path) return false
    await selectRepo(next.path)
    return true
  }

  /** Load the repositories this profile owns, then the log of the active one. */
  async function loadRepos() {
    patch({ reposLoading: true })
    try {
      const value = await gwCall('repos', {})
      const repos = Array.isArray(value?.workspaces) ? value.workspaces : []
      const projectRepo = state.sessionProject === null ? null : gwRepoForPath(repos, state.sessionProject)
      const chosen = projectRepo
        ?? repos.find((entry) => entry.path === state.repoPath)
        ?? repos[0]
        ?? null
      patch({ repos, reposLoading: false, repo: chosen, repoPath: chosen?.path ?? null })
      if (chosen !== null) {
        gwWritePrefs({ repoPath: chosen.path })
        await Promise.all([loadLog(), loadBranches()])
      }
    } catch (error) {
      patch({ reposLoading: false, logError: error, repo: null })
    }
  }

  /** Load one page of commits plus its graph lanes. */
  async function loadLog() {
    const repo = state.repo
    if (repo === null) return
    const token = ++logToken
    patch({ logLoading: true, logError: null })
    try {
      const value = await gwCall('log', {
        cwd: repo.path,
        ref: state.ref === null ? undefined : state.ref,
        limit: GW_LOG_PAGE,
        skip: 0,
      })
      if (token !== logToken) return
      const commits = Array.isArray(value?.commits) ? value.commits : []
      const graph = gwBuildGraph(commits)
      patch({
        commits,
        graphRows: graph.rows,
        lanes: graph.lanes,
        hasMore: value?.hasMore === true,
        repoInfo: value?.repo ?? null,
        conflictCount: Array.isArray(value?.repo?.conflicts) ? value.repo.conflicts.length : 0,
        mergeInProgress: value?.repo?.merging === true,
        logLoading: false,
        logError: null,
      })
      const first = commits[0]
      if (state.selected === null && first !== undefined) {
        void select({ kind: 'commit', hash: first.hash })
      }
    } catch (error) {
      if (token !== logToken) return
      patch({ logLoading: false, logError: error, commits: [], graphRows: [], repoInfo: null })
    }
  }

  /** Append the next page of commits and rebuild the graph over the full list. */
  async function loadMore() {
    const repo = state.repo
    if (repo === null || state.logLoading || state.hasMore !== true) return
    const token = ++logToken
    patch({ logLoading: true })
    try {
      const value = await gwCall('log', {
        cwd: repo.path,
        ref: state.ref === null ? undefined : state.ref,
        limit: GW_LOG_PAGE,
        skip: state.commits.length,
      })
      if (token !== logToken) return
      const commits = [...state.commits, ...(Array.isArray(value?.commits) ? value.commits : [])]
      const graph = gwBuildGraph(commits)
      patch({
        commits,
        graphRows: graph.rows,
        lanes: graph.lanes,
        hasMore: value?.hasMore === true,
        repoInfo: value?.repo ?? state.repoInfo,
        logLoading: false,
      })
    } catch (error) {
      if (token !== logToken) return
      patch({ logLoading: false, logError: error })
    }
  }

  /** Load the branch tree (local and remote refs). */
  async function loadBranches() {
    const repo = state.repo
    if (repo === null) return
    try {
      const value = await gwCall('branches', { cwd: repo.path })
      patch({ branches: { local: value?.local ?? [], remote: value?.remote ?? [] } })
    } catch {
      patch({ branches: { local: [], remote: [] } })
    }
  }

  /** Refresh everything the dock shows: the repository list, then the active repository. */
  async function reload() {
    const switched = await refreshRepos()
    if (!switched) await Promise.all([loadLog(), loadBranches()])
  }

  /**
   * Switch the repository and re-read its history.
   * @param path - repository path from the picker.
   * @param options - `manual` records the choice as an override for the current project.
   */
  async function selectRepo(path, options = {}) {
    const repo = state.repos.find((entry) => entry.path === path) ?? null
    if (repo === null) return
    if (options.manual === true) patch({ suppressedFor: state.sessionProject })
    if (repo.path === state.repo?.path) return
    gwWritePrefs({ repoPath: repo.path })
    if (state.tabs.length > 0) layoutRef.current?.selectPanel?.(null)
    patch({
      repo,
      repoPath: repo.path,
      ref: null,
      commits: [],
      graphRows: [],
      selected: null,
      detail: null,
      files: [],
      tabs: [],
      activeTabId: null,
      diff: null,
    })
    await Promise.all([loadLog(), loadBranches()])
  }

  /** Adopt the project the user is working in; its repository becomes the log's subject. */
  function followProject(projectPath) {
    if (typeof projectPath !== 'string' || projectPath === '') return
    if (projectPath !== state.sessionProject) patch({ sessionProject: projectPath, suppressedFor: null })
    applyProjectRepo()
  }

  /** Switch to the current project's repository unless the user chose one by hand. */
  function applyProjectRepo() {
    const project = state.sessionProject
    if (project === null || project === undefined) return
    if (state.repos.length === 0) return
    if (state.suppressedFor === project) return
    const repo = gwRepoForPath(state.repos, project)
    if (repo !== null && repo.path !== state.repo?.path) void selectRepo(repo.path)
  }

  /** Filter the log to one ref (no checkout — read-only navigation). */
  async function selectRef(name) {
    if ((state.ref ?? null) === (name ?? null)) return
    patch({ ref: name ?? null, selected: null, detail: null, files: [] })
    await loadLog()
  }

  /** Select one log row and load what its details pane shows. */
  async function select(entry) {
    const token = ++detailToken
    patch({ selected: entry, detail: null, detailLoading: true, files: [] })
    if (entry === null) {
      patch({ detailLoading: false })
      return
    }
    const repo = state.repo
    if (repo === null) return
    try {
      if (entry.kind === 'worktree') {
        const value = await gwCall('status', { cwd: repo.path })
        if (token !== detailToken) return
        const files = (value?.entries ?? []).map((item) => {
          const staged = item.xy[0] !== ' ' && item.xy[0] !== '?'
          const unstaged = item.xy[1] !== ' ' || item.xy === '??'
          const mode = unstaged ? 'worktree' : 'index'
          const letter = item.xy === '??' ? '?' : (staged ? item.xy[0] : item.xy[1])
          return {
            path: item.path,
            status: letter,
            mode,
            stat: (unstaged ? item.unstaged : item.staged) ?? item.unstaged ?? item.staged,
            staged,
            unstaged,
          }
        })
        patch({ detailLoading: false, files, worktreeFiles: files })
        return
      }
      const value = await gwCall('commit', { cwd: repo.path, hash: entry.hash })
      if (token !== detailToken) return
      const files = (value?.files ?? []).map((file) => ({
        path: file.path,
        oldPath: file.oldPath,
        status: file.status,
        mode: 'commit',
        hash: value.hash,
        additions: file.additions,
        deletions: file.deletions,
        binary: file.binary,
      }))
      patch({ detailLoading: false, detail: value, files })
    } catch (error) {
      if (token !== detailToken) return
      patch({ detailLoading: false, detail: null, files: [], logError: error })
    }
  }

  /** Read one file diff and remember it against its tab. */
  async function loadDiff(tab) {
    const repo = state.repo
    if (repo === null || tab === undefined) return
    const token = ++diffToken
    patch({ diffLoading: true, diffError: null, diff: null })
    try {
      const value = await gwCall('diff', {
        cwd: repo.path,
        hash: tab.file.hash,
        path: tab.file.path,
        mode: tab.file.mode,
      })
      if (token !== diffToken) return
      const tabs = state.tabs.map((entry) => (entry.id === tab.id ? { ...entry, diff: value } : entry))
      patch({ diff: value, diffLoading: false, tabs })
    } catch (error) {
      if (token !== diffToken) return
      patch({ diff: null, diffLoading: false, diffError: error })
    }
  }

  /** Open (or focus) one file's diff and bring the centre panel forward. */
  function openFile(file, label) {
    const id = gwTabId(file)
    const existing = state.tabs.find((entry) => entry.id === id)
    const tab = existing ?? { id, file, label: label ?? gwSplitPath(file.path).name, diff: undefined }
    const tabs = existing === undefined ? [...state.tabs, tab] : state.tabs
    patch({ tabs, activeTabId: id })
    layoutRef.current?.selectPanel?.(GW_PANEL_ID)
    if (existing !== undefined && existing.diff !== undefined) patch({ diff: existing.diff, diffError: null, diffLoading: false })
    else void loadDiff(tab)
  }

  /** Focus an already-open tab. */
  function activateTab(id) {
    const tab = state.tabs.find((entry) => entry.id === id)
    if (tab === undefined) return
    patch({ activeTabId: id })
    if (tab.diff !== undefined) patch({ diff: tab.diff, diffError: null, diffLoading: false })
    else void loadDiff(tab)
  }

  /** Close one tab; closing the last one returns to the conversation. */
  function closeTab(id) {
    const index = state.tabs.findIndex((entry) => entry.id === id)
    if (index < 0) return
    const tabs = state.tabs.filter((entry) => entry.id !== id)
    const wasActive = state.activeTabId === id
    const fallback = tabs[Math.min(index, tabs.length - 1)]
    patch({
      tabs,
      activeTabId: wasActive ? (fallback?.id ?? null) : state.activeTabId,
      diff: wasActive ? (fallback?.diff ?? null) : state.diff,
      diffError: null,
    })
    if (wasActive && fallback !== undefined && fallback.diff === undefined) void loadDiff(fallback)
    if (tabs.length === 0) layoutRef.current?.selectPanel?.(null)
  }

  /** Show the conversation, leaving every tab open for later. */
  function showConversation() {
    layoutRef.current?.selectPanel?.(null)
  }

  /** Toggle the dock; hiding it retires the diff panel with it. */
  function setOpen(open) {
    gwWritePrefs({ open })
    if (!open) layoutRef.current?.selectPanel?.(null)
    patch({ open })
  }

  /** Remember the dock height after a resize. */
  function setHeight(px) {
    const height = gwClamp(Math.round(px), 150, gwMaxHeight())
    state = { ...state, height }
    emit()
  }

  /** Persist geometry once the drag ends. */
  function commitGeometry(extra) {
    gwWritePrefs({ height: state.height, branchesWidth: state.branchesWidth, detailWidth: state.detailWidth, ...extra })
  }

  /** Remember the branch column width while dragging. */
  function setBranchesWidth(px) {
    state = { ...state, branchesWidth: gwClamp(Math.round(px), 150, 460) }
    emit()
  }

  /** Remember the details column width while dragging. */
  function setDetailWidth(px) {
    state = { ...state, detailWidth: gwClamp(Math.round(px), 240, 760) }
    emit()
  }

  /** Switch the diff between side-by-side and unified. */
  function setDiffMode(mode) {
    const diffMode = mode === 'unified' ? 'unified' : 'side'
    gwWritePrefs({ diffMode })
    patch({ diffMode })
  }

  /** Text filter applied to the loaded log page. */
  function setFilter(filter) {
    patch({ filter })
  }

  /** Transient notice (copy confirmations). */
  function flash(text) {
    patch({ toast: text })
    globalThis.setTimeout(() => {
      if (state.toast === text) patch({ toast: null })
    }, 1200)
  }

  /** One notice for the last operation; transient tones clear themselves. */
  function notify(tone, code, params) {
    const notice = { tone, code, params: params ?? {} }
    patch({ notice })
    if (tone !== 'error') {
      globalThis.setTimeout(() => {
        if (state.notice === notice) patch({ notice: null })
      }, 6000)
    }
  }

  /** Run one write operation with the shared busy guard. */
  async function runAction(label, operation) {
    if (state.busy !== null) return
    patch({ busy: label, menu: null })
    try {
      await operation()
    } finally {
      patch({ busy: null })
    }
  }

  function notifyGitError(error) {
    notify('error', error?.code === 'conflicts' ? 'gitConflictsBlocking' : 'gitError', {
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  /** Open the branch context menu at the pointer. */
  function openMenu(x, y, branch) {
    patch({ menu: { x, y, branch } })
  }

  function closeMenu() {
    patch({ menu: null })
  }

  /** Open the commit dialog with every changed file selected. */
  async function startCommit() {
    const repo = state.repo
    patch({ menu: null })
    if (repo === null) return
    try {
      const value = await gwCall('status', { cwd: repo.path })
      const files = (value?.entries ?? []).map((entry) => ({ path: entry.path, xy: entry.xy }))
      if (files.length === 0) {
        notify('info', 'commitEmpty')
        return
      }
      patch({
        dialog: {
          kind: 'commit',
          branch: value?.repo?.branch ?? '',
          files,
          message: '',
          selected: files.map((file) => file.path),
        },
      })
    } catch (error) {
      notifyGitError(error)
    }
  }

  function toggleCommitFile(path) {
    const dialog = state.dialog
    if (dialog === null || dialog.kind !== 'commit') return
    const selected = dialog.selected.includes(path)
      ? dialog.selected.filter((item) => item !== path)
      : [...dialog.selected, path]
    patch({ dialog: { ...dialog, selected } })
  }

  function toggleAllCommitFiles(selectAll) {
    const dialog = state.dialog
    if (dialog === null || dialog.kind !== 'commit') return
    patch({ dialog: { ...dialog, selected: selectAll ? dialog.files.map((file) => file.path) : [] } })
  }

  function setCommitMessage(message) {
    const dialog = state.dialog
    if (dialog === null || dialog.kind !== 'commit') return
    patch({ dialog: { ...dialog, message } })
  }

  function closeDialog() {
    patch({ dialog: null })
  }

  /** Create the commit (and optionally push right after it). */
  async function submitCommit(pushAfter) {
    const repo = state.repo
    const dialog = state.dialog
    if (repo === null || dialog === null || dialog.kind !== 'commit') return
    if (dialog.message.trim() === '') {
      notify('warn', 'commitMessageRequired')
      return
    }
    if (dialog.selected.length === 0) {
      notify('warn', 'commitNoFiles')
      return
    }
    const message = dialog.message.trim()
    const paths = dialog.selected.slice()
    patch({ dialog: null })
    await runAction('commit', async () => {
      try {
        const value = await gwCall('commitChanges', { cwd: repo.path, message, paths })
        notify('ok', 'commitDone', { hash: value?.hash ?? '' })
        await reload()
        if (pushAfter) await pushCore()
      } catch (error) {
        notifyGitError(error)
      }
    })
  }

  /** Push the current branch; used standalone and right after a commit. */
  async function pushCore() {
    const repo = state.repo
    if (repo === null) return
    try {
      const value = await gwCall('push', { cwd: repo.path })
      if (value?.status === 'ok') notify('ok', 'pushed', { upstream: value.repo?.upstream ?? '' })
      else if (value?.status === 'auth-required') notify('warn', 'pushAuth', { detail: value.output ?? '' })
      else notify('error', 'pushFailed', { detail: value?.output ?? '' })
      await reload()
    } catch (error) {
      notifyGitError(error)
    }
  }

  function push() {
    return runAction('push', pushCore)
  }

  /** Pull the upstream branch, routing conflicts into the merge window. */
  async function pull(mode) {
    const repo = state.repo
    patch({ menu: null, dialog: null })
    if (repo === null) return
    await runAction('pull', async () => {
      try {
        const value = await gwCall('pull', { cwd: repo.path, mode: mode === 'smart' ? 'smart' : undefined })
        if (value?.status === 'conflicts') {
          notify('warn', 'pullConflicts', { count: (value.conflicts ?? []).length })
          await reload()
          await openMerge()
          return
        }
        if (value?.status === 'local-changes') {
          patch({ dialog: { kind: 'overwrite', files: value.files ?? [] } })
          return
        }
        notify('ok', 'pulled', { upstream: value?.repo?.upstream ?? '' })
        await reload()
      } catch (error) {
        notifyGitError(error)
      }
    })
  }

  /** Read every conflicted file the window needs for the first one. */
  async function openMerge() {
    const repo = state.repo
    if (repo === null) return
    try {
      const value = await gwCall('conflicts', { cwd: repo.path })
      const files = value?.files ?? []
      if (files.length === 0) {
        patch({ merge: null, conflictCount: 0 })
        notify('info', 'mergeNone')
        return
      }
      patch({
        merge: {
          cwd: repo.path,
          files,
          index: 0,
          current: 0,
          cache: value?.file === null || value?.file === undefined ? {} : { [value.file.path]: value.file },
          choices: value?.file === null || value?.file === undefined
            ? {}
            : { [value.file.path]: new Array(gwMergeView(value.file, []).conflicts.length).fill(null) },
        },
        conflictCount: files.length,
        mergeInProgress: true,
      })
    } catch (error) {
      notifyGitError(error)
    }
  }

  /** Switch the merge window to another conflicted file. */
  async function selectMergeFile(index) {
    const merge = state.merge
    if (merge === null) return
    const entry = merge.files[index]
    if (entry === undefined) return
    if (merge.cache[entry.path] !== undefined) {
      patch({ merge: { ...merge, index, current: 0 } })
      return
    }
    try {
      const value = await gwCall('conflicts', { cwd: merge.cwd, path: entry.path })
      const file = value?.file ?? null
      patch({
        merge: {
          ...merge,
          index,
          current: 0,
          cache: { ...merge.cache, [entry.path]: file },
          choices: {
            ...merge.choices,
            [entry.path]: new Array(file === null ? 0 : gwMergeView(file, []).conflicts.length).fill(null),
          },
        },
      })
    } catch (error) {
      notifyGitError(error)
    }
  }

  /** Focus one conflict (drives the bottom accept buttons). */
  function focusConflict(id) {
    const merge = state.merge
    if (merge === null) return
    patch({ merge: { ...merge, current: id } })
  }

  /** Accept the left (local) or right (remote) side of one conflict. */
  function chooseConflict(id, side) {
    const merge = state.merge
    if (merge === null) return
    const entry = merge.files[merge.index]
    const choices = (merge.choices[entry.path] ?? []).slice()
    choices[id] = side
    patch({
      merge: {
        ...merge,
        current: id,
        choices: { ...merge.choices, [entry.path]: choices },
      },
    })
  }

  /** Accept one side for every conflict of the open file. */
  function chooseAll(side) {
    const merge = state.merge
    if (merge === null) return
    const entry = merge.files[merge.index]
    const file = merge.cache[entry.path]
    if (file === undefined || file === null) return
    const count = gwMergeView(file, []).conflicts.length
    patch({
      merge: {
        ...merge,
        choices: { ...merge.choices, [entry.path]: new Array(count).fill(side) },
      },
    })
  }

  /** Write the resolved file, then move to the next conflict (or finish). */
  async function applyMerge() {
    const merge = state.merge
    if (merge === null) return
    const entry = merge.files[merge.index]
    const file = merge.cache[entry.path]
    if (file === undefined || file === null) return
    const view = gwMergeView(file, merge.choices[entry.path])
    if (view.unresolved > 0) {
      notify('warn', 'mergeUnresolved', { count: view.unresolved })
      return
    }
    const content = gwMergeContent(view)
    await runAction('merge', async () => {
      try {
        const value = await gwCall('resolve', { cwd: merge.cwd, path: entry.path, content })
        const remaining = value?.remaining ?? []
        if (remaining.length === 0) {
          patch({ merge: null, conflictCount: 0 })
          notify('ok', 'mergeApplied')
        } else {
          const files = merge.files.filter((item) => remaining.includes(item.path))
          patch({ merge: { ...merge, files, index: 0, current: 0 }, conflictCount: remaining.length })
          await selectMergeFile(0)
          notify('ok', 'mergeFileApplied', { count: remaining.length })
        }
        await reload()
      } catch (error) {
        notifyGitError(error)
      }
    })
  }

  /** Abort the merge and restore the pre-merge state. */
  async function abortMerge() {
    const repo = state.repo
    if (repo === null) return
    patch({ merge: null, menu: null })
    await runAction('abort', async () => {
      try {
        await gwCall('abortMerge', { cwd: repo.path })
        patch({ conflictCount: 0, mergeInProgress: false })
        notify('ok', 'mergeAborted')
        await reload()
      } catch (error) {
        notifyGitError(error)
      }
    })
  }

  /** Close the merge window without touching the merge in progress. */
  function closeMerge() {
    patch({ merge: null })
  }

  /** Commit the resolved merge (no message: git keeps its own MERGE_MSG). */
  async function finishMerge() {
    const repo = state.repo
    if (repo === null) return
    await runAction('commit', async () => {
      try {
        const value = await gwCall('commitChanges', { cwd: repo.path, message: '', paths: [] })
        patch({ mergeInProgress: false, conflictCount: 0 })
        notify('ok', 'mergeCommitted', { hash: value?.hash ?? '' })
        await reload()
      } catch (error) {
        notifyGitError(error)
      }
    })
  }

  function dismissNotice() {
    patch({ notice: null })
  }

  return {
    /** Adopt the right-Sidebar controller once the service exists (or is replaced). */
    attachSidebarRight(value) {
      sidebarRight = value
      emit()
    },
    /** The controller held right now, or undefined while the service is absent. */
    sidebarRight() {
      return sidebarRight
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getState() {
      return state
    },
    loadRepos,
    refreshRepos,
    loadLog,
    loadMore,
    loadBranches,
    reload,
    selectRepo,
    followProject,
    applyProjectRepo,
    selectRef,
    select,
    openFile,
    activateTab,
    closeTab,
    showConversation,
    setOpen,
    setHeight,
    setBranchesWidth,
    setDetailWidth,
    commitGeometry,
    setDiffMode,
    setFilter,
    flash,
    openMenu,
    closeMenu,
    startCommit,
    toggleCommitFile,
    toggleAllCommitFiles,
    setCommitMessage,
    submitCommit,
    closeDialog,
    push,
    pull,
    openMerge,
    selectMergeFile,
    focusConflict,
    chooseConflict,
    chooseAll,
    applyMerge,
    abortMerge,
    closeMerge,
    finishMerge,
    dismissNotice,
  }
}
