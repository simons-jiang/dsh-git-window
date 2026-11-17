/**
 * Floating surfaces owned by the tool window: the branch context menu, the
 * commit dialog, the "local changes would be merged over" dialog, the merge
 * window, and the transient notice/busy pills.
 *
 * They are registered into `shell.overlay` (a root-scoped floating list) rather
 * than rendered inside the dock, because the dock sits in a clipped, scrolling
 * frame — anything absolute inside it would be cut off.
 */

/**
 * Menu rows for one branch, in IntelliJ's order: checkout, compare, show diff
 * with the working tree, merge it into current, update, push — then the two
 * commit shortcuts this window adds. Rebase, rename, delete and upstream
 * edits are deliberately not offered: this window never rewrites history or
 * removes branches.
 */
function gwMenuItems(state, tr) {
  const selected = state.menu?.branch ?? ''
  const remote = state.menu?.remote === true
  const current = state.repoInfo?.branch ?? ''
  const noRepo = state.repo === null
  const busy = state.busy !== null
  const canCompare = selected !== '' && current !== '' && selected !== current
  const items = [
    { id: 'checkout', label: tr('menuCheckout'), hint: tr('menuCheckoutHint'), disabled: noRepo || busy || selected === '' || (!remote && selected === current), run: () => state.store.checkout(selected, remote) },
    { id: 'compare', label: tr('menuCompareWith').replace('{ref}', current), hint: tr('menuCompareHint'), disabled: noRepo || busy || !canCompare, run: () => state.store.compareWith(current, selected, tr('compareTitle').replace('{ref}', selected)) },
    { id: 'worktree', label: tr('menuWorktreeDiff'), hint: tr('menuWorktreeDiffHint'), disabled: noRepo || busy || selected === '', run: () => state.store.compareWith(selected, null, tr('compareWorktreeTitle').replace('{ref}', selected)) },
    { id: 'merge', label: tr('menuMergeInto').replace('{ref}', selected).replace('{current}', current), hint: tr('menuMergeHint'), disabled: noRepo || busy || !canCompare, run: () => state.store.mergeBranch(selected) },
    { id: 'sep-writes', separator: true },
    { id: 'update', label: tr('menuUpdate'), hint: tr('menuUpdateHint'), disabled: noRepo || busy || current === '' || selected !== current, run: () => state.store.pull() },
    { id: 'push', label: tr('menuPush'), hint: tr('menuPushHint'), disabled: noRepo || busy || current === '' || selected !== current, run: () => state.store.push() },
  ]
  if (state.conflictCount > 0 || state.mergeInProgress === true) {
    items.push({ id: 'sep-conflicts', separator: true })
    items.push({ id: 'resolve', label: tr('menuResolve'), hint: tr('menuResolveHint'), disabled: busy, run: () => state.store.openMerge() })
  }
  if (state.mergeInProgress === true) {
    items.push({ id: 'abort', label: tr('menuAbortMerge'), hint: tr('menuAbortMergeHint'), disabled: busy, run: () => state.store.abortMerge() })
  }
  items.push({ id: 'sep-commit', separator: true })
  items.push({ id: 'commit', label: tr('menuCommit'), hint: tr('menuCommitHint'), disabled: noRepo || busy, run: () => state.store.startCommit() })
  items.push({ id: 'commit-push', label: tr('menuCommitPush'), hint: tr('menuCommitPushHint'), disabled: noRepo || busy, run: () => state.store.startCommit() })
  return items
}

