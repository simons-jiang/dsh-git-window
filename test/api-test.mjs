/**
 * Standalone checks for the Host half's API surface. No Harness, no browser:
 * a fake Context captures the route, and fake request/response objects carry
 * the JSON envelope. Run with `node test/api-test.mjs <repo-path>`.
 */
import { Readable } from 'node:stream'
import { apply } from '../index.js'

const repo = process.argv[2]
if (!repo) {
  console.error('usage: node test/api-test.mjs <repository-path>')
  process.exit(2)
}

let handler
const registry = {
  list: () => [{ path: repo, title: 'repo', updatedAt: new Date().toISOString(), sessionIds: [] }],
}
const ctx = {
  get(name) {
    if (name === 'workspaceRegistry') return registry
    return undefined
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
  req.headers = { host: '127.0.0.1:56868' }
  return new Promise((resolve, reject) => {
    const res = {
      headersSent: false,
      writeHead(status) {
        this.status = status
        this.headersSent = true
      },
      end(text) {
        try {
          resolve({ status: this.status, body: JSON.parse(text) })
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
  if (condition) {
    console.log(`ok   ${name}`)
  } else {
    failures.push(name)
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const repos = await call('repos', {})
check('repos ok', repos.body.ok === true, JSON.stringify(repos.body).slice(0, 200))
check('repos lists the workspace', repos.body.value.workspaces.length === 1)

const log = await call('log', { cwd: repo, limit: 5 })
check('log ok', log.body.ok === true, JSON.stringify(log.body).slice(0, 300))
const commits = log.body.value?.commits ?? []
check('log has 5 commits', commits.length === 5, `got ${commits.length}`)
check('commit has hash + subject', typeof commits[0]?.hash === 'string' && typeof commits[0]?.subject === 'string')
check('commit has parents', Array.isArray(commits[0]?.parents))
check('repo reports a branch', typeof log.body.value?.repo === 'object')

const merge = commits.find((commit) => commit.parents.length > 1)
const target = merge ?? commits[0]
const commit = await call('commit', { cwd: repo, hash: target.hash })
check('commit ok', commit.body.ok === true, JSON.stringify(commit.body).slice(0, 300))
const files = commit.body.value?.files ?? []
check('commit lists files', files.length > 0, `got ${files.length}`)
console.log('   sample files:', files.slice(0, 3).map((file) => `${file.status} ${file.path} +${file.additions} -${file.deletions}`))

const file = files.find((entry) => entry.status !== 'D' && entry.binary !== true) ?? files[0]
const diff = await call('diff', { cwd: repo, hash: target.hash, path: file.path, mode: 'commit' })
check('diff ok', diff.body.ok === true, JSON.stringify(diff.body).slice(0, 300))
const hunks = diff.body.value?.hunks ?? []
check('diff has hunks', hunks.length > 0, `got ${hunks.length} for ${file.path}`)
if (hunks.length > 0) {
  const lines = hunks[0].lines
  check('hunk lines numbered', lines.every((line) => (line.type === '+' ? line.newLine > 0 : line.type === '-' ? line.oldLine > 0 : line.oldLine > 0 && line.newLine > 0)))
  console.log('   hunk head:', hunks[0].oldStart, hunks[0].newStart, lines.length, 'lines')
}

const branches = await call('branches', { cwd: repo })
check('branches ok', branches.body.ok === true, JSON.stringify(branches.body).slice(0, 200))
const localBranches = branches.body.value?.local ?? []
check('branches lists local refs', localBranches.length > 0)
console.log('   branches:', localBranches.slice(0, 4).map((entry) => `${entry.head === '*' ? '*' : ''}${entry.name}${entry.upstream === undefined ? '' : ` -> ${entry.upstream}`}`).join(', '))
check('exactly one branch is HEAD', localBranches.filter((entry) => entry.head === '*').length === (log.body.value?.repo?.detached === true ? 0 : 1))

const status = await call('status', { cwd: repo })
check('status ok', status.body.ok === true, JSON.stringify(status.body).slice(0, 200))

const parseLog = await call('log', { cwd: repo, limit: 200 })
const withRefs = (parseLog.body.value?.commits ?? []).filter((entry) => entry.refs.length > 0)
check('some commit carries refs', withRefs.length > 0)
if (withRefs.length > 0) console.log('   refs sample:', JSON.stringify(withRefs[0].refs))

const escape = await call('diff', { cwd: repo, path: '../../etc/passwd', mode: 'worktree' })
check('path escape refused', escape.body.ok === false && escape.body.error.code === 'bad-path', JSON.stringify(escape.body))

const outside = await call('log', { cwd: '/etc', limit: 5 })
check('outside workspace refused', outside.body.ok === false && outside.body.error.code === 'forbidden-path', JSON.stringify(outside.body))

const unknown = await call('nope', {})
check('unknown method refused', unknown.status === 404)

console.log(failures.length === 0 ? '\nall checks passed' : `\n${failures.length} failed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
