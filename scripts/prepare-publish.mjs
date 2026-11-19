/**
 * Stage a publishable copy of this plugin under the PUBLIC package name.
 *
 * The working directory keeps `@local/dsh-git-window` because the profile has
 * it installed as a linked package under that name; renaming in place would
 * leave that loader row pointing at nothing. This script copies the shipped
 * files into `dist/`, rewrites the two places the package name appears, and
 * leaves a tree that `npm pack`/`npm publish` can use directly.
 *
 * Usage: node scripts/prepare-publish.mjs [public-name]
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(root, 'dist')
const publicName = process.argv[2] ?? 'dsh-git-window'

/** Everything the published package must contain. */
const SHIPPED = [
  'index.js',
  'client.js',
  'cordis.patch.yml',
  'icon.svg',
  'README.md',
  'PUBLISHING.md',
  'LICENSE',
  'locale',
  'platform',
]

await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

for (const entry of SHIPPED) {
  await cp(join(root, entry), join(out, entry), { recursive: true })
}

const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
manifest.name = publicName
// `@local/*` stays on the working copy; the published package is standalone.
manifest.private = undefined
delete manifest.private
manifest.version = manifest.version
await writeFile(join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const patchPath = join(out, 'cordis.patch.yml')
const patch = await readFile(patchPath, 'utf8')
await writeFile(patchPath, patch.replace(/name: '@local\/dsh-git-window'/g, `name: '${publicName}'`), 'utf8')

const check = await readFile(patchPath, 'utf8')
console.log(`staged ${publicName} → ${out}`)
console.log(check.trim())
