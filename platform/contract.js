/**
 * The contract every platform implementation follows.
 *
 * The plugin keeps one place per operation that differs between operating
 * systems. `index.js` asks `platform/index.js` for the current platform instead
 * of branching on `process.platform`, so adding a system means one more file
 * that satisfies this contract — not another `if` scattered through the Host.
 *
 * **Every new feature must be checked on both systems.** If a feature touches a
 * native path, an external command, an environment variable, a shortcut label
 * or how a root is written, the difference belongs here: add a member to this
 * contract, implement it in `macos.js` and `windows.js`, and list it in
 * `PLATFORM_METHODS` so the test fails until both implementations answer.
 *
 * Paths that come from git (repository-relative file paths, branches) are
 * POSIX everywhere; only native paths from the Host — workspace directories,
 * repository roots, `cwd` — go through the conversions below.
 *
 * @typedef {object} GitPlatform
 * @property {string} id                    `macos` or `windows`; also what the browser receives.
 * @property {string} name                  Short name used by tests and logs.
 * @property {() => string} getPathSeparator     Native separator (`/` or `\`).
 * @property {() => boolean} isCaseInsensitive   Whether native paths compare case-insensitively.
 * @property {(value: string) => string} toPosix  Native or mixed path → slash form.
 * @property {(value: string) => string} toNative Slash form → the form the user's tools accept.
 * @property {(value: string) => boolean} isAbsolutePath    Rooted on this system.
 * @property {(value: string) => boolean} isRepoRelativePath  Safe git-relative path (no root, no `..`).
 * @property {(parent: string, child: string) => boolean} isPathInside  Child equals or lies below parent.
 * @property {() => Record<string, string>} gitEnvironment  Environment every git child gets here.
 * @property {() => object} describe       Facts the browser mirrors.
 */

/** Every member a platform implementation must carry. */
export const PLATFORM_METHODS = [
  'id',
  'name',
  'getPathSeparator',
  'isCaseInsensitive',
  'toPosix',
  'toNative',
  'isAbsolutePath',
  'isRepoRelativePath',
  'isPathInside',
  'gitEnvironment',
  'describe',
]
