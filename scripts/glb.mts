import { readFileSync } from 'node:fs'
import type { TriMesh } from '../src/geom/csg'

/** Licence / provenance stamped into the GLB's `asset` block. */
export interface GlbMeta {
  copyright: string
  extras: Record<string, string>
}

/** Minimal binary glTF writer: one mesh, positions + uint32 indices, mm units. */
export function writeGlb(positions: Float32Array, indices: Uint32Array, meta?: GlbMeta): Uint8Array {
  const pad4 = (n: number) => (n + 3) & ~3
  const posBytes = positions.byteLength
  const idxBytes = indices.byteLength
  const binLen = pad4(posBytes) + pad4(idxBytes)

  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k])
      max[k] = Math.max(max[k], positions[i + k])
    }

  const json = {
    asset: { version: '2.0', generator: 'threedeeforge', ...meta },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: pad4(posBytes), byteLength: idxBytes, target: 34963 },
    ],
    buffers: [{ byteLength: binLen }],
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLen = pad4(jsonBytes.length)

  const total = 12 + 8 + jsonLen + 8 + binLen
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  let o = 0
  dv.setUint32(o, 0x46546c67, true); dv.setUint32(o + 4, 2, true); dv.setUint32(o + 8, total, true); o += 12
  dv.setUint32(o, jsonLen, true); dv.setUint32(o + 4, 0x4e4f534a, true); o += 8
  out.set(jsonBytes, o); out.fill(0x20, o + jsonBytes.length, o + jsonLen); o += jsonLen
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8
  out.set(new Uint8Array(positions.buffer, positions.byteOffset, posBytes), o); o += pad4(posBytes)
  out.set(new Uint8Array(indices.buffer, indices.byteOffset, idxBytes), o)
  return out
}

/** Read a GLB written by writeGlb above (single primitive, POSITION + indices). */
export function readGlb(path: string): TriMesh {
  const b = readFileSync(path)
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const jsonLen = dv.getUint32(12, true)
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString())
  const bin = b.byteOffset + 20 + jsonLen + 8
  const view = (i: number) => json.bufferViews[json.accessors[i].bufferView]
  const p = view(0), x = view(1)
  return {
    positions: new Float32Array(b.buffer.slice(bin + p.byteOffset, bin + p.byteOffset + p.byteLength)),
    indices: new Uint32Array(b.buffer.slice(bin + x.byteOffset, bin + x.byteOffset + x.byteLength)),
  }
}

/** Read the `asset` block of a GLB's JSON chunk. */
export function readGlbAsset(path: string): Record<string, any> {
  const b = readFileSync(path)
  const jsonLen = b.readUInt32LE(12)
  return JSON.parse(b.subarray(20, 20 + jsonLen).toString()).asset ?? {}
}
