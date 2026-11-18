/**
 * Client-side view of the Host's file-system rules.
 *
 * The Host owns the platform decision: every `repos` answer carries a
 * `platform` description, so the browser never guesses from its own user agent.
 * The guess below only covers the first paint, before that answer arrives, and
 * is replaced by the Host's facts on the next repository refresh.
 */

/** Best-effort platform guess for the first paint; the Host overrides it. */
function gwDetectPlatformId() {
  const agent = typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
    ? navigator.userAgent
    : ''
  return /windows/i.test(agent) ? 'windows' : 'macos'
}

/**
 * Build the client platform contract from a Host description.
 *
 * @param info - `{ id, separator, caseInsensitive }` from the Host.
 * @returns the native-path predicates the client needs.
 */
function gwPlatform(info) {
  const id = info?.id === 'windows' ? 'windows' : 'macos'
  const separator = id === 'windows' ? '\\' : '/'
  const caseInsensitive = info?.caseInsensitive === true
  /** Canonical form for comparisons only: both separator flavours become `/`. */
  const key = (value) => {
    let text = String(value ?? '').replace(/[\\/]+/g, '/')
    while (text.length > 1 && text.endsWith('/')) text = text.slice(0, -1)
    return caseInsensitive ? text.toLowerCase() : text
  }
  return {
    id,
    getPathSeparator: () => separator,
    isCaseInsensitive: () => caseInsensitive,
    /** Whether `child` is `parent` itself or lies below it. */
    covers(parent, child) {
      const base = key(parent)
      const target = key(child)
      if (base === '') return false
      return target === base || target.startsWith(base === '/' ? '/' : `${base}/`)
    },
    /** Whether the value is rooted on the Host's system. */
    isAbsolutePath(value) {
      const text = String(value ?? '')
      if (id === 'windows') return /^[A-Za-z]:[\\/]/.test(text) || /^\\\\/.test(text) || /^[\\/]/.test(text)
      return text.startsWith('/')
    },
    describe: () => ({ id, separator, caseInsensitive }),
  }
}