/** Branch context menu. */
function GwContextMenu({ store, state, tr }) {
  const menu = state.menu
  const items = gwMenuItems({ ...state, store }, tr)
  const width = 286
  const rowHeight = (item) => (item.separator === true ? 9 : 30)
  const height = 12 + items.reduce((sum, item) => sum + rowHeight(item), 0) + 10
  const left = Math.max(8, Math.min(menu.x, (globalThis.innerWidth || 1200) - width - 8))
  const top = Math.max(8, Math.min(menu.y, (globalThis.innerHeight || 800) - Math.min(height, 640) - 8))
  const renderItem = (item) => {
    if (item.separator === true) return h('div', { key: item.id, className: 'gw-menu-sep' })
    return h('button', {
      key: item.id,
      className: 'gw-menu-item',
      disabled: item.disabled === true,
      title: item.hint,
      onClick: () => item.run(),
    }, item.label)
  }
  return [
    h('div', {
      key: 'backdrop',
      className: 'gw-menu-backdrop',
      onMouseDown: () => store.closeMenu(),
      onContextMenu: (event) => { event.preventDefault(); store.closeMenu() },
    }),
    h('div', {
      key: 'menu',
      className: 'gw-menu',
      style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: '640px', overflowY: 'auto' },
    }, [
      h('div', { key: 'head', className: 'gw-menu-head' }, [
        h(GwBranchIcon, { key: 'i', size: 11 }),
        h('span', { key: 'n', className: 'gw-menu-branch', title: menu.branch ?? '' }, menu.branch ?? tr('allBranches')),
      ]),
      items.map(renderItem),
    ]),
  ]
}

/** Commit dialog: message plus the files to stage. */
function GwCommitDialog({ store, state, tr }) {
  const dialog = state.dialog
  const allSelected = dialog.files.length > 0 && dialog.selected.length === dialog.files.length
  return h('div', { key: 'dialog', className: 'gw-dialog' }, [
    h('div', { key: 'title', className: 'gw-dialog-title' }, tr('commitTitle')),
    h('div', { key: 'sub', className: 'gw-dialog-sub' }, dialog.branch === undefined ? '' : `${tr('repository')}: ${dialog.branch}`),
    h('textarea', {
      key: 'message',
      className: 'gw-dialog-input',
      rows: 3,
      autoFocus: true,
      placeholder: tr('commitPlaceholder'),
      value: dialog.message,
      onChange: (event) => store.setCommitMessage(event.target.value),
      onKeyDown: (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') store.submitCommit(false)
      },
    }),
    h('div', { key: 'files-head', className: 'gw-dialog-row' }, [
      h('label', { key: 'all', className: 'gw-dialog-check' }, [
        h('input', {
          key: 'box',
          type: 'checkbox',
          checked: allSelected,
          onChange: () => store.toggleAllCommitFiles(!allSelected),
        }),
        h('span', { key: 't' }, tr('commitFiles').replace('{count}', String(dialog.files.length))),
      ]),
    ]),
    h('div', { key: 'files', className: 'gw-dialog-files' }, dialog.files.map((file) => {
      const checked = dialog.selected.includes(file.path)
      const split = gwSplitPath(file.path)
      return h('label', { key: file.path, className: 'gw-dialog-file', title: file.path }, [
        h('input', {
          key: 'box',
          type: 'checkbox',
          checked,
          onChange: () => store.toggleCommitFile(file.path),
        }),
        h('span', { key: 's', className: 'gw-status', style: { color: gwStatusColor(file.xy.replace(/\s/g, '')[0] ?? 'M') } }, file.xy.replace(/\s/g, '') || 'M'),
        h('span', { key: 'p', className: 'gw-path' }, [
          h('span', { key: 'n', className: 'gw-name' }, split.name),
        ]),
      ])
    })),
    h('div', { key: 'foot', className: 'gw-dialog-foot' }, [
      h('button', { key: 'cancel', className: 'gw-btn', onClick: () => store.closeDialog() }, tr('cancel')),
      h('div', { key: 'spacer', className: 'gw-tabspacer' }),
      h('button', { key: 'commit', className: 'gw-btn', onClick: () => store.submitCommit(false) }, tr('commitOnly')),
      h('button', { key: 'both', className: 'gw-btn primary', onClick: () => store.submitCommit(true) }, tr('commitAndPush')),
    ]),
  ])
}

