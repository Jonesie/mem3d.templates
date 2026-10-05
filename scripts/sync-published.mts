/**
 * Publishes templates: mirrors template folders under ./templates whose
 * template.json has `"published"` not explicitly `false` into
 * /hdd2/mem3d/templates — the directory the mem3d site's container
 * actually mounts (read-only). A template that is a draft (or deleted) but
 * still on the live site is removed from there, so un-publishing a template
 * here and re-running this is enough to pull it off the live site.
 *
 * This is the only step that makes a change visible: editing files under
 * ./templates never touches the site by itself, so drafts are safe to work
 * on indefinitely. The site's own TemplateCatalogue rescans on file mtime
 * with no restart needed (mem3d#20), so publishing is just: run this.
 *
 * Only templates that differ from the live site are checked and synced.
 * Changed templates are verified in parallel (`npm run verify -- <id>` each)
 * and nothing is published if any of them fails; pass --no-verify to skip
 * that (the full check is slow).
 *
 * Run from the repo root:
 *   npm run sync                  # just the templates that changed vs the live site
 *   npm run sync -- bento-box     # just these (skipped if already up to date; --force overrides)
 *   npm run sync -- --all         # every template; always asks you to confirm first
 *   npm run sync -- --no-verify bento-box   # without the verify step
 *   npm run sync -- --dry-run    # just list what would be verified and synced
 *   npm run sync -- --jobs 8      # how many verifies run at once (default 4)
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

const SRC = 'templates'
const DEST = '/hdd2/mem3d/templates'

const args = process.argv.slice(2)
const flag = (f: string) => args.includes(f)
const skipVerify = flag('--no-verify')
const force = flag('--force')
const dryRun = flag('--dry-run')
const syncAll = flag('--all')
const jobsAt = args.indexOf('--jobs')
const jobs = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1]) || 4) : 4
const only = args.filter((a, i) => !a.startsWith('--') && !(jobsAt >= 0 && i === jobsAt + 1))

if (syncAll && only.length) {
  console.error('sync: use either --all or template ids, not both')
  process.exit(1)
}

const local = readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
for (const id of only) {
  if (!local.includes(id)) {
    console.error(`sync: no such template "${id}" under ${SRC}/`)
    process.exit(1)
  }
}
const live = existsSync(DEST) ? readdirSync(DEST, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []

const isPublished = (id: string) => {
  const path = `${SRC}/${id}/template.json`
  return existsSync(path) && JSON.parse(readFileSync(path, 'utf8')).published !== false
}

/** Does the live copy differ from the source? (Checksum compare, ignores mtimes.) */
function differs(id: string): boolean {
  if (!live.includes(id)) return true
  const out = execFileSync('rsync', ['-rcn', '--delete', '--itemize-changes', `${SRC}/${id}/`, `${DEST}/${id}/`], { encoding: 'utf8' })
  return out.trim().length > 0
}

// What needs doing: publish (new/changed, published) or remove (live, but now a draft or deleted).
const candidates = only.length ? only : syncAll ? [...new Set([...local, ...live])] : [...new Set([...local.filter(isPublished), ...live])]
const toPublish = candidates.filter((id) => local.includes(id) && isPublished(id) && (force || differs(id)))
const toRemove = candidates.filter((id) => live.includes(id) && !(local.includes(id) && isPublished(id)))
const upToDate = candidates.filter((id) => local.includes(id) && isPublished(id) && !toPublish.includes(id))
const drafts = only.filter((id) => local.includes(id) && !isPublished(id) && !live.includes(id))

if (syncAll) {
  // Syncing everything is slow and rarely needed, so it is never silent.
  if (!process.stdin.isTTY) {
    console.error('sync --all asks for confirmation and needs an interactive terminal. Sync specific templates instead, or run it yourself.')
    process.exit(1)
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ans = await rl.question(`Sync ALL templates (${toPublish.length} to publish, ${toRemove.length} to remove)${skipVerify ? '' : ', verifying each'}? [y/N] `)
  rl.close()
  if (!/^y(es)?$/i.test(ans.trim())) {
    console.log('cancelled')
    process.exit(0)
  }
}

if (!toPublish.length && !toRemove.length) {
  console.log(`nothing to sync${upToDate.length ? `: ${upToDate.join(', ')} already up to date` : ''}${drafts.length ? `; draft, not published: ${drafts.join(', ')}` : ''}`)
  process.exit(0)
}
console.log(`changed: ${toPublish.join(', ') || '(none)'}${toRemove.length ? `   to remove: ${toRemove.join(', ')}` : ''}`)
if (dryRun) process.exit(0)

/** Run `npm run verify -- <id>` for each id, at most `jobs` at a time; output is held back and printed per template. */
async function verifyAll(ids: string[]): Promise<string[]> {
  const failed: string[] = []
  const queue = [...ids]
  const run = (id: string) => new Promise<void>((resolve) => {
    const started = Date.now()
    let out = ''
    const p = spawn('npm', ['run', '--silent', 'verify', '--', id], { stdio: ['ignore', 'pipe', 'pipe'] })
    p.stdout.on('data', (d) => { out += d })
    p.stderr.on('data', (d) => { out += d })
    p.on('close', (code) => {
      const secs = ((Date.now() - started) / 1000).toFixed(0)
      console.log(`${code === 0 ? ' ok ' : 'FAIL'} verify ${id} (${secs}s)`)
      if (code !== 0) { failed.push(id); console.log(out) }
      resolve()
    })
  })
  const worker = async () => { for (let id = queue.shift(); id; id = queue.shift()) await run(id) }
  await Promise.all(Array.from({ length: Math.min(jobs, ids.length) }, worker))
  return failed
}

if (skipVerify) {
  console.log('verify skipped (--no-verify)')
} else if (toPublish.length) {
  console.log(`verifying ${toPublish.length} template${toPublish.length === 1 ? '' : 's'}, up to ${jobs} at once`)
  const failed = await verifyAll(toPublish)
  if (failed.length) {
    console.error(`sync: verify failed for ${failed.join(', ')}; nothing published`)
    process.exit(1)
  }
}

for (const id of toPublish) {
  execFileSync('rsync', ['-a', '--delete', `${SRC}/${id}/`, `${DEST}/${id}/`])
}
for (const id of toRemove) {
  rmSync(`${DEST}/${id}`, { recursive: true, force: true })
  console.log(`removed (no longer published): ${id}`)
}

console.log(`published ${toPublish.length} template${toPublish.length === 1 ? '' : 's'} to ${DEST}`)
if (upToDate.length) console.log(`already up to date: ${upToDate.join(', ')}`)
if (drafts.length) console.log(`draft, not published: ${drafts.join(', ')}`)
