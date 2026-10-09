// Full pre-publish check, run by the maintainer against this checkout:
//   1. the public checks (schema + watertight/overlap)
//   2. the main threedeeforge repo's stl-check (default text on every zone, every
//      symbol through an icon zone, stroke printability) pointed at this
//      repo's templates/ via THREEDEEFORGE_TEMPLATES_DIR
// Nothing here touches the live site. The maintainer's publish tool (threedeeforge repo) runs this first and
// refuses to publish if it fails.
//
// Pass template ids to check just those:  npm run verify -- bento-box toolbox
// (the checks run against a temporary copy holding only those templates, and the main
// repo's slow symbol-library and multi-colour sweeps are skipped; a plain `npm run verify`
// with no ids still runs them).
//
// The main repo is private, so this can't run in public CI. Set THREEDEEFORGE_REPO
// if it isn't at ~/dev/threedeeforge.  Run: npm run verify
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const repo = resolve(process.env.THREEDEEFORGE_REPO ?? `${homedir()}/dev/threedeeforge`)
const client = `${repo}/client`
const ids = process.argv.slice(2)
let templates = resolve('templates')
for (const id of ids) {
  if (!existsSync(`${templates}/${id}/template.json`)) {
    console.error(`verify: no such template "${id}" under templates/`)
    process.exit(1)
  }
}
let scratch: string | undefined
if (ids.length) {
  scratch = mkdtempSync(`${tmpdir()}/threedeeforge-verify-`)
  // plaque-classic rides along: the main repo's multi-colour test uses it as a fixture.
  for (const id of new Set([...ids, 'plaque-classic'])) cpSync(`${templates}/${id}`, `${scratch}/${id}`, { recursive: true })
  templates = scratch
}

if (!existsSync(`${client}/scripts/stl-check.mts`)) {
  console.error(`verify: main threedeeforge repo not found at ${repo} (set THREEDEEFORGE_REPO)`)
  process.exit(1)
}

function step(title: string, cmd: string, args: string[], cwd = process.cwd()) {
  console.log(`\n== ${title}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, THREEDEEFORGE_TEMPLATES_DIR: templates, ...(ids.length ? { THREEDEEFORGE_SKIP_SWEEPS: '1' } : {}) } })
  if (r.status !== 0) {
    console.error(`\nverify: FAILED at "${title}"`)
    if (scratch) rmSync(scratch, { recursive: true, force: true })
    process.exit(r.status ?? 1)
  }
}

step('template.json schema', 'npm', ['run', '--silent', 'check-schema'])
step('mesh watertight / part overlap', 'npm', ['run', '--silent', 'stl-check'])
step('full stl-check (main repo)', 'npm', ['run', '--silent', 'stl-check'], client)
if (scratch) rmSync(scratch, { recursive: true, force: true })
console.log(`\nverify: all checks passed${ids.length ? ` (${ids.join(', ')})` : ''}`)
