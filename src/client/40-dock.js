/**
 * The bottom tool window: IDEA's Git log.
 *
 * Left column — refs (HEAD, local and remote branches) acting as a log filter.
 * Middle column — the commit table with a graph gutter, ref chips, author and
 * date, headed by the "local changes" row while the working tree is dirty.
 * Right column — the selected revision's message and changed files; clicking a
 * file opens its diff in the centre panel.
 */

/** Whether the repositories have been read once in this page. */
let gwBooted = false

/** Load repositories the first time the dock becomes visible. */
function gwBoot(store) {
  if (gwBooted) return
  gwBooted = true
  void store.loadRepos()
}

/** Status letter → colour, matching the IDE's own A/M/D/R vocabulary. */
function gwStatusColor(letter) {
  switch (letter) {
    case 'A':
    case 'U':
    case '?':
      return '#5fb85f'
    case 'D':
      return '#e0725e'
    case 'R':
    case 'C':
      return '#a98bf0'
    case 'M':
      return '#5b9cf6'
    default:
      return 'var(--dsw-alias-label-secondary, #9a9ea8)'
  }
}

/**
 * One chip per ref name, head first. Git decorates the checked-out branch as
 * `HEAD -> x`, which also names `x` itself; showing both would print the same
 * branch twice.
 */
function gwMergeRefs(refs) {
  const order = { head: 0, branch: 1, remote: 2, tag: 3 }
  const byName = new Map()
  for (const ref of refs) {
    const existing = byName.get(ref.name)
    if (existing === undefined || (ref.kind === 'head' && existing.kind !== 'head')) byName.set(ref.name, ref)
  }
  return [...byName.values()].sort((left, right) => (order[left.kind] ?? 9) - (order[right.kind] ?? 9))
}

/** Small chevron used by the ref tree. */
function GwChevron({ open }) {
  return h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': true },
    h('path', {
      d: open ? 'M2 4 L5 7 L8 4' : 'M4 2 L7 5 L4 8',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }))
}

/** Branch glyph used in the ref tree and tabs. */
function GwBranchIcon({ size = 12 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true },
    h('path', {
      d: 'M4.5 2.5v7.2M4.5 11.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm7-1.5V7.4M9 9.9a1.6 1.6 0 0 0 3.2 0 1.6 1.6 0 0 0-3.2 0ZM11.5 7.4a5.4 5.4 0 0 0-4.6-4.6',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.2,
      strokeLinecap: 'round',
    }))
}

/** Git mark for the tab row. */
function GwGitIcon({ size = 13 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true },
    h('g', { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' },
      h('circle', { cx: 6, cy: 6, r: 2.6 }),
      h('circle', { cx: 6, cy: 18, r: 2.6 }),
      h('circle', { cx: 18, cy: 12, r: 2.6 }),
      h('path', { d: 'M6 8.6v6.8M8.6 6h4.6a2.2 2.2 0 0 1 2.2 2.2v1.4' })))
}

