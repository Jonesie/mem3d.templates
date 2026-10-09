/**
 * Generates the starter templates procedurally with Manifold and writes
 * templates/<id>/{template.json,mesh.glb} (this repo's own copy — the
 * source of truth; the threedeeforge site never sees it directly, see README).
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
  id: string; label: string; kind?: 'text' | 'richtext' | 'symbol'; align?: 'left' | 'center' | 'right'; origin: Vec3; normal: Vec3; up: Vec3
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
  /** GitHub username of the author; threedeeforge links to it. Defaults to DEFAULT_AUTHOR below. */
  author?: string
  /** Shown in the editor: a short description of the model. */
  notes?: string
  /** Markdown print / assembly instructions: the editor's Print instructions dialog and the zip README. */
  printInstructions?: string
  /** Parts must be printed together as placed; STL export is one merged file. */
  printInPlace?: boolean
  /** Set false to keep the template a draft (not mirrored to the live site). */
  published?: false
}

/** GitHub username used for templates with no explicit `author`. */
const DEFAULT_AUTHOR = 'Jonesie'
const AUTHOR_FULL = 'Peter Jones (Jonesie)'
const LICENSE_ID = 'CC-BY-NC-SA-4.0'
const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/'
const REPO_URL = 'https://github.com/Jonesie/threedeeforge.templates'

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
    notes: 'A classic plaque with a title, a few lines of body text and an adornment.',
    printInstructions: 'Print flat as placed, face up, no supports.\n\n**Colours**\n- The text is engraved; in a second colour it exports as a flush inlay.\n- Load the 3MF for an AMS/MMU, or print the merged STL in one colour.',
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
    notes: 'A headstone and base: two parts, printed separately and assembled by hand.',
    printInstructions: '**Printing**\n- The headstone prints lying flat, engraved/embossed face up (no rotation needed, no supports).\n- The base prints separately, as placed, no supports.\n- Printing the headstone flat rather than standing also means a multi-colour (AMS/MMU) print only swaps filament within the top ~1–2 mm of engraving/emboss depth, not across the whole standing height.\n\n**Assembly**\n- Stand the headstone up and push its tenon into the base’s socket, a firm friction fit.\n- Add a dot of glue if you want it permanent.',
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
    notes: 'A keyring tag with a line of raised text and a hole for a split ring.',
    printInstructions: 'Print flat as placed, no supports.\n\n- The raised text is 1 mm proud; a 0.4 mm nozzle is fine.\n- Fit a split ring through the hole.',
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
    notes: 'A desk name wedge in three prints, no glue: a face plate and two triangular ends that lock into one rigid wedge at 40°.',
    printInstructions: '**Printing**\n- Print the face plate flat, text up, no supports. It is the whole reason this is split, so the name and title get a flat, crisp surface.\n- The two triangular ends are laid on their outer faces (slot side up), so the slot is open to the top.\n- The lip over the slot is a 40° overhang, so print with supports there or a slightly slow bridge.\n\n**Assembly**\n- Slide the plate down into the slots from the top edge until it stops on the bottom of the slots. It sits ~1 mm below the ends\' slope, held by a lip over each edge.\n- The two ends and plate lock into one rigid wedge at 40°. It is a snug fit; lift it back out the same way to swap the text.',
    parts: [
      { id: 'ends', label: 'Ends', colour: 0 },
      { id: 'plate', label: 'Face Plate', colour: 1 },
    ],
    colours: ['#222226', '#d4a017'],
    // Assembled it is still a triangular wedge 120 long (X), 30 deep (Y), 25
    // tall, its face leaning back at ~40°, but as two 8 mm triangular ends
    // and a separate plate that slides into a slot in each. Authored in print
    // layout (as headstone-classic is): the plate flat, the ends on their
    // inner faces, so the zones are plain +Z faces on the plate.
    build: () => {
      const dy = 30, dz = 25, len = Math.hypot(dy, dz)
      const END_T = 8, END_X = 52 // ends span |x| in [52, 60]; plate spans between
      const SLOT_D = 2            // how far the plate seats into each end
      const LIP = 1, PLATE_T = 3, CLEAR = 0.3
      const profile = CrossSection.ofPolygons([[[0, 0], [30, 0], [30, 25]]]) // YZ profile
      const end = (x0: number) => Manifold.extrude(profile, END_T).rotate(90, 0, 90).translate(x0, -15, 0)

      // Slope frame: local x = world x, local y runs up the slope, local z
      // is the slope's outward normal, origin at the slope's bottom edge.
      const u: Vec3 = [0, dy / len, dz / len]
      const nrm: Vec3 = [0, -dz / len, dy / len]
      const toWorld = (m: M) => m.transform([1, 0, 0, 0, ...u, 0, ...nrm, 0, 0, -15, 0, 1])
      const box = (x0: number, x1: number, s0: number, s1: number, n0: number, n1: number) =>
        toWorld(Manifold.cube([x1 - x0, s1 - s0, n1 - n0], false).translate(x0, s0, n0))

      // Slot: closed at the bottom, open at the top edge (plate slides down
      // into it), a LIP thick over the plate's edges to hold it in.
      const slotN0 = -(LIP + CLEAR + PLATE_T + CLEAR), slotN1 = -LIP
      const slotL = box(-END_X - SLOT_D, -END_X + 1, 2, len + 5, slotN0, slotN1)
      const slotR = box(END_X - 1, END_X + SLOT_D, 2, len + 5, slotN0, slotN1)
      const endL = end(-END_X - END_T).subtract(slotL)
      const endR = end(END_X).subtract(slotR)

      // Lay each end on its outer face (slot up), side by side behind the plate.
      const lay = (m: M, angle: number, cx: number) => {
        const r = m.rotate(0, angle, 0)
        const bb = r.boundingBox()
        return r.translate(cx - (bb.min[0] + bb.max[0]) / 2, 30, -bb.min[2])
      }
      const ends = Manifold.union(lay(endL, -90, -20), lay(endR, 90, 20))

      // Plate: fits between the ends plus SLOT_D at each side, less clearance.
      const plateW = 2 * (END_X + SLOT_D) - 2 * CLEAR
      const plateL = len - 2 - CLEAR - 3.5
      const plate = Manifold.cube([plateW, plateL, PLATE_T], false).translate(-plateW / 2, -35 - plateL / 2, 0)
      return { ends, plate }
    },
    zones: [
      { id: 'name', label: 'Name', part: 'plate', origin: [0, -30, 3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 100, height: 15, mode: 'emboss', depth: 1.5, maxLines: 1, default: 'Peter Jones' },
      { id: 'title', label: 'Title', part: 'plate', origin: [0, -44.5, 3], normal: [0, 0, 1], up: [0, 1, 0],
        width: 100, height: 7, mode: 'engrave', depth: 0.8, maxLines: 1, default: 'Executive VP of Printing' },
    ],
  },
  {
    id: 'statue-trump',
    name: 'Trump Statue',
    tags: ['statue', 'novelty', 'plinth'],
    notes: 'A figure on a hollow plinth, with a name and a caption on the nameplate.',
    printInstructions: 'A figure on a hollow plinth. Print the figure upright as placed with tree supports; the plinth base, top cap and front nameplate print separately.\n\n**Printing**\n- Print the figure upright as placed with tree supports on: the forward arm, thumb, chin and the hair sweep all overhang.\n- The plinth base is a hollow shell, open front and top. Print it upright.\n- Print the top cap and the front nameplate separately (the nameplate flat, face up, for the cleanest engraving).\n- 0.12 mm layers flatter the face.\n\n**Assembly**\n- Nothing is glued. The nameplate slides down into a slot behind the base\'s open front, and the cap sits on a friction-fit locating spigot, so the name can be swapped later by lifting the (unglued) cap off.\n\n**Colours**\n- Load the 3MF so the colour parts stay registered; with one colour, print the merged STLs.',
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
    notes: 'A hollow coffin with a lift-off lid.',
    printInstructions: '**Printing**\n- Print the body as placed, open side up. It is a hollow shell, so no supports are needed.\n- The handles hang mid-air off the sides: printed together (3MF) they need supports.\n- Otherwise print the handles STL on its own (the six pieces lie flat) and glue them on.\n\n**Lid**\n- The lid drops on by its own locating spigot, no glue. Lift it off to reach the (empty) inside.',
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
    notes: 'A desk stand for a phone, with a name on the base, text on the front and back of the upright and an adornment at each side.',
    printInstructions: 'Print as placed, base on the bed, no supports.\n\n- The backrest leans 25° and the cable slot under the lip bridges.\n- The raised adornments on the lip face are 1 mm proud and print fine on the vertical face.',
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
    notes: 'A fishing trophy plaque: a raised fish with a title and a caption below it.',
    printInstructions: 'Print flat as placed, face up, no supports.\n\n**Colours**\n- The fish stands 3.5 mm proud, and the engraved lines below it are flush inlays in their own colours.\n- Load the 3MF for an AMS/MMU; the merged STL prints fine in one colour.',
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
    notes: 'A casino-style chip with text curved round the top and bottom and a denomination in the middle, with coloured edge spots.',
    printInstructions: 'Print flat as placed, no supports.\n\n**Colours**\n- Three colours: load the 3MF and assign a filament to body, edge spots and inlay.\n- All three are flush, so a single-colour print of the merged STL works too.\n\n**Quality**\n- The curved text is only 0.5 mm deep; 0.12 mm layers keep it crisp.',
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
        width: 0, height: 4, mode: 'engrave', depth: 0.5, maxLines: 1, default: 'FORGE CASINO', font: 'Anton',
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
    notes: 'A cat tag with a name and a phone number or message, and a hole between the ears for a split ring.',
    printInstructions: 'Print flat as placed, no supports.\n\n- The phone number is engraved into the face on the bed, so use a smooth plate for a clean underside.\n- Fit a split ring through the hole between the ears.',
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
    notes: 'A round coaster with text curved round the top and bottom, an adornment in the middle and a raised rim.',
    printInstructions: 'Print flat as placed, no supports.\n\n**Colours**\n- The rim is a separate part standing 1.2 mm above the face.\n- Print the merged STL in one colour, or pause at 4 mm and swap filament for a two-tone rim without an AMS.\n\n**Text**\n- The curved text and icon are engraved 0.8 mm.',
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
    notes: 'A luggage tag with a name, phone number and adornment on the front, an address on the back and a slot for a strap.',
    printInstructions: 'Print flat as placed, no supports.\n\n- The address is engraved into the bed face, so use a smooth plate for a clean underside.\n- Thread a strap through the slot at the left end.',
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
    notes: 'A cake topper: your words on a strip, with prongs that push into the cake.',
    printInstructions: 'Print flat as placed, no supports.\n\n- Use 100 % infill for stiff prongs.\n- The words and strip are one 2 mm piece.\n- Wash before use if it touches food, or wrap the prongs in cling film.',
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
    notes: 'A heart with an arrow through it, initials on each side and an adornment.',
    printInstructions: 'Print flat as placed, no supports.\n\n**Colours**\n- The arrow lies on the bed and runs under the heart’s top skin, so load the 3MF for two colours.\n- A single-colour print of the merged STL works too.\n\n**Quality**\n- The filleted edge is stacked layers, so 0.12 mm layers smooth it.',
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
    notes: 'A two-part statuette: a black plinth and a gold figure, printed upright as placed.',
    printInstructions: '**Printing**\n- Use tree supports: the crossguard, shoulders, hands and chin overhang.\n- The blade is thin, so 0.12 mm layers and a slow outer wall help.\n\n**Colours and assembly**\n- Load the 3MF for the black plinth and gold figure.\n- Or print the two STLs separately and glue the reel to the plinth.',
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
    id: 'magnet-box',
    name: 'Magnetic Box',
    tags: ['box', 'gift', 'storage'],
    notes: 'Two trays that close over each other, held shut by 2.5 mm round magnets in the four corners of each half — no hinge.',
    printInstructions: '**Printing**\n- Print both halves as placed, no supports.\n- The lid text is on the outside of the lid, which prints face down on the bed. The engraving is a recess open to the bed, so nothing needs supporting, and with a second colour it prints as a flush inlay.\n\n**Magnets**\n- Glue a magnet into each corner recess (8 in all), every one the same way round: keep the same face up in every recess.\n- The lid flips over to close, so its magnets then meet the base\'s opposite poles and attract. Check with the lid before the glue sets.\n\n**Closing**\n- Flip the lid over onto the base to close it.',
    // Two identical 70 x 50 x 17 trays with a 2 mm rim rebate (inner lip on
    // the base, outer lip on the lid) so they locate on each other. Each has
    // a half-round corner post up to the rebate step carrying a Ø3.5 magnet
    // recess, opening at the mating face (glued in). Set MAG_SKIN > 0 to
    // leave a thin roof over the magnet instead, for pausing the print to
    // drop the magnets in and printing over them. Crosshatch on all four
    // sides of both halves, text on the outside of the lid.
    parts: [
      { id: 'base', label: 'Base', colour: 0 },
      { id: 'lid', label: 'Lid', colour: 1 },
    ],
    colours: ['#2c3e50', '#d4a017', '#f4f4f0'],
    build: () => {
      const W = 70, D = 50, R = 6, WALL = 2, FLOOR = 2.5, H = 17
      const LIP = 2, CHAMFER = 1.2
      const STEP = H - LIP               // where the two halves meet
      const LY = D + 2                   // lid sits behind the base, clear of it
      const MAG_R = 1.75, MAG_DEPTH = 1.5, MAG_SKIN = 0 // Ø3.5 recess for a Ø2.5 magnet
      const PILLAR_R = 2.8               // half-round post hugging the corner wall
      const MAG_OFF = 3.7                // magnet centre, from the corner arc's centre toward the corner

      const outline = roundedRect(W, D, R)
      const tray = () => {
        const bottom = Manifold.hull([
          Manifold.extrude(outline.offset(-CHAMFER, 'Round', 2, 24), 0.01),
          Manifold.extrude(outline, 0.01).translate(0, 0, CHAMFER),
        ])
        const body = Manifold.union(bottom, Manifold.extrude(outline, H - CHAMFER).translate(0, 0, CHAMFER))
        return body.subtract(Manifold.extrude(roundedRect(W - 2 * WALL, D - 2 * WALL, R - WALL), H).translate(0, 0, FLOOR))
      }
      // A half-round post in each corner, up to the step, with a magnet
      // recess opening at its top. It sits against the corner wall (centre
      // MAG_OFF out from the corner arc's centre along the diagonal) and is
      // clipped to the outline, so it only bulges into the tray, not out.
      const corners: [number, number, number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(
        ([sx, sy]): [number, number, number, number] => [sx * (W / 2 - R), sy * (D / 2 - R), sx, sy])
      const at = ([cx, cy, sx, sy]: [number, number, number, number]): XY => [cx + (sx * MAG_OFF) / Math.SQRT2, cy + (sy * MAG_OFF) / Math.SQRT2]
      const clip = Manifold.extrude(outline, H)
      const withMagnets = (t: M) => {
        let out = t
        for (const c of corners) {
          const [mx, my] = at(c)
          out = out.add(Manifold.cylinder(STEP - FLOOR + 0.01, PILLAR_R, PILLAR_R, 40).translate(mx, my, FLOOR - 0.01).intersect(clip))
        }
        for (const c of corners) {
          const [mx, my] = at(c)
          out = out.subtract(Manifold.cylinder(MAG_DEPTH + 0.01, MAG_R, MAG_R, 32).translate(mx, my, STEP - MAG_SKIN - MAG_DEPTH))
          if (MAG_SKIN === 0) out = out.subtract(Manifold.cylinder(0.02, MAG_R, MAG_R, 32).translate(mx, my, STEP - 0.01))
        }
        return out
      }

      // The rim (lip) stands 2 mm above the step and would cover the recess
      // mouth, so cut it away around each corner recess. On the base the lip
      // is inboard, so cut a generous round. On the lid the lip is the outer
      // skin: cut only the recess's own width so the skin stays whole on the
      // outside (no gap in the rim).
      const clearRim = (m: M, dy: number, r: number) => corners.reduce((out, c) => {
        const [mx, my] = at(c)
        return out.subtract(Manifold.cylinder(LIP + 0.02, r, r, 40).translate(mx, my + dy, STEP))
      }, m)

      // Base: inner lip (remove the outer 1.2 mm of the top 2 mm of wall).
      let base = withMagnets(tray()).subtract(
        Manifold.extrude(outline.offset(1, 'Round', 2, 32).subtract(outline.offset(-1.2, 'Round', 2, 32)), LIP + 0.01).translate(0, 0, H - LIP))
      // Lid: outer lip (remove the inner 1.2 mm), placed behind the base.
      let lid = withMagnets(tray()).subtract(
        Manifold.extrude(outline.offset(-0.8, 'Round', 2, 24).subtract(outline.offset(-2, 'Round', 2, 24)), LIP + 0.01).translate(0, 0, H - LIP))
        .translate(0, LY, 0)

      // Crosshatch grooves on all four sides of both halves, below the lip.
      // Same heights on both: the lid is flipped when closed, so the
      // patterns line up around the box.
      const hatch = (len: number, height: number) => {
        const bars: CrossSection[] = []
        for (let d = -len - height; d <= len + height; d += 5) {
          bars.push(CrossSection.square([1, 4 * len], true).rotate(45).translate(d, 0))
          bars.push(CrossSection.square([1, 4 * len], true).rotate(-45).translate(d, 0))
        }
        return Manifold.extrude(CrossSection.union(bars).intersect(roundedRect(len, height, 1)), 0.7)
      }
      const zc = (CHAMFER + STEP) / 2, hh = STEP - CHAMFER - 2
      const front = hatch(56, hh).rotate(90, 0, 0).translate(0, -D / 2 + 0.7, zc)
      const back = hatch(56, hh).rotate(-90, 0, 0).translate(0, D / 2 - 0.7, zc)
      const side = (sx: number) => hatch(36, hh).rotate(90, 0, 0).rotate(0, 0, sx * 90).translate(sx * (W / 2 - 0.7), 0, zc)
      const cut = (m: M, dy: number) =>
        m.subtract(front.translate(0, dy, 0)).subtract(back.translate(0, dy, 0))
          .subtract(side(-1).translate(0, dy, 0)).subtract(side(1).translate(0, dy, 0))
      base = clearRim(cut(base, 0), 0, MAG_R + 0.6)
      lid = clearRim(cut(lid, LY), LY, MAG_R + 0.05)
      return { base, lid }
    },
    zones: [
      // Outside of the lid = its underside as printed (z = 0, on the bed), so
      // the zones face -Z. "Up" points toward -y so the text reads correctly
      // once the lid is flipped over the x axis and closed.
      // Rounded Fredoka rather than the default Cinzel: Cinzel's hairline
      // serifs are thinner than a nozzle, so on the bed face (first layers,
      // slightly squished) the inlay came out fuzzy. 1 mm deep keeps the inlay
      // a solid 5 layers.
      { id: 'line1', label: 'Lid line 1', part: 'lid', colour: 2, origin: [-8, 46.5, 0], normal: [0, 0, -1], up: [0, -1, 0],
        width: 46, height: 12, mode: 'engrave', depth: 1, maxLines: 1, default: 'For Mum', font: 'Fredoka' },
      { id: 'line2', label: 'Lid line 2', part: 'lid', colour: 2, origin: [-8, 57.5, 0], normal: [0, 0, -1], up: [0, -1, 0],
        width: 46, height: 8, mode: 'engrave', depth: 1, maxLines: 2, default: 'with love, 2026', font: 'Fredoka' },
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'lid', colour: 2, origin: [23, 52, 0], normal: [0, 0, -1], up: [0, -1, 0],
        width: 13, height: 13, mode: 'engrave', depth: 1, maxLines: 1, default: 'heart' },
    ],
  },
  {
    id: 'lunch-box',
    name: 'Lunch Box',
    tags: ['lunch', 'box', 'school', 'storage'],
    notes: 'A 170 x 115 x 50 mm lunch box with a divider wall and a friction-fit lid — no hinge, no hardware.',
    printInstructions: '**Printing**\n- Print both parts as placed, no supports.\n- The lid prints face up: its flat top is the finished face, with the name and adornment embossed 0.8 mm proud of it as part of the same object, so there is nothing to swap or paint.\n- Underneath is a solid plug that drops inside the box walls with 0.25 mm clearance, through a 45-degree chamfer so there is no overhang to support. The chamfer seats on the box rim and centres the lid. If the plug is too tight or too loose, scale the lid by a percent either way.\n\n**Food safety**\n- Best for dry, cold food (sandwiches, fruit, crackers, snacks). It is not watertight, and 3D-printed layer lines can trap moisture and bacteria, so keep wet or hot food out, or put it in a silicone cup.\n- Print in PETG (PLA softens in a hot car or dishwasher). Look for a filament that states it is food-contact safe.\n- Use a stainless-steel nozzle rather than the standard brass one, since brass can contain lead.\n- Hand-wash only, dry thoroughly, and replace the box if the surface becomes scratched or stained. Lining it with baking paper helps keep it clean.',
    // Base: rounded tray with a divider 30 mm left of centre, 5 mm short of
    // the rim so the lid plug clears it. Lid: solid plug, 45 degree chamfer
    // and a thin flange, printed face up, placed behind the base.
    parts: [
      { id: 'base', label: 'Box', colour: 0 },
      { id: 'lid', label: 'Lid', colour: 0 },
    ],
    colours: ['#2980b9', '#f4f4f0'],
    build: () => {
      const W = 170, D = 115, R = 12, WALL = 2.4, FLOOR = 2.4, H = 50
      const PLUG_H = 3.5, CLEAR = 0.25
      const DIV_X = -30, DIV_T = 2
      const LY = D + 10                  // lid sits behind the base, clear of it
      const outline = roundedRect(W, D, R)
      const inner = roundedRect(W - 2 * WALL, D - 2 * WALL, R - WALL)
      const base = Manifold.extrude(outline, H)
        .subtract(Manifold.extrude(inner, H).translate(0, 0, FLOOR))
        .add(Manifold.cube([DIV_T, D - WALL, H - 5], false).translate(DIV_X - DIV_T / 2, -(D - WALL) / 2, 0))
      // Lid, printed face up: a solid plug that drops inside the walls, a 45 deg chamfer
      // out to the box's outline (so the overhang needs no supports and the lid
      // self-centres on the rim), then a thin flange carrying the embossed text.
      const plug = inner.offset(-CLEAR, 'Round', 2, 32)
      const CHAMFER = WALL + CLEAR, FLANGE = 1.5
      const lid = Manifold.union([
        Manifold.extrude(plug, PLUG_H + 0.01),
        Manifold.hull([
          Manifold.extrude(plug, 0.01).translate(0, 0, PLUG_H),
          Manifold.extrude(outline, 0.01).translate(0, 0, PLUG_H + CHAMFER),
        ]),
        Manifold.extrude(outline, FLANGE).translate(0, 0, PLUG_H + CHAMFER),
      ]).translate(0, LY, 0)
      return { base, lid }
    },
    zones: [
      // Lid top face (z = 7.65, face up), centred on y = 125 (D + 10). Embossed 0.8 mm
      // proud and deliberately no `colour`, so the text is part of the lid object.
      // Fredoka rather than the default serif so thin strokes stay printable.
      { id: 'line1', label: 'Name', part: 'lid', origin: [-20, 139, 7.65], normal: [0, 0, 1], up: [0, 1, 0],
        width: 100, height: 30, mode: 'emboss', depth: 0.8, maxLines: 1, default: 'Charlie', font: 'Fredoka' },
      { id: 'line2', label: 'Subtitle', part: 'lid', origin: [-20, 111, 7.65], normal: [0, 0, 1], up: [0, 1, 0],
        width: 100, height: 16, mode: 'emboss', depth: 0.8, maxLines: 2, default: 'lunch time', font: 'Fredoka' },
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'lid', origin: [55, 125, 7.65], normal: [0, 0, 1], up: [0, 1, 0],
        width: 40, height: 40, mode: 'emboss', depth: 0.8, maxLines: 1, default: 'star' },
    ],
  },
  {
    id: 'bento-box',
    name: 'Bento Box',
    tags: ['lunch', 'bento', 'box', 'school', 'storage'],
    notes: 'A 190 x 120 x 40 mm bento box: a black shell and lid with a subtle wave pattern engraved around the outside, and four removable white inserts — one large compartment and three small ones. Friction-fit lid, no hardware.',
    printInstructions: '**Printing**\n- Print the shell and lid in black and the inserts in white. Everything prints as placed, no supports.\n- The inserts are shown seated in the shell; each prints on its own, flat on the bed, and drops in with 0.3 mm clearance. They stand well below the rim so the lid clears them.\n- The lid prints face up: its flat top is the finished face, with the name and adornment embossed 0.8 mm proud of it in white, so print the name and adornment in white (a colour change, or a second object).\n- Underneath is a solid plug that drops inside the shell walls with 0.25 mm clearance, through a 45-degree chamfer so there is no overhang to support. The chamfer seats on the shell rim and centres the lid. If the plug is too tight or too loose, scale the lid by a percent either way.\n\n**Food safety**\n- Best for dry, cold food (sandwiches, fruit, crackers, snacks). It is not watertight, and 3D-printed layer lines can trap moisture and bacteria, so keep wet or hot food out, or put it in a silicone cup.\n- Print in PETG (PLA softens in a hot car or dishwasher). Look for a filament that states it is food-contact safe.\n- Use a stainless-steel nozzle rather than the standard brass one, since brass can contain lead.\n- Hand-wash only, dry thoroughly, and replace the box if the surface becomes scratched or stained. Lining it with baking paper helps keep it clean.',
    // Shell: plain tray. Inserts: thin-walled open boxes that tile the cavity
    // (large on the left, three small in a column on the right), each
    // clipped to the shell's rounded cavity so the corners nest.
    parts: [
      { id: 'shell', label: 'Shell', colour: 0 },
      { id: 'lid', label: 'Lid', colour: 0 },
      { id: 'insert-main', label: 'Main compartment', colour: 1 },
      { id: 'insert-1', label: 'Small compartment 1', colour: 1 },
      { id: 'insert-2', label: 'Small compartment 2', colour: 1 },
      { id: 'insert-3', label: 'Small compartment 3', colour: 1 },
    ],
    colours: ['#1a1a1a', '#f4f4f0'],
    build: () => {
      const W = 190, D = 120, R = 12, WALL = 2.4, FLOOR = 2.4, H = 40
      const PLUG_H = 3.5, CLEAR = 0.25
      const INS_WALL = 1.6, INS_FLOOR = 1.6, INS_H = 30, INS_GAP = 0.3, INS_SEAT = 0.1
      const LY = D + 10
      const outline = roundedRect(W, D, R)
      const inner = roundedRect(W - 2 * WALL, D - 2 * WALL, R - WALL)
      let shell = Manifold.extrude(outline, H).subtract(Manifold.extrude(inner, H).translate(0, 0, FLOOR))

      // Seigaiha (overlapping waves) engraved 0.5 mm into the four outer walls: each
      // wave is three concentric rings, drawn top row first so the rows below cover
      // the ones above, which leaves the classic fan of arches. Rows are R/2 apart,
      // alternate rows shifted by R. Kept inside the straight part of each wall.
      const WAVE_R = 8, RING_W = 0.7, WAVE_DEPTH = 0.5, BAND_Z0 = 4, BAND_Z1 = H - 4
      const seigaiha = (len: number, hh: number) => {
        const centres: XY[] = []
        for (let j = 0, y = hh / 2 + WAVE_R / 2; y > -hh / 2 - WAVE_R; j++, y -= WAVE_R / 2)
          for (let x = -len / 2 - WAVE_R * 2 + (j % 2) * WAVE_R; x < len / 2 + WAVE_R * 2; x += WAVE_R * 2) centres.push([x, y])
        const rings = (r: number) => CrossSection.union([1, 0.72, 0.44].map((k) =>
          CrossSection.circle(WAVE_R * k, 48).subtract(CrossSection.circle(WAVE_R * k - RING_W, 48))))
        const unit = rings(WAVE_R)
        const waves = centres.map(([x, y], i) => {
          const later = centres.slice(i + 1).filter(([qx, qy]) => Math.hypot(qx - x, qy - y) < 2 * WAVE_R)
            .map(([qx, qy]) => CrossSection.circle(WAVE_R, 48).translate(qx - x, qy - y))
          const visible = later.length ? unit.subtract(CrossSection.union(later)) : unit
          return visible.translate(x, y)
        })
        return CrossSection.union(waves).intersect(roundedRect(len, hh, 1))
      }
      const bandH = BAND_Z1 - BAND_Z0
      const onWall = (len: number, rotZ: number, dist: number) =>
        Manifold.extrude(seigaiha(len, bandH), WAVE_DEPTH + 0.01).rotate(90, 0, 0).translate(0, WAVE_DEPTH, (BAND_Z0 + BAND_Z1) / 2)
          .translate(0, -dist - 0.01, 0).rotate(0, 0, rotZ)
      for (const [len, rot, dist] of [[150, 0, D / 2], [150, 180, D / 2], [88, 90, W / 2], [88, -90, W / 2]] as [number, number, number][])
        shell = shell.subtract(onWall(len, rot, dist))
      // Lid, printed face up: a solid plug that drops inside the shell walls, a 45 deg
      // chamfer out to the shell's outline (so the overhang needs no supports and the
      // lid self-centres on the rim), then a thin flange carrying the embossed text.
      const plug = inner.offset(-CLEAR, 'Round', 2, 32)
      const CHAMFER = WALL + CLEAR, FLANGE = 1.5
      const LID_H = PLUG_H + CHAMFER + FLANGE
      const lid = Manifold.union([
        Manifold.extrude(plug, PLUG_H + 0.01),
        Manifold.hull([
          Manifold.extrude(plug, 0.01).translate(0, 0, PLUG_H),
          Manifold.extrude(outline, 0.01).translate(0, 0, PLUG_H + CHAMFER),
        ]),
        Manifold.extrude(outline, FLANGE).translate(0, 0, PLUG_H + CHAMFER),
      ]).translate(0, LY, 0)

      // Insert footprints: cavity shrunk by INS_GAP, cut into a left block and
      // a right column of three, with INS_GAP * 1.3 between neighbours.
      const cav = inner.offset(-INS_GAP, 'Round', 2, 32)
      const cx0 = -(W / 2 - WALL) + INS_GAP, cx1 = -cx0
      const cy0 = -(D / 2 - WALL) + INS_GAP, cy1 = -cy0
      const SEP = INS_GAP * 1.3, SPLIT = 18                      // large block ends at x = SPLIT
      const cell = (x0: number, x1: number, y0: number, y1: number) =>
        roundedRect(x1 - x0, y1 - y0, 2).translate((x0 + x1) / 2, (y0 + y1) / 2).intersect(cav)
      const smallH = (cy1 - cy0 - 2 * SEP) / 3
      const cells = [
        cell(cx0, SPLIT - SEP / 2, cy0, cy1),
        ...[0, 1, 2].map((i) => cell(SPLIT + SEP / 2, cx1, cy0 + i * (smallH + SEP), cy0 + i * (smallH + SEP) + smallH)),
      ]
      const box = (c: CrossSection) =>
        Manifold.extrude(c, INS_H).subtract(Manifold.extrude(c.offset(-INS_WALL, 'Round', 2, 24), INS_H).translate(0, 0, INS_FLOOR))
          .translate(0, 0, FLOOR + INS_SEAT)
      return {
        shell, lid,
        'insert-main': box(cells[0]), 'insert-1': box(cells[1]), 'insert-2': box(cells[2]), 'insert-3': box(cells[3]),
      }
    },
    zones: [
      // Lid top face (z = 7.65, face up), centred on y = 130 (D + 10). Embossed: it
      // stands 0.8 mm proud of the flange, in colour 1 (white), so it prints as a separate
      // white object on the black lid. Fredoka rather than the default
      // serif so thin strokes stay printable.
      { id: 'line1', label: 'Name', part: 'lid', origin: [-25, 144, 7.65], normal: [0, 0, 1], up: [0, 1, 0],
        width: 105, height: 30, colour: 1, mode: 'emboss', depth: 0.8, maxLines: 1, default: 'Charlie', font: 'Fredoka' },
      { id: 'line2', label: 'Subtitle', part: 'lid', origin: [-25, 116, 7.65], normal: [0, 0, 1], up: [0, 1, 0],
        width: 105, height: 16, colour: 1, mode: 'emboss', depth: 0.8, maxLines: 2, default: 'bento time', font: 'Fredoka' },
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'lid', origin: [60, 130, 7.65], normal: [0, 0, 1], up: [0, 1, 0],
        width: 40, height: 40, colour: 1, mode: 'emboss', depth: 0.8, maxLines: 1, default: 'trout' },
    ],
  },
  {
    id: 'toolbox',
    name: 'Toolbox',
    tags: ['toolbox', 'tools', 'storage', 'workshop'],
    notes: 'An open carry-all tray with a tall tent-shaped plate at each end, a long front compartment and three small ones behind it. The handle snaps into the end plates — no nuts, glue or hardware — and swings freely, so the box hangs level.',
    printInstructions: '**Printing**\n- Print the box as placed, no supports.\n- Print the handle as placed too, lying on its side: the flat on its underside is the bed contact, and the split pins at each end print with their layers running along them, which is the strong direction.\n- Use PETG or tougher; PLA pins can crack when you snap them in.\n\n**Fitting the handle**\n- Push each pin into its hole until the barb clicks through, one end at a time.\n- To remove, squeeze the two halves of a pin together with pliers and pull.\n- The pins carry the full weight of the box, so keep loads reasonable (a few kilos of hand tools is fine, not a bag of bricks).\n\n**Text and colour**\n- The name and adornment are engraved into the front wall; fill them with a second colour for an inlay.',
    parts: [
      { id: 'base', label: 'Box', colour: 0 },
      { id: 'handle', label: 'Handle', colour: 1 },
    ],
    colours: ['#c0392b', '#2c3e50'],
    build: () => {
      const X = 200, Y = 120, R = 6, WALL = 3, FLOOR = 3, WALL_H = 60, DIV_H = 50, DIV_T = 2.4
      const PLATE = 3, HZ = 130, TOP_R = 22, HOLE_R = 4.7  // pivot height above the floor, hole radius
      const outline = roundedRect(X, Y, R)
      const inner = roundedRect(X - 2 * WALL, Y - 2 * WALL, R - WALL)
      let base = Manifold.extrude(outline, WALL_H).subtract(Manifold.extrude(inner, WALL_H).translate(0, 0, FLOOR))

      // End plate: the wall footprint (Y x WALL_H) tapering by a tangent hull to a round top
      // carrying the pivot hole. Drawn in (y, z), extruded along x.
      const tent = CrossSection.hull([CrossSection.square([Y, WALL_H], false).translate(-Y / 2, 0), CrossSection.circle(TOP_R, 48).translate(0, HZ)])
      const plate = (sx: number) => Manifold.extrude(tent, PLATE).rotate(90, 0, 90).translate(sx > 0 ? X / 2 - PLATE : -X / 2, 0, 0)
      base = base.add(plate(1)).add(plate(-1))
      // Pivot holes, clear through each plate.
      const hole = Manifold.cylinder(PLATE + 2, HOLE_R, HOLE_R, 32).rotate(0, 90, 0)
      base = base.subtract(hole.translate(X / 2 - PLATE - 1, 0, HZ)).subtract(hole.translate(-X / 2 - 1, 0, HZ))

      // Dividers: one long wall parallel to the front, three small bays behind it.
      const DIV_Y = -12
      const innerLen = X - 2 * WALL
      base = base.add(Manifold.cube([innerLen + 0.02, DIV_T, DIV_H], false).translate(-innerLen / 2 - 0.01, DIV_Y - DIV_T / 2, FLOOR - 0.01))
      const back = Y / 2 - WALL - (DIV_Y + DIV_T / 2) + 0.02
      for (const cx of [-34, 34])
        base = base.add(Manifold.cube([DIV_T, back, DIV_H], false).translate(cx - DIV_T / 2, DIV_Y + DIV_T / 2 - 0.01, FLOOR - 0.01))

      // Handle: a round bar between the plates, flat underneath for the bed, with a split
      // snap pin on each end. Drawn along x, centred on y = 0 / z = 0, then moved behind the box.
      const GAP = X - 2 * PLATE, HALF = GAP / 2 - 0.5      // 0.5 mm running clearance to each plate
      const BAR_R = 7, CORE_R = 4.3, BARB_R = 5.2
      const CORE_L = 0.5 + PLATE + 0.6, BARB_L = 2        // pin reaches 0.6 mm past the plate, then the barb
      const pin = () => Manifold.union([
        Manifold.cylinder(CORE_L + 0.1, CORE_R, CORE_R, 32).translate(0, 0, -0.1),
        Manifold.cylinder(BARB_L, BARB_R, CORE_R - 0.4, 32).translate(0, 0, CORE_L),
      ]).rotate(0, 90, 0)
      const slot = Manifold.cube([CORE_L + BARB_L, 2 * BARB_R + 2, 1.6], false).translate(1.2, -BARB_R - 1, -0.8) // halves flex up/down
      const end = () => pin().subtract(slot)
      let handle = Manifold.union([
        Manifold.cylinder(2 * HALF, BAR_R, BAR_R, 64).rotate(0, 90, 0).translate(-HALF, 0, 0),
        end().translate(HALF, 0, 0),
        end().mirror([1, 0, 0]).translate(-HALF, 0, 0),
      ])
      handle = handle.intersect(Manifold.cube([X + 40, 4 * BAR_R, 2 * BAR_R + 2], false).translate(-X / 2 - 20, -2 * BAR_R, -(BAR_R - 1.5)))
      handle = handle.translate(0, Y / 2 + 20, BAR_R - 1.5)
      return { base, handle }
    },
    zones: [
      // Front wall, outside face (y = -60). Anton: a bold face holds up when engraved
      // into a 3 mm wall.
      { id: 'line1', label: 'Name', part: 'base', colour: 1, origin: [-14, -60, 30], normal: [0, -1, 0], up: [0, 0, 1],
        width: 140, height: 36, mode: 'engrave', depth: 1, maxLines: 1, default: 'TOOLS', font: 'Anton' },
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'base', colour: 1, origin: [72, -60, 30], normal: [0, -1, 0], up: [0, 0, 1],
        width: 36, height: 36, mode: 'engrave', depth: 1, maxLines: 1, default: 'wrench' },
    ],
  },
  {
    id: 'light-sign',
    name: 'Illuminated Sign',
    tags: ['sign', 'light', 'led', 'shop', 'wall'],
    notes: 'A light-box sign: a black, light-tight box with a clear front panel that slides in from the right. Print a spare panel for each message (OPEN / CLOSED, VACANCY / NO VACANCY). Each is printed clear and painted black, so only the engraved letters glow.',
    printInstructions: '**Printing the parts**\n- **Box:** print on its back with the open front facing up, in black, with at least 4 walls (or 100% infill) so no light shines through the walls. PLA or PETG both work. Turn supports on: the thin lip over each rail slot overhangs and is fragile, so it is worth supporting. The supports come off with a little care.\n- **Panel:** print flat, text side up, no supports, in clear PETG. Use 100% infill and 0.2 mm layers, and print slowly. It comes out frosted rather than glass-clear, which spreads the light nicely. The end of the panel is a cap that completes the end of the box, printed as part of the same piece.\n\n**Painting the panel**\n1. Lightly scuff the front face.\n2. Roll or dab on matte black acrylic (or whatever dark colour matches your box) with a small foam roller or foam brush. It only touches the raised surface, so the engraved letters stay clear and glow.\n3. Paint the end face of the cap (the right-hand end of the panel) black too, so the end of the sign matches the box.\n4. Two thin coats block the light better than one thick one.\n5. If paint gets into a letter, wipe it out with a cotton bud while it is wet. Spray paint works too if you mask the letters or wipe them clean afterwards.\n\n**Lights and power**\n- Use a low-heat LED strip, so the box and the clear panel stay cool and nothing softens. For example, [this strip on AliExpress](https://www.aliexpress.com/item/1005008569438382.html). Check its voltage and length before you order, and stick it around the inside of the box (the inside is 194 mm wide and 114 mm tall).\n- Feed the cable out through one of the two 20 x 12 mm rectangular power holes, each big enough for a USB-A plug to pass through. One is in the back wall (bottom right); the other is low in the right-hand end wall. Use the end one if you fix the sign flat to a wall, since the back hole would be blocked.\n- Use LEDs only: a candle or tea light will soften the print.\n- Small heat vents run through the top wall and both side walls. They are narrow slits, but if any light shows through, cover them on the inside with a dab of black paint or tape.\n\n**Fixing the sign and changing the panel**\n- To hang or fix the sign, four countersunk 3.6 mm holes go through the back panel. With the front panel slid out you can reach the screw heads from inside, so screw straight into the wall or a board.\n- Print one panel for each message (for example OPEN and CLOSED, or VACANCY and NO VACANCY) and swap them in seconds.\n- To change the lettering or reach the lights, work a fingernail or a thin blade into the seam at the right-hand end and slide the panel out. The cap on the end of the panel completes the box end, so when it is in nothing sticks out.\n- The panel is held by a close sliding fit (about 0.2 mm of clearance). If it works loose, a dab of removable putty at the end holds it. That gap also lets a little light seep at the edges; black tape over the slot cures it.',
    // Box: 200 x 120 x 33, 3 mm walls, one open chamber. The panel's top and bottom
    // edges enter 1.5 mm slits in the top and bottom walls, behind a 1.2 mm front lip.
    // The front 3.6 mm of the right-hand end wall (curved corners included) is cut away
    // and made part of the panel as an end cap, so the panel slides in from the right
    // and finishes flush with the box, with nothing standing proud. The panel is shown
    // seated and prints flat, text face up.
    parts: [
      { id: 'box', label: 'Box', colour: 0 },
      { id: 'lid', label: 'Front panel (clear, slides in)', colour: 1 },
    ],
    colours: ['#1a1a1a', '#cfe6f2'],
    build: () => {
      const W = 200, H = 120, D = 33, WALL = 3, IN = W / 2 - WALL        // inner half-width 97
      const Z0 = 29.4, Z1 = 31.8                                         // rebate floor / panel slot
      const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
        Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false).translate(x0, y0, z0)

      let box = Manifold.extrude(roundedRect(W, H, 6), D).translate(0, H / 2, 0)
        .subtract(slab(-IN, IN, WALL, H - WALL, WALL, D + 1))             // one open cavity, square inside corners
      // Rails: a slit in the top wall and in the bottom wall. The front 3.6 mm of the right-hand
      // end wall is cut away, curved corners and all; the panel's own end cap fills it again.
      const SLIT = 1.5
      box = box
        .subtract(slab(-IN, IN, H - WALL - 0.01, H - WALL + SLIT, Z0, Z1))
        .subtract(slab(-IN, IN, WALL - SLIT, WALL + 0.01, Z0, Z1))
        .subtract(slab(IN - 0.01, W / 2 + 1, -1, H + 1, Z0, D + 1))
        // Power: two 20 x 12 mm rectangular holes, big enough for a USB-A plug to pass through: one
        // through the back wall, low at the right-hand end, and one through the right-hand end wall,
        // low down, for when the back is screwed flat to a wall.
        .subtract(slab(70, 90, 6, 18, -1, WALL + 0.5))
        .subtract(slab(IN - 1, W / 2 + 1, 6, 18, 6, 26))
      // Heat vents: ten 1.6 x 14 mm slots through the top wall, three through each side
      // wall high up. Small and out of the front view.
      for (let i = 0; i < 10; i++) box = box.subtract(slab(-81 + 18 * i - 0.8, -81 + 18 * i + 0.8, H - WALL - 1, H + 1, 9, 23))
      for (const y of [96, 103, 110]) {
        box = box.subtract(slab(-W / 2 - 1, -IN + 1, y - 0.8, y + 0.8, 9, 23)).subtract(slab(IN - 1, W / 2 + 1, y - 0.8, y + 0.8, 9, 23))
      }
      // Fixing: four 3.6 mm holes through the back wall, countersunk on the inside so the
      // screw heads sit flush and are reached with the front panel slid out.
      for (const [x, y] of [[-70, 100], [70, 100], [-70, 28], [70, 28]]) {
        box = box.subtract(Manifold.cylinder(WALL + 2, 1.8, 1.8, 32).translate(x, y, -1))
          .subtract(Manifold.cylinder(1.81, 1.8, 3.8, 32).translate(x, y, WALL - 1.8))
      }

      // Panel: a 2 mm plate 0.2 mm clear of the rail slot and 0.15 mm short of the slit floors, in one
      // piece with an end cap at its right-hand end: the box's own outline (rounded corners included),
      // from the front face back to the plate's underside, 0.2 mm short of the end wall it sits on,
      // flush with the box ends and front.
      const PZ0 = Z0 + 0.2, PZ1 = Z1 - 0.2
      const plate = slab(-IN + 0.2, IN + 1, WALL - SLIT + 0.15, H - WALL + SLIT - 0.15, PZ0, PZ1)
      const cap = Manifold.extrude(roundedRect(W, H, 6), D - PZ0).translate(0, H / 2, PZ0)
        .intersect(slab(IN + 0.2, W / 2 + 1, -1, H + 1, 0, D + 1))
      const lid = Manifold.union([plate, cap])
      return { box, lid }
    },
    zones: [
      // Front face of the panel (z = 31.6), viewed from the front: up = +y. Engraved 1.2 mm so the
      // letters are recesses a roller leaves clear when the face is painted black; no `colour`, so
      // the text is part of the panel.
      { id: 'top', label: 'Top line', part: 'lid', origin: [0, 102, 31.6], normal: [0, 0, 1], up: [0, 1, 0],
        width: 170, height: 22, mode: 'engrave', depth: 1.2, maxLines: 1, default: 'WELCOME', font: 'Anton' },
      { id: 'line1', label: 'Name', part: 'lid', origin: [-28, 58, 31.6], normal: [0, 0, 1], up: [0, 1, 0],
        width: 120, height: 34, mode: 'engrave', depth: 1.2, maxLines: 1, default: 'COFFEE', font: 'Anton' },
      { id: 'line2', label: 'Subtitle', part: 'lid', origin: [-28, 22, 31.6], normal: [0, 0, 1], up: [0, 1, 0],
        width: 120, height: 16, mode: 'engrave', depth: 1.2, maxLines: 2, default: 'open all day', font: 'Fredoka' },
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'lid', origin: [66, 40, 31.6], normal: [0, 0, 1], up: [0, 1, 0],
        width: 44, height: 44, mode: 'engrave', depth: 1.2, maxLines: 1, default: 'star' },
    ],
  },
  {
    id: 'led-box-sign',
    name: 'LED Box Sign',
    tags: ['sign', 'light', 'led', 'shop', 'wall', 'bedroom'],
    notes: 'A wall-hanging light box in the style of a commercial acrylic LED sign: a deep, squarish translucent shell with a lettered front face and an **open back**, so a light strip fits inside and the whole box glows. It prints in two parts, the shell and the front face, and the face is glued on after printing. The raised lettering is dark against the lit background.',
    printInstructions: '**Printing the parts**\n- **Shell:** print standing on its back rim, with the open front facing up. The rim sits flat on the bed, so the hanging lugs print flat on the bed and the walls print straight up. Neither part needs supports. A cross of two 10 mm wide ribs runs corner to corner across the open back, 2 mm thick, and prints flat on the bed with the rest of the rim. Use natural or white translucent PETG (or PLA), 0.2 mm layers, and 4 or more perimeters. The walls are 2 mm, so they are effectively solid. The small power notch in the bottom wall is a short 14 mm bridge, which prints cleanly.\n- **Front face:** print flat, lettering side up. The lettering and adornment are embossed 1 mm, raised from the face, and print face up with no supports. (You can switch them to engraved in the editor; that prints face up too.) Use natural or white translucent filament, 0.2 mm layers and 100% infill. For dark lettering, change filament to black at the layer where the lettering starts, 2.4 mm up, so the raised letters are an opaque dark region on the translucent face.\n- Keep the lettering bold: a heavy font on a short line of text reads best when lit.\n\n**Assembly**\n- A thin ring on the back of the face drops just inside the shell walls and holds the face in position, so dry-fit it first and check it seats evenly. Glue the face to the front rim of the shell.\n- Fit the light strip and feed the power lead out through the notch before you glue the face on, since the face closes the box.\n- Glue the face to the front rim with a thin bead of cyanoacrylate or PETG-safe adhesive along the whole rim, and clamp or tape it while it sets.\n\n**Hanging**\n- A 6 mm wide, 4 mm thick flange runs round the inside of the back rim. It stiffens the walls and gives the box a wide, flat surface against the wall. Two keyhole lugs are built into the same rim, inside the top wall, so the box sits flat against the wall with nothing visible. Mark two screw positions 90 mm apart, on a level line, and drive in screws for 4 mm shanks with heads up to 8 mm across (a no. 6 or M4 pan head is about right), leaving about 3 mm of shank clear of the wall.\n- Lift the box, drop the large end of each keyhole over its screw head, then let the box slide down so the screws lock into the narrow slots.\n- The lugs are 4 mm thick plates printed flat, so layer lines run along the load and they hold the weight of the box and light strip. For a heavier fit, use a wall anchor at each screw.\n\n**Lights and power**\n- **Mounting the lights:** the corner-to-corner cross across the open back is there to hold a central light. It has a 24 mm round pad where the ribs cross, 2 mm thick, so you can stick or screw a light or LED module to it, or run a strip along the ribs. If you are hanging the box over a wall fitting light, cut the cross out with a craft knife or snips, which takes a minute since it is only 2 mm thick, and the back is then open to the fitting. The 4 mm flange round the rim is what holds the box stiff, so leave it.\n- Use a low-heat LED strip, stuck around the inside of the walls or along the cross, so nothing softens. The inside is 156 mm wide, 136 mm tall and 57.6 mm deep above the 4 mm back flange, which narrows the back opening to 144 x 124 mm, so fit the strip and light through the back before you hang the box. A frosted diffuser or a strip that faces the walls avoids hot spots on the face.\n- Use LEDs only: a candle or tea light will soften the print.\n- **Vents:** the box has none, so it is closed and dust-free. If your light is likely to make the box hot (a powerful LED module, or a box left on all day), drill a row of small holes, about 3 mm, along the top wall and the bottom wall before you glue the face on. Warm air rises in through the bottom and out through the top. Drill from the outside with a sharp bit and a slow speed, and keep the holes away from the lugs and the power notch. If light shows through, cover the holes on the inside with a dab of black paint or tape.\n- The power lead leaves through a 14 x 9 mm notch in the bottom wall, open to the back rim, so a USB or barrel plug can be fitted from behind. The wall closes the notch once the box is hung. Fit the strip and lead first, then glue the face on and hang the box.',
    // Box 160 x 140 x 60 (depth 3/8 of the width), 2 mm walls all round so the sides glow too. Two parts: the shell is open
    // at the back (z = 0) AND the front, and prints back rim down; the 2.4 mm front face plate (z 57.6 to 60) prints face up and
    // glues on, with a locating ring on its back, and glues onto the shell's front rim. Two keyhole lugs are plates flush with the back rim,
    // fused into the top wall, so the box hangs flat and they print flat on the bed. A 14 x 9 mm notch in the bottom wall,
    // open to the rim, takes the power lead.
    parts: [
      { id: 'shell', label: 'Shell (back rim down)', colour: 0 },
      { id: 'face', label: 'Front face (glue on, print face up)', colour: 0 },
    ],
    colours: ['#f4f4f0', '#1a1a1a'],
    build: () => {
      const W = 160, H = 140, D = 60, WALL = 2, FRONT = 2.4
      const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
        Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false).translate(x0, y0, z0)
      const outer = Manifold.extrude(roundedRect(W, H, 8), D - FRONT).translate(0, H / 2, 0)   // the face plate sits on the rim
      const cavity = Manifold.extrude(roundedRect(W - 2 * WALL, H - 2 * WALL, 6), D + 2).translate(0, H / 2, -1)
      // Keyhole lugs: a 4 mm plate flush with the back rim, hanging 24 mm below the top wall, burying itself
      // 1 mm into it. The 9 mm head hole sits 16 mm below the wall; the 4.4 mm slot runs up from it.
      const lug = (x: number) => {
        const top = H - WALL
        const plate = slab(x - 9, x + 9, top - 24, top + 1, 0, 4)
        const key = Manifold.union([
          Manifold.cylinder(6, 4.5, 4.5, 40).translate(x, top - 16, -1),
          slab(x - 2.2, x + 2.2, top - 16, top - 6, -1, 5),
        ])
        return plate.subtract(key)
      }
      const lugs = Manifold.union([lug(-45), lug(45)])
      const hole = roundedRect(W - 2 * WALL, H - 2 * WALL, 6)
      const LAND = 3, top = D - FRONT
      // Back flange: a 6 mm x 4 mm band round the inside of the back rim, flat on the bed, so it needs no supports.
      // It stiffens the walls, gives the sign a wide face to sit on the wall, and joins the lugs.
      const back = Manifold.extrude(hole.subtract(hole.offset(-6, 'Round', 2, 32)), 4).translate(0, H / 2, 0)
      // Light mount: two 10 mm ribs corner to corner across the back, 2 mm thick (half the flange), with a 24 mm
      // pad where they cross. They join the flange at the corners and can be cut out for a wall fitting light.
      const IW = W - 2 * WALL, IH = H - 2 * WALL, ang = Math.atan2(IH, IW) * 180 / Math.PI
      const rib = (a: number) => Manifold.cube([Math.hypot(IW, IH) + 10, 10, 2], true).rotate(0, 0, a).translate(0, H / 2, 1)
      const cross = Manifold.union([rib(ang), rib(-ang), Manifold.cylinder(2, 12, 12, 48).translate(0, H / 2, 0)])
        .intersect(Manifold.extrude(hole, 2).translate(0, H / 2, 0))
      const shell = Manifold.union([outer.subtract(cavity), lugs, back, cross]).subtract(slab(43, 57, -1, WALL + 7, -1, 9))
      // Face: the plate in the box's outline, plus a 1.6 mm locating ring on its back that drops inside
      // the shell walls with 0.3 mm to spare, so the face seats itself before gluing.
      const plate = Manifold.extrude(roundedRect(W, H, 8), FRONT).translate(0, H / 2, D - FRONT)
      const ringOut = hole.offset(-0.3, 'Round', 2, 32)
      const ring = Manifold.extrude(ringOut.subtract(ringOut.offset(-1.6, 'Round', 2, 32)), LAND + 0.01)
        .translate(0, H / 2, top - LAND)
      const face = Manifold.union([plate, ring])
      return { shell, face }
    },
    zones: [
      // Front face (z = 60), viewed from the front: up = +y. Embossed 1 mm by default (the editor can engrave instead); the raised dark text is a colour-change region.
      { id: 'icon', label: 'Adornment', kind: 'symbol', part: 'face', colour: 1, origin: [0, 104, 60], normal: [0, 0, 1], up: [0, 1, 0],
        width: 40, height: 40, mode: 'emboss', depth: 1, maxLines: 1, default: 'trout' },
      { id: 'line1', label: 'Name', part: 'face', colour: 1, origin: [0, 62, 60], normal: [0, 0, 1], up: [0, 1, 0],
        width: 132, height: 36, mode: 'emboss', depth: 1, maxLines: 1, default: 'Pescatorio', font: 'Pacifico' },
      { id: 'line2', label: 'Subtitle', part: 'face', colour: 1, origin: [0, 28, 60], normal: [0, 0, 1], up: [0, 1, 0],
        width: 120, height: 24, mode: 'emboss', depth: 1, maxLines: 2, default: 'Fresh fish and seafood daily', font: 'Fredoka' },
    ],
  },
  {
    id: 'notice-board',
    name: 'Notice Board',
    tags: ['sign', 'notice', 'rules', 'list', 'wall', 'fridge', 'home'],
    notes: 'An A5 (148 x 210 mm) notice sheet for a list: house rules, a to-do list, a safety notice. It has a header with an optional adornment at each end, a longer list in the body, and a footer. The defaults are a humorous "Rules of the House".',
    printInstructions: '**Printing**\n- Print flat as placed, face up, no supports. The sheet is 4 mm thick, with a 2 mm wide rim standing 1 mm proud round the edge. The text is embossed 1 mm, so the rim and the lettering are the same height.\n- **Colours:** dark blue sheet, yellow rim and text. The rim is its own part, sitting on the sheet, so a multi-colour (AMS/MMU) print takes both parts from the 3MF. On a single extruder, change filament at 4 mm (the layer where the rim and lettering start); one change gives yellow rim, text and adornments.\n- Use the editor to change any colour, or to engrave the text instead.\n\n**The list**\n- The body is a multi-line text box: put one rule on each line, and long lines wrap. Start a line with "- " for a bullet or "1. " for a numbered item (indent two spaces to nest). The text shrinks as you add more, and you can align it left, centre or right.\n- The header has room for two lines. Each adornment is chosen from the icon library, or left blank; the header text keeps the same width either way.\n\n**Mounting**\n- There is a round recess in each rear corner, 5.2 mm across and 2 mm deep, for a **5 mm round magnet** (glue it in), so the sheet sticks to a fridge or a steel door.\n- Or drill a recess out through the sheet with a drill bit and use it as a screw hole to hang the notice on a wall. Leave the other corners alone, or drill all four. A pan or round head up to 5 mm across will sit in the recess.',
    colours: ['#1b2a5e', '#f5c400'],
    // A5 portrait, 148 x 210 x 4, rounded corners. Two parts so the rim previews and prints yellow: the sheet (blue) and a 2 mm wide, 1 mm tall rim sitting on its top face (z = 4 to 5).
    // Four 5.2 mm x 2 mm recesses in the corners of the back (z = 0), open to the bed so they print without supports.
    parts: [
      { id: 'sheet', label: 'Sheet', colour: 0 },
      { id: 'rim', label: 'Rim', colour: 1 },
    ],
    build: () => {
      const W = 148, H = 210, T = 4, R = 6
      const outline = roundedRect(W, H, R)
      const pockets = Manifold.union(
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
          Manifold.cylinder(2 + 1, 2.6, 2.6, 48).translate(sx * 65, sy * 96, -1)))
      const sheet = Manifold.extrude(outline, T).subtract(pockets)
      const rim = Manifold.extrude(outline.subtract(outline.offset(-2, 'Round', 2, 32)), 1).translate(0, 0, T)
      return { sheet, rim }
    },
    zones: [
      // Top face, z = 4, viewed from the front: up = +y. Header at the top with an adornment at each end, the list body, then the footer. All inside the rim (inner edge at x = +/-72, y = +/-103).
      { id: 'iconLeft', label: 'Left adornment', kind: 'symbol', part: 'sheet', colour: 1, origin: [-57, 84, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 22, height: 22, mode: 'emboss', depth: 1, maxLines: 1, default: 'people-roof' },
      { id: 'iconRight', label: 'Right adornment', kind: 'symbol', part: 'sheet', colour: 1, origin: [57, 84, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 22, height: 22, mode: 'emboss', depth: 1, maxLines: 1, default: 'radiation' },
      { id: 'header', label: 'Header', part: 'sheet', colour: 1, origin: [0, 84, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 84, height: 28, mode: 'emboss', depth: 1, maxLines: 2, default: 'Rules of the House', font: 'Fredoka' },
      { id: 'body', label: 'List', kind: 'richtext', align: 'left', part: 'sheet', colour: 1, origin: [0, -6, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 128, height: 132, mode: 'emboss', depth: 1, maxLines: 12, font: 'Fredoka',
        default: '1. Wipe your feet. And your mess.\n2. If you open it, close it.\n3. If you drop it, pick it up.\n4. If you break it, own it and tell someone.\n5. Respect each other, and the last slice of pizza.\n6. No shoes on the couch. The couch has feelings.\n7. The dishwasher is not decoration. Load it.' },
      { id: 'footer', label: 'Footer', part: 'sheet', colour: 1, origin: [0, -88, 4], normal: [0, 0, 1], up: [0, 1, 0],
        width: 120, height: 14, mode: 'emboss', depth: 1, maxLines: 1, default: 'By Order of the Management', font: 'Fredoka' },
    ],
  },
  {
    id: 'picture-frame',
    name: 'Picture Frame',
    tags: ['frame', 'photo', 'home', 'gift'],
    notes: 'A frame for a 6 x 4" (152 x 102 mm) photo, with a stand, a line of text above and below the photo and adornments on the corners, sides and edge.',
    printInstructions: 'Three parts, shown assembled but printed one at a time — the STL zip has a file per part.\n\n**Printing**\n- Frame and stand print as placed with no supports.\n- Flip the back panel so the keyhole recess faces up.\n\n**Assembly**\n- A 6 x 4" (152 x 102 mm) photo drops into the rebate, then the panel holds it in.\n- The stand clips onto the bottom rail, or hang it on a screw through the keyhole.',
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
    notes: 'A beer-can mug that prints upright as placed, with a sleeve for a can or slim bottle.',
    printInstructions: '**Printing**\n- The body needs no supports, but the handle does: turn on tree supports (from the build plate is enough) or the underside of the handle will droop.\n\n**What fits**\n- A 355 ml can (66 mm) drops into the sleeve with 2 mm clearance all round.\n- Most slim bottles (up to ~74 mm) fit too, but a wide stubby will not.\n\n**Colour**\n- Text and adornments are engraved into the outside wall, in two short bands rather than up the whole mug, so a two-colour AMS print only swaps filament across those few layers.\n- To cut the purge waste further, in Orca/Bambu Studio turn on "Flush into objects\' infill" (Print Settings > Others), so the purged filament goes into the mug\'s own infill instead of a waste tower.\n- Or skip the swap altogether and print the merged STL in one colour, which leaves the engraving open with no purge at all.',
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
          width: 14, height: 14, mode: 'emboss', depth: 1, maxLines: 1, default: 'star', wrap,
          repeat: [1, 2, 3, 4, 5, 6, 7].map((i): Vec3 => [(i * C) / 8, 0, 0]) },
      ] as Zone[]
    })(),
  },
  {
    id: 'liberty-torch',
    name: 'Liberty Torch',
    tags: ['torch', 'lamp', 'light', 'wall', 'novelty'],
    colours: ['#b5651d', '#f2c230'],
    parts: [
      { id: 'handle', label: 'Handle', colour: 0 },
      { id: 'flame', label: 'Flame', colour: 1 },
      { id: 'flame-spiral', label: 'Flame (spiral, alternative)', colour: 1 },
      { id: 'mount', label: 'Wall mount', colour: 0 },
    ],
    notes: 'A torch in the style of the Statue of Liberty\'s: a hollow handle in a Greek style (fluted shaft, Greek-key band, bead rings and a dentil course) with your text round the balcony rim, a flame that lights up (choose a flickering flame or a twisted spiral one, both screw on the same way), and a wall plate with a hoop to hang it from. The parts are printed separately and shown side by side as printed.',
    printInstructions: '**Printing**\n- **Handle:** print upright as placed, no supports. The bead rings, key band and dentils are fine detail: a 0.4 mm nozzle and 0.12 to 0.16 mm layers show them best. It is hollow right through, with a floor 3 mm thick at the bottom.\n- **Flame (pick one):** there are two flames, a flickering one with curling licks and a twisted spiral one. Print whichever you like, or both and swap them. Both print upright as placed (point up), no supports. It is hollow, with a round skirt at the base that has an internal thread. Use a translucent or light filament and few walls if you want the light to glow through. Print the thread at 0.2 mm layers or finer.\n- **Wall mount:** print lying on its back as placed, in **PETG or a stronger filament such as carbon-fibre PETG/nylon**, not PLA. Use tree supports under the hoop, 4+ walls and 40%+ infill. The hoop carries the whole torch on a lever, so keep the plate and gussets solid.\n\n**Light**\n- Made for a **large (maxi) LED tea light**, about 58 mm across and up to 25 mm tall. With the flame off, drop it through the 61 mm opening in the deck: it settles on the sloping inside of the balcony, centred, with its top below the deck. Use an LED one; nothing here is vented, so don\'t use a wax candle.\n- A USB LED strip or puck light also works in the same space.\n\n**Cable**\n- The cable leaves through a slot 1/3 of the way up the handle, 16 x 8 mm, big enough for a USB-A plug with its moulded boot. Feed the plug out of the slot from the inside, pull the lead through, then fit the light.\n- Turn the handle in the hoop so the slot faces the wall; the lead then runs down the wall to the socket.\n\n**Assembly**\n- Screw the flame onto the threaded collar on the deck: turn it clockwise (right-hand thread, pitch 5 mm, about three turns) until the skirt sits on the deck. To change the tea light, unscrew the flame.\n- Screw the plate to the wall with four screws (up to 4 mm shank, countersunk).\n- Drop the handle bottom-first through the hoop until its knob rests in the hoop\'s cone seat.',
    // Handle: a revolved profile, hollowed 2.4 mm in from the outside. From the
    // bottom: a 32 mm stub (it goes through the mount's hoop), a knob that is
    // the stop on the hoop, a grip that widens to the balcony, a 45 degree flare
    // out to the rim (a true cylinder, so the text can wrap on it), and a deck
    // with a collar the flame fits over. The USB slot is cut through the +Y wall.
    // Mount: the plate stands in the XZ plane (wall at y = 0), and the hoop
    // leans 40 degrees from vertical, away from the wall, so the torch leans out.
    build: () => {
      const WALL = 2.4
      const RO = 46              // rim radius
      const FLARE_TOP = 130 + (RO - 20)   // the 45 degree flare from the grip (r 20) out to the rim
      const H_DECK = FLARE_TOP + 24       // top of the balcony deck
      // Flame thread (external on the deck's collar): pitch 5, 2 mm deep, a
      // trapezoid whose flanks stay clear of vertical so it prints unsupported.
      const THR_RM = 37, THR_RN = 35, THR_P = 5, THR_H = 12, COLLAR_H = 14
      const OPEN_R = 30.5        // opening through the collar and deck: a 58 mm tea light drops through
      const outer: [number, number][] = [
        [0, 0], [16, 0], [16, 30], [24, 38], [24, 41], [17, 49], [20, 130],
        [RO, FLARE_TOP], [RO, H_DECK], [0, H_DECK],
      ]
      const profile = CrossSection.ofPolygons([outer])
      // Offset a mirrored copy so the cavity reaches the axis (a one-sided offset leaves a rod down the middle); the floor is 3 mm.
      const cavity = profile.add(profile.mirror([1, 0])).offset(-WALL, 'Round', 2, 32)
        .intersect(CrossSection.square([100, 400], false).translate(0, 3))
      const revolve = (cs: CrossSection) => Manifold.revolve(cs, 96)
      let handle = revolve(profile).subtract(revolve(cavity))
      // The flame screws onto a threaded collar on the deck. Radius against angle
      // for one turn of a thread (the ridge centred at half a pitch); extruding it
      // with a twist of 360 degrees per pitch makes the helix.
      const threadSection = (rn: number, rm: number, base: number, top: number) => {
        const pts: [number, number][] = []
        for (let i = 0; i < 180; i++) {
          const th = (2 * Math.PI * i) / 180
          const u = Math.abs(((i / 180) * THR_P) - THR_P / 2)
          const r = u <= top / 2 ? rm : u <= base / 2 ? rm - ((u - top / 2) / ((base - top) / 2)) * (rm - rn) : rn
          pts.push([r * Math.cos(th), r * Math.sin(th)])
        }
        return CrossSection.ofPolygons([pts])
      }
      const threadSolid = (rn: number, rm: number, base: number, top: number, h: number) =>
        Manifold.extrude(threadSection(rn, rm, base, top), h, Math.ceil((360 * h) / THR_P / 10), (360 * h) / THR_P)
      const male = threadSolid(THR_RN, THR_RM, 3.6, 1.2, THR_H)
        .intersect(Manifold.revolve(CrossSection.ofPolygons([[[0, 0], [THR_RM + 1, 0], [THR_RM + 1, THR_H - 2.2], [THR_RN, THR_H], [0, THR_H]]]), 96))
      const collar = Manifold.union(Manifold.cylinder(COLLAR_H, THR_RN, THR_RN, 96), male.translate(0, 0, 1.5))
      handle = handle.add(collar.translate(0, 0, H_DECK - 0.01))
      handle = handle.subtract(Manifold.cylinder(COLLAR_H + WALL * 2 + 2, OPEN_R, OPEN_R, 96).translate(0, 0, H_DECK - WALL * 2))
      // USB-A slot: 16 wide (round the handle) x 8 tall, a third of the way up.
      const slotZ = H_DECK / 3
      const slot = Manifold.extrude(roundedRect(16, 8, 4), 30).rotate(-90, 0, 0).translate(0, 0, slotZ)

      // Greek ornament. The grip is a slightly tapered column (r 17 at z 49 to 20
      // at z 130): bead rings, a fluted shaft, and a Greek-key (meander) band
      // between rails. Under the rim, a dentil course. All sits within the wall
      // (2.4 mm) and clear of the cable slot (z 53 to 61) and the rim text.
      const gripR = (z: number) => 17 + (3 * (z - 49)) / 81
      const at = (m: M, deg: number) => m.rotate(0, 0, deg)
      const beads = (z: number, n = 36, rad = 1.5) => Manifold.union(
        Array.from({ length: n }, (_, i) => at(Manifold.sphere(rad, 16).translate(gripR(z) + 0.2, 0, z), (360 * i) / n)))
      // Flutes: 12 round-bottomed grooves 1.1 mm deep, flat-ended, widening up the taper.
      const F0 = 69, F1 = 101, NF = 12
      const flute0 = gripR(F0)
      const flutes = Manifold.extrude(
        CrossSection.compose(Array.from({ length: NF }, (_, i) => {
          const a = (2 * Math.PI * i) / NF
          return CrossSection.circle(2, 24).translate((flute0 + 0.9) * Math.cos(a), (flute0 + 0.9) * Math.sin(a))
        })), F1 - F0, 1, 0, [gripR(F1) / flute0, gripR(F1) / flute0]).translate(0, 0, F0)
      // Meander: rails at lattice v = 0 and 8, and in each of 10 units a spiral hook
      // (0,0) (0,6) (6,6) (6,2) (2,2) (2,4) (4,4), bars one lattice unit wide with
      // one-unit gaps. 1 lattice unit = a, about 1.5 mm; the band is 9a tall.
      const NK = 10, KZ = 108
      const KR = gripR(KZ + 7)
      const a = (2 * Math.PI * KR) / NK / 8
      const KIN = KR - 1.2, KOUT = KR + 0.8
      const degPer = 360 / NK / 8
      const vbar = (x: number, v0: number, v1: number) =>
        at(Manifold.cube([KOUT - KIN, a, (v1 - v0 + 1) * a], false).translate(KIN, -a / 2, KZ + (v0 - 0.5) * a), x * degPer)
      const hbar = (v: number, x0: number, x1: number) => at(
        Manifold.revolve(CrossSection.square([KOUT - KIN, a], false).translate(KIN, KZ + (v - 0.5) * a), 24, (x1 - x0 + 1) * degPer),
        (x0 - 0.5) * degPer)
      const rail = (v: number) => Manifold.revolve(CrossSection.square([KOUT - KIN, a], false).translate(KIN, KZ + (v - 0.5) * a), 120)
      const key: M[] = [rail(0), rail(8)]
      for (let u = 0; u < NK; u++) {
        const o = u * 8
        key.push(vbar(o, 0, 6), hbar(6, o, o + 6), vbar(o + 6, 2, 6), hbar(2, o + 2, o + 6), vbar(o + 2, 2, 4), hbar(4, o + 2, o + 4))
      }
      // Dentils: 40 blocks 3 mm wide, 1.4 mm proud, in the last 3 mm below the deck.
      const dentils = Manifold.union(Array.from({ length: 40 }, (_, i) =>
        at(Manifold.cube([2.4, 3, 3], false).translate(RO - 1, -1.5, H_DECK - 3), (360 * i) / 40)))
      handle = handle.subtract(flutes)
        .add(beads(65)).add(beads(104)).add(beads(125))
        .add(Manifold.union(key)).add(dentils)
      handle = handle.subtract(slot)

      // Flame: a round skirt with an internal thread that screws onto the
      // handle's collar, a 45 degree shoulder, then a fat teardrop core whose tip
      // sways in an S, ringed by seven broad leaf-shaped licks that curl outward
      // and spiral a little as they rise. Every part is a chain of hulled discs
      // (a smooth frustum between each pair of slices; the licks' discs are
      // ellipses, wide round the core and thin radially), so nothing leans more
      // than about 35 degrees and it prints upright with no supports. The core is
      // hollow (a copy 2.4 mm smaller all round) so the light shows through; the
      // licks are solid and rooted in the skirt's shoulder.
      const SK_R = 42.5, SK_H = 13, BODY_Z = 18
      type Slice = { x: number; y: number; z: number; r: number; w?: number; ang?: number }
      // A disc, or (with w and ang) an ellipse w wide round the axis and r deep radially.
      const disc = (p: Slice) => {
        const r = Math.max(p.r, 0.4)
        const d = Manifold.cylinder(0.05, 1, 1, 48).scale([Math.max(p.w ?? p.r, 0.4), r, 1])
        return d.rotate(0, 0, ((p.ang ?? 0) * 180) / Math.PI - 90).translate(p.x, p.y, p.z)
      }
      const sweep = (pts: Slice[]) => Manifold.union(pts.slice(1).map((p, i) => Manifold.hull([disc(pts[i]), disc(p)])))
      const FLAME_H = 118, R0 = 34, NS = 40
      const bodyAt = (t: number): Slice => ({
        x: 16 * t * t + 6 * Math.sin(2 * Math.PI * t) * t, y: 0, z: BODY_Z + t * FLAME_H,
        r: Math.max(0.6, R0 * Math.pow(1 - t, 1.25) * (1 + 0.22 * Math.sin(Math.PI * t))),
      })
      const bodyPts = Array.from({ length: NS + 1 }, (_, i) => bodyAt(i / NS))
      const WALL_F = 2.4
      const cavPts = bodyPts.filter((q) => q.r - WALL_F > 1.2).map((q) => ({ ...q, r: q.r - WALL_F }))
      const NL = 7
      const licks = [95, 66, 86, 60, 78, 70, 90].map((h, k) => {
        const deg = (360 * k) / NL + 8
        const pts: Slice[] = []
        for (let j = 0; j <= 18; j++) {
          const u = j / 18
          // Out from the core and curling (the radius grows, then the tip leans in a touch),
          // with a sideways flicker; widest low down, then narrowing to a curved tip.
          const rho = 24 + 18 * Math.pow(u, 1.5) - 5 * Math.pow(u, 4)
          const ang = ((deg + 34 * u + 11 * Math.sin(2 * Math.PI * u)) * Math.PI) / 180
          pts.push({ x: rho * Math.cos(ang), y: rho * Math.sin(ang), z: BODY_Z - 4 + u * (h + 4), ang,
            w: Math.max(0.5, 18 * Math.pow(1 - u, 0.7) * (0.8 + 0.2 * Math.sin(Math.PI * u))),
            r: Math.max(0.5, 9 * Math.pow(1 - u, 0.9) * (1 + 0.2 * Math.sin(Math.PI * u))) })
        }
        return sweep(pts)
      })
      const skirt = Manifold.revolve(CrossSection.ofPolygons([[[0, 0], [SK_R, 0], [SK_R, SK_H], [SK_R - 12.5, SK_H + 12.5], [0, SK_H + 12.5]]]), 96)
      const CLR = 0.35
      const femaleH = THR_H + 1.5
      const female = threadSolid(THR_RN + CLR, THR_RM + CLR, 3.6 + 0.7, 1.2 + 0.7, femaleH).translate(0, 0, -0.01)
      const roof = Manifold.revolve(CrossSection.ofPolygons([[[0, femaleH - 1], [THR_RN + 0.5, femaleH - 1], [THR_RN + 0.5, femaleH], [24, femaleH + THR_RN + 0.5 - 24], [0, femaleH + THR_RN + 0.5 - 24]]]), 96)
      const flame = Manifold.union([skirt, sweep(bodyPts), ...licks]).subtract(sweep(cavPts)).subtract(female).subtract(roof)

      // The alternative flame: a 5-spiked cone twisting 300 degrees as it narrows
      // to a point, hollowed by a smaller copy of itself. Same skirt and thread,
      // so it screws onto the handle just like the other.
      const SP_H = 120, SP_R = 33, SP_TWIST = 300, SP_TOP = 0.04
      const spikes = (r: number, n = 200) => {
        const pts: [number, number][] = []
        for (let i = 0; i < n; i++) {
          // 5 spikes: a triangle wave with sharp tips and rounded valleys.
          const a = (2 * Math.PI * i) / n, rr = r * (0.76 + 0.34 * Math.pow(1 - Math.abs(Math.sin((5 * a) / 2)), 1.4))
          pts.push([rr * Math.cos(a), rr * Math.sin(a)])
        }
        return CrossSection.ofPolygons([pts])
      }
      const SP_CAV_F = 0.88, SP_CAV_TOP = 0.097
      const spiralBody = Manifold.extrude(spikes(SP_R), SP_H, 120, SP_TWIST, [SP_TOP, SP_TOP]).translate(0, 0, BODY_Z)
      const spiralInner = Manifold.extrude(spikes(SP_R * 0.9), SP_H * SP_CAV_F, 80, SP_TWIST * SP_CAV_F, [SP_CAV_TOP, SP_CAV_TOP]).translate(0, 0, BODY_Z)
      const flameSpiral = Manifold.union(skirt, spiralBody).subtract(spiralInner).subtract(female).subtract(roof)

      // Mount.
      const T = 5, PW = 90, PH = 110
      const top: Vec3 = [0, 48, 65]               // centre of the hoop's top face
      const RING_R = 31, RING_L = 28, BORE = 16.35, SEAT_R = 24.35, SEAT_D = 8
      // Local +Z of `m` becomes the hoop axis, with the origin at the top face.
      const place = (m: M) => m.rotate(-40, 0, 0).translate(top[0], top[1], top[2])
      const hoopOuter = place(Manifold.cylinder(RING_L, RING_R, RING_R, 96).translate(0, 0, -RING_L))
      const bore = place(Manifold.union(
        Manifold.cylinder(RING_L + 2, BORE, BORE, 96).translate(0, 0, -RING_L - 1),
        Manifold.cylinder(SEAT_D + 0.01, BORE, SEAT_R, 96).translate(0, 0, -SEAT_D)))
      // Two gussets, one each side of the bore, joining the ring to the plate.
      const slab = (x0: number, x1: number) => Manifold.cube([x1 - x0, 400, 400], false).translate(x0, -200, -200)
      const gusset = (x0: number, x1: number) => Manifold.hull([
        hoopOuter.intersect(slab(x0, x1)),
        Manifold.cube([x1 - x0, 10, 70], false).translate(x0, 0, 25),
      ])
      const plate = Manifold.extrude(roundedRect(PW, PH, 8), T).rotate(90, 0, 0).translate(0, T, PH / 2)
      const holes = [[-35, 10], [35, 10], [-35, 100], [35, 100]].map(([x, z]) =>
        Manifold.union(
          Manifold.cylinder(T + 2, 2.2, 2.2, 32).rotate(-90, 0, 0).translate(x, -1, z),
          Manifold.cylinder(2.4, 2.2, 4.6, 32).rotate(-90, 0, 0).translate(x, T - 2.4 + 0.01, z)))
      const mount = Manifold.union([plate, hoopOuter, gusset(20, 30), gusset(-30, -20)])
        .subtract(bore).subtract(Manifold.union(holes))

      // Side by side, as printed: handle at the origin, flame to the right,
      // the mount to the left lying on its back (wall face down).
      return {
        handle,
        flame: flame.translate(100, 0, 0),
        'flame-spiral': flameSpiral.translate(200, 0, 0),
        mount: mount.rotate(90, 0, 0).translate(-100, PH / 2, 0),
      }
    },
    zones: [
      { id: 'rim', label: 'Rim text (raised, round the balcony)', part: 'handle', colour: 1, origin: [0, -46, 167], normal: [0, -1, 0], up: [0, 0, 1],
        width: 170, height: 18, mode: 'emboss', depth: 1.2, maxLines: 1, default: 'LIBERTY', font: 'Anton', wrap: { radius: 46 } },
    ],
  },
  {
    id: 'keycap',
    name: 'Keycap',
    tags: ['keyboard', 'keycap', 'desk', 'gadget'],
    verified: true,
    notes: 'Cherry MX fit: a 1u cap, 18 mm at the base and 9 mm tall, with a 4.2 x 1.35 mm cross socket.',
    printInstructions: '**Printing**\n- Print upside down: top face on the plate, skirt and stem upward. It needs no supports, and the legend comes out crisp off a smooth plate.\n- Keep the legend engraved: embossed text would have to print into the bed.\n- Use 0.12 mm layers.\n\n**Fit**\n- If the switch is tight, file the cross rather than reprinting.',
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
        width: 10, height: 10, mode: 'emboss', depth: 1, maxLines: 1, default: 'A', font: 'Anton', colour: 1 },
      { id: 'icon', label: 'Adornment (instead of the legend)', kind: 'symbol', origin: [0, 0, 9], normal: [0, 0, 1], up: [0, 1, 0],
        width: 10, height: 10, mode: 'emboss', depth: 1, maxLines: 1, default: '', colour: 1 },
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
    const magnet = (profile: CrossSection, pockets: [number, number][] = [[0, 0]], thick = T) =>
      Manifold.extrude(profile, thick).subtract(Manifold.union(
        pockets.map(([x, y]) => Manifold.cylinder(2.01, 3.1, 3.1, 48).translate(x, y, -0.01))))
    const tz = (id: string, label: string, x: number, y: number, w: number, h: number, text: string, lines = 1, extra: Partial<Zone> = {}): Zone => ({
      id, label, colour: 1, origin: [x, y, zTop], normal: [0, 0, 1], up: [0, 1, 0],
      width: w, height: h, mode: 'emboss', depth: 1, maxLines: lines, default: text, ...extra,
    })
    const icon = (x: number, y: number, size: number, symbol: string, extra: Partial<Zone> = {}): Zone => ({
      id: 'icon', label: 'Adornment', kind: 'symbol', colour: 1, origin: [x, y, zTop], normal: [0, 0, 1], up: [0, 1, 0],
      width: size, height: size, mode: 'emboss', depth: 1, maxLines: 1, default: symbol, ...extra,
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
          // 4 mm plate: the side text overlaps the magnet pockets, so the
          // roof over them must stay well thicker than the 0.8 mm engraving
          // (at 3 mm the inlay was left on a 0.2 mm skin and fell off).
          return magnet(body.subtract(CrossSection.union([...windows, front])).add(wheels), [[-25, 15], [25, 15]], 4)
        },
        zones: [tz('line1', 'Side', 0, 13, 72, 7, 'SCHOOL BUS', 1, { origin: [0, 13, 4] }), tz('line2', 'Lower', 0, 6, 40, 4.5, 'route 66', 1, { origin: [0, 6, 4] }), icon(24, 25, 9, 'sun', { origin: [24, 25, 4] })],
      },
      {
        id: 'magnet-truck', name: 'Truck Magnet', tags: [...tags, 'vehicle', 'truck'], colours: ['#2c3e50', '#f4f4f0'],
        build: () => {
          const trailer = roundedRect(64, 30, 3).translate(-14, 21)
          const cab = roundCorners(poly([[20, 6], [44, 6], [44, 20], [40, 30], [20, 30]]), 3) // same bottom line as the trailer
          const window = roundCorners(poly([[30, 16], [42, 16], [39.5, 26], [30, 26]]), 1.5)
          const wheels = CrossSection.union([circ(6, -34, 4), circ(6, -18, 4), circ(6, 34, 4)])
          const coupling = rect(10, 8, 19, 10) // bridges the 2 mm gap between trailer and cab
          return magnet(trailer.add(cab.subtract(window)).add(wheels).add(coupling), [[-30, 21], [2, 21], [32, 10]], 4) // 4 mm: text/icon overlap the pockets, see the bus
        },
        zones: [tz('line1', 'Trailer', -14, 24, 56, 13, 'HAULAGE', 1, { origin: [-14, 24, 4] }), tz('line2', 'Trailer small', -14, 12, 56, 6, 'we deliver', 1, { origin: [-14, 12, 4] }), icon(28, 12, 8, 'anchor', { origin: [28, 12, 4] })],
      },
      {
        id: 'magnet-house', name: 'House Magnet', tags: [...tags, 'home'], colours: ['#e67e22', '#f4f4f0'],
        build: () => {
          const walls = rect(56, 36, 0, 18)
          const roof = roundCorners(poly([[-34, 34], [34, 34], [0, 60]]), 3)
          const windows = CrossSection.union(roundedRect(11, 10, 1.5).translate(-16, 25), roundedRect(11, 10, 1.5).translate(16, 25))
          return magnet(walls.add(roof).subtract(windows), [[-16, 10], [16, 10]], 4) // 4 mm: the wall text overlaps the pockets, see the bus
        },
        zones: [tz('line1', 'Roof', 0, 42, 30, 8, 'THE JONESES', 1, { origin: [0, 42, 4] }), tz('line2', 'Wall', 0, 8, 48, 9, 'est. 1999', 1, { origin: [0, 8, 4] }), icon(0, 25, 9, 'house', { origin: [0, 25, 4] })],
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
    const printInstructions = 'Print face up with supports OFF.\n\n- The magnet pockets on the back are bridged over, and supports would fill them.\n- Glue a Ø6 × 2 mm disc magnet into each pocket afterwards.\n- For a smoother top, set Ironing to "Top surface" in your slicer.'
    const descriptions: Record<string, string> = {
      'magnet-bus': 'A fridge magnet shaped like a school bus, with a line of text on the side, a smaller line below and an adornment.',
      'magnet-car': 'A fridge magnet shaped like a car, with a business name, a phone number and an adornment.',
      'magnet-house': 'A fridge magnet shaped like a house, with text on the roof and on the wall and an adornment.',
      'magnet-truck': 'A fridge magnet shaped like a truck, with text on the trailer, a smaller line and an adornment.',
      'magnet-cloud': 'A cloud fridge magnet with an adornment and two lines of text.',
      'magnet-oval': 'A oval fridge magnet with an adornment and two lines of text.',
      'magnet-round': 'A round fridge magnet with an adornment and two lines of text.',
      'magnet-square': 'A square fridge magnet with an adornment and two lines of text.',
      'magnet-star': 'A star fridge magnet with an adornment and two lines of text.',
      'magnet-triangle': 'A triangle fridge magnet with an adornment and two lines of text.',
    }
    return list.map((t) => ({ ...t, notes: descriptions[t.id], printInstructions }))
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
    writeFileSync(`${dir}/${pid}.glb`, writeGlb(positions, new Uint32Array(mesh.triVerts), {
      copyright: `© ${AUTHOR_FULL}. ${LICENSE_ID} (noncommercial, share-alike) — ${LICENSE_URL}`,
      extras: { license: LICENSE_ID, author: t.author ? t.author : AUTHOR_FULL, source: `${REPO_URL}/tree/main/templates/${t.id}` },
    }))
    tris += mesh.numTri
  }
  const json: Record<string, unknown> = { id: t.id, name: t.name, units: 'mm', tags: t.tags, author: t.author ?? DEFAULT_AUTHOR }
  if (t.parts) {
    for (const p of t.parts) if (!solids[p.id]) throw new Error(`${t.id}: build() returned no solid for part ${p.id}`)
    json.parts = t.parts.map((p) => ({ ...p, mesh: `${p.id}.glb` }))
  } else {
    json.mesh = 'mesh.glb'
  }
  if (t.colours) json.colours = t.colours
  if (t.verified) json.verified = true
  if (t.notes) json.notes = t.notes
  if (t.printInstructions) json.printInstructions = t.printInstructions
  if (t.printInPlace) json.printInPlace = true
  if (t.published === false) json.published = false
  json.zones = t.zones
  writeFileSync(`${dir}/template.json`, JSON.stringify(json, null, 2) + '\n')
  console.log(t.id.padEnd(18), String(tris).padStart(6), 'tris', Object.keys(solids).join(','))
}
