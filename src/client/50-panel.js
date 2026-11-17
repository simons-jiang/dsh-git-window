/**
 * The centre surface: the diff of the file the user picked in the dock, with
 * an editor-style tab strip. The first tab is the Conversation, so the panel is
 * never a dead end; closing the last file tab returns there automatically.
 */

/** Count added and removed lines in one file diff. */
function gwDiffStats(diff) {
  let additions = 0
  let deletions = 0
  for (const hunk of diff.hunks ?? []) {
    for (const line of hunk.lines ?? []) {
      if (line.type === '+') additions += 1
      else if (line.type === '-') deletions += 1
    }
  }
  return { additions, deletions }
}

/** The conversation tab that leads back to the chat. */
function GwEditorTabs({ store, state, tr }) {
  return h('div', { className: 'gw-etabs' }, [
    h('div', {
      key: 'conversation',
      className: 'gw-etab',
      title: tr('backToConversation'),
      onClick: () => store.showConversation(),
    }, [
      h('span', { key: 'icon', style: { opacity: 0.7, display: 'inline-flex' } }, h(GwChatIcon, { size: 12 })),
      h('span', { key: 'label', className: 'gw-tabtitle' }, tr('conversation')),
    ]),
    ...state.tabs.map((tab) => h('div', {
      key: tab.id,
      className: `gw-etab${tab.id === state.activeTabId ? ' active' : ''}`,
      title: tab.file.path,
      onClick: () => store.activateTab(tab.id),
    }, [
      h('span', { key: 'label', className: 'gw-tabtitle' }, tab.label),
      h('span', {
        key: 'close',
        className: 'gw-close',
        title: tr('close'),
        onClick: (event) => {
          event.stopPropagation()
          store.closeTab(tab.id)
        },
      }, h(GwCloseIcon, { size: 9 })),
    ])),
  ])
}

/**
 * Path breadcrumb for the diff toolbar. The directory part is the only
 * shrinkable segment, so a long path never hides the file name.
 */
function GwCrumbs({ path }) {
  const split = gwSplitPath(path)
  const parts = split.dir === '' ? [] : split.dir.replace(/\/$/, '').split('/')
  const directories = []
  parts.forEach((part, index) => {
    if (index > 0) directories.push(h('span', { key: `s${index}`, className: 'gw-crumb-sep' }, '/'))
    directories.push(h('span', { key: `d${index}` }, part))
  })
  if (directories.length > 0) directories.push(h('span', { key: 'sfile', className: 'gw-crumb-sep' }, '/'))
  return [
    h('span', { key: 'dirs', className: 'gw-crumb-dirs', title: path }, directories),
    h('span', { key: 'file', className: 'gw-crumb-file' }, split.name),
  ]
}

