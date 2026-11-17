/**
 * End-to-end checks for the write paths (commit / pull / push / conflict
 * resolution). Builds a throwaway bare repository plus two clones under a
 * temporary directory, so no real repository is touched. Run with
 * `node test/git-actions-test.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

const root = await mkdtemp(join(tmpdir(), 'dsh-git-actions-'))
const bare = join(root, 'origin.git')
const mine = join(root, 'mine')
const theirs = join(root, 'theirs')

function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_GLOBAL: join(root, 'gitconfig'),
      GIT_CONFIG_NOSYSTEM: '1',
      LC_ALL: 'C',
    },
    ...options,
  })
}

await writeFile(join(root, 'gitconfig'), '[init]\n\tdefaultBranch = main\n[advice]\n\tdetachedHead = false\n')
git(root, ['init', '--bare', '--initial-branch=main', bare])
git(root, ['clone', bare, mine])
await writeFile(join(mine, 'a.txt'), 'line1\nVALUE=1\nline3\n')
await writeFile(join(mine, 'b.txt'), 'b1\nb2\n')
git(mine, ['add', '.'])
git(mine, ['commit', '-m', 'init'])
git(mine, ['push', '-u', 'origin', 'main'])
git(root, ['clone', bare, theirs])
await writeFile(join(theirs, 'a.txt'), 'line1\nVALUE=2\nline3\n')
git(theirs, ['add', '.'])
git(theirs, ['commit', '-m', 'remote change'])
git(theirs, ['push', 'origin', 'main'])

let handler
const ctx = {
  get(name) {
    return name === 'workspaceRegistry' ? { list: () => [{ path: mine, title: 'mine', updatedAt: 'x', sessionIds: [] }] } : undefined
  },
  effect(callback) {
    callback()
  },
  webServer: {
    register(route) {
      handler = route.handler
      return () => {}
    },
  },
}
apply(ctx)

function call(method, payload) {
  const req = Readable.from([Buffer.from(JSON.stringify(payload))])
  req.method = 'POST'
  req.url = `/dsh-git/api/${method}`
  req.headers = {}
  return new Promise((resolvePromise, reject) => {
    const res = {
      headersSent: false,
      writeHead(status) {
        this.status = status
        this.headersSent = true
      },
      end(text) {
        try {
          resolvePromise({ status: this.status, body: JSON.parse(text) })
        } catch (error) {
          reject(error)
        }
      },
      destroy() {},
    }
    handler(req, res).catch(reject)
  })
}

const failures = []
function check(name, condition, detail) {
  if (condition) console.log(`ok   ${name}`)
  else {
    failures.push(name)
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

// 1. An uncommitted edit to a file the incoming merge touches blocks the pull.
await writeFile(join(mine, 'a.txt'), 'line1\nVALUE=local\nline3\n')
const blocked = await call('pull', { cwd: mine })
check('pull reports blocking local changes', blocked.body.ok === true && blocked.body.value.status === 'local-changes', JSON.stringify(blocked.body).slice(0, 260))
check('blocked pull names the file', (blocked.body.value?.files ?? []).includes('a.txt'), JSON.stringify(blocked.body.value?.files))

// 2. The commit path stages the chosen files and records the message.
const commit = await call('commitChanges', { cwd: mine, message: 'test: local change', paths: ['a.txt'] })
check('commit succeeds', commit.body.ok === true, JSON.stringify(commit.body).slice(0, 300))
check('commit reports a hash', typeof commit.body.value?.hash === 'string' && commit.body.value.hash.length >= 7)

// 3. Pulling now produces a conflict instead of a fast-forward.
const pulled = await call('pull', { cwd: mine })
check('pull reports conflicts', pulled.body.value?.status === 'conflicts', JSON.stringify(pulled.body).slice(0, 300))
check('conflict list has a.txt', (pulled.body.value?.conflicts ?? []).includes('a.txt'), JSON.stringify(pulled.body.value?.conflicts))

// 4. The merge window payload carries all three sides.
const state = await call('conflicts', { cwd: mine })
check('conflicts returns the merging flag', state.body.value?.merging === true)
check('conflicts returns the file list', (state.body.value?.files ?? []).length === 1)
const file = state.body.value?.file
check('conflict carries ours/theirs/base', typeof file?.ours === 'string' && typeof file?.theirs === 'string', JSON.stringify({ ours: file?.ours, theirs: file?.theirs, base: file?.base }))
check('ours keeps the local value', (file?.ours ?? '').includes('VALUE=local'), JSON.stringify(file?.ours))
check('theirs keeps the remote value', (file?.theirs ?? '').includes('VALUE=2'), JSON.stringify(file?.theirs))
check('base keeps the pre-merge value', (file?.base ?? '').includes('VALUE=1'), JSON.stringify(file?.base))
check('worktree still has markers', (file?.worktree ?? '').includes('<<<<<<<'), JSON.stringify(file?.worktree))

// 5. Resolving writes the result and clears the unmerged entry.
const resolved = await call('resolve', { cwd: mine, path: 'a.txt', content: 'line1\nVALUE=9\nline3\n' })
check('resolve clears the last conflict', resolved.body.ok === true && (resolved.body.value?.remaining ?? []).length === 0, JSON.stringify(resolved.body).slice(0, 260))
check('resolve keeps the merge open', resolved.body.value?.merging === true)

// 6. The merge commit needs no message of its own.
const merge = await call('commitChanges', { cwd: mine, message: '', paths: [] })
check('merge commit succeeds', merge.body.ok === true, JSON.stringify(merge.body).slice(0, 300))

// 7. Push goes to the configured upstream.
const pushed = await call('push', { cwd: mine })
check('push succeeds', pushed.body.value?.status === 'ok', JSON.stringify(pushed.body).slice(0, 300))
// The bare repository is the source of truth for what was actually pushed.
const remoteTip = git(bare, ['rev-parse', 'main']).trim()
const localTip = git(mine, ['rev-parse', 'HEAD']).trim()
check('remote tip matches after push', remoteTip === localTip, `${remoteTip} vs ${localTip}`)

// 8. Path escapes are still refused on the write paths.
const escape = await call('resolve', { cwd: mine, path: '../../etc/passwd', content: 'x' })
check('resolve refuses a path escape', escape.body.ok === false && escape.body.error.code === 'bad-path', JSON.stringify(escape.body))

// Bring the second clone up to date with what the push just published.
git(theirs, ['fetch', 'origin'])
git(theirs, ['reset', '--hard', 'origin/main'])

// 9. Smart pull stashes unrelated local edits and restores them afterwards.
await writeFile(join(mine, 'b.txt'), 'b1 local\nb2\n')
const smart = await call('pull', { cwd: mine, mode: 'smart' })
check('smart pull succeeds with a dirty tree', smart.body.ok === true && smart.body.value.status === 'ok', JSON.stringify(smart.body).slice(0, 260))
const restored = execFileSync('git', ['diff', '--name-only'], { cwd: mine, encoding: 'utf8' }).trim()
check('smart pull restores the local edit', restored === 'b.txt', restored)
git(mine, ['checkout', '--', 'b.txt'])

// 10. Aborting a merge restores the pre-merge state.
await writeFile(join(mine, 'a.txt'), 'line1\nVALUE=4\nline3\n')
git(mine, ['add', '.'])
git(mine, ['commit', '-m', 'local again'])
await writeFile(join(theirs, 'a.txt'), 'line1\nVALUE=5\nline3\n')
git(theirs, ['add', '.'])
git(theirs, ['commit', '-m', 'remote again'])
git(theirs, ['push', 'origin', 'main'])
const conflictAgain = await call('pull', { cwd: mine })
check('second pull conflicts', conflictAgain.body.value?.status === 'conflicts')
const aborted = await call('abortMerge', { cwd: mine })
check('abort clears conflicts', (aborted.body.value?.conflicts ?? []).length === 0, JSON.stringify(aborted.body).slice(0, 200))
const afterAbort = await call('conflicts', { cwd: mine })
check('abort leaves no merge in progress', afterAbort.body.value?.merging === false)

// 11. Branch menu operations: checkout, rename, compare, merge, delete.
git(mine, ['branch', 'feature/menu'])
const switched = await call('checkout', { cwd: mine, branch: 'feature/menu' })
check('checkout switches branch', switched.body.value?.repo?.branch === 'feature/menu', JSON.stringify(switched.body).slice(0, 200))
await writeFile(join(mine, 'menu.txt'), 'menu\n')
const menuCommit = await call('commitChanges', { cwd: mine, message: 'test: menu branch', paths: ['menu.txt'] })
check('commit on the new branch', menuCommit.body.ok === true, JSON.stringify(menuCommit.body).slice(0, 200))
const compared = await call('compare', { cwd: mine, base: 'main', head: 'feature/menu' })
check('compare lists the branch file', (compared.body.value?.files ?? []).some((file) => file.path === 'menu.txt'), JSON.stringify(compared.body).slice(0, 260))
const comparedDiff = await call('diff', { cwd: mine, mode: 'compare', base: 'main', head: 'feature/menu', path: 'menu.txt' })
check('compare diff has hunks', (comparedDiff.body.value?.hunks ?? []).length > 0, JSON.stringify(comparedDiff.body).slice(0, 200))
const backMain = await call('checkout', { cwd: mine, branch: 'main' })
check('checkout back to main', backMain.body.value?.repo?.branch === 'main')
const mergedBranch = await call('mergeBranch', { cwd: mine, branch: 'feature/menu' })
check('merge reports success', mergedBranch.body.value?.status === 'ok', JSON.stringify(mergedBranch.body).slice(0, 200))
const worktreeCompare = await call('compare', { cwd: mine, base: 'main' })
check('compare against the working tree answers', Array.isArray(worktreeCompare.body.value?.files), JSON.stringify(worktreeCompare.body).slice(0, 200))

// 12. Unknown/duplicate method names stay 404.
const unknown = await call('nope', {})
check('unknown method refused', unknown.status === 404)

await rm(root, { recursive: true, force: true })
console.log(failures.length === 0 ? '\nall checks passed' : `\n${failures.length} failed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
