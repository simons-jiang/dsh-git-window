/**
 * dsh-git-window — Host half.
 *
 * Serves the Git data the browser half's IDEA-style Git tool window renders:
 * the repository list, `git log` pages (with graph topology and refs), one
 * commit's changed files, and one file's diff for a commit, the index, or the
 * working tree.
 *
 * Everything goes through the system `git` binary spawned per request — no
 * library, no cached repository state. Output formats are chosen to be
 * machine-readable regardless of the user's locale and colour settings
 * (`-z` NUL framing, unit/record separators, `--no-color`, `core.quotePath=false`),
 * and paths are always literal.
 *
 * Access rules: a request may only name a directory inside one of the
 * profile's registered Workspaces (the exact directories the user opened in
 * this Harness). The route is additionally fenced through Connection's own
 * Host/Origin and browser-credential check, so no other origin can read the
 * user's repository.
 */
import { spawn } from 'node:child_process'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { platform } from './platform/index.js'

export const name = 'dsh-git-window'

/** The Web carrier is the only hard dependency; the rest degrade. */
export const inject = ['webServer']

/** Prefix of every route this plugin serves. */
const ROUTE_PATH = '/dsh-git/api'

/** Maximum JSON request body. */
const MAX_BODY_BYTES = 64 * 1024

/** Maximum bytes captured from one git command. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024

/** Maximum bytes of one file diff sent to the browser. */
const MAX_DIFF_BYTES = 2 * 1024 * 1024

/** Context lines requested per file: the whole file, so the client renders a continuous view. */
const DIFF_CONTEXT_LINES = 1000000

/** Default and maximum `git log` page size. */
const DEFAULT_LOG_LIMIT = 200
const MAX_LOG_LIMIT = 1000

/** Bound on an untracked file synthesized as an all-added diff. */
const MAX_UNTRACKED_LINES = 5000

/** Git's own "not a repository" phrasing is reported with this code. */
const NOT_REPO = 'not-repo'

/** A request problem the client can render (never a plugin crash). */
class RequestError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** A failing git invocation carrying git's own diagnostics. */
class GitError extends Error {
  constructor(args, code, stderr) {
    const detail = String(stderr || '').trim().split('\n').slice(0, 4).join(' ').trim()
    super(detail === '' ? `git ${args[0] ?? ''} failed (exit ${code})` : detail)
    this.code = code
    this.args = args
  }
}

/**
 * Run one git command to completion.
 * @param cwd - working directory the command runs in.
 * @param args - argv after the shared `-c` overrides.
 * @param options - timeout, capture cap, and whether a non-zero exit is data.
 * @returns the exit code, stdout and stderr.
 */
function runGit(cwd, args, options = {}) {
  const { timeoutMs = 20000, maxBytes = MAX_OUTPUT_BYTES, allowFailure = false } = options
  const full = [
    '--no-pager',
    '-c',
    'color.ui=false',
    '-c',
    'core.quotePath=false',
    '-c',
    'log.showSignature=false',
    '-c',
    'core.pager=cat',
    ...args,
  ]
  return new Promise((resolvePromise, reject) => {
    let child
    try {
      child = spawn('git', full, {
        cwd,
        env: {
          ...process.env,
          ...platform.gitEnvironment(),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      reject(new RequestError('git-missing', `git could not be started: ${error.message}`, 500))
      return
    }
    const out = []
    let outBytes = 0
    let errText = ''
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolvePromise(value)
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(new RequestError('git-timeout', `git ${args[0] ?? ''} timed out`, 504))
    }, timeoutMs)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (outBytes >= maxBytes) return
      outBytes += Buffer.byteLength(chunk)
      out.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      if (errText.length < 8000) errText += chunk
    })
    child.on('error', (error) => {
      finish(new RequestError('git-missing', `git could not be started: ${error.message}`, 500))
    })
    child.on('close', (code) => {
      const stdout = out.join('')
      if (code !== 0 && !allowFailure) {
        const stderr = errText
        const notRepo = /not a git repository/i.test(stderr)
        finish(new RequestError(notRepo ? NOT_REPO : 'git-error', notRepo ? 'not a git repository' : new GitError(full, code, stderr).message, notRepo ? 409 : 400))
        return
      }
      finish(null, { code: code ?? 0, stdout, stderr: errText })
    })
  })
}

/** Run git and return stdout, treating a non-zero exit as empty. */
async function gitText(cwd, args, options = {}) {
  const result = await runGit(cwd, args, { ...options, allowFailure: true })
  return result.code === 0 ? result.stdout : ''
}

/** Read-only NUL/record framed listing used by the porcelain parsers. */
function splitRecords(text, separator) {
  return text.split(separator).filter((entry) => entry.length > 0)
}

/** Canonical directory, or `undefined` when it does not exist. */
async function canonicalDirectory(path) {
  try {
    const real = await realpath(path)
    const info = await stat(real)
    return info.isDirectory() ? real : undefined
  } catch {
    return undefined
  }
}

/**
 * The exact directories a request may inspect: the profile's registered
 * Workspaces, canonicalized. Cached briefly because `git log` runs on every
 * refresh and the registry only changes through user actions.
 */
