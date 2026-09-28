# mem3d.templates

Template source for [mem3d](https://mem3d.jonesie.kiwi) — kept independent
of the site's own repo (`~/dev/mem3d`) so templates can be authored,
reviewed and (eventually) contributed by others without touching the app
itself, and so a template can sit as a draft indefinitely with zero risk of
it going live before it's ready.

## Layout

- `templates/` — every template's `template.json` + mesh `.glb` file(s),
  one folder per id. This is the actual source of truth; nothing here is
  built from anything else in this repo except the procedural ones (below).
- `scripts/gen-templates.mts` — generates the procedural templates (most of
  them) with Manifold. `npm run gen`.
- `freecad-src/` — the FreeCAD-authored templates' source `.FCStd` files
  and their generator scripts (currently just `pet-tag`).
- `tools/freecad_export_template.py` — exports a FreeCAD document to
  `templates/<id>/` (`template.json` + mesh `.glb`), same as `gen` does for
  the procedural ones. Run inside FreeCAD or via FreeCADCmd.
- `scripts/sync-published.mts` — **publishing**. Mirrors every template
  whose `template.json` doesn't have `"published": false` into
  `/hdd2/mem3d/templates`, the directory the mem3d site's container
  actually mounts (read-only). Anything no longer published gets removed
  from there too. `npm run sync`.

## Workflow

1. Author or edit a template under `templates/<id>/` (via `npm run gen`,
   the FreeCAD export tool, or by hand) or a whole new template.
2. Leave `"published": false` in its `template.json` while it's a draft —
   editing files here never touches the live site by itself.
3. When it's ready: remove that flag (or set it `true`) and `npm run sync`.
   No site rebuild, no container restart — the site's own
   `TemplateCatalogue` rescans on file mtime.
4. Commit. This repo is the history of what's been published and when,
   independent of the mem3d app's own commit history.
