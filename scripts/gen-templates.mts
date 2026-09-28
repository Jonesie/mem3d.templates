/**
 * Generates the starter templates procedurally with Manifold and writes
 * templates/<id>/{template.json,mesh.glb} (this repo's own copy — the
 * source of truth; the mem3d site never sees it directly, see README).
 * Real templates come from FreeCAD (freecad-src/); these exercise the
 * zone transform code with faces at various orientations.
 *
 * Run from the repo root:  npm run gen
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import Module, { type Manifold as M } from 'manifold-3d'
import { writeGlb } from './glb.mts'

const wasm = await Module()
wasm.setup()
const { Manifold, CrossSection } = wasm

type Vec3 = [number, number, number]
interface Zone {
  id: string; label: string; kind?: 'text' | 'symbol'; origin: Vec3; normal: Vec3; up: Vec3
  width: number; height: number; mode: 'emboss' | 'engrave'; depth: number
  maxLines: number; default: string; font?: string; part?: string; colour?: number
  backing?: { offset: number; height: number }
  arc?: { radius: number; sweep: number; side: 'top' | 'bottom' }
  /** Extra placements, as [x, y, 0] offsets in the zone's own plane. */
  repeat?: Vec3[]
  /** Bend the content around a cylinder of this radius (axis parallel to `up`). */
  wrap?: { radius: number }
}
interface PartMeta { id: string; label: string; colour?: number }
interface Tpl {
  id: string; name: string; tags: string[]; zones: Zone[]
  /** Single solid, or one solid per part (keyed by PartMeta.id). Parts must not overlap. */
  build: () => M | Record<string, M>
  parts?: PartMeta[]
  colours?: string[]
  /** Set once a real print has been checked; shows a badge in the gallery. */
  verified?: boolean
  /** Shown in the editor: printing / assembly notes. */
  notes?: string
  /** Parts must be printed together as placed; STL export is one merged file. */
  printInPlace?: boolean
}

const roundedRect = (w: number, h: number, r: number) =>
  CrossSection.square([w - 2 * r, h - 2 * r], true).offset(r, 'Round', 2, 32)

type XY = [number, number]

/**
 * Where the three border adornments sit on the picture frame's front face,
 * as [x, y] pairs. The first pair of each list is that zone's own origin
 * and the rest become `repeat` placements, so one icon the user picks once
 * appears everywhere in its list.
 *
 * The border is a 15 mm band around a 176 x 126 face: the side bands are
 * centred on x = +/-80.5 and are clear for y between -48 and 48, the top and
 * bottom bands on y = +/-55.5, and the four corners sit at (+/-80.5, +/-55.5).
 * The two text zones take the middle 110 mm of the top and bottom bands,
 * so on those bands only |x| > 55 is free. Icons are 9 mm.
 */
function borderPattern(): { corners: XY[]; sides: XY[]; edges: XY[] } {
  const bx = 80.5, by = 55.5
  const pair = (x: number, ys: number[]): XY[] => ys.map((y): XY => [x, y])
  return {
    // One icon anchoring all four corners.
    corners: [[-bx, by], [bx, by], [bx, -by], [-bx, -by]],
    // A second marching down both side bands, clear of the corners.
    sides: [...pair(-bx, [40, 20, 0, -20, -40]), ...pair(bx, [40, 20, 0, -20, -40])],
    // A third filling the four gaps between the text and the corners.
    edges: [[-68, by], [68, by], [68, -by], [-68, -by]],
  }
}