/** The diff panel entry. */
function GwDiffPanel({ store, t, translate }) {
  const tr = typeof translate === 'function' ? translate : (t ?? ((key) => key))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const tab = state.tabs.find((entry) => entry.id === state.activeTabId)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (event.defaultPrevented) return
      const current = store.getState()
      // A menu, dialog or merge window owns Escape while it is open.
      if (current.menu !== null || current.dialog !== null || current.merge !== null) return
      event.preventDefault()
      store.showConversation()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store])

  const stats = state.diff === null ? null : gwDiffStats(state.diff)
  const body = state.repo === null
    ? h('div', { className: 'gw-diffstates' }, tr('noRepo'))
    : tab === undefined
      ? h('div', { className: 'gw-diffstates' }, [
        h('div', { key: 'big', className: 'gw-big' }, tr('emptyDiff')),
        h('div', { key: 'hint' }, tr('emptyDiffHint')),
      ])
      : state.diffLoading
        ? h('div', { className: 'gw-diffstates' }, tr('loading'))
        : state.diffError !== null
          ? h('div', { className: 'gw-diffstates' }, [
            h('div', { key: 'msg' }, `${tr('diffError')}${state.diffError.message ?? state.diffError}`),
            h('button', {
              key: 'retry',
              className: 'gw-btn',
              onClick: () => store.activateTab(tab.id),
            }, tr('refresh')),
          ])
          : state.diff === null
            ? h('div', { className: 'gw-diffstates' }, tr('loading'))
            : state.diff.binary
              ? h('div', { className: 'gw-diffstates' }, tr('binary'))
              : (state.diff.hunks ?? []).length === 0
                ? h('div', { className: 'gw-diffstates' }, tr('noDiff'))
                : h(GwDiffBody, { diff: state.diff, mode: state.diffMode })

  return h('div', { className: 'gw-diff' }, [
    h(GwStyle, { key: 'style' }),
    h(GwEditorTabs, { key: 'tabs', store, state, tr }),
    h('div', { key: 'toolbar', className: 'gw-difftoolbar' }, [
      h('div', { key: 'crumbs', className: 'gw-crumbs' }, tab === undefined ? [] : h(GwCrumbs, { path: tab.file.path })),
      stats === null || stats.additions === 0 ? null : h('span', { key: 'add', className: 'gw-addstat' }, `+${stats.additions}`),
      stats === null || stats.deletions === 0 ? null : h('span', { key: 'del', className: 'gw-delstat' }, `-${stats.deletions}`),
      tab === undefined ? null : h('span', { key: 'rev', className: 'gw-mono', style: { opacity: 0.7 } },
        tab.file.mode === 'commit' ? gwShort(tab.file.hash)
          : tab.file.mode === 'index' ? tr('staged')
            : tab.file.mode === 'compare'
              ? (tab.file.head === null || tab.file.head === undefined
                ? `${tab.file.base} → ${tr('worktreeHint')}`
                : `${tab.file.base}..${tab.file.head}`)
              : tr('worktreeHint')),
      state.diff?.binary === true ? null : h('div', { key: 'modes', className: 'gw-seg' }, [
        h('button', {
          key: 'side',
          className: state.diffMode === 'side' ? 'active' : '',
          onClick: () => store.setDiffMode('side'),
        }, tr('sideBySide')),
        h('button', {
          key: 'unified',
          className: state.diffMode === 'unified' ? 'active' : '',
          onClick: () => store.setDiffMode('unified'),
        }, tr('unified')),
      ]),
      tab === undefined ? null : h('button', {
        key: 'back',
        className: 'gw-iconbtn',
        title: tr('backToConversation'),
        onClick: () => store.showConversation(),
      }, h(GwCloseIcon, { size: 11 })),
    ]),
    h('div', { key: 'body', className: 'gw-diffbody' }, [
      state.diff?.truncated === true ? h('div', { key: 'trunc', className: 'gw-banner', style: { position: 'sticky', top: 0 } }, tr('truncated')) : null,
      body,
    ]),
  ])
}

/** Conversation glyph for the tab that leads back to the chat. */
function GwChatIcon({ size = 12 }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true },
    h('path', {
      d: 'M2.5 3.5h11v7h-6l-3.2 2.4v-2.4H2.5z',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.3,
      strokeLinejoin: 'round',
    }))
}

/** The sidebar footer control that shows and hides the tool window. */
function GwToggle({ store, t, translate }) {
  const tr = typeof translate === 'function' ? translate : (t ?? ((key) => key))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  // The dock unmounts while closed, so this seat carries the stylesheet too.
  return [
    h(GwStyle, { key: 'style' }),
    h('button', {
      key: 'button',
      className: `gw-iconbtn${state.open ? ' on' : ''}`,
      title: state.open ? tr('hideWindow') : tr('showWindow'),
      'aria-pressed': state.open,
      style: { width: 24, height: 24 },
      onClick: () => store.setOpen(!state.open),
    }, h(GwGitIcon, { size: 15 })),
  ]
}
