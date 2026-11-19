/**
 * Client activation: register the three seats this plugin occupies.
 *
 *  - `shell.bottom`        — the docked Git tool window (full width, above the
 *                            window's bottom edge, below every column).
 *  - `main` (keyed)        — the centre diff surface the dock selects.
 *  - `sidebar.footer.action` — the always-available show/hide control.
 *
 * The store is created once here and shared by all three through `inject`, so a
 * file click in the dock is the same selection the panel renders.
 */

/** Locale namespace, shared with `locale/*.json`. */
const GW_NS = 'dsh-git-window'

/** Module entry. */
function apply(ctx) {
  const layoutRef = { current: undefined }
  const store = gwCreateStore(layoutRef)
  // Subscribe once, before any surface renders: the palette comes from the code
  // workspace and can change at any time.
  gwWatchTheme()
  let bound = undefined
  try {
    if (ctx.locale !== undefined && typeof ctx.locale.register === 'function') {
      ctx.locale.register(GW_NS, { en: GW_TEXT_EN, zh: GW_TEXT_ZH })
      // A regional Chinese locale (zh-CN / zh-Hans) must not fall back to the
      // English dictionary just because the ids differ.
      for (const alias of ['zh-CN', 'zh-Hans']) {
        try {
          ctx.locale.register(GW_NS, alias, GW_TEXT_ZH)
        } catch (error) {
          void error
        }
      }
      const candidate = ctx.locale.bind(GW_NS)
      if (typeof candidate === 'function') bound = candidate
    }
  } catch (error) {
    // A host without the locale face still renders: `t` falls back to the
    // English dictionary the bundle carries.
    void error
  }
  // Built after the locale registration above so both sources are available.
  const translate = gwMakeTranslator(ctx, bound)

  // The right-Sidebar controller arrives on its own schedule; the store adopts
  // it whenever the service (re)loads, which re-renders the dock.
  try {
    ctx.inject(['sidebarRight'], (scoped) => {
      store.attachSidebarRight(scoped.sidebarRight)
    })
  } catch (error) {
    void error
  }
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['layout'], (scoped) => {
        layoutRef.current = scoped.layout
      })
    }
  } catch (error) {
    void error
  }

  ctx.effect(() => ctx.slots.inject('shell.bottom', () => ctx.slots.register({
    name: 'shell.bottom',
    registrant: GW_NS,
    locale: GW_NS,
    inject: () => ({ store, translate }),
  }, GwDock)), 'dsh-git-window: bottom dock')

  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: GW_PANEL_ID,
    registrant: GW_NS,
    locale: GW_NS,
    inject: () => ({ store, translate }),
  }, GwDiffPanel)), 'dsh-git-window: diff panel')

  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: `${GW_NS}:overlay`,
    order: 30,
    registrant: GW_NS,
    locale: GW_NS,
    inject: () => ({ store, translate }),
  }, GwOverlay)), 'dsh-git-window: floating surfaces')

  ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: `${GW_NS}:toggle`,
    order: 5,
    label: () => 'Git',
    registrant: GW_NS,
    locale: GW_NS,
    inject: () => ({ store, translate }),
  }, GwToggle)), 'dsh-git-window: footer toggle')
}
