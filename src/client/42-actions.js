/**
 * Floating surfaces owned by the tool window: the branch context menu, the
 * commit dialog, the "local changes would be merged over" dialog, the merge
 * window, and the transient notice/busy pills.
 *
 * They are registered into `shell.overlay` (a root-scoped floating list) rather
 * than rendered inside the dock, because the dock sits in a clipped, scrolling
 * frame — anything absolute inside it would be cut off.
 */

/** Menu rows for one branch: the four git writes plus conflict recovery. */
function gwMenuItems(state, tr) {
  const repo = state.repo
  const branch = state.menu?.branch ?? null
  const items = [
    { id: 'pull', label: tr('menuPull'), hint: tr('menuPullHint'), run: () => state.store.pull() },
    { id: 'commit', label: tr('menuCommit'), hint: tr('menuCommitHint'), run: () => state.store.startCommit(false) },
    { id: 'push', label: tr('menuPush'), hint: tr('menuPushHint'), run: () => state.store.push() },
    { id: 'commit-push', label: tr('menuCommitPush'), hint: tr('menuCommitPushHint'), run: () => state.store.startCommit(true) },
  ]
  if (state.conflictCount > 0 || state.mergeInProgress === true) {
    items.push({ id: 'resolve', label: tr('menuResolve'), hint: tr('menuResolveHint'), run: () => state.store.openMerge() })
  }
  if (state.mergeInProgress === true) {
    items.push({ id: 'abort', label: tr('menuAbortMerge'), hint: tr('menuAbortMergeHint'), run: () => state.store.abortMerge() })
  }
  if (repo === null) return items.map((item) => ({ ...item, disabled: true }))
  return items.map((item) => ({ ...item, branch }))
}

/** Branch context menu. */
function GwContextMenu({ store, state, tr }) {
  const menu = state.menu
  const items = gwMenuItems({ ...state, store }, tr)
  const width = 236
  const height = 12 + items.length * 30 + 10
  const left = Math.max(8, Math.min(menu.x, (globalThis.innerWidth || 1200) - width - 8))
  const top = Math.max(8, Math.min(menu.y, (globalThis.innerHeight || 800) - height - 8))
  return [
    h('div', {
      key: 'backdrop',
      className: 'gw-menu-backdrop',
      onMouseDown: () => store.closeMenu(),
      onContextMenu: (event) => { event.preventDefault(); store.closeMenu() },
    }),
    h('div', { key: 'menu', className: 'gw-menu', style: { left: `${left}px`, top: `${top}px`, width: `${width}px` } }, [
      h('div', { key: 'head', className: 'gw-menu-head' }, [
        h(GwBranchIcon, { key: 'i', size: 11 }),
        h('span', { key: 'n', className: 'gw-menu-branch', title: menu.branch ?? '' }, menu.branch ?? tr('allBranches')),
      ]),
      items.map((item) => h('button', {
        key: item.id,
        className: 'gw-menu-item',
        disabled: item.disabled === true || state.busy !== null,
        title: item.hint,
        onClick: () => item.run(),
      }, item.label)),
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
      return h('label', { key: file.path, className: 'gw-dialog-file' }, [
        h('input', {
          key: 'box',
          type: 'checkbox',
          checked,
          onChange: () => store.toggleCommitFile(file.path),
        }),
        h('span', { key: 's', className: 'gw-status', style: { color: gwStatusColor(file.xy.replace(/\s/g, '')[0] ?? 'M') } }, file.xy.replace(/\s/g, '') || 'M'),
        h('span', { key: 'p', className: 'gw-path' }, [
          h('span', { key: 'd', className: 'gw-dir' }, split.dir),
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
