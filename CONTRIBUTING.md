# Contributing a template

Anyone can fork this repo and open a pull request — new templates, fixes
to existing ones, or better zone placement/notes. This doc covers the
template format and how to build and check one before you open a PR. For
what happens to your PR after that, see [Review & publishing](README.md#review--publishing)
in the README.

## The three ways to author a template

Pick whichever fits what you're making:

1. **Procedural (Manifold/TypeScript)** — add an entry to the `templates`
   array in [`scripts/gen-templates.mts`](scripts/gen-templates.mts), then
   run:

   ```bash
   npm install
   npm run gen
   ```

   This (re)writes `templates/<id>/{template.json,mesh(es).glb}` for every
   procedural template, including yours. It fails loudly if a solid comes
   out with an error status, or if `build()` doesn't return a solid for
   every part you declared — treat that failure as a hard gate, not a
   warning.

2. **FreeCAD** — model the part in FreeCAD (see `freecad-src/` for the
   existing example), label the target faces `ZONE_<id>` / `ICON_<id>`,
   and export with:

   ```bash
   python3 tools/freecad_export_template.py your-model.FCStd --out templates \
     --author your-github-username --id your-template-id --name "Display Name" --tags tag1,tag2
   ```

   Full label/property conventions (zone modes, depths, multi-part
   `BODY_<id>` objects, colours) are documented in the docstring at the
   top of that script.

3. **By hand** — write `templates/<id>/template.json` and drop in the
   mesh `.glb` file(s) yourself. Match the schema below. This is fine for
   small edits to an existing template (e.g. tweaking a zone or the
   printing notes) without re-exporting the mesh.

Whichever route you use, leave `"published": false` in your
`template.json` while you work. The flag is just your note that it isn't
ready; the site hides such templates by default (an admin can override
that), so a draft is safe to push and iterate on in a PR.

## `template.json` schema

```jsonc
{
  "id": "your-template-id",       // matches the folder name, kebab-case
  "name": "Display Name",
  "units": "mm",
  "tags": ["tag1", "tag2"],
  "author": "your-github-username", // your GitHub username/id — mem3d links to it from the model page
  "notes": "A short description, shown in the editor.",
  "printInstructions": "**Printing**\n- Orientation, supports, colours, assembly (Markdown, optional).",
  "published": false,             // omit or `true` once ready to go live
  "verified": false,               // maintainer sets this after a real print
  "colours": ["#2980b9", "#d4a017"], // suggested palette (hex), optional

  // Single-solid templates:
  "mesh": "mesh.glb",

  // OR multi-part templates (parts must not overlap):
  "parts": [
    { "id": "body", "label": "Body", "mesh": "body.glb", "colour": 0 }
  ],

  "zones": [
    {
      "id": "name",
      "label": "Name",
      "kind": "text",              // "richtext" for multi-line wrapping text, or "symbol" for an icon
      "part": "body",               // which part this zone sits on (multi-part only)
      "origin": [0, 0, 0],          // zone centre, mm
      "normal": [0, 0, 1],          // out of the solid
      "up": [0, 1, 0],               // text-up direction, in the face plane
      "width": 40, "height": 12,
      "mode": "engrave",            // or "emboss"
      "depth": 0.8,
      "maxLines": 1,                // richtext: most wrapped lines before the text shrinks
      "align": "center",            // richtext only: "left" | "center" | "right", the starting alignment
      "default": "Wolfie",
      "font": "OpenSans",           // optional, defaults to the site's own default
      "colour": 1,                  // optional palette index
      "arc": { "radius": 12.9, "sweep": 170, "side": "top" },   // optional, curved text
      "backing": { "offset": 1.2, "height": 1 },                 // optional
      "repeat": [[10, 0, 0]],       // optional extra placements, offsets in-plane
      "wrap": { "radius": 20 }      // optional, bend content around a cylinder
    }
  ]
}
```

`author` must be your own GitHub username/id — the one that opened the
PR. It's how mem3d attributes the model to you and, until it's verified,
scopes the unverified preview to your account only (see
[Review & publishing](README.md#review--publishing)).

**Zone kinds.** `text` is one short line (or up to `maxLines` lines, split
only where the user presses Enter), centred, edited inline. `richtext` is for
longer text such as an epitaph or a message: the user edits it in a dialog,
it wraps at `width`, and it is sized as large as it can be while the wrapped
block fits `height` and `maxLines` lines (so more text means smaller text).
`align` sets the starting alignment, which the user can change. The text
(and your `default`) can use a little markdown: `**bold**`, `*italic*`,
`__underline__`, and lists (`- item`, `1. item`, two spaces to nest; wrapped
items hang under their text). There is one font face, so bold and italic are synthesised
(thickened and slanted): use a font with solid strokes, and keep the text large
enough that bold doesn't close up the counters. Give it a
generous `height` and a `maxLines` that matches what you'd want to print; set
`default` to a realistic sample, as stl-check builds it. A richtext zone can't
also have `arc`. `symbol` is an icon from the library.

`normal` and `up` must be unit vectors and mutually perpendicular; `up`
is what "upright" text on that zone means. Look at a few existing
`templates/*/template.json` files (or the `Zone` type at the top of
`scripts/gen-templates.mts`) for real examples if anything above is
unclear.

## Checking your work before opening a PR

There's no live preview in this repo — the mem3d site only sees what a
maintainer explicitly publishes (see README) — so check what you can
locally:

- **Procedural templates**: `npm run gen` succeeding (no thrown error) is
  itself a correctness check — Manifold validates the solid and that
  every declared part builds.
- **Mesh sanity**: open the `.glb` file(s) in any glTF viewer (e.g.
  [gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com), or
  Blender, or FreeCAD) and eyeball that the geometry looks right and
  parts don't overlap.
- **Zone placement**: sanity-check that each zone's `origin`/`normal`/`up`
  actually sit on the face you intend, and that `width`/`height` don't
  overrun the part.
- **`template.json` is valid JSON** and matches the schema above.
- Give a short **`notes`** description of the model, and put the printing
  and assembly advice in **`printInstructions`** (Markdown): orientation,
  whether supports are needed, multi-colour/AMS guidance, glue vs.
  friction-fit, etc. — see existing templates for the level of detail
  expected. The description shows in the editor; the print instructions are
  behind its "Print instructions…" link (under the download buttons) and in
  the README inside the STL zip. If you leave `printInstructions` out, the
  link shows `notes` instead, as it used to.

## Opening the PR

- One template (or one focused fix) per PR.
- Keep `"published": false` unless you're only editing an already-live
  template's metadata (notes, tags) — geometry changes should land as a
  draft first.
