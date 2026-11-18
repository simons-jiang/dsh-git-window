/**
 * macOS: POSIX paths rooted at `/`, case-insensitive comparisons (APFS default),
 * POSIX environment for git children.
 */
import { posix } from 'node:path'

/** @type {import('./contract.js').GitPlatform} */
export const macPlatform = {
  id: 'macos',
  name: 'macos',
  getPathSeparator: () => '/',
  isCaseInsensitive: () => true,
  toPosix: (value) => String(value ?? ''),
  toNative: (value) => String(value ?? ''),
  isAbsolutePath: (value) => posix.isAbsolute(String(value ?? '')),
  isRepoRelativePath: (value) => {
    const text = String(value ?? '')
    if (text === '' || text.includes('\0')) return false
    // A drive prefix is Windows syntax, never a repository-relative path here.
    if (/^[A-Za-z]:/.test(text)) return false
    if (posix.isAbsolute(text)) return false
    return !text.split(/[\\/]+/).includes('..')
  },
  isPathInside: (parent, child) => {
    // APFS compares case-insensitively by default, so containment does too.
    const target = macPlatform.toPosix(child).toLowerCase()
    const parentPosix = macPlatform.toPosix(parent)
    if (parentPosix === '/') return target.startsWith('/')
    const base = parentPosix.replace(/\/+$/, '').toLowerCase()
    if (base === '') return false
    return target === base || target.startsWith(`${base}/`)
  },
  gitEnvironment: () => ({
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    LC_ALL: 'C',
    LANG: 'C',
  }),
  describe: () => ({
    id: 'macos',
    label: 'macOS',
    separator: '/',
    caseInsensitive: true,
  }),
}