const templates: Tpl[] = [
  {
    id: 'plaque-classic',
    name: 'Classic Plaque',
    tags: ['plaque', 'sign'],
    notes: 'Print flat as placed, face up, no supports. The text is engraved; in a second colour it exports as a flush inlay, so load the 3MF for an AMS/MMU or print the merged STL in one colour.',
    colours: ['#e6d9bd', '#2c3e50', '#c0392b'],
    // 100 × 50 × 4, rounded corners, text on top (+Z).
    build: () => Manifold.extrude(roundedRect(100, 50, 6), 4),
    zones: [
      { id: 'icon', label: 'Adornment', kind: 'symbol', colour: 2, origin: [-38, 0, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 18, height: 18, mode: 'engrave', depth: 1, maxLines: 1, default: '' },
      { id: 'title', label: 'Title', colour: 1, origin: [10, 12, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 72, height: 14, mode: 'engrave', depth: 1, maxLines: 1, default: 'In Loving Memory' },
      { id: 'body', label: 'Body', colour: 1, origin: [10, -9, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 72, height: 22, mode: 'engrave', depth: 0.8, maxLines: 3, default: 'Forever in our hearts' },
    ],
  },
  {
    id: 'headstone-classic',
    name: 'Classic Headstone',
    tags: ['memorial', 'garden'],
    notes: 'Two parts, printed separately then assembled by hand afterward: the headstone prints lying flat, engraved/embossed face up (no rotation needed, no supports) — stand it up and push its tenon into the base’s socket, a firm friction fit (add a dot of glue if you want it permanent). The base prints separately, as placed, no supports. Printing the headstone flat rather than standing also means a multi-colour (AMS/MMU) print only swaps filament within the top ~1–2 mm of engraving/emboss depth, not across the whole standing height.',
    colours: ['#8b8f98', '#f4f4f0'],
    verified: true,
    parts: [
      { id: 'slab', label: 'Headstone', colour: 0 },
      { id: 'base', label: 'Base', colour: 0 },
    ],
    // Standing height is how the piece reads assembled: 60 wide (X), 10 thick
    // (Y-thickness/Z-thickness below), 80 tall with an arched top, on a
    // 70×20×8 base, text on the front face. But it's authored to *print*
    // lying flat, front face up — built standing (as before, tenon included)
    // then rotated -90° about X + dropped to the bed as one last step, so
    // the exported file needs no manual reorientation in the slicer. Verified
    // by slicing the actual exported STL: rests flat with zero warnings, and
    // the front face (with the engraving/emboss detail) faces up, not into
    // the bed. Printing flat like this also means a multi-colour print only
    // swaps filament within the shallow engrave/emboss depth near the top,
    // not across the whole 80 mm standing height.
    build: () => {
      const arch = CrossSection.union(
        CrossSection.square([60, 50], false),                       // 0..50 tall
        CrossSection.circle(30, 64).translate(30, 50),              // arch centred at 50
      )
      // extrude in XZ: build in XY then rotate so Y→Z, then push to y ∈ [-5, 5]
      const slabBody = Manifold.extrude(arch, 10).rotate(90, 0, 0).translate(-30, 5, 8)

      // Nearly the slab's full 60 mm width (58, not e.g. 40): a narrower centred tenon
      // leaves an unsupported shelf around it that OrcaSlicer flagged as a "floating
      // cantilever" when actually sliced. Full-width in X avoids that. TD must also
      // equal the slab's full 10 mm thickness (not recessed): the Y (thickness) axis
      // becomes the vertical axis once the slab lies flat, so a recessed tenon here
      // hangs above the bed instead of resting on it — a second, worse floating
      // cantilever, confirmed by slicing with auto-support on before this fix.
      const TW = 58, TD = 10, TH = 6          // tenon width (X) / depth (Y) / height (Z), in the standing frame
      const XY_CLEAR = 0.3, Z_CLEAR = 0.3    // per-side clearance so it's a firm push-fit, not a jam
      const tenon = Manifold.cube([TW, TD, TH], true).translate(0, 0, 8 - TH / 2)
      const socketH = TH + Z_CLEAR
      const socket = Manifold.cube([TW + 2 * XY_CLEAR, TD + 2 * XY_CLEAR, socketH], true).translate(0, 0, 8 - socketH / 2)

      // Rotate the whole standing slab+tenon down onto its back so the front
      // face (and the tenon, now a coplanar tab off one edge) lie flat and
      // print-ready — verified clean by slicing the real exported STL.
      const slab = Manifold.union(slabBody, tenon).rotate(-90, 0, 0).translate(0, 0, 5)
      // The slab now occupies roughly y ∈ [2, 88] lying flat (see above) — moved
      // out of the way in Y so the two don't overlap in the preview/export, the
      // same convention picture-frame's non-touching "stand" part already uses.
      const base = Manifold.extrude(roundedRect(70, 20, 3), 8).subtract(socket).translate(0, -30, 0)
      return { slab, base }
    },
    // Origins follow the same rotate(-90,0,0)+translate(0,0,5) applied to the
    // slab above: (x, y, z)_old -> (x, z, -y + 5). All three zones sat on the
    // old front face (normal [0,-1,0], up [0,0,1]), which becomes normal
    // [0,0,1] (faces up) / up [0,1,0] here; each old z becomes the new y.
    zones: [
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'slab', colour: 1, origin: [0, 75, 10], normal: [0, 0, 1], up: [0, 1, 0],
        width: 14, height: 14, mode: 'engrave', depth: 1, maxLines: 1, default: 'dog' },
      { id: 'name', label: 'Name', part: 'slab', colour: 1, origin: [0, 56, 10], normal: [0, 0, 1], up: [0, 1, 0],
        width: 50, height: 12, mode: 'engrave', depth: 1.2, maxLines: 1, default: 'REX' },
      { id: 'epitaph', label: 'Epitaph', part: 'slab', colour: 1, origin: [0, 32, 10], normal: [0, 0, 1], up: [0, 1, 0],
        width: 50, height: 30, mode: 'engrave', depth: 0.8, maxLines: 4, default: '2011 – 2024\nGood boy' },
    ],
  },
  {
    id: 'keyring-tag',
    name: 'Keyring Tag',
    tags: ['keyring', 'tag'],
    notes: 'Print flat as placed, no supports. The raised text is 1 mm proud; a 0.4 mm nozzle is fine. Fit a split ring through the hole.',
    colours: ['#2980b9', '#f4f4f0'],
    // 50 × 22 × 3 rounded, 4 mm hole at the left end. Text embossed on top.
    build: () => {
      const body = Manifold.extrude(roundedRect(50, 22, 6), 3)
      const hole = Manifold.cylinder(10, 2.2, 2.2, 32).translate(-19, 0, -3)
      return Manifold.difference(body, hole)
    },
    zones: [
      { id: 'text', label: 'Text', colour: 1, origin: [3.5, 0, 3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 36, height: 14, mode: 'emboss', depth: 1, maxLines: 1, default: 'PETER' },
    ],
  },
  {
    id: 'desk-wedge',
    name: 'Desk Name Plate',
    tags: ['name plate', 'desk'],
    notes: 'Print as placed with the flat base down, no supports — the 40° slope is self-supporting. The text sits on the slope, so nothing overhangs.',
    colours: ['#222226', '#d4a017'],
    // Triangular prism 120 long (X), 30 deep (Y), 25 tall: the sloped face
    // leans back at ~40°. Text goes on the slope — a non-axis-aligned zone.
    build: () => {
      const profile = CrossSection.ofPolygons([[[0, 0], [30, 0], [30, 25]]]) // YZ profile
      return Manifold.extrude(profile, 120).rotate(0, 0, 0).rotate(90, 0, 90).translate(-60, -15, 0)
    },
    zones: (() => {
      // Sloped face passes through (y=-15, z=0) and (y=15, z=25) in world.
      const dy = 30, dz = 25, len = Math.hypot(dy, dz)
      const normal: Vec3 = [0, -dz / len, dy / len]
      const up: Vec3 = [0, dy / len, dz / len]
      // Two zones stacked on the slope: name (upper ~60%) and a title line.
      // Points along the slope: t=0 at the bottom edge, 1 at the top.
      const at = (t: number): Vec3 => [0, -15 + dy * t, dz * t]
      return [
        { id: 'name', label: 'Name', colour: 1, origin: at(0.62), normal, up,
          width: 104, height: 17, mode: 'emboss', depth: 1.5, maxLines: 1, default: 'Peter Jones' },
        { id: 'title', label: 'Title', colour: 1, origin: at(0.24), normal, up,
          width: 104, height: 7, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'Executive VP of Printing' },
      ] as Zone[]
    })(),
  },
  {
    id: 'statue-trump',
    name: 'Trump Statue',
    tags: ['statue', 'novelty', 'plinth'],
    notes: 'Print the figure upright as placed with tree supports on: the forward arm, thumb, chin and the hair sweep all overhang. The plinth base is a hollow shell, open front and top — print it upright, then print the top cap and the front nameplate separately (the nameplate flat, face up, for the cleanest engraving). Neither is glued: the nameplate slides down into a slot behind the base\'s open front, and the cap sits on a friction-fit locating spigot — so the name can be swapped later by lifting the (unglued) cap off. Load the 3MF so the colour parts stay registered; with one colour, print the merged STLs. 0.12 mm layers flatter the face.',
    // Stylised caricature (suit, long tie, hair swoop, thumbs-up) standing on
    // a 60 × 50 × 40 plinth. Z up, figure faces -Y. Text on the plinth front.
    // Plinth is 3 parts, none glued (issue #23): a hollow base shell
    // (open front/top) with a T-slot behind the front opening, a top cap
    // that friction-fits a locating spigot, and a front nameplate shaped to
    // slide down into the base's slot and lift out again to swap the text.
    parts: [
      { id: 'plinth-base', label: 'Plinth Base', colour: 0 },
      { id: 'plinth-top', label: 'Plinth Top', colour: 0 },
      { id: 'plinth-front', label: 'Plinth Front', colour: 0 },
      { id: 'shoes', label: 'Shoes', colour: 0 },
      { id: 'suit', label: 'Suit', colour: 5 },
      { id: 'shirt', label: 'Shirt', colour: 4 },
      { id: 'tie', label: 'Tie', colour: 3 },
      { id: 'skin', label: 'Skin', colour: 1 },
      { id: 'hair', label: 'Hair', colour: 2 },
    ],
    // issue #22: black plinth + shoes, blue suit, white shirt, red tie,
    // orange skin, yellow hair/text.
    colours: ['#222226', '#e67e22', '#f1c40f', '#c0392b', '#f4f4f0', '#2c3e50'],
    build: () => {
      const P = 40 // plinth height
      const SEG = 40
      // Ellipsoid and capsule helpers: everything organic is hulls of these.
      const ell = (rx: number, ry: number, rz: number, x: number, y: number, z: number) =>
        Manifold.sphere(1, SEG).scale([rx, ry, rz]).translate(x, y, z)
      const sph = (r: number, x: number, y: number, z: number) => ell(r, r, r, x, y, z)
      const capsule = (a: Vec3, b: Vec3, ra: number, rb = ra) => Manifold.hull([sph(ra, ...a), sph(rb, ...b)])

      // Plinth base: foot slab + a hollow shell (left, right, back walls
      // only) standing on it — open front and open top, so it prints upright
      // as a light shell instead of a solid block.
      const wallT = 3
      const boxH = P - 8 // 32
      const voidBackY = 25 - wallT   // inset from the back wall
      const voidFrontY = -25 - 5     // overshoot past the (open) front
      const boxVoid = Manifold.extrude(roundedRect(60 - 2 * wallT, voidBackY - voidFrontY, 1.5), boxH + 2)
        .translate(0, (voidBackY + voidFrontY) / 2, -1)
      // T-slot behind the open front (issue #23): a pair of full-height rails
      // just inside the void's front-left/front-right edges narrow the
      // opening for a thin strip at the very front. The nameplate's matching
      // wide "body" sits just behind that strip — too wide to pull forward
      // past the rails, but free to slide up/down since the rails only
      // occupy that one thin front slice, not the void's full depth.
      const slotClear = 0.3, slotInset = 2, slotDepth = 1.5
      const voidHalfW = (60 - 2 * wallT) / 2 // 27
      const railY0 = -25
      const rail = (side: 1 | -1) => Manifold.cube([slotInset, slotDepth, boxH], true)
        .translate(side * (voidHalfW - slotInset / 2), railY0 + slotDepth / 2, 4 + boxH / 2)
      const plinthBase = Manifold.union([
        Manifold.extrude(roundedRect(66, 56, 3), 4),
        Manifold.extrude(roundedRect(60, 50, 2), boxH).subtract(boxVoid).translate(0, 0, 4),
        rail(1), rail(-1),
      ])
      // Top cap, printed separately, no glue — a locating spigot on its
      // underside drops into the base's open top (clear of the back and
      // side walls, and short of the open front) with just enough clearance
      // to friction-fit rather than rattle, so the cap can be lifted off
      // again later instead of being a one-way glue joint.
      // Rounded-rect (not a plain cube) matching the void's own corner
      // radius: a sharp-cornered spigot at this clearance clipped past the
      // void's rounded back corners and overlapped the base there (caught by
      // npm run stl-check's overlap check).
      const spigotClear = 0.25
      const spigotFrontY = -20
      const spigotBackY = voidBackY - spigotClear
      const spigot = Manifold.extrude(roundedRect(60 - 2 * wallT - 2 * spigotClear, spigotBackY - spigotFrontY, 1.5), 6)
        .translate(0, (spigotBackY + spigotFrontY) / 2, 30)
      const plinthTop = Manifold.union([Manifold.extrude(roundedRect(64, 54, 3), 4).translate(0, 0, P - 4), spigot])
      // Front nameplate: a two-step "T" cross-section (thin front lip, wider
      // body behind) that engages the base's rails above — carries the
      // name/caption text, and prints flat, face up, for crisp engraving.
      const bodyW = 60 - 2 * wallT - 2 * slotClear // 53.4: the void's width, minus a slide clearance
      const lipW = bodyW - 2 * slotInset           // 49.4: narrow enough to pass between the rails
      const lip = Manifold.cube([lipW, slotDepth, boxH], true)
        .translate(0, railY0 + slotDepth / 2, 4 + boxH / 2)
      const body = Manifold.cube([bodyW, wallT - slotDepth, boxH], true)
        .translate(0, railY0 + slotDepth + (wallT - slotDepth) / 2, 4 + boxH / 2)
      const plinthFront = Manifold.union([lip, body])

      // Shoes (long, rounded toe): their own part/colour, separate from the
      // suit — the tapered trouser legs' hulls overlap the shoe volume by
      // design (so the two read as continuous), so the legs subtract the
      // shoes to stay disjoint once they're separate solids.
      const shoeHulls: M[] = []
      const legHulls: M[] = []
      for (const x of [-7.5, 7.5]) {
        shoeHulls.push(Manifold.hull([ell(5.5, 4.5, 3, x, 5, P + 3), ell(5.5, 5, 2.5, x, -8, P + 2.5)]))
        legHulls.push(Manifold.hull([ell(5.5, 5.5, 1, x, 0, P + 4), ell(6.5, 6.5, 1, x, 0, P + 38)]))
      }
      const shoesM = Manifold.union(shoeHulls)
      const suit: M[] = [Manifold.union(legHulls).subtract(shoesM)]
      // Jacket: broad shoulders, a bit of belly, tapering to the hips.
      let jacket = Manifold.hull([
        ell(16, 10, 1, 0, 0, P + 35),          // hem
        ell(18, 12.5, 3, 0, -1.5, P + 50),     // belly
        sph(6.5, -17, 0, P + 68), sph(6.5, 17, 0, P + 68), // shoulders
        ell(8, 7, 1, 0, 0, P + 72),            // collar
      ])
      // V opening down the front: recess 1.5 mm so shirt + tie read as a suit.
      const vee = Manifold.extrude(
        CrossSection.ofPolygons([[[-10, P + 74], [0, P + 46], [10, P + 74]]]), 4, // CCW
      ).rotate(90, 0, 0).translate(0, -10.5, 0) // XZ profile, spans y ∈ [-14.5, -10.5]
      jacket = jacket.subtract(vee)
      suit.push(jacket)
      // Shirt behind the opening with collar points; tie knot and long tie past the hem.
      const shirt = Manifold.union([
        Manifold.hull([ell(9, 2, 1, 0, -11.2, P + 72), ell(1.5, 2, 1, 0, -11.2, P + 47)]),
        Manifold.hull([sph(1.2, -1.5, -12.5, P + 72), sph(1.2, -6, -11.5, P + 71), sph(1.2, -1.5, -12, P + 68)]),
        Manifold.hull([sph(1.2, 1.5, -12.5, P + 72), sph(1.2, 6, -11.5, P + 71), sph(1.2, 1.5, -12, P + 68)]),
      ])
      const tie = Manifold.union([
        ell(3.2, 2.2, 2.6, 0, -12.6, P + 69),
        Manifold.hull([ell(2.5, 1.2, 1, 0, -12.6, P + 67), ell(3.5, 1.2, 1, 0, -12.8, P + 34), ell(1.5, 1.2, 1, 0, -12.8, P + 30)]),
      ])
      // Sleeves: left arm hanging, right arm bent forward.
      suit.push(capsule([-18, 0, P + 66], [-20, 1, P + 51], 4.5, 4))
      suit.push(capsule([-20, 1, P + 51], [-20, -4, P + 37], 4, 3.5))
      suit.push(capsule([18, 0, P + 66], [20, -5, P + 52], 4.5, 4))
      suit.push(capsule([20, -5, P + 52], [20, -22, P + 58], 4, 3.5))

      const skin: M[] = []
      // Hands: left relaxed, right fist with thumb up.
      skin.push(Manifold.hull([sph(3.5, -20, -4, P + 36), ell(3, 2.5, 5, -20, -5, P + 31)]))
      skin.push(Manifold.hull([sph(4.5, 20, -25, P + 59), ell(4, 3.5, 3, 20, -27, P + 56)]))
      skin.push(capsule([20, -25, P + 62], [20, -26, P + 69], 2, 1.7))
      // Neck, head (one hull so cheeks, jowls and chin blend), features.
      skin.push(capsule([0, 0, P + 68], [0, 0, P + 78], 5.5))
      const H = P + 90 // head centre
      skin.push(Manifold.hull([
        ell(12.5, 12, 12, 0, 0, H),                   // cranium
        ell(9.5, 9.5, 7, 0, -1, H - 9),               // jaw
        sph(3, -8.5, -8.5, H - 4), sph(3, 8.5, -8.5, H - 4), // cheeks
        sph(3, -7, -7, H - 10), sph(3, 7, -7, H - 10), // jowls
        ell(3.5, 2.5, 2.5, 0, -10, H - 12),           // chin
      ]))
      skin.push(
        ell(11, 4, 2.5, 0, -9.5, H + 2.5),            // brow ridge
        Manifold.hull([sph(2.4, 0, -13.5, H - 4), sph(1.6, 0, -11.5, H + 1)]), // nose
        ell(4.5, 1.6, 1.2, 0, -12.8, H - 7.5),        // pursed lips
        ell(1.8, 3.2, 4.5, -12.5, -0.5, H - 2), ell(1.8, 3.2, 4.5, 12.5, -0.5, H - 2), // ears
      )
      // Squinting eye sockets, cut after union so they read under the brow.
      const eyes = Manifold.union([ell(3, 2.5, 1.3, -4.5, -12.2, H - 0.5), ell(3, 2.5, 1.3, 4.5, -12.2, H - 0.5)])

      // Hair: helmet cap + the diagonal comb-over sweeping left→right, overhanging the brow.
      const hair = Manifold.union([
        Manifold.hull([
          ell(13.5, 13, 6.5, 0, 1, H + 8),
          ell(11, 6, 4, 0, 11, H + 3),                  // back
          sph(4, -13, -2, H + 4), sph(4, 13, -2, H + 4),  // sides over the ears
        ]),
        Manifold.hull([
          sph(6, -8, -6, H + 9), sph(5.5, 4, -11, H + 8),
          sph(4.5, 10, -12, H + 5), sph(4, -2, -16.5, H + 5), // front lip past the brow
        ]),
      ])

      // Make the parts disjoint in priority order so they print as clean
      // separate solids: tie over shirt over suit over skin over hair.
      const shirtM = shirt.subtract(tie)
      const suitM = Manifold.union(suit).subtract(tie).subtract(shirtM)
      const skinM = Manifold.union(skin).subtract(eyes).subtract(suitM).subtract(shirtM)
      const hairM = hair.subtract(skinM).subtract(suitM)
      return {
        'plinth-base': plinthBase, 'plinth-top': plinthTop, 'plinth-front': plinthFront,
        shoes: shoesM, suit: suitM, shirt: shirtM, tie, skin: skinM, hair: hairM,
      }
    },
    zones: [
      // width: the visible face is now the nameplate's narrow front "lip"
      // (issue #23's T-slot, 49.4mm wide) rather than the old 60mm-wide
      // flush panel — inset a few mm each side rather than running edge to edge.
      { id: 'name', label: 'Name', part: 'plinth-front', colour: 2, origin: [0, -25, 27], normal: [0, -1, 0], up: [0, 0, 1],
        width: 44, height: 10, mode: 'engrave', depth: 1, maxLines: 1, default: 'THE DONALD' },
      { id: 'caption', label: 'Caption', part: 'plinth-front', colour: 2, origin: [0, -25, 14], normal: [0, -1, 0], up: [0, 0, 1],
        width: 44, height: 14, mode: 'engrave', depth: 0.8, maxLines: 2, default: 'Nobody builds plinths\nlike I build plinths' },
    ],
  },
  {
    id: 'coffin',
    name: 'Coffin',
    tags: ['memorial', 'novelty', 'halloween'],
    notes: 'Print the body as placed, open side up — it\'s a hollow shell now, no supports needed. The lid drops on by its own locating spigot, no glue: lift it off to reach the (empty) inside. The handles hang mid-air off the sides: printed together (3MF) they need supports; otherwise print the handles STL on its own — the six pieces lie flat — and glue them on.',
    // Classic six-sided toe-pincher, lying flat, head at -X. 90 long, 40 at
    // the shoulders, 22 tall: a hollow shell with an open top, and a
    // separate bevelled lid that registers on a locating spigot (issue #26,
    // same mechanism as statue-trump's plinth-top/plinth-base) rather than
    // the two being fused into one solid piece.
    parts: [
      { id: 'body', label: 'Coffin', colour: 0 },
      { id: 'lid', label: 'Lid', colour: 0 },
      { id: 'handles', label: 'Handles', colour: 1 },
    ],
    colours: ['#7b4a2d', '#d4a017'],
    build: () => {
      const pts: [number, number][] = [[-45, -13], [-15, -20], [45, -10], [45, 10], [-15, 20], [-45, 13]]
      const profile = CrossSection.ofPolygons([pts])
      const bodyH = 14 // unchanged from the old solid box height
      const wallT = 2.5, floorT = 2
      // Hollow shell: the wall's inner face is the outer profile inset by
      // wallT: offsetting a polygon (rather than a sharp inset shape) keeps
      // the wall thickness uniform all the way round the irregular hexagon,
      // corners included.
      const innerProfile = profile.offset(-wallT, 'Round', 2, 32)
      const cavity = Manifold.extrude(innerProfile, bodyH - floorT + 2).translate(0, 0, floorT)
      const bodyShell = Manifold.extrude(profile, bodyH).subtract(cavity)

      // Lid: same tapered cap shape as before, now its own part. A spigot —
      // the cavity's own profile, inset a little further for a friction-fit
      // clearance — drops from its underside into the open shell so it
      // can't slide, the same "no glue" mechanism issue #23 built for the
      // Trump statue's plinth (rounded to match the shell's own corners
      // there too, for the same reason: a sharp-cornered spigot clipped a
      // rounded corner and overlapped the base — not a risk here since
      // this spigot's shape *is* the cavity's shape, just inset).
      const spigotClear = 0.25
      const spigotH = 4
      const spigotProfile = innerProfile.offset(-spigotClear, 'Round', 2, 32)
      const spigot = Manifold.extrude(spigotProfile, spigotH).translate(0, 0, bodyH - spigotH)
      const lidCap = Manifold.extrude(profile, 8, 1, 0, [0.9, 0.85]).translate(0, 0, bodyH)
      const lid = Manifold.union([lidCap, spigot])

      // Handles: a bar on two posts, standing 3 mm off each side edge at
      // mid-height — two on each long shoulder→foot edge, one on each
      // head→shoulder edge. Posts sink 0.5 mm into the body; the part is
      // then trimmed so it only touches. Mounted against the shell's outer
      // surface, same as when the body was solid — hollowing only removed
      // material on the inside, past the 0.5 mm the posts sink.
      const handles: M[] = []
      const along = (a: [number, number], b: [number, number], ts: number[]) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI
        const nx = dy / len, ny = -dx / len // outward for edges traversed clockwise-from-inside
        for (const t of ts) {
          const ex = a[0] + dx * t, ey = a[1] + dy * t
          const h = Manifold.union([
            Manifold.cube([14, 2.5, 2.5], true).translate(0, -3.5, 0),
            Manifold.cube([2.5, 4.5, 2.5], true).translate(-4.5, -1.5, 0),
            Manifold.cube([2.5, 4.5, 2.5], true).translate(4.5, -1.5, 0),
          ]).rotate(0, 0, ang).translate(ex, ey, 7)
          // rotate(ang) maps local -Y to the outward normal for these edges
          void nx; void ny
          handles.push(h)
        }
      }
      along(pts[1], pts[2], [0.3, 0.7])   // right/lower long edge (y<0)
      along(pts[0], pts[1], [0.5])
      along(pts[4], pts[5], [0.5])        // upper edges traversed foot→head so -Y local = outward
      along(pts[3], pts[4], [0.3, 0.7])
      return { body: bodyShell, lid, handles: Manifold.union(handles).subtract(bodyShell) }
    },
    zones: [
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'lid', colour: 1, origin: [-28, 0, 22], normal: [0, 0, 1], up: [0, 1, 0],
        width: 11, height: 11, mode: 'engrave', depth: 1, maxLines: 1, default: 'cross' },
      { id: 'name', label: 'Name', part: 'lid', colour: 1, origin: [5, 4, 22], normal: [0, 0, 1], up: [0, 1, 0],
        width: 52, height: 9, mode: 'engrave', depth: 1, maxLines: 1, default: 'R.I.P.' },
      { id: 'dates', label: 'Dates / line', part: 'lid', colour: 1, origin: [5, -6, 22], normal: [0, 0, 1], up: [0, 1, 0],
        width: 52, height: 7, mode: 'engrave', depth: 0.8, maxLines: 1, default: '1958 – 2058' },
    ],
  },
  {
    id: 'phone-stand',
    name: 'Phone Stand',
    tags: ['desk', 'phone', 'gift'],
    notes: 'Print as placed, base on the bed, no supports: the backrest leans 25° and the cable slot under the lip bridges. The raised adornments on the lip face are 1 mm proud and print fine on the vertical face.',
    colours: ['#2c3e50', '#f4f4f0', '#c0392b'],
    // Desk stand: 70 wide base with a front lip (cable slot underneath) and a
    // backrest leaning 25° back. Phone sits on the base against the backrest.
    // Front is -Y. Text on the base strip in front of the lip; adornments on
    // the lip face either side of the slot.
    build: () => {
      const base = Manifold.extrude(roundedRect(70, 92, 8), 4).translate(0, -6, 0)
      const lip = Manifold.extrude(roundedRect(70, 8, 3), 18).translate(0, -36, 0)
      const slot = Manifold.cube([14, 12, 16]).translate(-7, -42, -4)
      // Upright: rounded top corners, square bottom (it sinks into the base),
      // stood up (XY → XZ) and leaned back 25°.
      const uprightProfile = CrossSection.union(
        roundedRect(70, 62, 8).translate(0, 31),
        CrossSection.square([70, 20], true).translate(0, 10),
      )
      const back = Manifold.extrude(uprightProfile, 6).rotate(90, 0, 0).translate(0, 6, 0)
        .rotate(-25, 0, 0).translate(0, 24, 2.6)
      return Manifold.union([base, lip, back]).subtract(slot)
    },
    zones: (() => {
      // Upright rear face: local +Y after the 25° lean; text-up is the slab's up.
      const c = Math.cos(Math.PI * 25 / 180), s = Math.sin(Math.PI * 25 / 180)
      const normal: Vec3 = [0, c, -s]
      const up: Vec3 = [0, s, c]
      // Rear-face centre: local (0, 6, 34) through the same transform as the slab.
      const origin: Vec3 = [0, 6 * c + 34 * s + 24, -6 * s + 34 * c + 2.6]
      return [
      { id: 'name', label: 'Name', colour: 1, origin: [0, -46, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 60, height: 9, mode: 'engrave', depth: 1, maxLines: 1, default: 'Peter' },
      { id: 'front', label: 'Front of upright', colour: 1, origin: [0, 34 * s + 24, 34 * c + 2.6], normal: [0, -c, s], up,
        width: 58, height: 40, mode: 'engrave', depth: 1, maxLines: 3, default: "I'm out" },
      { id: 'back', label: 'Back of upright', colour: 1, origin, normal, up,
        width: 58, height: 40, mode: 'engrave', depth: 1, maxLines: 3, default: 'Do not\ndisturb' },
      { id: 'left', label: 'Left adornment', kind: 'symbol', colour: 2, origin: [-21, -40, 11], normal: [0, -1, 0], up: [0, 0, 1],
        width: 13, height: 13, mode: 'emboss', depth: 1, maxLines: 1, default: 'heart' },
      { id: 'right', label: 'Right adornment', kind: 'symbol', colour: 2, origin: [21, -40, 11], normal: [0, -1, 0], up: [0, 0, 1],
        width: 13, height: 13, mode: 'emboss', depth: 1, maxLines: 1, default: 'heart' },
      ] as Zone[]
    })(),
  },
  {
    id: 'fish-plaque',
    name: 'Fishing Trophy Plaque',
    tags: ['plaque', 'fishing', 'trophy'],
    notes: 'Print flat as placed, face up, no supports. The fish stands 3.5 mm proud and the engraved lines below it are flush inlays in their own colours, so load the 3MF for an AMS/MMU; the merged STL prints fine in one colour.',
    colours: ['#7b4a2d', '#d4a017', '#222226'],
    // Oval 120 × 80 × 5 with a raised rim; a big fish across the top half,
    // title and caption below. The fish is a symbol zone, so it can be
    // swapped for anything in the library.
    build: () => {
      const ellipse = (rx: number, ry: number) => CrossSection.circle(1, 96).scale([rx, ry])
      const plate = Manifold.extrude(ellipse(60, 40), 5)
      const rim = Manifold.extrude(ellipse(60, 40).subtract(ellipse(56, 36)), 2).translate(0, 0, 5)
      return Manifold.union(plate, rim)
    },
    zones: [
      { id: 'fish', label: 'Fish', kind: 'symbol', colour: 1, origin: [0, 6, 5], normal: [0, 0, 1], up: [0, 1, 0],
        width: 78, height: 39, mode: 'emboss', depth: 3.5, maxLines: 1, default: 'trout' },
      { id: 'title', label: 'Title', colour: 2, origin: [0, -21, 5], normal: [0, 0, 1], up: [0, 1, 0],
        width: 76, height: 8.5, mode: 'engrave', depth: 1, maxLines: 1, default: 'BIGGEST CATCH' },
      { id: 'caption', label: 'Caption', colour: 2, origin: [0, -30.5, 5], normal: [0, 0, 1], up: [0, 1, 0],
        width: 44, height: 5, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'Lake Taupō · 2026' },
    ],
  },
  {
    id: 'casino-chip',
    name: 'Casino Chip',
    tags: ['chip', 'novelty', 'game'],
    notes: 'Print flat as placed, no supports. Three colours: load the 3MF and assign a filament to body, edge spots and inlay — all three are flush, so a single-colour print of the merged STL works too. The curved text is only 0.5 mm deep; 0.12 mm layers keep it crisp.',
    // 40 mm poker chip, 3.3 thick, three colours like the real thing: the
    // body, eight full-height edge spots set into the rim, and a flush
    // centre inlay. Curved text around the face on the body, in the r
    // 12.5–17 annulus between inlay and spot roots, denomination on the
    // inlay. Bold font: at this size thin serifs come out under a nozzle
    // width.
    parts: [
      { id: 'body', label: 'Chip', colour: 0 },
      { id: 'spots', label: 'Edge spots', colour: 1 },
      { id: 'inlay', label: 'Inlay', colour: 2 },
    ],
    colours: ['#c0392b', '#f4f4f0', '#e6d9bd'],
    build: () => {
      const disc = Manifold.cylinder(3.3, 20, 20, 128)
      const inlay = Manifold.cylinder(0.6, 12.5, 12.5, 96).translate(0, 0, 3.3 - 0.6)
      const spotCuts: M[] = []
      for (let i = 0; i < 8; i++)
        spotCuts.push(Manifold.cube([7, 6, 10], true).translate(0, 20, 1.65).rotate(0, 0, i * 45))
      const spots = Manifold.union(spotCuts).intersect(disc).subtract(inlay)
      const body = disc.subtract(inlay).subtract(spots)
      return { body, spots, inlay }
    },
    zones: [
      { id: 'top', label: 'Top arc', colour: 1, origin: [0, 0, 3.3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 0, height: 4, mode: 'engrave', depth: 0.5, maxLines: 1, default: 'MEM3D CASINO', font: 'Anton',
        arc: { radius: 12.9, sweep: 170, side: 'top' } },
      { id: 'bottom', label: 'Bottom arc', colour: 1, origin: [0, 0, 3.3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 0, height: 4, mode: 'engrave', depth: 0.5, maxLines: 1, default: 'NO CASH VALUE', font: 'Anton',
        arc: { radius: 12.9, sweep: 170, side: 'bottom' } },
      { id: 'value', label: 'Denomination', part: 'inlay', colour: 0, origin: [0, 0, 3.3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 18, height: 12, mode: 'engrave', depth: 0.4, maxLines: 1, default: '100', font: 'Anton' },
    ],
  },
  {
    id: 'cat-tag',
    name: 'Cat Tag',
    tags: ['pet', 'tag', 'cat'],
    notes: 'Print flat as placed, no supports. The phone number is engraved into the face on the bed, so use a smooth plate for a clean underside. Fit a split ring through the hole between the ears.',
    // Cat-head pet tag: oval face (wider than tall) with two small ears and
    // a hanging hole between them. Name across the face, phone on the back.
    colours: ['#8e44ad', '#f1c40f'],
    build: () => {
      const T = 2.5
      const RX = 16, RY = 13
      // Ears sit on the ellipse; points listed CCW for both sides.
      const ear = (sx: number) => {
        const pts: [number, number][] = [[sx * 8.5, 11], [sx * 13.5, 7], [sx * 12, 16.5]]
        return CrossSection.ofPolygons([sx > 0 ? pts : pts.reverse()])
      }
      const outline = CrossSection.union([
        CrossSection.circle(1, 96).scale([RX, RY]),
        ear(-1), ear(1),
        CrossSection.circle(4.5, 48).translate(0, 11.5), // bridge between the ears for the hole
      ])
      const hole = Manifold.cylinder(T + 4, 2, 2, 32).translate(0, 12.5, -2)
      return Manifold.extrude(outline, T).subtract(hole)
    },
    zones: [
      { id: 'name', label: 'Name', colour: 1, origin: [0, 0, 2.5], normal: [0, 0, 1], up: [0, 1, 0],
        width: 26, height: 8, mode: 'engrave', depth: 0.6, maxLines: 1, default: 'MITTENS' },
      { id: 'phone', label: 'Phone / message', colour: 1, origin: [0, 0, 0], normal: [0, 0, -1], up: [0, 1, 0],
        width: 24, height: 16, mode: 'engrave', depth: 0.6, maxLines: 3, default: '123 456 789\nIf found\nplease call', font: 'OpenSans' },
    ],
  },
  {
    id: 'coaster',
    name: 'Coaster',
    tags: ['coaster', 'kitchen', 'gift'],
    notes: 'Print flat as placed, no supports. The rim is a separate part standing 1.2 mm above the face: print the merged STL in one colour, or pause at 4 mm and swap filament for a two-tone rim without an AMS. The curved text and icon are engraved 0.8 mm.',
    // 90 mm round coaster, 4 thick, with a raised rim in a second colour.
    // Curved text top and bottom, a symbol in the middle.
    parts: [
      { id: 'body', label: 'Coaster', colour: 0 },
      { id: 'rim', label: 'Rim', colour: 1 },
    ],
    colours: ['#2c3e50', '#d4a017'],
    build: () => {
      const body = Manifold.cylinder(4, 45, 45, 160)
      const rim = Manifold.cylinder(1.2, 45, 45, 160).subtract(Manifold.cylinder(2, 42, 42, 160).translate(0, 0, -0.4)).translate(0, 0, 4)
      return { body, rim }
    },
    zones: [
      { id: 'top', label: 'Top arc', colour: 1, origin: [0, 0, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 0, height: 7, mode: 'engrave', depth: 0.8, maxLines: 1, default: "PETER'S COFFEE",
        arc: { radius: 31, sweep: 160, side: 'top' } },
      { id: 'bottom', label: 'Bottom arc', colour: 1, origin: [0, 0, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 0, height: 7, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'EST. 2026',
        arc: { radius: 31, sweep: 160, side: 'bottom' } },
      { id: 'icon', label: 'Adornment', kind: 'symbol', colour: 1, origin: [0, 0, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 36, height: 36, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'mug-hot' },
    ],
  },
  {
    id: 'luggage-tag',
    name: 'Luggage Tag',
    tags: ['tag', 'travel', 'luggage'],
    notes: 'Print flat as placed, no supports. The address is engraved into the bed face, so use a smooth plate for a clean underside. Thread a strap through the slot at the left end.',
    // 80 × 50 × 3 rounded tag with a strap slot at the left end. Name and
    // phone on the front, address on the back, an adornment by the slot.
    colours: ['#e67e22', '#f4f4f0'],
    build: () => {
      const tag = Manifold.extrude(roundedRect(80, 50, 8), 3)
      const slot = Manifold.extrude(roundedRect(4, 22, 2), 10).translate(-33, 0, -3)
      return tag.subtract(slot)
    },
    zones: [
      { id: 'icon', label: 'Adornment', kind: 'symbol', colour: 1, origin: [-21, 0, 3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 14, height: 14, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'bicycle' },
      { id: 'name', label: 'Name', colour: 1, origin: [9, 9, 3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 56, height: 14, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'Peter Jones' },
      { id: 'phone', label: 'Phone', colour: 1, origin: [9, -9, 3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 56, height: 9, mode: 'engrave', depth: 0.8, maxLines: 1, default: '+64 21 123 4567', font: 'OpenSans' },
      { id: 'address', label: 'Address (back)', colour: 1, origin: [4, 0, 0], normal: [0, 0, -1], up: [0, 1, 0],
        width: 64, height: 40, mode: 'engrave', depth: 0.8, maxLines: 4, default: '12 Example Street\nWellington\nNew Zealand', font: 'OpenSans' },
    ],
  },
  {
    id: 'cake-topper',
    name: 'Cake Topper',
    tags: ['cake', 'party', 'celebration'],
    verified: true,
    notes: 'Print flat as placed, no supports, 100 % infill for stiff prongs. The words and strip are one 2 mm piece; wash before use if it touches food, or wrap the prongs in cling film.',
    // Printed flat: a banner strip with two prongs; the words are the model,
    // embossed 2 mm (the strip's own thickness) so they merge into one flat
    // piece. Letters overlap the strip along their bottom edge.
    colours: ['#d4a017'],
    build: () => {
      const strip = Manifold.cube([100, 8, 2]).translate(-50, 0, 0)
      const prong = (x: number) => Manifold.cube([3, 47, 2]).translate(x - 1.5, -45, 0) // overlaps the strip by 2 mm
      return Manifold.union([strip, prong(-30), prong(30)])
    },
    zones: [
      { id: 'text', label: 'Words', origin: [0, 13, 0], normal: [0, 0, 1], up: [0, 1, 0],
        width: 96, height: 22, mode: 'emboss', depth: 2, maxLines: 1, default: 'Happy Birthday', font: 'Pacifico',
        backing: { offset: 1.2, height: 1 } },
    ],
  },
  {
    id: 'valentine-heart',
    name: 'Valentine Heart',
    tags: ['love', 'valentine', 'gift'],
    notes: 'Print flat as placed, no supports. The arrow lies on the bed and runs under the heart’s top skin, so load the 3MF for two colours; a single-colour print of the merged STL works too. The filleted edge is stacked layers, so 0.12 mm layers smooth it.',
    // A 45 mm heart, 6 thick, with rounded (filleted) edges all round, shot
    // through by a flat cupid's arrow that lies on the bed and passes under
    // the heart's top skin. Initials on each lobe, a symbol below.
    parts: [
      { id: 'heart', label: 'Heart', colour: 0 },
      { id: 'arrow', label: 'Arrow', colour: 1 },
    ],
    colours: ['#c0392b', '#d4a017', '#f4f4f0'],
    build: () => {
      const T = 6, R = 2 // thickness, edge fillet radius
      // Heart outline: two lobes each hulled to a rounded tip (keeps the dip
      // between the lobes), then the concave dip rounded by a closing offset.
      const lobe = (sx: number) => CrossSection.hull([CrossSection.circle(12, 96).translate(sx * 10.5, 9), CrossSection.circle(2.5, 32).translate(0, -17)])
      const outline = CrossSection.union(lobe(-1), lobe(1)).offset(2, 'Round', 2, 32).offset(-2, 'Round', 2, 32)
      // Fillet by stacking inset slabs that follow a quarter circle.
      const filleted = (prof: CrossSection, n = 8) => {
        const slabs: M[] = []
        for (let i = 0; i < n; i++) {
          const z0 = (R * i) / n, z1 = (R * (i + 1)) / n
          const inset = R - Math.sqrt(R * R - (R - z0) ** 2)
          const sl = prof.offset(-inset, 'Round', 2, 32)
          slabs.push(Manifold.extrude(sl, z1 - z0 + 0.02).translate(0, 0, z0))
          slabs.push(Manifold.extrude(sl, z1 - z0 + 0.02).translate(0, 0, T - z1 - 0.02))
        }
        slabs.push(Manifold.extrude(prof, T - 2 * R + 0.02).translate(0, 0, R - 0.01))
        return Manifold.union(slabs)
      }
      // Arrow, drawn along +X then rotated 35°: shaft, head, two fletches.
      const arrow2d = CrossSection.union([
        CrossSection.square([66, 3.2], true).translate(-5, 0),
        CrossSection.ofPolygons([[[28, -5.5], [41, 0], [28, 5.5]]]),
        CrossSection.ofPolygons([[[-38, 1.4], [-30, 1.4], [-27, 6.5], [-35, 6.5]]]),
        CrossSection.ofPolygons([[[-38, -1.4], [-35, -6.5], [-27, -6.5], [-30, -1.4]]]),
      ]).offset(-0.7, 'Round', 2, 16).offset(1.4, 'Round', 2, 16).offset(-0.7, 'Round', 2, 16).rotate(35)
      const arrow = Manifold.extrude(arrow2d, 4)
      const heart = filleted(outline).subtract(arrow) // arrow tunnels under the top skin
      return { heart, arrow }
    },
    zones: [
      { id: 'left', label: 'Left initials', colour: 2, origin: [-10.5, 9.5, 6], normal: [0, 0, 1], up: [0, 1, 0],
        width: 13, height: 9, mode: 'engrave', depth: 1, maxLines: 1, default: 'PJ' },
      { id: 'right', label: 'Right initials', colour: 2, origin: [10.5, 9.5, 6], normal: [0, 0, 1], up: [0, 1, 0],
        width: 13, height: 9, mode: 'engrave', depth: 1, maxLines: 1, default: 'MJ' },
      { id: 'icon', label: 'Adornment', kind: 'symbol', colour: 2, origin: [0, -4.5, 6], normal: [0, 0, 1], up: [0, 1, 0],
        width: 9, height: 9, mode: 'engrave', depth: 1, maxLines: 1, default: 'infinity' },
    ],
  },
  {
    id: 'award-statuette',
    name: 'Award Statuette',
    tags: ['award', 'trophy', 'novelty'],
    notes: 'Print upright as placed with tree supports: the crossguard, shoulders, hands and chin overhang, and the blade is thin — 0.12 mm layers and a slow outer wall help. Load the 3MF for the black plinth and gold figure, or print the two STLs separately and glue the reel to the plinth.',
    // Art-deco award figure: a smooth stylised knight with a featureless
    // head, broad shoulders and a narrow waist, both hands on a crusader's
    // sword held point-down between his feet, standing on a five-hole film
    // reel. Gold figure + reel on a two-tier black plinth with a nameplate.
    // ~140 mm tall.
    parts: [
      { id: 'plinth', label: 'Plinth', colour: 0 },
      { id: 'figure', label: 'Figure', colour: 1 },
    ],
    colours: ['#222226', '#d4a017'],
    build: () => {
      const SEG = 48
      const ell = (rx: number, ry: number, rz: number, x: number, y: number, z: number) =>
        Manifold.sphere(1, SEG).scale([rx, ry, rz]).translate(x, y, z)
      const sph = (r: number, x: number, y: number, z: number) => ell(r, r, r, x, y, z)
      const capsule = (a: Vec3, b: Vec3, ra: number, rb = ra) => Manifold.hull([sph(ra, ...a), sph(rb, ...b)])
      const P = 24            // plinth top
      const Z = P + 5         // reel top = the figure's feet

      const plinth = Manifold.union([
        Manifold.cylinder(6, 23, 23, 96),
        Manifold.cylinder(P - 6, 20.5, 20.5, 96).translate(0, 0, 6),
        Manifold.cube([36, 5, 14], true).translate(0, -21.5, 11), // nameplate, face at y = -24
      ])

      const fig: M[] = []
      // Film reel with five holes.
      let reel = Manifold.cylinder(5, 18, 18, 96).translate(0, 0, P)
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i * 2 * Math.PI) / 5
        reel = reel.subtract(Manifold.cylinder(7, 3.2, 3.2, 32).translate(11 * Math.cos(a), 11 * Math.sin(a), P - 1))
      }
      fig.push(reel)
      // Feet (toes forward), legs together, knees, thighs into the pelvis.
      for (const sx of [-1, 1]) {
        fig.push(ell(3.2, 6, 2.6, sx * 3.6, -2, Z + 2.2))
        fig.push(capsule([sx * 3.4, 0, Z + 3], [sx * 3.4, 0, Z + 34], 4.2, 4.6))
        fig.push(capsule([sx * 3.4, 0, Z + 34], [sx * 4.2, 0, Z + 58], 4.6, 5.5))
      }
      fig.push(ell(9, 6, 5, 0, 0, Z + 58))                                             // pelvis
      fig.push(Manifold.hull([ell(7.5, 5.5, 1, 0, 0, Z + 60), ell(8.5, 6, 1, 0, 0, Z + 70)])) // waist
      fig.push(Manifold.hull([ell(8.5, 6, 1, 0, 0, Z + 70), ell(13, 7.5, 1, 0, 0, Z + 84), ell(12.5, 7, 1, 0, 0, Z + 90)])) // chest
      fig.push(ell(6.5, 2.4, 4.5, -5.5, -5, Z + 84), ell(6.5, 2.4, 4.5, 5.5, -5, Z + 84))      // pectorals (flat, blended)
      fig.push(sph(5, -13.5, 0, Z + 90), sph(5, 13.5, 0, Z + 90))                             // shoulders
      fig.push(capsule([0, 0, Z + 90], [0, 0, Z + 97], 3.5))                                  // neck
      fig.push(ell(6, 6.5, 8.5, 0, 0.5, Z + 105))                                             // head
      // Arms down and forward to the hands, which are stacked on the grip.
      for (const sx of [-1, 1]) {
        fig.push(capsule([sx * 13.5, 0, Z + 90], [sx * 11, -6, Z + 72], 4, 3.5))
        fig.push(capsule([sx * 11, -6, Z + 72], [sx * 3, -9.5, Z + 62 + (sx < 0 ? 3 : -3)], 3.5, 3))
      }
      fig.push(sph(3.8, -1, -10, Z + 65), sph(3.8, 1, -10, Z + 59))
      // Sword: grip between the hands, crossguard, tapered blade down into the reel, pommel.
      fig.push(Manifold.cylinder(13, 1.8, 1.8, 24).translate(0, -10, Z + 55.5))
      fig.push(Manifold.cube([11, 2.5, 2.2], true).translate(0, -10, Z + 55))
      fig.push(Manifold.hull([Manifold.cube([3.8, 1.4, 1], true).translate(0, -10, Z + 54), Manifold.cube([2, 1, 1], true).translate(0, -10, Z - 2)]))
      fig.push(sph(2.4, 0, -10, Z + 69))
      const figure = Manifold.union(fig).subtract(plinth)
      return { plinth, figure }
    },
    zones: [
      { id: 'title', label: 'Award', colour: 1, origin: [0, -24, 14.5], normal: [0, -1, 0], up: [0, 0, 1],
        width: 32, height: 5, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'BEST HAM ACTOR' },
      { id: 'name', label: 'Recipient', colour: 1, origin: [0, -24, 7.5], normal: [0, -1, 0], up: [0, 0, 1],
        width: 32, height: 5, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'Peter Jones', font: 'PlayfairDisplay' },
    ],
  },
  {
    id: 'hinged-box',
    name: 'Hinged Box',
    tags: ['box', 'gift', 'storage'],
    printInPlace: true,
    notes: 'Both halves print flat with the hinge already assembled — no pins to fit. Work the hinge gently a few times after printing to free it.',
    // Print-in-place clamshell, after a proven design: two identical 70 × 50
    // × 17 trays with a 2 mm rim rebate (inner lip on the base, outer lip on
    // the lid) so they interlock closed. Hinge axis 2 mm below the rim, 1 mm
    // outside each wall. Two small hinges: base has 3 mm knuckles either
    // side carrying a Ø2 pin, the lid a single 4.6 mm knuckle (r 2, Ø2.8
    // hole) between them — 0.4 mm radial / 0.25 mm axial clearance, and the
    // wall under the other part's knuckle is cut away. Small knuckles and
    // short pins are what make it print reliably. Crosshatch on the base
    // sides, text inside the lid.
    parts: [
      { id: 'base', label: 'Base', colour: 0 },
      { id: 'lid', label: 'Lid', colour: 1 },
    ],
    colours: ['#2c3e50', '#d4a017', '#f4f4f0'],
    build: () => {
      const W = 70, D = 50, R = 6, WALL = 2, FLOOR = 2.5, H = 17
      const LIP = 2, CHAMFER = 1.2
      const AZ = H - LIP                 // hinge axis height
      const AY = D / 2 + 1               // axis 1 mm outside the base's back face
      const LY = D + 2                   // lid centre: walls 2 mm apart, axis midway
      const KR = 2, PIN = 1.0, HOLE = 1.4, GAPX = 0.25
      const HALF = 4.6                   // lid knuckle length
      const KB = 3                       // base knuckle length
      const hinges = [-17.5, 17.5]       // hinge centres along x

      const outline = roundedRect(W, D, R)
      const tray = () => {
        const bottom = Manifold.hull([
          Manifold.extrude(outline.offset(-CHAMFER, 'Round', 2, 24), 0.01),
          Manifold.extrude(outline, 0.01).translate(0, 0, CHAMFER),
        ])
        const body = Manifold.union(bottom, Manifold.extrude(outline, H - CHAMFER).translate(0, 0, CHAMFER))
        return body.subtract(Manifold.extrude(roundedRect(W - 2 * WALL, D - 2 * WALL, R - WALL), H).translate(0, 0, FLOOR))
      }
      const alongX = (r: number, x0: number, len: number, y: number) =>
        Manifold.cylinder(len, r, r, 40).rotate(0, 90, 0).translate(x0, y, AZ)

      // Base: inner lip (remove the outer 1.2 mm of the top 2 mm of wall).
      let base = tray().subtract(
        Manifold.extrude(outline.subtract(outline.offset(-1.2, 'Round', 2, 24)), LIP + 0.01).translate(0, 0, H - LIP))
      // Lid: outer lip (remove the inner 1.2 mm), placed behind the base.
      let lid = tray().subtract(
        Manifold.extrude(outline.offset(-0.8, 'Round', 2, 24).subtract(outline.offset(-2, 'Round', 2, 24)), LIP + 0.01).translate(0, 0, H - LIP))
        .translate(0, LY, 0)

      for (const hx of hinges) {
        const lidX0 = hx - HALF / 2
        // Base: knuckles either side of the lid knuckle, pin through the middle.
        base = base.add(alongX(KR, lidX0 - GAPX - KB, KB, AY)).add(alongX(KR, lidX0 + HALF + GAPX, KB, AY))
        base = base.add(alongX(PIN, lidX0 - GAPX - KB + 0.5, HALF + 2 * GAPX + KB, AY))
        // Cut the base wall away under the lid knuckle (with clearance), keep the pin.
        const slot = Manifold.cube([HALF + 2 * GAPX, 6, 6]).translate(lidX0 - GAPX, AY - 3, AZ - 3)
        base = base.subtract(slot.subtract(alongX(PIN, lidX0 - GAPX - 1, HALF + 2 * GAPX + 2, AY)))
        // Lid: one knuckle with a clearance hole; cut its wall away under the base knuckles.
        lid = lid.add(alongX(KR, lidX0, HALF, AY)).subtract(alongX(HOLE, lidX0 - 1, HALF + 2, AY))
        for (const x0 of [lidX0 - GAPX - KB - GAPX, lidX0 + HALF + GAPX])
          lid = lid.subtract(Manifold.cube([KB + GAPX, 6, 6]).translate(x0, AY - 3, AZ - 3))
      }

      // Crosshatch grooves on the base's front and sides, below the lip.
      const hatch = (len: number, height: number) => {
        const bars: CrossSection[] = []
        for (let d = -len - height; d <= len + height; d += 5) {
          bars.push(CrossSection.square([1, 4 * len], true).rotate(45).translate(d, 0))
          bars.push(CrossSection.square([1, 4 * len], true).rotate(-45).translate(d, 0))
        }
        return Manifold.extrude(CrossSection.union(bars).intersect(roundedRect(len, height, 1)), 0.7)
      }
      const zc = (CHAMFER + AZ) / 2, hh = AZ - CHAMFER - 2
      const front = hatch(56, hh).rotate(90, 0, 0).translate(0, -D / 2 + 0.7, zc)
      const side = (sx: number) => hatch(36, hh).rotate(90, 0, 0).rotate(0, 0, sx * 90).translate(sx * (W / 2 - 0.7), 0, zc)
      base = base.subtract(front).subtract(side(-1)).subtract(side(1))
      return { base, lid }
    },
    zones: [
      { id: 'line1', label: 'Lid line 1', part: 'lid', colour: 2, origin: [-9, 57.5, 2.5], normal: [0, 0, 1], up: [0, 1, 0],
        width: 44, height: 11, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'For Mum' },
      { id: 'line2', label: 'Lid line 2', part: 'lid', colour: 2, origin: [-9, 46.5, 2.5], normal: [0, 0, 1], up: [0, 1, 0],
        width: 44, height: 7, mode: 'engrave', depth: 0.8, maxLines: 2, default: 'with love, 2026' },
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'lid', colour: 2, origin: [23, 52, 2.5], normal: [0, 0, 1], up: [0, 1, 0],
        width: 13, height: 13, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'heart' },
    ],
  },
  {
    id: 'picture-frame',
    name: 'Picture Frame',
    tags: ['frame', 'photo', 'home', 'gift'],
    notes: 'Three parts, shown assembled but printed one at a time — the STL zip has a file per part. Frame and stand print as placed with no supports; flip the back panel so the keyhole recess faces up. A 6 x 4" (152 x 102 mm) photo drops into the rebate, then the panel holds it in; the stand clips onto the bottom rail, or hang it on a screw through the keyhole.',
    // 6 x 4" photo in a 176 x 126 x 10 frame with a 15 mm border: text top
    // and bottom, three adornments repeating around the border. The back
    // panel fills the rebate and carries a keyhole hanger; the desk stand
    // is a tilted channel on a base that grips the frame's bottom rail.
    parts: [
      { id: 'frame', label: 'Frame', colour: 0 },
      { id: 'back', label: 'Back panel', colour: 1 },
      { id: 'stand', label: 'Desk stand', colour: 1 },
    ],
    colours: ['#2c3e50', '#d4a017'],
    build: () => {
      const T = 10, REBATE = 5.5, BORDER = 15
      const PW = 152, PH = 102              // 6 x 4" photo
      const AW = PW - 6, AH = PH - 6        // aperture: a 3 mm lip holds the photo
      const OW = AW + 2 * BORDER, OH = AH + 2 * BORDER
      const frame = Manifold.extrude(roundedRect(OW, OH, 6), T)
        .subtract(Manifold.extrude(roundedRect(PW + 2, PH + 2, 2), REBATE))        // photo rebate, open at the back
        .subtract(Manifold.extrude(roundedRect(AW, AH, 2), T).translate(0, 0, REBATE))

      // Keyhole hanger: the head passes through the round hole, then the
      // frame drops so the shank rides up the slot and the head is trapped
      // in a recess open to the wall side (z = 0).
      const slot = (r: number, from: number, to: number) => CrossSection.union([
        CrossSection.circle(r, 48).translate(0, from),
        CrossSection.square([2 * r, to - from], true).translate(0, (from + to) / 2),
        CrossSection.circle(r, 48).translate(0, to),
      ])
      const PANEL = 5, HEAD = 3.5
      const back = Manifold.extrude(roundedRect(PW + 1.4, PH + 1.4, 2), PANEL)
        .subtract(Manifold.extrude(CrossSection.union(CrossSection.circle(4.6, 48).translate(0, 30), slot(2.6, 30, 42)), PANEL))
        .subtract(Manifold.extrude(slot(5, 30, 42), HEAD))

      // Desk stand: two jaws leaning back on a base plate, gripping the
      // frame's bottom rail. Walls rise from the plate, so it needs no
      // supports as placed.
      const JAW = 3.5, CHANNEL = T + 0.6, TILT = 12, PLATE = 5
      const jaw = (y: number) => Manifold.cube([64, JAW, 56], true).translate(0, y, 14)
      const jaws = Manifold.union([jaw(-(CHANNEL + JAW) / 2), jaw((CHANNEL + JAW) / 2)])
        .rotate(TILT, 0, 0).translate(0, -4, 0)
        .subtract(Manifold.cube([300, 300, 100], true).translate(0, 0, -50)) // trim below the bed
      const stand = Manifold.union(Manifold.extrude(roundedRect(64, 52, 6), PLATE), jaws).translate(0, -100, 0)

      return { frame, back, stand }
    },
    zones: (() => {
      const FRONT = 10, BX = 80.5, BY = 55.5   // front face; centre-lines of the border bands
      const pattern = borderPattern()
      const icon = (id: string, label: string, def: string, at: XY[]): Zone => ({
        id, label, kind: 'symbol', colour: 1,
        origin: [at[0][0], at[0][1], FRONT], normal: [0, 0, 1], up: [0, 1, 0],
        width: 9, height: 9, mode: 'engrave', depth: 1, maxLines: 1, default: def,
        repeat: at.slice(1).map(([x, y]): Vec3 => [x - at[0][0], y - at[0][1], 0]),
      })
      const line = (id: string, label: string, y: number, def: string): Zone => ({
        id, label, colour: 1, origin: [0, y, FRONT], normal: [0, 0, 1], up: [0, 1, 0],
        width: 110, height: 9, mode: 'engrave', depth: 1, maxLines: 1, default: def,
      })
      void BX
      return [
        line('top', 'Top line', BY, 'THE JONES FAMILY'),
        line('bottom', 'Bottom line', -BY, 'Summer 2026'),
        icon('corners', 'Corner adornment', 'star', pattern.corners),
        icon('sides', 'Side adornment', 'heart', pattern.sides),
        icon('edges', 'Edge adornment', 'leaf', pattern.edges),
      ]
    })(),
  },
  {
    id: 'can-mug',
    name: 'Beer Can Mug',
    tags: ['mug', 'beer', 'drink', 'novelty'],
    verified: true,
    notes: 'Prints upright as placed. The body needs no supports, but the handle does — turn on tree supports (from the build plate is enough) or the underside of the handle will droop. A 355 ml can (66 mm) drops into the sleeve with 2 mm clearance all round; most slim bottles (up to ~74 mm) fit too, but a wide stubby will not. Text and adornments are engraved into the outside wall, and they sit in two short bands rather than spread up the whole mug, so a two-colour AMS print only swaps filament across those few layers. To cut the purge waste further: in Orca/Bambu Studio, turn on "Flush into objects\' infill" (Print Settings > Others) so the purged filament goes into the mug\'s own infill instead of a waste tower — or skip the swap altogether and print the merged STL in one colour, which leaves the engraving open with no purge at all.',
    // A sleeve most cans and slim bottles drop into: 82 outside, 74 bore,
    // 115 tall on a 4 mm base (4 mm wall). Text wraps right around the body
    // opposite the handle and an adornment repeats eight times round the
    // foot — both bent onto the cylinder by the zone `wrap`. Both bands sit
    // low and close together in height (roughly z 6-20 and z 55-89) so a
    // two-colour print only needs filament changes across those few
    // layers, not the whole mug — see the colour-change note in `notes`.
    // The handle is a squared C with rounded corners, its edges filleted
    // by stacked inset slabs (as the heart).
    colours: ['#2c3e50', '#d4a017'],
    build: () => {
      const RO = 41, RI = 37, H = 115, BASE = 4
      const cavity = Manifold.cylinder(H, RI, RI, 160).translate(0, 0, BASE)
      const body = Manifold.cylinder(H, RO, RO, 160)

      // Handle drawn in XY (x radial, y up), extruded 14 thick, then stood
      // up into the XZ plane. Concentric rounded rects make the squared C;
      // the left bar is buried in the mug wall so it reads as a C outside.
      const TH = 14, FR = 3
      const outline = roundedRect(52, 72, 16).translate(60, 58)
      const hole = roundedRect(30, 46, 10).translate(60, 58)
      const face = outline.subtract(hole)
      const filleted = (prof: CrossSection, t: number, r: number, n = 6) => {
        const slabs: M[] = []
        for (let i = 0; i < n; i++) {
          const z0 = (r * i) / n, z1 = (r * (i + 1)) / n
          const inset = r - Math.sqrt(r * r - (r - z0) ** 2)
          const sl = prof.offset(-inset, 'Round', 2, 24)
          slabs.push(Manifold.extrude(sl, z1 - z0 + 0.02).translate(0, 0, z0))
          slabs.push(Manifold.extrude(sl, z1 - z0 + 0.02).translate(0, 0, t - z1 - 0.02))
        }
        slabs.push(Manifold.extrude(prof, t - 2 * r + 0.02).translate(0, 0, r - 0.01))
        return Manifold.union(slabs)
      }
      const handle = filleted(face, TH, FR).rotate(90, 0, 0).translate(0, TH / 2, 0)

      return Manifold.union(body, handle).subtract(cavity)
    },
    zones: (() => {
      const RO = 41, C = 2 * Math.PI * RO
      const wrap = { radius: RO }
      const face = { normal: [-1, 0, 0] as Vec3, up: [0, 0, 1] as Vec3 } // opposite the handle
      return [
        { id: 'text', label: 'Wrap-around text', colour: 1, origin: [-RO, 0, 72], ...face,
          width: 170, height: 34, mode: 'engrave', depth: 1, maxLines: 2, default: 'CHEERS', font: 'Anton', wrap },
        { id: 'band', label: 'Adornment (repeats around the foot)', kind: 'symbol', colour: 1, origin: [-RO, 0, 12], ...face,
          width: 14, height: 14, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'star', wrap,
          repeat: [1, 2, 3, 4, 5, 6, 7].map((i): Vec3 => [(i * C) / 8, 0, 0]) },
      ] as Zone[]
    })(),
  },
  {
    id: 'keycap',
    name: 'Keycap',
    tags: ['keyboard', 'keycap', 'desk', 'gadget'],
    verified: true,
    notes: 'Cherry MX fit: a 1u cap, 18 mm at the base and 9 mm tall, with a 4.2 x 1.35 mm cross socket. Print upside down — top face on the plate, skirt and stem upward — so it needs no supports and the legend comes out crisp off a smooth plate. Keep the legend engraved: embossed text would have to print into the bed. 0.12 mm layers; if the switch is tight, file the cross rather than reprinting.',
    // 1u keycap: a tapered hollow shell (18 -> 14 over 9 mm) on a central
    // Cherry cross stem that runs up to the underside of the top so the
    // legend sits on solid material. One legend zone, text or adornment.
    colours: ['#222226', '#f4f4f0'],
    build: () => {
      const OUT = 18, TOP = 14, HT = 9, WALL = 1.4
      // Hull two thin slabs into the tapered shell, then hollow it from below.
      const slab = (w: number, r: number, z: number) => Manifold.extrude(roundedRect(w, w, r), 0.01).translate(0, 0, z)
      const shell = Manifold.hull([slab(OUT, 1.5, 0), slab(TOP, 2.5, HT)])
        .subtract(Manifold.hull([slab(OUT - 2 * WALL, 1, 0), slab(TOP - 2 * WALL, 2, HT - WALL)]))
      // Stem: a post from the open bottom right through to the top face, so
      // it fuses with the skin the legend is cut into rather than merely
      // touching it. The switch's cross is cut into it from below.
      const cross = Manifold.union([
        Manifold.cube([4.2, 1.35, 4.2], true),
        Manifold.cube([1.35, 4.2, 4.2], true),
      ]).translate(0, 0, 2.1)
      const stem = Manifold.cylinder(HT, 2.8, 2.8, 48).subtract(cross)
      return Manifold.union(shell, stem)
    },
    zones: [
      { id: 'legend', label: 'Legend', origin: [0, 0, 9], normal: [0, 0, 1], up: [0, 1, 0],
        width: 10, height: 10, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'A', font: 'Anton', colour: 1 },
      { id: 'icon', label: 'Adornment (instead of the legend)', kind: 'symbol', origin: [0, 0, 9], normal: [0, 0, 1], up: [0, 1, 0],
        width: 10, height: 10, mode: 'engrave', depth: 0.8, maxLines: 1, default: '', colour: 1 },
    ],
  },
  // ---- Fridge magnets: 3 mm plates with Ø6.2 × 2 mm recesses on the back
  // for 6 mm disc magnets (one on small shapes, two on wide ones). Each has
  // two text zones and an adornment. The recesses are blind pockets opening
  // downwards, so printed face-up they are bridged over at 2 mm; supports
  // would fill them, hence the note.
  ...(() => {
    const T = 3
    const zTop = T
    const roundCorners = (c: CrossSection, r: number) => c.offset(-r, 'Round', 2, 24).offset(r, 'Round', 2, 24)
    const softenAll = (c: CrossSection, r: number) => roundCorners(c, r).offset(r, 'Round', 2, 24).offset(-r, 'Round', 2, 24)
    const magnet = (profile: CrossSection, pockets: [number, number][] = [[0, 0]]) =>
      Manifold.extrude(profile, T).subtract(Manifold.union(
        pockets.map(([x, y]) => Manifold.cylinder(2.01, 3.1, 3.1, 48).translate(x, y, -0.01))))
    const tz = (id: string, label: string, x: number, y: number, w: number, h: number, text: string, lines = 1, extra: Partial<Zone> = {}): Zone => ({
      id, label, colour: 1, origin: [x, y, zTop], normal: [0, 0, 1], up: [0, 1, 0],
      width: w, height: h, mode: 'engrave', depth: 0.8, maxLines: lines, default: text, ...extra,
    })
    const icon = (x: number, y: number, size: number, symbol: string, extra: Partial<Zone> = {}): Zone => ({
      id: 'icon', label: 'Adornment', kind: 'symbol', colour: 1, origin: [x, y, zTop], normal: [0, 0, 1], up: [0, 1, 0],
      width: size, height: size, mode: 'engrave', depth: 0.8, maxLines: 1, default: symbol, ...extra,
    })
    const poly = (pts: [number, number][]) => CrossSection.ofPolygons([pts])
    const rect = (w: number, h: number, x = 0, y = 0) => CrossSection.square([w, h], true).translate(x, y)
    const circ = (r: number, x = 0, y = 0) => CrossSection.circle(r, 64).translate(x, y)
    const tags = ['magnet', 'fridge']

    const list: Tpl[] = [
      {
        id: 'magnet-square', name: 'Square Magnet', tags: [...tags, 'shape'], colours: ['#2980b9', '#f4f4f0'],
        build: () => magnet(roundedRect(60, 60, 8), [[-15, 0], [15, 0]]),
        zones: [icon(0, 14, 18, 'sun'), tz('line1', 'Line 1', 0, -4, 50, 12, 'HELLO'), tz('line2', 'Line 2', 0, -17, 50, 8, 'from the fridge')],
      },
      {
        id: 'magnet-round', name: 'Round Magnet', tags: [...tags, 'shape'], colours: ['#c0392b', '#f4f4f0'],
        build: () => magnet(circ(31)),
        zones: [icon(0, 13, 16, 'heart'), tz('line1', 'Line 1', 0, -2, 46, 12, 'MUM'), tz('line2', 'Line 2', 0, -15, 40, 7, 'best in the world')],
      },
      {
        id: 'magnet-oval', name: 'Oval Magnet', tags: [...tags, 'shape'], colours: ['#27ae60', '#f4f4f0'],
        build: () => magnet(CrossSection.circle(1, 96).scale([37, 26]), [[-16, 0], [16, 0]]),
        zones: [icon(-22, 0, 14, 'leaf'), tz('line1', 'Line 1', 8, 5, 42, 12, 'GARDEN'), tz('line2', 'Line 2', 8, -7, 42, 7, 'water the tomatoes')],
      },
      {
        id: 'magnet-triangle', name: 'Triangle Magnet', tags: [...tags, 'shape'], colours: ['#f1c40f', '#222226'],
        build: () => magnet(roundCorners(poly([[-36, -20], [36, -20], [0, 42]]), 6), [[0, 2]]),
        zones: [icon(0, 18, 12, 'star'), tz('line1', 'Line 1', 0, 0, 40, 11, 'WOW'), tz('line2', 'Line 2', 0, -12, 54, 7, 'you did it')],
      },
      {
        id: 'magnet-car', name: 'Car Magnet', tags: [...tags, 'vehicle', 'car'], colours: ['#c0392b', '#f4f4f0'],
        // Side view facing right: body, cabin, wheels; the two windows are cut through.
        build: () => {
          const body = roundCorners(poly([[-40, 6], [40, 6], [40, 20], [20, 20], [12, 34], [-16, 34], [-26, 20], [-40, 20]]), 3)
          const windows = CrossSection.union(
            roundCorners(poly([[-14, 21], [-2, 21], [-2, 31], [-16, 31]]), 1.5),
            roundCorners(poly([[2, 21], [17, 21], [10, 31], [2, 31]]), 1.5),
          )
          const wheels = CrossSection.union(circ(7.5, -24, 7), circ(7.5, 24, 7))
          // Magnet pockets sit in the wheel hubs, clear of both text lines.
          return magnet(body.subtract(windows).add(wheels), [[-24, 7], [24, 7]])
        },
        // Business name across the body, phone number below it between the
        // wheels, an adornment on the bonnet.
        zones: [tz('line1', 'Business', 0, 15.5, 40, 7, 'Jims Autos'), tz('line2', 'Phone', 0, 9.5, 32, 5, '987 6543'), icon(32, 13, 9, 'wrench')],
      },
      {
        id: 'magnet-bus', name: 'School Bus Magnet', tags: [...tags, 'vehicle', 'bus'], colours: ['#f1c40f', '#222226'],
        build: () => {
          const body = roundedRect(90, 34, 5).translate(0, 17)
          const windows: CrossSection[] = []
          for (let i = 0; i < 4; i++) windows.push(roundedRect(11, 9, 1.5).translate(-32 + i * 14, 25))
          const front = roundedRect(11, 9, 1.5).translate(38, 25)
          const wheels = CrossSection.union(circ(6.5, -30, 4), circ(6.5, 30, 4))
          return magnet(body.subtract(CrossSection.union([...windows, front])).add(wheels), [[-25, 15], [25, 15]])
        },
        zones: [tz('line1', 'Side', 0, 13, 72, 7, 'SCHOOL BUS'), tz('line2', 'Lower', 0, 6, 40, 4.5, 'route 66'), icon(24, 25, 9, 'sun')],
      },
      {
        id: 'magnet-truck', name: 'Truck Magnet', tags: [...tags, 'vehicle', 'truck'], colours: ['#2c3e50', '#f4f4f0'],
        build: () => {
          const trailer = roundedRect(64, 30, 3).translate(-14, 21)
          const cab = roundCorners(poly([[20, 6], [44, 6], [44, 20], [40, 30], [20, 30]]), 3) // same bottom line as the trailer
          const window = roundCorners(poly([[30, 16], [42, 16], [39.5, 26], [30, 26]]), 1.5)
          const wheels = CrossSection.union([circ(6, -34, 4), circ(6, -18, 4), circ(6, 34, 4)])
          const coupling = rect(10, 8, 19, 10) // bridges the 2 mm gap between trailer and cab
          return magnet(trailer.add(cab.subtract(window)).add(wheels).add(coupling), [[-30, 21], [2, 21], [32, 10]])
        },
        zones: [tz('line1', 'Trailer', -14, 24, 56, 13, 'HAULAGE'), tz('line2', 'Trailer small', -14, 12, 56, 6, 'we deliver'), icon(28, 12, 8, 'anchor')],
      },
      {
        id: 'magnet-house', name: 'House Magnet', tags: [...tags, 'home'], colours: ['#e67e22', '#f4f4f0'],
        build: () => {
          const walls = rect(56, 36, 0, 18)
          const roof = roundCorners(poly([[-34, 34], [34, 34], [0, 60]]), 3)
          const windows = CrossSection.union(roundedRect(11, 10, 1.5).translate(-16, 25), roundedRect(11, 10, 1.5).translate(16, 25))
          return magnet(walls.add(roof).subtract(windows), [[-16, 10], [16, 10]])
        },
        zones: [tz('line1', 'Roof', 0, 42, 30, 8, 'THE JONESES'), tz('line2', 'Wall', 0, 8, 48, 9, 'est. 1999'), icon(0, 25, 9, 'house')],
      },
      {
        id: 'magnet-star', name: 'Star Magnet', tags: [...tags, 'shape'], colours: ['#d4a017', '#222226'],
        build: () => {
          const pts: [number, number][] = []
          for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 15 : 34; pts.push([r * Math.cos(a), r * Math.sin(a)]) }
          return magnet(roundCorners(poly(pts), 3))
        },
        zones: [icon(0, 12, 10, 'crown'), tz('line1', 'Line 1', 0, 0, 26, 9, 'STAR'), tz('line2', 'Line 2', 0, -9, 22, 5, 'of the week')],
      },
      {
        id: 'magnet-cloud', name: 'Cloud Magnet', tags: [...tags, 'shape'], colours: ['#f4f4f0', '#2980b9'],
        build: () => magnet(softenAll(CrossSection.union([circ(14, -20, -2), circ(18, -4, 6), circ(15, 14, 2), circ(12, 22, -6), rect(50, 16, 0, -8)]), 2), [[-16, -4], [14, -4]]),
        zones: [icon(-20, 0, 10, 'moon'), tz('line1', 'Line 1', 6, 3, 36, 10, 'DREAM'), tz('line2', 'Line 2', 4, -7, 40, 6, 'big')],
      },
    ]
    const notes = 'Print face up with supports OFF: the magnet pockets on the back are bridged over, and supports would fill them. Glue a Ø6 × 2 mm disc magnet into each pocket afterwards.'
    return list.map((t) => ({ ...t, notes }))
  })(),
]

const root = './templates'
for (const t of templates) {
  const dir = `${root}/${t.id}`
  mkdirSync(dir, { recursive: true })
  const built = t.build()
  const solids: Record<string, M> = built instanceof Manifold ? { mesh: built } : built
  let tris = 0
  for (const [pid, m] of Object.entries(solids)) {
    if (m.status() !== 'NoError') throw new Error(`${t.id}/${pid}: ${m.status()}`)
    const mesh = m.getMesh()
    const positions = new Float32Array(mesh.numVert * 3)
    for (let i = 0; i < mesh.numVert; i++)
      for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertProperties[i * mesh.numProp + k]
    writeFileSync(`${dir}/${pid}.glb`, writeGlb(positions, new Uint32Array(mesh.triVerts)))
    tris += mesh.numTri
  }
  const json: Record<string, unknown> = { id: t.id, name: t.name, units: 'mm', tags: t.tags }
  if (t.parts) {
    for (const p of t.parts) if (!solids[p.id]) throw new Error(`${t.id}: build() returned no solid for part ${p.id}`)
    json.parts = t.parts.map((p) => ({ ...p, mesh: `${p.id}.glb` }))
  } else {
    json.mesh = 'mesh.glb'
  }
  if (t.colours) json.colours = t.colours
  if (t.verified) json.verified = true
  if (t.notes) json.notes = t.notes
  if (t.printInPlace) json.printInPlace = true
  json.zones = t.zones
  writeFileSync(`${dir}/template.json`, JSON.stringify(json, null, 2) + '\n')
  console.log(t.id.padEnd(18), String(tris).padStart(6), 'tris', Object.keys(solids).join(','))
}
