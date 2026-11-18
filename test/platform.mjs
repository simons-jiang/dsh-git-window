/**
 * The Host platform layer: macOS and Windows implementations of one contract.
 *
 * The plugin keeps every OS difference in `platform/`, so these checks are what
 * proves a new implementation is complete and that the two shipped ones really
 * differ where they should. Both implementations run on any host because they
 * use Node's `posix` / `win32` path flavours instead of the running system.
 */
import { createPlatform, macPlatform, windowsPlatform } from '../platform/index.js'
import { PLATFORM_METHODS } from '../platform/contract.js'

const checks = []
const check = (ok, label, detail) => checks.push({ ok, label, detail })

check(createPlatform('darwin') === macPlatform, 'darwin resolves to the macOS implementation', String(createPlatform('darwin').name))
check(createPlatform('win32') === windowsPlatform, 'win32 resolves to the Windows implementation', String(createPlatform('win32').name))
check(createPlatform('linux') === windowsPlatform, 'anything that is not macOS takes the Windows behaviour', String(createPlatform('linux').name))

for (const implementation of [macPlatform, windowsPlatform]) {
  const missing = PLATFORM_METHODS.filter((member) => implementation[member] === undefined)
  check(missing.length === 0, `${implementation.name} implements the whole contract`, missing.join(', '))
}

check(macPlatform.getPathSeparator() === '/', 'macOS separator is /', macPlatform.getPathSeparator())
check(windowsPlatform.getPathSeparator() === '\\', 'Windows separator is backslash', windowsPlatform.getPathSeparator())
check(macPlatform.isCaseInsensitive() === true, 'macOS compares case-insensitively (APFS default)')
check(windowsPlatform.isCaseInsensitive() === true, 'Windows compares case-insensitively')

check(macPlatform.toPosix('/Users/a/b') === '/Users/a/b', 'macOS paths are already POSIX', macPlatform.toPosix('/Users/a/b'))
check(windowsPlatform.toPosix('C:\\Users\\a\\b') === 'C:/Users/a/b', 'Windows paths become POSIX', windowsPlatform.toPosix('C:\\Users\\a\\b'))
check(windowsPlatform.toNative('C:/Users/a/b') === 'C:\\Users\\a\\b', 'Windows paths go back to native form', windowsPlatform.toNative('C:/Users/a/b'))

check(macPlatform.isAbsolutePath('/Users/a') === true, 'macOS accepts a rooted path')
check(macPlatform.isAbsolutePath('Users/a') === false, 'macOS refuses a relative path')
check(macPlatform.isAbsolutePath('C:\\repo') === false, 'macOS refuses a Windows drive path')
check(windowsPlatform.isAbsolutePath('C:\\work\\app') === true, 'Windows accepts a drive path')
check(windowsPlatform.isAbsolutePath('C:/work/app') === true, 'Windows accepts a slash drive path')
check(windowsPlatform.isAbsolutePath('\\\\server\\share\\app') === true, 'Windows accepts a UNC path')
check(windowsPlatform.isAbsolutePath('work\\app') === false, 'Windows refuses a relative path')

check(macPlatform.isPathInside('/Users/a', '/Users/a/repo') === true, 'macOS inside')
check(macPlatform.isPathInside('/Users/A', '/users/a/repo') === true, 'macOS inside ignores case')
check(macPlatform.isPathInside('/Users/a', '/Users/ab') === false, 'macOS sibling is outside')
check(macPlatform.isPathInside('/', '/anything') === true, 'macOS root contains everything')
check(windowsPlatform.isPathInside('C:\\Users\\A', 'c:\\users\\a\\repo') === true, 'Windows inside ignores case')
check(windowsPlatform.isPathInside('C:\\Users\\A', 'C:\\Users\\AB') === false, 'Windows sibling is outside')
check(windowsPlatform.isPathInside('C:\\', 'C:\\work') === true, 'Windows drive root contains everything')

check(macPlatform.isRepoRelativePath('src/main/A.java') === true, 'macOS repo-relative path')
check(macPlatform.isRepoRelativePath('src/../../etc') === false, 'macOS rejects parent segments')
check(macPlatform.isRepoRelativePath('/etc/passwd') === false, 'macOS rejects absolute repo paths')
check(windowsPlatform.isRepoRelativePath('src\\main\\A.java') === true, 'Windows repo-relative path with backslashes')
check(windowsPlatform.isRepoRelativePath('C:repo') === false, 'Windows rejects drive-relative paths')
check(windowsPlatform.isRepoRelativePath('C:\\repo\\a') === false, 'Windows rejects absolute repo paths')
check(windowsPlatform.isRepoRelativePath('..\\src') === false, 'Windows rejects parent segments')

check(macPlatform.gitEnvironment().GIT_TERMINAL_PROMPT === '0' && windowsPlatform.gitEnvironment().GIT_TERMINAL_PROMPT === '0',
  'both systems pin the git terminal prompt')
check(macPlatform.gitEnvironment().LC_ALL === 'C' && windowsPlatform.gitEnvironment().LC_ALL === undefined,
  'POSIX pins the locale, Windows does not')
check(macPlatform.describe().id === 'macos' && windowsPlatform.describe().id === 'windows', 'describe carries the browser facts')
check(windowsPlatform.describe().separator === '\\' && windowsPlatform.describe().caseInsensitive === true,
  'Windows describe matches its own accessors')
check(macPlatform.describe().caseInsensitive === true, 'macOS describe reports case-insensitive comparison')

const failed = checks.filter((entry) => entry.ok !== true)
for (const entry of checks) if (entry.ok === true) console.log(`  ✓ ${entry.label}`)
for (const entry of failed) console.log(`  ✗ ${entry.label} — ${entry.detail}`)
console.log(failed.length === 0 ? 'all platform checks passed' : `${failed.length} platform check(s) failed`)
process.exitCode = failed.length === 0 ? 0 : 1
