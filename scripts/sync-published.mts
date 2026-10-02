/**
 * Publishes templates: mirrors every template folder under ./templates
 * whose template.json has `"published"` not explicitly `false` into
 * /hdd2/mem3d/templates — the directory the mem3d site's container
 * actually mounts (read-only). Anything not published there gets removed,
 * so un-publishing (or deleting) a template here and re-running this is
 * enough to pull it off the live site.
 *
 * This is the only step that makes a change visible: editing files under
 * ./templates never touches the site by itself, so drafts are safe to work
 * on indefinitely. The site's own TemplateCatalogue rescans on file mtime
 * with no restart needed (mem3d#20), so publishing is just: run this.
 *
 * It runs `npm run verify` first and publishes nothing if that fails;
 * pass --no-verify to skip that (the full check is slow).
 *
 * Run from the repo root:
 *   npm run sync                  # everything
 *   npm run sync -- bento-box     # just these templates (verify + mirror only
 *                                 # them, leave the rest of the live site alone;
 *                                 # a draft id is pulled off the live site)
 *   npm run sync -- --no-verify bento-box   # same, without the verify step
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'

const SRC = 'templates'
const DEST = '/hdd2/mem3d/templates'

const args = process.argv.slice(2)
const skipVerify = args.includes('--no-verify')
const only = args.filter((a) => a !== '--no-verify')
const all = readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
for (const id of only) {
  if (!all.includes(id)) {
    console.error(`sync: no such template "${id}" under ${SRC}/`)
    process.exit(1)
  }
}
if (!skipVerify) {
  const verify = spawnSync('npm', ['run', '--silent', 'verify', ...(only.length ? ['--', ...only] : [])], { stdio: 'inherit' })
  if (verify.status !== 0) process.exit(verify.status ?? 1)
} else {
  console.log('verify skipped (--no-verify)')
}

const ids = only.length ? only : all
const published = ids.filter((id) => {
  const path = `${SRC}/${id}/template.json`
  if (!existsSync(path)) return false
  const t = JSON.parse(readFileSync(path, 'utf8'))
  return t.published !== false
})
const skipped = ids.filter((id) => !published.includes(id))

for (const id of published) {
  execFileSync('rsync', ['-a', '--delete', `${SRC}/${id}/`, `${DEST}/${id}/`])
}

if (existsSync(DEST)) {
  for (const id of readdirSync(DEST, { withFileTypes: true })) {
    // A full sync prunes everything unpublished; a targeted one only touches the ids asked for.
    if (id.isDirectory() && !published.includes(id.name) && (!only.length || only.includes(id.name))) {
      rmSync(`${DEST}/${id.name}`, { recursive: true, force: true })
      console.log(`removed (no longer published): ${id.name}`)
    }
  }
}

console.log(`published ${published.length} template${published.length === 1 ? '' : 's'} to ${DEST}`)
if (skipped.length) console.log(`draft, not published: ${skipped.join(', ')}`)
