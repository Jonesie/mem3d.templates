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
 * Run from the repo root:  npm run sync
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'

const SRC = 'templates'
const DEST = '/hdd2/mem3d/templates'

const ids = readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
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
    if (id.isDirectory() && !published.includes(id.name)) {
      rmSync(`${DEST}/${id.name}`, { recursive: true, force: true })
      console.log(`removed (no longer published): ${id.name}`)
    }
  }
}

console.log(`published ${published.length} template${published.length === 1 ? '' : 's'} to ${DEST}`)
if (skipped.length) console.log(`draft, not published: ${skipped.join(', ')}`)
