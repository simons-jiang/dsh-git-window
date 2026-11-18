/**
 * Windows: drive-letter and UNC paths, case-insensitive comparisons, no POSIX
 * locale variables.
 */
import { win32 } from 'node:path'

/** @type {import('./contract.js').GitPlatform} */
export const windowsPlatform = {
  id: 'windows',
  name: 'windows',
  getPathSeparator: () => '\\',
  isCaseInsensitive: () => true,
  toPosix: (value) => String(value ?? '').replace(/\\/g, '/'),
  toNative: (value) => String(value ?? '').replace(/\//g, '\\'),
  isAbsolutePath: (value) => win32.isAbsolute(String(value ?? '')),
  isRepoRelativePath: (value) => {
    const text = String(value ?? '')
    if (text === '' || text.includes('\0')) return false
    // `C:relative` (drive-relative) and any rooted form are not repository paths.
    if (/^[A-Za-z]:/.test(text)) return false
    const posixText = windowsPlatform.toPosix(text)
    if (posixText.startsWith('/')) return false
    return !posixText.split('/').includes('..')
  },
  isPathInside: (parent, child) => {
    const base = windowsPlatform.toPosix(parent).replace(/\/+$/, '').toLowerCase()
    const target = windowsPlatform.toPosix(child).toLowerCase()
    if (base === '') return false
    return target === base || target.startsWith(`${base}/`)
  },
  gitEnvironment: () => ({
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
  }),
  describe: () => ({
    id: 'windows',
    label: 'Windows',
    separator: '\\',
    caseInsensitive: true,
  }),
}
