// Validates every templates/<id>/template.json: required fields, types,
// mesh files present, zone geometry sane, colour/part references resolve.
// Cheap and dependency-free, so it runs in public CI on every PR.
// Exits non-zero on any error. Run: npm run check-schema
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const templatesDir = process.env.MEM3D_TEMPLATES_DIR ?? 'templates'
const hex = /^#[0-9a-fA-F]{6}$/
const isVec3 = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
const len = (v: number[]) => Math.hypot(v[0], v[1], v[2])
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

function check(id: string): string[] {
  const dir = `${templatesDir}/${id}`
  const errs: string[] = []
  const path = `${dir}/template.json`
  if (!existsSync(path)) return ['missing template.json']
  let t: any
  try { t = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { return [`template.json is not valid JSON: ${(e as Error).message}`] }

  if (t.id !== id) errs.push(`id "${t.id}" must match folder name "${id}"`)
  if (!isStr(t.name)) errs.push('name must be a non-empty string')
  if (t.units !== 'mm') errs.push('units must be "mm"')
  if (!Array.isArray(t.tags) || !t.tags.every(isStr)) errs.push('tags must be an array of strings')
  if (!isStr(t.author)) errs.push('author must be a non-empty string')
  if (!isStr(t.notes)) errs.push('notes must be a non-empty string (print advice)')
  if (!Array.isArray(t.colours) || t.colours.length === 0 || !t.colours.every((c: unknown) => typeof c === 'string' && hex.test(c)))
    errs.push('colours must be a non-empty array of #rrggbb strings')
  for (const k of ['published', 'verified']) if (k in t && typeof t[k] !== 'boolean') errs.push(`${k} must be a boolean`)

  // Meshes: either a single `mesh`, or `parts` (not both).
  const partIds = new Set<string>()
  const nColours = Array.isArray(t.colours) ? t.colours.length : 0
  if (t.parts !== undefined) {
    if ('mesh' in t) errs.push('use either "mesh" or "parts", not both')
    if (!Array.isArray(t.parts) || t.parts.length === 0) errs.push('parts must be a non-empty array')
    else for (const p of t.parts) {
      if (!isStr(p?.id)) { errs.push('every part needs an id'); continue }
      if (partIds.has(p.id)) errs.push(`duplicate part id "${p.id}"`)
      partIds.add(p.id)
      if (!isStr(p.label)) errs.push(`part ${p.id}: label required`)
      if (!Number.isInteger(p.colour) || p.colour < 0 || p.colour >= nColours) errs.push(`part ${p.id}: colour index out of range`)
      if (!isStr(p.mesh) || !existsSync(`${dir}/${p.mesh}`)) errs.push(`part ${p.id}: mesh file "${p.mesh}" not found`)
    }
  } else if (!isStr(t.mesh) || !existsSync(`${dir}/${t.mesh}`)) errs.push(`mesh file "${t.mesh}" not found`)

  // Zones
  if (!Array.isArray(t.zones)) return [...errs, 'zones must be an array']
  const zoneIds = new Set<string>()
  for (const z of t.zones) {
    const zid = z?.id
    const at = `zone ${zid}:`
    if (!isStr(zid)) { errs.push('every zone needs an id'); continue }
    if (zoneIds.has(zid)) errs.push(`duplicate zone id "${zid}"`)
    zoneIds.add(zid)
    if (!isStr(z.label)) errs.push(`${at} label required`)
    if (z.kind !== undefined && z.kind !== 'text' && z.kind !== 'symbol') errs.push(`${at} kind must be "text" or "symbol"`)
    if (z.mode !== 'emboss' && z.mode !== 'engrave') errs.push(`${at} mode must be "emboss" or "engrave"`)
    for (const k of ['origin', 'normal', 'up']) if (!isVec3(z[k])) errs.push(`${at} ${k} must be [x, y, z] numbers`)
    if (isVec3(z.normal) && isVec3(z.up)) {
      if (Math.abs(len(z.normal) - 1) > 0.01) errs.push(`${at} normal must be unit length`)
      if (Math.abs(len(z.up) - 1) > 0.01) errs.push(`${at} up must be unit length`)
      if (Math.abs(dot(z.normal, z.up)) > 0.01) errs.push(`${at} up must be perpendicular to normal`)
    }
    // width is ignored (0) on arc zones: the arc length is the width.
    for (const k of ['width', 'height', 'depth']) {
      const ok = typeof z[k] === 'number' && (z[k] > 0 || (k === 'width' && z.arc && z[k] === 0))
      if (!ok) errs.push(`${at} ${k} must be a positive number`)
    }
    if (!Number.isInteger(z.maxLines) || z.maxLines < 1) errs.push(`${at} maxLines must be a positive integer`)
    if (typeof z.default !== 'string') errs.push(`${at} default must be a string`)
    if (z.colour !== undefined && (!Number.isInteger(z.colour) || z.colour < 0 || z.colour >= nColours)) errs.push(`${at} colour index out of range`)
    if (z.part !== undefined && !partIds.has(z.part)) errs.push(`${at} part "${z.part}" is not a declared part`)
  }
  if (t.zones.length === 0) errs.push('template has no zones')
  return errs
}

let failed = false
for (const id of readdirSync(templatesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const errs = check(id)
  if (errs.length) failed = true
  console.log(`${errs.length ? 'FAIL' : ' ok '} ${id}`)
  for (const e of errs) console.log(`       ${e}`)
}
process.exit(failed ? 1 : 0)
