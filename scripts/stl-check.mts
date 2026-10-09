// Headless sanity check of the template meshes themselves: every mesh must
// be watertight (each edge shared by exactly two triangles), and the parts
// of a multi-part template must not intersect. Exits non-zero on any FAIL.
// Run: npm run stl-check
//
// The fuller check in the main threedeeforge repo (default text on every zone, every
// symbol extruding cleanly) needs that repo's client code, so it isn't here.
import { readdirSync, readFileSync } from 'node:fs'
import Module from 'manifold-3d'
import { readGlb } from './glb.mts'

type Mesh = ReturnType<typeof readGlb>
type Part = { id: string; mesh: string }
type Tpl = { id: string; mesh?: string; parts?: Part[] }

const templatesDir = process.env.THREEDEEFORGE_TEMPLATES_DIR ?? 'templates'

/** Edges not shared by exactly two triangles. */
function nonManifoldEdges(m: Mesh): number {
  const edges = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]]
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u}-${v}` : `${v}-${u}`
      edges.set(k, (edges.get(k) ?? 0) + 1)
    }
  }
  return [...edges.values()].filter((n) => n !== 2).length
}

const wasm = await Module()
wasm.setup()
const { Manifold, Mesh: ManifoldMesh } = wasm

let failed = false
for (const id of readdirSync(templatesDir).sort()) {
  const dir = `${templatesDir}/${id}`
  const t: Tpl = JSON.parse(readFileSync(`${dir}/template.json`, 'utf8'))
  const parts: Part[] = t.parts ?? [{ id: 'body', mesh: t.mesh! }]
  const meshes = parts.map((p) => readGlb(`${dir}/${p.mesh}`))
  const bad = meshes.reduce((n, m) => n + nonManifoldEdges(m), 0)
  const tris = meshes.reduce((n, m) => n + m.indices.length / 3, 0)

  // Parts must not intersect (hinges, inlays, stacked parts).
  let overlap = ''
  if (parts.length > 1) {
    const ms = meshes.map((m) => Manifold.ofMesh(new ManifoldMesh({ numProp: 3, vertProperties: m.positions, triVerts: m.indices })))
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const v = Manifold.intersection(ms[i], ms[j]).volume()
      if (v > 1e-3) overlap += ` OVERLAP ${parts[i].id}∩${parts[j].id}=${v.toFixed(2)}mm³`
    }
  }
  if (bad || overlap) failed = true
  console.log(`${bad || overlap ? 'FAIL' : ' ok '} ${id.padEnd(20)} ${String(tris).padStart(6)} tris  non-manifold edges: ${bad}${overlap}`)
}
process.exit(failed ? 1 : 0)