function allowedRoots(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return Promise.resolve([])
  const paths = registry.list().map((workspace) => workspace.path)
  return Promise.all(paths.map((path) => canonicalDirectory(path))).then((roots) => roots.filter((root) => root !== undefined))
}

/**
 * Resolve the directory a request names and prove it belongs to a registered
 * Workspace. Any other path — including `..` escapes and symlinked targets —
 * is refused before git ever runs.
 */
async function admitCwd(ctx, requested) {
  if (typeof requested !== 'string' || requested.trim() === '') {
    throw new RequestError('bad-path', 'cwd is required', 400)
  }
  if (!platform.isAbsolutePath(requested)) throw new RequestError('bad-path', 'cwd must be absolute', 400)
  const target = await canonicalDirectory(requested)
  if (target === undefined) throw new RequestError('bad-path', 'directory does not exist', 400)
  const roots = await allowedRoots(ctx)
  if (!roots.some((root) => platform.isPathInside(root, target))) {
    throw new RequestError('forbidden-path', 'directory is outside every registered workspace', 403)
  }
  return target
}

/** Repository facts shared by every response: root, branch, sync state. */
async function repositoryInfo(cwd) {
  const top = await gitText(cwd, ['rev-parse', '--show-toplevel'])
  const root = top.trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const branchLine = (await gitText(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const detached = branchLine === 'HEAD'
  const upstream = (await gitText(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])).trim()
  let ahead
  let behind
  if (upstream !== '') {
    const counts = (await gitText(root, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`])).trim()
    const parts = counts.split(/\s+/)
    if (parts.length === 2) {
      behind = Number(parts[0])
      ahead = Number(parts[1])
    }
  }
  const head = (await gitText(root, ['rev-parse', '--short', 'HEAD'])).trim()
  return {
    root,
    branch: detached ? undefined : branchLine,
    detached,
    head: head === '' ? undefined : head,
    upstream: upstream === '' ? undefined : upstream,
    ahead,
    behind,
  }
}

/** Working-tree status entries (both sides of the index). */
async function workingTreeStatus(root) {
  const [porcelain, unstaged, staged] = await Promise.all([
    gitText(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']),
    gitText(root, ['diff', '--numstat', '-z', '--no-color', '--no-renames']),
    gitText(root, ['diff', '--cached', '--numstat', '-z', '--no-color', '--no-renames']),
  ])
  const counts = (text) => {
    const map = new Map()
    for (const record of splitRecords(text, '\0')) {
      const parts = record.split('\t')
      if (parts.length < 3) continue
      const path = parts.slice(2).join('\t')
      const added = parts[0] === '-' ? undefined : Number(parts[0])
      const removed = parts[1] === '-' ? undefined : Number(parts[1])
      map.set(path, added === undefined ? { binary: true } : { additions: added, deletions: removed })
    }
    return map
  }
  const unstagedCounts = counts(unstaged)
  const stagedCounts = counts(staged)
  const entries = []
  for (const record of splitRecords(porcelain, '\0')) {
    if (record.length < 4) continue
    const xy = record.slice(0, 2)
    const path = record.slice(3)
    entries.push({
      path,
      xy,
      staged: stagedCounts.get(path),
      unstaged: unstagedCounts.get(path),
      untracked: xy === '??',
    })
  }
  entries.sort((left, right) => left.path.localeCompare(right.path))
  return entries
}

/** `%D` ref decoration → compact chips (`HEAD -> main`, `origin/main`, `tag: v1`). */
function parseRefs(raw) {
  if (raw === '') return []
  const refs = []
  for (const part of raw.split(',')) {
    const text = part.trim()
    if (text === '') continue
    const head = text.match(/^HEAD -> (.+)$/)
    if (head !== null) {
      // One chip per branch: the checked-out one is marked as the head ref.
      refs.push({ name: head[1], kind: 'head' })
      continue
    }
    if (text === 'HEAD') {
      refs.push({ name: 'HEAD', kind: 'head' })
      continue
    }
    const tag = text.match(/^tag: (.+)$/)
    if (tag !== null) {
      refs.push({ name: tag[1], kind: 'tag' })
      continue
    }
    if (/^origin\/|^[^/]+\/HEAD$/.test(text) && text.includes('/')) {
      refs.push({ name: text, kind: 'remote' })
      continue
    }
    refs.push({ name: text, kind: 'branch' })
  }
  return refs
}

/** One `git log` page. */
async function logCommits(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const limit = Math.min(Math.max(Number(payload.limit) || DEFAULT_LOG_LIMIT, 1), MAX_LOG_LIMIT)
  const skip = Math.max(Number(payload.skip) || 0, 0)
  const ref = typeof payload.ref === 'string' && /^[\w./@{}~^-]+$/.test(payload.ref) ? payload.ref : undefined
  const format = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%D%x1f%s%x1e'
  const args = [
    'log',
    '--no-color',
    '--decorate=short',
    '--date-order',
    `--max-count=${limit + 1}`,
    `--skip=${skip}`,
    `--pretty=format:${format}`,
  ]
  if (ref !== undefined) args.push(ref)
  else args.push('--all')
  const text = await gitText(root, args)
  const commits = []
  for (const raw of splitRecords(text, '\x1e')) {
    // `--pretty` separates commits with its own newline, which lands after the
    // record separator this format ends each entry with. `%s` and the identity
    // fields are single-line, so trimming the edge newlines loses no content.
    const record = raw.replace(/^[\n\r]+/, '').replace(/[\n\r]+$/, '')
    if (record === '') continue
    const fields = record.split('\x1f')
    if (fields.length < 10) continue
    commits.push({
      hash: fields[0],
      parents: fields[1] === '' ? [] : fields[1].split(' '),
      author: fields[2],
      authorEmail: fields[3],
      authorTime: Number(fields[4]) || 0,
      committer: fields[5],
      committerEmail: fields[6],
      committerTime: Number(fields[7]) || 0,
      refs: parseRefs(fields[8]),
      subject: fields[9],
    })
  }
  const hasMore = commits.length > limit
  if (hasMore) commits.length = limit
  const info = await repositoryInfo(root)
  let changes = []
  try {
    changes = await workingTreeStatus(root)
  } catch {
    changes = []
  }
  // The status already classified every row, so the conflict list is free;
  // only MERGE_HEAD needs its own probe.
  const conflicted = changes
    .filter((entry) => entry.xy.includes('U') || entry.xy === 'AA' || entry.xy === 'DD')
    .map((entry) => entry.path)
  const merging = await mergeInProgress(root)
  return {
    repo: { ...info, changeCount: changes.length, conflicts: conflicted, merging },
    commits,
    hasMore,
    skip,
    limit,
  }
}

/** Changed files of one commit, diffed against its first parent. */
async function commitFiles(root, hash) {
  const parentsText = (await gitText(root, ['rev-list', '--parents', '-n', '1', hash])).trim()
  const parents = parentsText.split(/\s+/).slice(1)
  let nameStatus
  let numStat
  if (parents.length === 0) {
    nameStatus = await gitText(root, ['diff-tree', '--root', '--no-commit-id', '-r', '-M', '--name-status', '-z', hash])
    numStat = await gitText(root, ['diff-tree', '--root', '--no-commit-id', '-r', '-M', '--numstat', '-z', hash])
  } else {
    const base = `${hash}^1`
    nameStatus = await gitText(root, ['diff', '--name-status', '-M', '-z', '--no-color', base, hash])
    numStat = await gitText(root, ['diff', '--numstat', '-M', '-z', '--no-color', base, hash])
  }
  const statMap = new Map()
  for (const record of splitRecords(numStat, '\0')) {
    const parts = record.split('\t')
    if (parts.length < 3) continue
    const path = parts.slice(2).join('\t')
    statMap.set(path, parts[0] === '-'
      ? { binary: true }
      : { additions: Number(parts[0]) || 0, deletions: Number(parts[1]) || 0 })
  }
  const records = splitRecords(nameStatus, '\0')
  const files = []
  for (let index = 0; index < records.length; index += 1) {
    const status = records[index]
    if (status.length === 0 || /^[0-9]+$/.test(status)) continue
    const letter = status[0]
    const first = records[index + 1]
    const second = letter === 'R' || letter === 'C' ? records[index + 2] : undefined
    if (first === undefined) break
    index += letter === 'R' || letter === 'C' ? 2 : 1
    const path = letter === 'R' || letter === 'C' ? second : first
    const oldPath = letter === 'R' || letter === 'C' ? first : undefined
    const stats = statMap.get(path) ?? (oldPath === undefined ? undefined : statMap.get(oldPath))
    files.push({
      path,
      oldPath,
      status: letter,
      binary: stats !== undefined && 'binary' in stats ? true : undefined,
      additions: stats !== undefined && 'additions' in stats ? stats.additions : undefined,
      deletions: stats !== undefined && 'deletions' in stats ? stats.deletions : undefined,
    })
  }
  files.sort((left, right) => left.path.localeCompare(right.path))
  return { parents, files }
}

/** One commit's identity, message and changed files. */
async function commitDetail(cwd, payload) {
  const hash = String(payload.hash ?? '')
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new RequestError('bad-request', 'hash is required', 400)
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const format = '%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%D%x1f%s%x1f%b'
  const text = await gitText(root, ['show', '-s', '--no-color', '--decorate=short', `--format=${format}`, hash])
  const fields = text.split('\x1f')
  if (fields.length < 11) throw new RequestError('not-found', 'commit not found', 404)
  const { files } = await commitFiles(root, hash)
  let additions = 0
  let deletions = 0
  for (const file of files) {
    if (file.additions !== undefined) additions += file.additions
    if (file.deletions !== undefined) deletions += file.deletions
  }
  return {
    repo: await repositoryInfo(root),
    hash: fields[0],
    parents: fields[1] === '' ? [] : fields[1].split(' '),
    author: fields[2],
    authorEmail: fields[3],
    authorTime: Number(fields[4]) || 0,
    committer: fields[5],
    committerEmail: fields[6],
    committerTime: Number(fields[7]) || 0,
    refs: parseRefs(fields[8]),
    subject: fields[9],
    body: fields.slice(10).join('\x1f').replace(/\s+$/, ''),
    files,
    additions,
    deletions,
  }
}

/**
 * Parse one unified diff into hunks with both-side line numbers. The client
 * renders these directly; nothing about the wire shape assumes a language.
 */
function parseUnifiedDiff(text) {
  const hunks = []
  const header = { binary: false, renameFrom: undefined, renameTo: undefined, newFile: false, deletedFile: false }
  let current
  let oldLine = 0
  let newLine = 0
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      current = undefined
      continue
    }
    if (raw.startsWith('@@')) {
      const match = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/)
      if (match === null) continue
      oldLine = Number(match[1])
      newLine = Number(match[3])
      current = {
        oldStart: oldLine,
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: newLine,
        newCount: match[4] === undefined ? 1 : Number(match[4]),
        section: match[5] ?? '',
        lines: [],
      }
      hunks.push(current)
      continue
    }
    if (current === undefined) {
      if (raw.startsWith('new file mode')) header.newFile = true
      else if (raw.startsWith('deleted file mode')) header.deletedFile = true
      else if (raw.startsWith('similarity index')) header.similarity = raw.slice(17).trim()
      else if (raw.startsWith('rename from ')) header.renameFrom = raw.slice(12)
      else if (raw.startsWith('rename to ')) header.renameTo = raw.slice(10)
      else if (raw.startsWith('Binary files ') || raw.startsWith('GIT binary patch')) header.binary = true
      continue
    }
    const marker = raw.charAt(0)
    if (marker === '+' || marker === '-' || marker === ' ') {
      const line = { type: marker === ' ' ? ' ' : marker, text: raw.slice(1) }
      if (marker === ' ') {
        line.oldLine = oldLine
        line.newLine = newLine
        oldLine += 1
        newLine += 1
      } else if (marker === '-') {
        line.oldLine = oldLine
        oldLine += 1
      } else {
        line.newLine = newLine
        newLine += 1
      }
      current.lines.push(line)
      continue
    }
    if (raw.startsWith('\\ No newline at end of file')) {
      const last = current.lines[current.lines.length - 1]
      if (last !== undefined) last.noNewline = true
      continue
    }
    if (raw === '') continue
    current = undefined
  }
  return { hunks, header }
}

/** Synthesize an all-added diff for a file git does not track. */
async function untrackedDiff(root, path) {
  const absolute = resolve(root, path)
  const text = await readFile(absolute, 'utf8')
  // A NUL byte in the leading window means the file is binary; rendering its
  // replacement characters as an all-added diff would be noise.
  if (text.slice(0, 8000).includes('\0')) {
    return { hunks: [], header: { binary: true, newFile: true } }
  }
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  if (lines.length > MAX_UNTRACKED_LINES) {
    return { hunks: [], header: { binary: false, newFile: true }, truncated: true }
  }
  return {
    hunks: [{
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: lines.length,
      section: '',
      lines: lines.map((line, index) => ({ type: '+', text: line, newLine: index + 1 })),
    }],
    header: { binary: false, newFile: true },
  }
}

/** One file's diff for one commit, the index, or the working tree. */
async function fileDiff(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const mode = payload.mode === 'index' || payload.mode === 'worktree' || payload.mode === 'compare' ? payload.mode : 'commit'
  const path = String(payload.path ?? '')
  admitPath(root, path)
  const common = ['--no-ext-diff', '--no-textconv', '--no-color', `--unified=${DIFF_CONTEXT_LINES}`, '-M']
  let args
  if (mode === 'worktree') {
    args = ['diff', ...common, '--', path]
  } else if (mode === 'index') {
    args = ['diff', '--cached', ...common, '--', path]
  } else if (mode === 'compare') {
    const base = admitRef(payload.base, 'base ref')
    const head = payload.head === null || payload.head === undefined ? undefined : admitRef(payload.head, 'head ref')
    args = head === undefined
      ? ['diff', ...common, base, '--', path]
      : ['diff', ...common, base, head, '--', path]
  } else {
    const hash = String(payload.hash ?? '')
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new RequestError('bad-request', 'hash is required', 400)
    const parentsText = (await gitText(root, ['rev-list', '--parents', '-n', '1', hash])).trim()
    const parents = parentsText.split(/\s+/).slice(1)
    args = parents.length === 0
      ? ['show', '--format=', '--no-color', '--no-ext-diff', `--unified=${DIFF_CONTEXT_LINES}`, '--root', hash, '--', path]
      : ['diff', ...common, `${hash}^1`, hash, '--', path]
  }
  const text = await gitText(root, args, { maxBytes: MAX_DIFF_BYTES })
  let parsed = parseUnifiedDiff(text)
  const truncated = Buffer.byteLength(text) >= MAX_DIFF_BYTES
  if (parsed.hunks.length === 0 && parsed.header.binary !== true && mode === 'worktree') {
    const tracked = await runGit(root, ['ls-files', '--error-unmatch', '--', path], { allowFailure: true })
    if (tracked.code !== 0) {
      try {
        parsed = await untrackedDiff(root, path)
      } catch {
        parsed = { hunks: [], header: { binary: false }, missing: true }
      }
    }
  }
  return {
    path,
    mode,
    oldPath: parsed.header.renameFrom,
    binary: parsed.header.binary === true,
    newFile: parsed.header.newFile === true,
    deletedFile: parsed.header.deletedFile === true,
    renamed: parsed.header.renameFrom !== undefined && parsed.header.renameTo !== undefined,
    truncated,
    hunks: parsed.hunks,
  }
}

/** Parse git's `%(upstream:track)` summary into divergence counts. */
function parseTrack(text) {
  const ahead = /ahead (\d+)/.exec(text)
  const behind = /behind (\d+)/.exec(text)
  return {
    ahead: ahead === null ? 0 : Number(ahead[1]),
    behind: behind === null ? 0 : Number(behind[1]),
  }
}

/** Local and remote refs of one repository, newest commit first. */
async function branchList(cwd) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  // `for-each-ref` has no `%x1f` escape (that is pretty-format only), so the
  // separator is a literal unit-separator byte in the format string itself.
  const format = ['%(refname:short)', '%(objectname)', '%(HEAD)', '%(upstream:short)', '%(committerdate:unix)', '%(upstream:track)'].join('\x1f')
  const parse = (text) => splitRecords(text, '\n').map((line) => {
    const fields = line.split('\x1f')
    if (fields.length < 6) return undefined
    const track = parseTrack(fields[5])
    return {
      name: fields[0],
      hash: fields[1],
      head: fields[2].trim() === '*' ? '*' : undefined,
      upstream: fields[3] === '' ? undefined : fields[3],
      time: Number(fields[4]) || 0,
      ahead: track.ahead,
      behind: track.behind,
    }
  }).filter((entry) => entry !== undefined)
  const [local, remote] = await Promise.all([
    gitText(root, ['for-each-ref', `--format=${format}`, 'refs/heads', '--sort=-committerdate']),
    gitText(root, ['for-each-ref', `--format=${format}`, 'refs/remotes', '--sort=-committerdate']),
  ])
  return { repo: await repositoryInfo(root), local: parse(local), remote: parse(remote) }
}

/** Validate one repository-relative path and return its absolute form. */
function admitPath(root, path) {
  const text = String(path ?? '')
  if (!platform.isRepoRelativePath(text)) {
    throw new RequestError('bad-path', 'path must be repository-relative', 400)
  }
  const absolute = resolve(root, text)
  if (!platform.isPathInside(root, absolute)) {
    throw new RequestError('bad-path', 'path escapes the repository', 400)
  }
  return absolute
}

/** Unmerged (conflicted) paths of the repository. */
async function unmergedPaths(root) {
  const text = await gitText(root, ['diff', '--name-only', '--diff-filter=U', '-z'])
  return splitRecords(text, '\0')
}

/** Conflicted paths with their two-letter status (UU, AA, DU, …). */
async function conflictEntries(root) {
  const entries = await workingTreeStatus(root)
  return entries
    .filter((entry) => entry.xy.includes('U') || entry.xy === 'AA' || entry.xy === 'DD')
    .map((entry) => ({ path: entry.path, status: entry.xy }))
}

/** Whether a merge is in progress (MERGE_HEAD exists). */
async function mergeInProgress(root) {
  const result = await runGit(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { allowFailure: true, timeoutMs: 5000 })
  return result.code === 0
}

/** Run a git command that must succeed; failures surface git's own message. */
async function gitOrThrow(root, args, options = {}) {
  const result = await runGit(root, args, { ...options, allowFailure: true })
  if (result.code !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim().split('\n').slice(0, 6).join(' ')
    throw new RequestError('git-failed', detail === '' ? `git ${args[0]} exited ${result.code}` : detail, 409)
  }
  return result
}

/** Parse git's "local changes would be overwritten" block into its file list. */
function overwrittenFiles(text) {
  const lines = String(text).split('\n')
  const start = lines.findIndex((line) => /would be overwritten/i.test(line))
  if (start < 0) return []
  const files = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (/^\t/.test(line)) files.push(line.slice(1).trim())
    else if (files.length > 0) break
  }
  return files
}

/** Files of the merge base file's conflict: ours (stage 2), theirs (stage 3), base (stage 1). */
async function conflictedFile(root, path) {
  admitPath(root, path)
  const stage = async (number) => {
    const result = await runGit(root, ['show', `:${number}:${path}`], { allowFailure: true, maxBytes: 4 * 1024 * 1024 })
    return result.code === 0 ? result.stdout : undefined
  }
  const entries = await conflictEntries(root)
  const entry = entries.find((item) => item.path === path)
  if (entry === undefined) throw new RequestError('not-conflicted', 'this file has no conflicts', 409)
  const [ours, theirs, base] = await Promise.all([stage(2), stage(3), stage(1)])
  let worktree = ''
  try {
    worktree = await readFile(admitPath(root, path), 'utf8')
  } catch {
    worktree = ''
  }
  // A conflict on a binary file cannot be resolved as text; sending the decoded
  // bytes to the window would let "apply" write garbage over the file.
  const looksBinary = (text) => typeof text === 'string' && text.slice(0, 8000).includes('\0')
  if (looksBinary(worktree) || looksBinary(ours) || looksBinary(theirs)) {
    return { path, status: entry.status, binary: true }
  }
  return { path, status: entry.status, ours, theirs, base, worktree }
}

/** Everything the merge window needs: conflicted files and the focused file's sides. */
async function conflictState(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const entries = await conflictEntries(root)
  const requested = typeof payload.path === 'string' && payload.path !== '' ? payload.path : entries[0]?.path
  const file = requested === undefined ? undefined : await conflictedFile(root, requested)
  return {
    merging: await mergeInProgress(root),
    files: entries,
    file: file ?? null,
    repo: await repositoryInfo(root),
  }
}

/** Commit the staged changes (or an in-progress merge) with the given message. */
async function commitChanges(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const unmerged = await unmergedPaths(root)
  if (unmerged.length > 0) {
    throw new RequestError('conflicts', `resolve ${unmerged.length} conflicted file(s) first`, 409)
  }
  const merging = await mergeInProgress(root)
  const message = String(payload.message ?? '').trim()
  const paths = Array.isArray(payload.paths) ? payload.paths : []
  if (paths.length > 500) throw new RequestError('too-many-paths', 'select fewer files', 413)
  if (paths.length > 0) {
    paths.forEach((path) => admitPath(root, path))
    await gitOrThrow(root, ['add', '--', ...paths], { timeoutMs: 60000 })
  }
  const staged = (await gitText(root, ['diff', '--cached', '--name-only'])).trim()
  if (staged === '' && !merging) throw new RequestError('nothing-to-commit', 'nothing is staged', 409)
  if (message === '' && !merging) throw new RequestError('bad-request', 'a commit message is required', 400)
  // Colours are already off through the shared `-c color.ui=false`; `commit`
  // and `pull` have no `--no-color` option of their own.
  const args = message === '' ? ['commit', '--no-edit'] : ['commit', '-m', message]
  const result = await gitOrThrow(root, args, { timeoutMs: 60000 })
  const hash = (await gitText(root, ['rev-parse', '--short', 'HEAD'])).trim()
  return { hash, output: `${result.stdout}${result.stderr}`.trim(), merging }
}

/** Pull the upstream branch (merge), reporting conflicts or blocking local edits. */
async function pullChanges(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const info = await repositoryInfo(root)
  if (info.detached) throw new RequestError('detached', 'detached HEAD has no branch to pull', 409)
  if (info.upstream === undefined) throw new RequestError('no-upstream', 'this branch has no upstream to pull from', 409)
  if (await mergeInProgress(root)) throw new RequestError('merge-in-progress', 'a merge is already in progress', 409)
  const smart = payload.mode === 'smart'
  let stashed = false
  if (smart) {
    const stash = await runGit(root, ['stash', 'push', '-u', '-m', 'dsh-git-window: auto stash'], { allowFailure: true, timeoutMs: 60000 })
    stashed = stash.code === 0 && !/No local changes/i.test(stash.stdout)
  }
  const result = await runGit(root, ['pull', '--no-rebase', '--no-edit'], { allowFailure: true, timeoutMs: 180000 })
  if (stashed) {
    await runGit(root, ['stash', 'pop', '--index'], { allowFailure: true, timeoutMs: 60000 })
  }
  const conflicts = await unmergedPaths(root)
  const stderr = `${result.stderr}\n${result.stdout}`
  if (result.code === 0 && conflicts.length === 0) {
    return { status: 'ok', output: result.stdout.trim(), conflicts: [], repo: await repositoryInfo(root) }
  }
  if (conflicts.length > 0) {
    return { status: 'conflicts', conflicts, output: stderr.trim(), repo: await repositoryInfo(root) }
  }
  if (overwrittenFiles(stderr).length > 0) {
    return { status: 'local-changes', files: overwrittenFiles(stderr), output: stderr.trim() }
  }
  throw new RequestError('pull-failed', stderr.trim().split('\n').slice(0, 6).join(' '), 409)
}

/** Push the current branch (never forced, no remote writes beyond the branch). */
async function pushChanges(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const info = await repositoryInfo(root)
  if (info.detached) throw new RequestError('detached', 'detached HEAD has no branch to push', 409)
  let args
  if (info.upstream === undefined) {
    const remotes = (await gitText(root, ['remote'])).trim().split('\n').filter((name) => name !== '')
    const requested = typeof payload.remote === 'string' ? payload.remote : undefined
    const remote = requested !== undefined && remotes.includes(requested) ? requested : (remotes.length === 1 ? remotes[0] : undefined)
    if (remote === undefined) {
      throw new RequestError('no-upstream', 'choose a remote: this branch has no upstream', 409)
    }
    args = ['push', '--set-upstream', remote, info.branch]
  } else {
    args = ['push']
  }
  const result = await runGit(root, args, { allowFailure: true, timeoutMs: 180000 })
  const output = `${result.stdout}${result.stderr}`.trim()
  if (result.code !== 0) {
    const auth = /Authentication failed|could not read Username|Permission denied \(publickey\)|terminal prompts disabled/i.test(output)
    return {
      status: auth ? 'auth-required' : 'failed',
      output: output.split('\n').slice(0, 8).join('\n'),
      repo: await repositoryInfo(root),
    }
  }
  return { status: 'ok', output, repo: await repositoryInfo(root) }
}

/** Write one resolved file and stage it. */
async function resolveConflict(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const path = String(payload.path ?? '')
  const content = typeof payload.content === 'string' ? payload.content : ''
  const absolute = admitPath(root, path)
  await writeFile(absolute, content, 'utf8')
  await gitOrThrow(root, ['add', '--', path], { timeoutMs: 60000 })
  const remaining = await unmergedPaths(root)
  return { remaining, merging: await mergeInProgress(root) }
}

/** Abort the in-progress merge, restoring the pre-merge state. */
async function abortMerge(cwd) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  if (await mergeInProgress(root)) {
    await gitOrThrow(root, ['merge', '--abort'], { timeoutMs: 60000 })
  } else {
    await gitOrThrow(root, ['reset', '--merge'], { timeoutMs: 60000 })
  }
  return { conflicts: await unmergedPaths(root) }
}

/** Validate one ref name handed to git as a single argument. */
function admitRef(name, label) {
  const text = String(name ?? '')
  if (text === '' || text.startsWith('-') || /[\s\0]/.test(text) || text.includes('..') || text.startsWith('/')) {
    throw new RequestError('bad-ref', `${label} is not a valid ref name`, 400)
  }
  return text
}

/** Switch to a local branch, or create a tracking branch from a remote one. */
async function checkoutBranch(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const branch = admitRef(payload.branch, 'branch')
  const remote = payload.remote === true
  let short = branch
  if (remote) {
    const slash = branch.indexOf('/')
    short = slash < 0 ? branch : branch.slice(slash + 1)
  }
  admitRef(short, 'branch')
  const exists = (await runGit(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${short}`], { allowFailure: true, timeoutMs: 5000 })).code === 0
  const args = remote
    ? (exists ? ['checkout', short] : ['checkout', '-b', short, '--track', branch])
    : ['checkout', branch]
  const result = await gitOrThrow(root, args, { timeoutMs: 60000 })
  return { branch: short, output: `${result.stdout}${result.stderr}`.trim(), repo: await repositoryInfo(root) }
}

/** Merge one branch into the current one, reporting conflicts. */
async function mergeIntoCurrent(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const branch = admitRef(payload.branch, 'branch')
  const result = await runGit(root, ['merge', '--no-edit', branch], { allowFailure: true, timeoutMs: 180000 })
  const conflicts = await unmergedPaths(root)
  const output = `${result.stdout}${result.stderr}`.trim()
  if (result.code === 0 && conflicts.length === 0) {
    return { status: 'ok', conflicts: [], output, repo: await repositoryInfo(root) }
  }
  if (conflicts.length > 0) {
    return { status: 'conflicts', conflicts, output, repo: await repositoryInfo(root) }
  }
  throw new RequestError('merge-failed', output.split('\n').slice(0, 6).join(' ') || `git merge exited ${result.code}`, 409)
}

/** Changed files between two refs, or between one ref and the working tree. */
async function compareRefs(cwd, payload) {
  const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
  if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
  const base = admitRef(payload.base, 'base ref')
  const head = payload.head === null || payload.head === undefined ? undefined : admitRef(payload.head, 'head ref')
  const nameArgs = ['diff', '--name-status', '-M', '-z', '--no-color', base]
  const numArgs = ['diff', '--numstat', '-M', '-z', '--no-color', base]
  if (head !== undefined) {
    nameArgs.push(head)
    numArgs.push(head)
  }
  const [nameStatus, numStat] = await Promise.all([
    gitText(root, nameArgs),
    gitText(root, numArgs),
  ])
  const statMap = new Map()
  for (const record of splitRecords(numStat, '\0')) {
    const parts = record.split('\t')
    if (parts.length < 3) continue
    const path = parts.slice(2).join('\t')
    statMap.set(path, parts[0] === '-'
      ? { binary: true }
      : { additions: Number(parts[0]) || 0, deletions: Number(parts[1]) || 0 })
  }
  const records = splitRecords(nameStatus, '\0')
  const files = []
  for (let index = 0; index < records.length; index += 1) {
    const status = records[index]
    if (status.length === 0 || /^[0-9]+$/.test(status)) continue
    const letter = status[0]
    const first = records[index + 1]
    if (first === undefined) break
    const paired = letter === 'R' || letter === 'C'
    const path = paired ? records[index + 2] : first
    const oldPath = paired ? first : undefined
    index += paired ? 2 : 1
    if (path === undefined) break
    const stats = statMap.get(path) ?? (oldPath === undefined ? undefined : statMap.get(oldPath))
    files.push({
      path,
      oldPath,
      status: letter,
      binary: stats !== undefined && 'binary' in stats ? true : undefined,
      additions: stats !== undefined && 'additions' in stats ? stats.additions : undefined,
      deletions: stats !== undefined && 'deletions' in stats ? stats.deletions : undefined,
    })
  }
  files.sort((left, right) => left.path.localeCompare(right.path))
  let additions = 0
  let deletions = 0
  for (const file of files) {
    if (file.additions !== undefined) additions += file.additions
    if (file.deletions !== undefined) deletions += file.deletions
  }
  return { base, head: head ?? null, files, additions, deletions, repo: await repositoryInfo(root) }
}

/** Registered Workspaces that are Git repositories, most recently used first. */
async function repositoryList(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return { workspaces: [], unavailable: true }
  const workspaces = registry.list()
  const results = []
  for (const workspace of workspaces) {
    let root
    try {
      root = (await gitText(workspace.path, ['rev-parse', '--show-toplevel'], { timeoutMs: 5000 })).trim()
    } catch {
      root = ''
    }
    if (root === '') continue
    results.push({
      path: workspace.path,
      root,
      title: workspace.title,
      updatedAt: workspace.updatedAt,
      sessionCount: workspace.sessionIds.length,
    })
  }
  results.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  return { workspaces: results, platform: platform.describe() }
}

/** Body reader bounded to one small JSON document. */
function readJsonBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = []
    let size = 0
    let done = false
    const settle = (error, value) => {
      if (done) return
      done = true
      if (error) reject(error)
      else resolvePromise(value)
    }
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        settle(new RequestError('too-large', 'request body too large', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        settle(null, {})
        return
      }
      try {
        const parsed = JSON.parse(text)
        settle(null, parsed !== null && typeof parsed === 'object' ? parsed : {})
      } catch {
        settle(new RequestError('bad-json', 'request body is not JSON', 400))
      }
    })
    req.on('error', (error) => settle(new RequestError('bad-request', error.message, 400)))
  })
}

