/**
 * The shared palette with `dsh-ide-window`.
 *
 * Both plugins draw their own surface in the same page, so a palette chosen in
 * the code workspace should colour this tool window too. The contract is three
 * strings, owned by `dsh-ide-window`:
 *
 * - `localStorage['dsh-theme']` — the current id (absent or empty means "follow
 *   DSH", i.e. this plugin keeps its own token defaults);
 * - a `dsh-theme` window event with `{ id }` — same document, so switching is
 *   immediate instead of waiting for a reload;
 * - `<link id="dsh-theme-link">` to `/dsh-ide/theme?id=<id>` — the stylesheet
 *   scopes its aliases to `[data-dsh-theme="<id>"]`, so this plugin only sets
 *   that attribute on its own root and the palette cascades in.
 *
 * This plugin never writes any of it: the code workspace owns the choice. When
 * it is not installed the stylesheet request simply 404s and the tool window
 * keeps its `--dsw-alias-*` defaults — nothing breaks.
 */

const GW_THEME_KEY = 'dsh-theme'
const GW_THEME_EVENT = 'dsh-theme'
const GW_THEME_LINK_ID = 'dsh-theme-link'

/** Listeners for `useSyncExternalStore`; notified after every change. */
const gwThemeListeners = new Set()

function gwReadStoredTheme() {
  try {
    const value = globalThis.localStorage?.getItem(GW_THEME_KEY)
    return typeof value === 'string' && value !== '' ? value : ''
  } catch {
    return ''
  }
}

let gwThemeId = gwReadStoredTheme()

/** The palette id this window should wear; empty means "follow DSH". */
function gwSharedTheme() {
  return gwThemeId
}

function gwSubscribeTheme(listener) {
  gwThemeListeners.add(listener)
  return () => gwThemeListeners.delete(listener)
}

/**
 * Point the stylesheet at `id`. The file lives in the code workspace's package,
 * so the request is the only thing this plugin needs from it.
 */
function gwSyncThemeLink(id) {
  const doc = globalThis.document
  if (doc === undefined || typeof doc.createElement !== 'function') return
  const existing = typeof doc.getElementById === 'function' ? doc.getElementById(GW_THEME_LINK_ID) : null
  if (id === '') {
    if (typeof existing?.remove === 'function') existing.remove()
    return
  }
  const href = `/dsh-ide/theme?id=${encodeURIComponent(id)}`
  if (existing === null || existing === undefined) {
    if (doc.head === undefined || typeof doc.head.append !== 'function') return
    const link = doc.createElement('link')
    link.id = GW_THEME_LINK_ID
    link.rel = 'stylesheet'
    link.href = href
    // A missing route (code workspace not installed) must not look like a bug.
    if (typeof link.addEventListener === 'function') {
      link.addEventListener('error', () => link.remove(), { once: true })
    }
    doc.head.append(link)
    return
  }
  if (typeof existing.getAttribute === 'function' && existing.getAttribute('href') !== href) {
    existing.setAttribute('href', href)
  }
}

function gwApplyTheme(id) {
  const next = typeof id === 'string' ? id : ''
  if (next === gwThemeId) return
  gwThemeId = next
  gwSyncThemeLink(next)
  for (const listener of gwThemeListeners) {
    try {
      listener()
    } catch {
      /* one broken subscriber must not stop the others */
    }
  }
}

/**
 * Follow the palette chosen in `dsh-ide-window`, live.
 *
 * `window` is read through `globalThis.window` so the browser (where the two are
 * the same object) and the offline smoke test (where `window` is a stand-in)
 * both work.
 */
function gwWatchTheme() {
  const bus = globalThis.window ?? globalThis
  if (bus === undefined || typeof bus.addEventListener !== 'function') return
  gwSyncThemeLink(gwThemeId)
  bus.addEventListener(GW_THEME_EVENT, (event) => gwApplyTheme(event?.detail?.id))
  // Other windows/tabs: the storage event is the only signal that crosses them.
  bus.addEventListener('storage', (event) => {
    if (event.key !== GW_THEME_KEY) return
    gwApplyTheme(typeof event.newValue === 'string' ? event.newValue : '')
  })
}

/** The attribute the palette stylesheet matches; `undefined` when following DSH. */
function gwThemeAttribute() {
  return gwThemeId === '' ? undefined : gwThemeId
}