/** Close glyph. */
function GwCloseIcon({ size = 10 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 10 10', 'aria-hidden': true },
    h('path', { d: 'M1.5 1.5l7 7M8.5 1.5l-7 7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }))
}

/** Refresh glyph. */
function GwRefreshIcon({ size = 12 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true },
    h('path', {
      d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.6V5.4h-2.8',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }))
}

/** The session whose conversation seat is on screen, live. */
function gwUseMountedSession(sidebarRight) {
  const subscribe = useCallback((listener) => {
    const mounted = sidebarRight === undefined ? undefined : sidebarRight.mounted
    if (mounted === undefined || typeof mounted.subscribe !== 'function') return () => {}
    return mounted.subscribe(listener)
  }, [sidebarRight])
  const getSnapshot = useCallback(() => {
    const mounted = sidebarRight === undefined ? undefined : sidebarRight.mounted
    return mounted === undefined || typeof mounted.getSnapshot !== 'function' ? undefined : mounted.getSnapshot()
  }, [sidebarRight])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** The dock entry. */
function GwDock({ store, t, translate, useWorkspaces }) {
  const tr = typeof translate === 'function' ? translate : (t ?? ((key) => key))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const sidebarRight = store.sidebarRight()
  const [collapsed, setCollapsed] = useState({ local: false, remote: true })
  const mountedSessionId = gwUseMountedSession(sidebarRight)
  // A host without the workspace selector simply never follows the project.
  const selectWorkspaces = typeof useWorkspaces === 'function' ? useWorkspaces : () => undefined
  const workspaceItems = selectWorkspaces((snapshot) => (snapshot === null || snapshot === undefined ? undefined : snapshot.items))

  useEffect(() => {
    if (state.open) gwBoot(store)
  }, [state.open])

  // Keep the log on the project the user is working in: the mounted session's
  // workspace decides the repository (their own pick wins until they switch).
  useEffect(() => {
    if (typeof mountedSessionId !== 'string' || !Array.isArray(workspaceItems)) return
    const workspace = workspaceItems.find((item) => Array.isArray(item.sessionIds) && item.sessionIds.includes(mountedSessionId))
    if (workspace !== undefined && typeof workspace.path === 'string') store.followProject(workspace.path)
  }, [mountedSessionId, workspaceItems, store])

  const beginHeightDrag = (event) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = store.getState().height
    const move = (moveEvent) => store.setHeight(startHeight - (moveEvent.clientY - startY))
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      store.commitGeometry()
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  const beginWidthDrag = (event, kind) => {
    event.preventDefault()
    const startX = event.clientX
    const start = kind === 'branches' ? store.getState().branchesWidth : store.getState().detailWidth
    const move = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      if (kind === 'branches') store.setBranchesWidth(start + delta)
      else store.setDetailWidth(start - delta)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      store.commitGeometry()
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  if (!state.open) return null

  const filter = state.filter.trim().toLowerCase()
  const visibleCommits = filter === ''
    ? state.commits
    : state.commits.filter((commit) => (
      commit.subject.toLowerCase().includes(filter)
      || commit.author.toLowerCase().includes(filter)
      || commit.hash.toLowerCase().includes(filter)
    ))
  const worktreeCount = state.repoInfo?.changeCount ?? 0
  const logColumns = `${Math.max(state.lanes * 13 + 12, 26)}px minmax(0, 1fr) 132px 108px`
  const branchName = state.ref !== null
    ? state.ref
    : (state.repoInfo?.branch ?? (state.repoInfo?.detached === true ? 'HEAD' : ''))

  const refTree = state.branches
  const localBranches = refTree.local.filter((branch) => branch.name !== '')
  const remoteBranches = refTree.remote.filter((branch) => !branch.name.endsWith('/HEAD'))

  const openBranchMenu = (event, name) => {
    event.preventDefault()
    event.stopPropagation()
    store.openMenu(event.clientX, event.clientY, name)
  }

  const renderBranch = (branch, kind) => h('div', {
    key: `${kind}:${branch.name}`,
    className: `gw-tree-row${branch.name === state.ref ? ' active' : ''}${branch.head === '*' ? ' head' : ''}`,
    title: `${branch.name}\n${tr('menuHint')}`,
    onClick: () => { void store.selectRef(branch.name === state.ref ? null : branch.name) },
    onContextMenu: (event) => openBranchMenu(event, branch.name),
  }, [
    h('span', { key: 'icon', style: { color: branch.head === '*' ? 'var(--dsw-alias-brand-primary, #4a88ff)' : 'inherit', display: 'inline-flex' } }, h(GwBranchIcon, { size: 11 })),
    h('span', { key: 'name', className: 'gw-branch-name' }, branch.name),
    branch.ahead === 0 && branch.behind === 0 ? null : h('span', { key: 'meta', className: 'gw-branch-meta' }, `${branch.ahead === 0 ? '' : `↑${branch.ahead}`}${branch.behind === 0 ? '' : `↓${branch.behind}`}`),
  ])

  // Never taller than the room the shell can spare (see gwMaxHeight).
  const dockHeight = Math.min(state.height, gwMaxHeight())
  return h('div', {
    className: 'gw-dock',
    style: { height: `${dockHeight}px` },
    // Anywhere else in the window (log rows, detail files, empty space) opens
    // the plugin's own menu instead of the browser's. Text fields keep theirs.
    onContextMenu: (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea')) return
      openBranchMenu(event, state.repoInfo?.branch ?? '')
    },
  }, [
    h(GwStyle, { key: 'style' }),
    h('div', { key: 'resizer', className: 'gw-resizer', onMouseDown: beginHeightDrag, title: tr('resizeHint') }),

    h('div', { key: 'tabrow', className: 'gw-tabrow' }, [
      h('div', { key: 'tab', className: 'gw-tab active' }, [
        h(GwGitIcon, { key: 'icon' }),
        h('span', { key: 'label' }, tr('log')),
        worktreeCount > 0 ? h('span', { key: 'count', className: 'gw-count' }, String(worktreeCount)) : null,
      ]),
      h('div', { key: 'spacer', className: 'gw-tabspacer' }),
      h('div', { key: 'toolbar', className: 'gw-toolbar' }, [
        h('label', { key: 'repo', className: 'gw-chip', title: state.repo?.path ?? tr('noRepo') }, [
          h('span', { key: 'k', style: { opacity: 0.75 } }, tr('repository')),
          h('select', {
            key: 'v',
            value: state.repo?.path ?? '',
            disabled: state.repos.length === 0,
            onChange: (event) => { void store.selectRepo(event.target.value, { manual: true }) },
          }, state.repos.map((entry) => h('option', { key: entry.path, value: entry.path }, entry.title))),
        ]),
        state.conflictCount > 0 ? h('button', {
          key: 'conflicts',
          className: 'gw-chip gw-chip-warn',
          title: tr('menuResolveHint'),
          onClick: () => { void store.openMerge() },
        }, [`⚠ ${String(tr('conflictsBadge')).replace('{count}', String(state.conflictCount))}`]) : null,
        state.mergeInProgress === true && state.conflictCount === 0 ? h('button', {
          key: 'mergecommit',
          className: 'gw-chip',
          title: tr('finishMergeHint'),
          onClick: () => { void store.finishMerge() },
        }, tr('finishMerge')) : null,
        branchName === '' ? null : h('div', {
          key: 'branch',
          className: 'gw-chip',
          title: state.ref !== null ? tr('clearFilter') : `${branchName}\n${tr('menuHint')}`,
          onClick: () => { if (state.ref !== null) void store.selectRef(null) },
          onContextMenu: (event) => openBranchMenu(event, branchName),
          style: state.ref !== null ? { cursor: 'pointer', color: 'var(--dsw-alias-label-primary, #dfe1e5)' } : undefined,
        }, [
          h('span', { key: 'icon', style: { display: 'inline-flex' } }, h(GwBranchIcon, { size: 11 })),
          h('span', { key: 'name' }, branchName),
          state.ref !== null ? h('span', { key: 'x', style: { opacity: 0.7 } }, '×') : null,
        ]),
        h('input', {
          key: 'filter',
          className: 'gw-filter',
          value: state.filter,
          placeholder: tr('filterPlaceholder'),
          spellCheck: false,
          onChange: (event) => store.setFilter(event.target.value),
        }),
        h('button', {
          key: 'refresh',
          className: 'gw-iconbtn',
          title: tr('refresh'),
          onClick: () => { void store.reload() },
        }, h(GwRefreshIcon)),
        h('button', {
          key: 'close',
          className: 'gw-iconbtn',
          title: tr('close'),
          onClick: () => store.setOpen(false),
        }, h(GwCloseIcon)),
      ]),
    ]),

    h('div', { key: 'body', className: 'gw-body' }, [
      h('div', { key: 'branches', className: 'gw-branches', style: { width: `${state.branchesWidth}px` } }, [
        h('div', { key: 'head', className: 'gw-branches-head' }, [
          h(GwBranchIcon, { key: 'icon', size: 11 }),
          h('span', { key: 'label' }, tr('branches')),
        ]),
        h('div', { key: 'scroll', className: 'gw-branches-scroll' }, [
          h('div', {
            key: 'all',
            className: `gw-tree-row${state.ref === null ? ' active' : ''}`,
            style: { paddingLeft: 10 },
            title: tr('menuHint'),
            onClick: () => { if (state.ref !== null) void store.selectRef(null) },
            onContextMenu: (event) => openBranchMenu(event, state.repoInfo?.branch ?? ''),
          }, [h('span', { key: 'icon', style: { display: 'inline-flex', opacity: 0.8 } }, h(GwGitIcon, { size: 11 })), h('span', { key: 'name', className: 'gw-branch-name' }, tr('allBranches'))]),
          h('div', {
            key: 'local-group',
            className: 'gw-tree-group',
            onClick: () => setCollapsed({ ...collapsed, local: !collapsed.local }),
          }, [
            h(GwChevron, { key: 'chev', open: !collapsed.local }),
            h('span', { key: 'label' }, `${tr('local')} (${localBranches.length})`),
          ]),
          collapsed.local ? null : localBranches.map((branch) => renderBranch(branch, 'local')),
          h('div', {
            key: 'remote-group',
            className: 'gw-tree-group',
            onClick: () => setCollapsed({ ...collapsed, remote: !collapsed.remote }),
          }, [
            h(GwChevron, { key: 'chev', open: !collapsed.remote }),
            h('span', { key: 'label' }, `${tr('remote')} (${remoteBranches.length})`),
          ]),
          collapsed.remote ? null : remoteBranches.map((branch) => renderBranch(branch, 'remote')),
        ]),
      ]),
      h('div', { key: 'split1', className: 'gw-dock-splitter', onMouseDown: (event) => beginWidthDrag(event, 'branches') }),

      h('div', { key: 'log', className: 'gw-log', style: { '--gw-log-cols': logColumns } }, [
        h('div', { key: 'head', className: 'gw-log-head' }, [
          h('span', { key: 'g' }, ''),
          h('span', { key: 's' }, tr('subject')),
          h('span', { key: 'a' }, tr('author')),
          h('span', { key: 'd' }, tr('date')),
        ]),
        h('div', {
          key: 'scroll',
          className: 'gw-log-scroll',
          tabIndex: 0,
          onKeyDown: (event) => {
            const entries = [...((state.repoInfo?.changeCount ?? 0) > 0 ? [{ kind: 'worktree' }] : []), ...visibleCommits]
            if (entries.length === 0) return
            const current = state.selected?.kind === 'worktree'
              ? 0
              : entries.findIndex((entry) => entry.kind === 'commit' && entry.hash === state.selected?.hash)
            let next = current
            if (event.key === 'ArrowDown') next = Math.min(current + 1, entries.length - 1)
            else if (event.key === 'ArrowUp') next = Math.max(current - 1, 0)
            else return
            event.preventDefault()
            const entry = entries[next]
            if (entry === undefined) return
            void store.select(entry.kind === 'worktree' ? { kind: 'worktree' } : { kind: 'commit', hash: entry.hash })
          },
        }, [
          worktreeCount > 0 ? h('div', {
            key: 'worktree',
            className: `gw-row local${state.selected?.kind === 'worktree' ? ' selected' : ''}`,
            onClick: () => { void store.select({ kind: 'worktree' }) },
          }, [
            h('div', { key: 'g', className: 'gw-cell gw-graphcell' }, h('span', {
              style: {
                display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                background: '#5fb85f', marginLeft: 3,
              },
            })),
            h('div', { key: 's', className: 'gw-cell gw-subject' }, [
              h('span', { key: 't', className: 'gw-subject-text' }, tr('localChanges')),
              h('span', { key: 'n', className: 'gw-count', style: { fontSize: 10, opacity: 0.75 } }, `(${worktreeCount})`),
            ]),
            h('div', { key: 'a', className: 'gw-cell gw-author' }, ''),
            h('div', { key: 'd', className: 'gw-cell gw-date' }, ''),
          ]) : null,
          visibleCommits.length === 0 && state.logLoading === false
            ? h('div', { key: 'empty', className: 'gw-empty' }, state.logError === null ? tr('noCommits') : `${tr('errorPrefix')}${state.logError.message ?? state.logError}`)
            : null,
          visibleCommits.map((commit, index) => h('div', {
            key: commit.hash,
            className: `gw-row${state.selected?.kind === 'commit' && state.selected.hash === commit.hash ? ' selected' : ''}`,
            onClick: () => { void store.select({ kind: 'commit', hash: commit.hash }) },
            onDoubleClick: () => {
              const file = store.getState().files[0]
              if (file !== undefined) store.openFile(file)
            },
            title: `${commit.hash}\n${commit.author} ${commit.authorEmail}`,
          }, [
            h('div', { key: 'g', className: 'gw-cell gw-graphcell' }, h(GwGraphCell, {
              row: state.graphRows[index] ?? { lane: 0, before: [], beforeColors: [], after: [], afterColors: [], parentLanes: [], color: '#5b9cf6', hash: commit.hash },
              lanes: state.lanes,
            })),
            h('div', { key: 's', className: 'gw-cell gw-subject' }, [
              gwMergeRefs(commit.refs).map((ref, refIndex) => h('span', {
                key: `${ref.kind}-${refIndex}-${ref.name}`,
                className: `gw-ref ${ref.kind}`,
                title: ref.name,
              }, ref.name)),
              h('span', { key: 't', className: 'gw-subject-text' }, commit.subject),
            ]),
            h('div', { key: 'a', className: 'gw-cell gw-author' }, commit.author),
            h('div', { key: 'd', className: 'gw-cell gw-date' }, gwRelativeDate(commit.authorTime, tr)),
          ])),
          state.hasMore && state.logLoading === false ? h('button', {
            key: 'more',
            className: 'gw-more',
            onClick: () => { void store.loadMore() },
          }, tr('loadMore')) : null,
          state.logLoading ? h('div', { key: 'loading', className: 'gw-empty' }, tr('loading')) : null,
        ]),
      ]),
      h('div', { key: 'split2', className: 'gw-dock-splitter', onMouseDown: (event) => beginWidthDrag(event, 'detail') }),
      h('div', { key: 'detail', className: 'gw-detail', style: { width: `${state.detailWidth}px` } },
        h(GwCommitDetails, { store, state, tr })),
    ]),
  ])
}

/** The right-hand details column. */
function GwCommitDetails({ store, state, tr }) {
  if (state.repo === null) {
    return h('div', { className: 'gw-empty' }, tr('noRepo'))
  }
  if (state.detailLoading) {
    return h('div', { className: 'gw-empty' }, tr('loading'))
  }
  if (state.selected === null) {
    return h('div', { className: 'gw-empty' }, tr('selectCommit'))
  }
  const worktree = state.selected.kind === 'worktree'
  const detail = state.detail
  const subject = worktree ? tr('localChanges') : (detail?.subject ?? '')
  const hash = worktree ? '' : (detail?.hash ?? '')
  const author = worktree ? '' : (detail?.author ?? '')
  const time = worktree ? 0 : (detail?.authorTime ?? 0)
  const files = state.files
  return [
    h('div', { key: 'head', className: 'gw-detail-head' }, [
      h('div', { key: 'subject', className: 'gw-detail-subject' }, subject),
      h('div', { key: 'meta', className: 'gw-detail-meta' }, [
        worktree ? h('span', { key: 'w' }, tr('worktreeHint')) : h('span', {
          key: 'hash',
          className: 'gw-mono gw-hash',
          title: tr('copyHash'),
          style: { cursor: 'pointer' },
          onClick: () => {
            void globalThis.navigator?.clipboard?.writeText(hash).catch(() => undefined)
            store.flash(tr('copied'))
          },
        }, gwShort(hash)),
        worktree ? null : h('span', { key: 'sep1', style: { opacity: 0.4 } }, '·'),
        worktree ? null : h('span', { key: 'author' }, author),
        worktree ? null : h('span', { key: 'sep2', style: { opacity: 0.4 } }, '·'),
        worktree ? null : h('span', { key: 'date' }, gwFullDate(time)),
      ]),
    ]),
    worktree || detail === null || detail.body === '' ? null : h('div', { key: 'message', className: 'gw-detail-message' }, detail.body),
    h('div', { key: 'files-head', className: 'gw-files-head' }, [
      h('span', { key: 'count' }, String(tr('filesChanged')).replace('{count}', String(files.length))),
      detail === null ? null : h('span', { key: 'add', className: 'gw-addstat' }, `+${detail.additions}`),
      detail === null ? null : h('span', { key: 'del', className: 'gw-delstat' }, `-${detail.deletions}`),
    ]),
    h('div', { key: 'files', className: 'gw-files' }, files.length === 0
      ? h('div', { className: 'gw-empty' }, tr('noFiles'))
      : files.map((file) => h(GwFileRow, { key: `${file.mode}:${file.path}`, file, store, state, tr }))),
    state.toast === null ? null : h('div', { key: 'toast', className: 'gw-copytoast' }, state.toast),
  ]
}

/** One changed-file row. */
function GwFileRow({ file, store, state, tr }) {
  const split = gwSplitPath(file.path)
  const additions = file.additions ?? file.stat?.additions
  const deletions = file.deletions ?? file.stat?.deletions
  const active = state.activeTabId === gwTabId({ mode: file.mode, hash: file.hash, path: file.path })
  return h('div', {
    className: `gw-file${active ? ' selected' : ''}`,
    title: file.oldPath === undefined ? file.path : `${file.oldPath} → ${file.path}`,
    onClick: () => store.openFile(file),
  }, [
    h('span', { key: 'status', className: 'gw-status', style: { color: gwStatusColor(file.status) } }, file.status),
    // 与 IDEA 一致：变更列表只显示文件名；完整路径由整行的 title 提供，
    // 这里不再设 title，避免空目录时把上层的提示顶掉。
    h('span', { key: 'path', className: 'gw-path' }, [
      h('span', { key: 'name', className: 'gw-name' }, split.name),
    ]),
    file.staged === true ? h('span', { key: 'staged', className: 'gw-branch-meta', title: tr('staged'), style: { opacity: 0.7 } }, '✓') : null,
    file.binary === true ? h('span', { key: 'bin', className: 'gw-branch-meta', style: { opacity: 0.6 } }, tr('binaryTag')) : null,
    additions === undefined || additions === 0 ? null : h('span', { key: 'add', className: 'gw-addstat' }, `+${additions}`),
    deletions === undefined || deletions === 0 ? null : h('span', { key: 'del', className: 'gw-delstat' }, `-${deletions}`),
  ])
}

/** First seven characters of a hash. */
function gwShort(hash) {
  return typeof hash === 'string' ? hash.slice(0, 7) : ''
}