/** Write one JSON response unless the socket is already committed. */
function writeJson(res, status, body) {
  if (res.headersSent === true) {
    res.destroy?.()
    return
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

/** Write the `{ ok: true, value }` envelope. */
function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value })
}

/** Write the failure envelope for any thrown value. */
function writeError(res, error) {
  if (error instanceof RequestError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  writeJson(res, 500, {
    ok: false,
    error: { code: 'internal', message: error instanceof Error ? error.message : String(error) },
  })
}

/** Route methods, by name, over the parsed payload. */
const METHODS = {
  repos: (ctx, payload) => repositoryList(ctx, payload),
  async log(ctx, payload) {
    return logCommits(await admitCwd(ctx, payload.cwd), payload)
  },
  async commit(ctx, payload) {
    return commitDetail(await admitCwd(ctx, payload.cwd), payload)
  },
  async diff(ctx, payload) {
    return fileDiff(await admitCwd(ctx, payload.cwd), payload)
  },
  async branches(ctx, payload) {
    return branchList(await admitCwd(ctx, payload.cwd))
  },
  // `commit` (below) READS one commit; creating one is `commitChanges`.
  async commitChanges(ctx, payload) {
    return commitChanges(await admitCwd(ctx, payload.cwd), payload)
  },
  async pull(ctx, payload) {
    return pullChanges(await admitCwd(ctx, payload.cwd), payload)
  },
  async push(ctx, payload) {
    return pushChanges(await admitCwd(ctx, payload.cwd), payload)
  },
  async conflicts(ctx, payload) {
    return conflictState(await admitCwd(ctx, payload.cwd), payload)
  },
  async resolve(ctx, payload) {
    return resolveConflict(await admitCwd(ctx, payload.cwd), payload)
  },
  async abortMerge(ctx, payload) {
    return abortMerge(await admitCwd(ctx, payload.cwd))
  },
  async checkout(ctx, payload) {
    return checkoutBranch(await admitCwd(ctx, payload.cwd), payload)
  },
  async mergeBranch(ctx, payload) {
    return mergeIntoCurrent(await admitCwd(ctx, payload.cwd), payload)
  },
  async compare(ctx, payload) {
    return compareRefs(await admitCwd(ctx, payload.cwd), payload)
  },
  async status(ctx, payload) {
    const cwd = await admitCwd(ctx, payload.cwd)
    const root = (await gitText(cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (root === '') throw new RequestError(NOT_REPO, 'not a git repository', 409)
    return {
      repo: await repositoryInfo(root),
      entries: await workingTreeStatus(root),
    }
  },
}

/**
 * Serve one API method: fence the request through Connection's own checks,
 * then dispatch by name. Read-only by construction — nothing here writes to a
 * repository.
 */
function createHandler(ctx) {
  return async (req, res) => {
    try {
      const connection = ctx.get('connection')
      if (connection !== undefined && connection.requestRejection(req) !== undefined) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh-git.internal').pathname
      const method = pathname.startsWith(`${ROUTE_PATH}/`) ? pathname.slice(ROUTE_PATH.length + 1) : ''
      if (method === '' || method.includes('/')) {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown git API method' } })
        return
      }
      const handler = Object.hasOwn(METHODS, method) ? METHODS[method] : undefined
      if (typeof handler !== 'function') {
        writeJson(res, 404, { ok: false, error: { code: 'not-found', message: `unknown git API method "${method}"` } })
        return
      }
      const payload = await readJsonBody(req)
      const value = await handler(ctx, payload)
      writeOk(res, value)
    } catch (error) {
      writeError(res, error)
    }
  }
}

export function apply(ctx) {
  const handler = createHandler(ctx)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PATH,
    handler,
  }), 'dsh-git-window: git api route')
}
