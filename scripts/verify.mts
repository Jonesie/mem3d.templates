// Full pre-publish check, run by the maintainer against this checkout:
//   1. the public checks (schema + watertight/overlap)
//   2. the main mem3d repo's stl-check (default text on every zone, every
//      symbol through an icon zone, stroke printability) pointed at this
//      repo's templates/ via MEM3D_TEMPLATES_DIR
// Nothing here touches the live site. `npm run sync` runs this first and
// refuses to publish if it fails.
//
// The main repo is private, so this can't run in public CI. Set MEM3D_REPO
// if it isn't at ~/dev/mem3d.  Run: npm run verify
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const repo = resolve(process.env.MEM3D_REPO ?? `${homedir()}/dev/mem3d`)
const client = `${repo}/client`
const templates = resolve('templates')

if (!existsSync(`${client}/scripts/stl-check.mts`)) {
  console.error(`verify: main mem3d repo not found at ${repo} (set MEM3D_REPO)`)
  process.exit(1)
}

function step(title: string, cmd: string, args: string[], cwd = process.cwd()) {
  console.log(`\n== ${title}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, MEM3D_TEMPLATES_DIR: templates } })
  if (r.status !== 0) {
    console.error(`\nverify: FAILED at "${title}"`)
    process.exit(r.status ?? 1)
  }
}

step('template.json schema', 'npm', ['run', '--silent', 'check-schema'])
step('mesh watertight / part overlap', 'npm', ['run', '--silent', 'stl-check'])
step('full stl-check (main repo)', 'npm', ['run', '--silent', 'stl-check'], client)
console.log('\nverify: all checks passed')