/** "Your local changes would be overwritten" dialog (IDEA's merge problem box). */
function GwOverwriteDialog({ store, state, tr }) {
  const dialog = state.dialog
  return h('div', { key: 'dialog', className: 'gw-dialog gw-dialog-problem' }, [
    h('div', { key: 'title', className: 'gw-dialog-title' }, tr('overwriteTitle')),
    h('div', { key: 'text', className: 'gw-dialog-text' }, tr('overwriteText')),
    h('div', { key: 'text2', className: 'gw-dialog-text dim' }, tr('overwriteHint')),
    h('div', { key: 'files', className: 'gw-dialog-files' }, dialog.files.map((file) => h('div', { key: file, className: 'gw-dialog-file' }, [
      h('span', { key: 's', className: 'gw-status', style: { color: '#5b9cf6' } }, 'M'),
      h('span', { key: 'p', className: 'gw-path' }, file),
    ]))),
    h('div', { key: 'foot', className: 'gw-dialog-foot' }, [
      h('button', { key: 'cancel', className: 'gw-btn', onClick: () => store.closeDialog() }, tr('overwriteCancel')),
      h('div', { key: 'spacer', className: 'gw-tabspacer' }),
      h('button', { key: 'smart', className: 'gw-btn primary', onClick: () => store.pull('smart') }, tr('overwriteSmart')),
    ]),
  ])
}

/** One toast line for the last git operation. */
function GwNotice({ store, state, tr }) {
  const notice = state.notice
  const tone = notice.tone === 'ok' ? 'ok' : notice.tone === 'error' ? 'error' : 'info'
  const template = tr(notice.code)
  const text = (typeof template === 'string' ? template : notice.code).replace('{detail}', notice.params?.detail ?? '')
    .replace('{hash}', notice.params?.hash ?? '')
    .replace('{count}', String(notice.params?.count ?? ''))
    .replace('{upstream}', notice.params?.upstream ?? '')
    .replace('{branch}', notice.params?.branch ?? '')
  return h('div', { className: `gw-notice ${tone}`, role: 'status' }, [
    h('span', { key: 't', className: 'gw-notice-text', title: notice.params?.detail ?? '' }, text),
    notice.params?.detail === undefined ? null : h('pre', { key: 'd', className: 'gw-notice-detail' }, notice.params.detail),
    h('button', { key: 'x', className: 'gw-iconbtn', onClick: () => store.dismissNotice() }, h(GwCloseIcon, { size: 9 })),
  ])
}

/** The overlay seat: exactly one floating surface is visible at a time. */
function GwOverlay({ store, t, translate }) {
  const tr = typeof translate === 'function' ? translate : (t ?? ((key) => key))
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)
  // Escape dismisses whatever floating surface is on top: a dialog first, then
  // the branch menu. It never reaches the centre panel's own Escape handler,
  // which would otherwise leave the diff while only trying to close the menu.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (state.dialog !== null) {
        event.preventDefault()
        store.closeDialog()
        return
      }
      if (state.menu !== null) {
        event.preventDefault()
        store.closeMenu()
      }
    }
    if (typeof window === 'undefined') return undefined
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store, state.menu, state.dialog])
  const layers = [h(GwStyle, { key: 'style' })]
  if (state.busy !== null) {
    layers.push(h('div', { key: 'busy', className: 'gw-busy', role: 'status' }, [
      h('span', { key: 'dot', className: 'gw-busy-dot' }),
      h('span', { key: 'txt' }, tr(`busy-${state.busy}`)),
    ]))
  }
  if (state.merge !== null) {
    layers.push(h(GwMergeWindow, { key: 'merge', store, merge: state.merge, tr }))
  } else if (state.dialog !== null) {
    layers.push(h('div', { key: 'backdrop', className: 'gw-menu-backdrop' }))
    layers.push(state.dialog.kind === 'overwrite'
      ? h(GwOverwriteDialog, { key: 'dialog', store, state, tr })
      : h(GwCommitDialog, { key: 'dialog', store, state, tr }))
  } else if (state.menu !== null) {
    layers.push(h(GwContextMenu, { key: 'menu', store, state, tr }))
  }
  if (state.notice !== null) layers.push(h(GwNotice, { key: 'notice', store, state, tr }))
  return layers
}
