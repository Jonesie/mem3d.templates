#!/usr/bin/env python3
"""
Export a FreeCAD model as a mem3d template: mesh.glb + template.json.

Author the part in FreeCAD, then for every text zone add a flat rectangle
(Part::Plane is easiest) lying on the target face and give it a Label of

    ZONE_<id>[_<mode>[_<depth>]]        e.g.  ZONE_name_engrave_1.0

  id     zone id (letters, digits, dashes)
  mode   emboss | engrave                (default engrave)
  depth  mm                              (default 1.0)

For an adornment zone (an optional symbol from the library instead of text)
use the prefix ICON_ instead of ZONE_; Default may name a symbol id.

The rectangle's local +Y (its Width direction) is text-up; its extent along
local X is the zone width. The normal is flipped automatically to point out
of the solid, so the plane's own orientation doesn't matter. Optional string
properties on the zone object override UI hints: ZoneLabel, Default, Font,
MaxLines, ZoneColour (default palette index).

Everything else at the top level with a solid shape is fused into one mesh
(PartDesign bodies, Part primitives, booleans...). To make a multi-colour
template instead, label each separately printable solid BODY_<id> — every
one becomes its own part (they must not overlap); a zone belongs to the
part it sits on. Optional string property PartColour (0-based palette
index) on a body, and --colours "#hex,#hex,#hex" for the palette.

Usage (any of):
  python3 tools/freecad_export_template.py model.FCStd --out templates \
      --author your-github-username [--id pet-tag] [--name "Pet Tag"] [--tags pet,tag] [--draft]
  FreeCADCmd tools/freecad_export_template.py      (with MEM3D_MODEL / MEM3D_OUT / MEM3D_AUTHOR env)
  Run as a macro inside FreeCAD on the active document (writes next to it;
  set MEM3D_AUTHOR in the environment first).
"""
import json
import math
import os
import re
import struct
import sys

# --------------------------------------------------------------------------
# Plain-python entry: locate FreeCADCmd and re-run ourselves inside it.
# --------------------------------------------------------------------------

def _main_cli():
    import argparse
    import shutil
    import subprocess

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("model", help=".FCStd file")
    ap.add_argument("--out", required=True, help="templates root; writes <out>/<id>/")
    ap.add_argument("--id", help="template id (default: file stem, slugified)")
    ap.add_argument("--name", help="display name (default: from id)")
    ap.add_argument("--author", required=True, help="your GitHub username/id; mem3d links to it")
    ap.add_argument("--tags", default="", help="comma-separated tags")
    ap.add_argument("--draft", action="store_true", help='write "published": false')
    ap.add_argument("--verified", action="store_true", help='write "verified": true (a real print has been checked)')
    ap.add_argument("--notes", default="", help="a short description of the model, shown in the editor")
    ap.add_argument("--print-instructions", default="", help="Markdown print / assembly instructions (the editor's Print instructions dialog and the zip README)")
    ap.add_argument("--colours", default="", help="suggested palette, comma-separated hex (multi-part templates)")
    ap.add_argument("--deflection", type=float, default=0.05, help="mesh linear deflection, mm")
    a = ap.parse_args()

    env = dict(os.environ,
               MEM3D_MODEL=os.path.abspath(a.model),
               MEM3D_OUT=os.path.abspath(a.out),
               MEM3D_ID=a.id or "",
               MEM3D_NAME=a.name or "",
               MEM3D_AUTHOR=a.author,
               MEM3D_TAGS=a.tags,
               MEM3D_DRAFT="1" if a.draft else "",
               MEM3D_VERIFIED="1" if a.verified else "",
               MEM3D_NOTES=a.notes,
               MEM3D_PRINT_INSTRUCTIONS=a.print_instructions,
               MEM3D_COLOURS=a.colours,
               MEM3D_DEFLECTION=str(a.deflection))

    for cmd in ("FreeCADCmd", "freecadcmd", "freecad-cmd"):
        if shutil.which(cmd):
            argv = [cmd, os.path.abspath(__file__)]
            break
    else:
        if shutil.which("flatpak"):
            # Flatpak only sees the home directory by default.
            argv = ["flatpak", "run", "--filesystem=home", "--command=FreeCADCmd",
                    "org.freecad.FreeCAD", os.path.abspath(__file__)]
        else:
            sys.exit("FreeCADCmd not found (tried PATH and flatpak org.freecad.FreeCAD)")
    r = subprocess.run(argv, env=env)
    sys.exit(r.returncode)


# --------------------------------------------------------------------------
# Inside FreeCAD.
# --------------------------------------------------------------------------

ZONE_RE = re.compile(r"^(ZONE|ICON)_([A-Za-z0-9-]+)(?:_(emboss|engrave))?(?:_([0-9]+(?:\.[0-9]+)?))?$")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def export(doc, out_root, tid, name, author, tags, draft, deflection, colours=(), log=print):
    import FreeCAD
    import Part
    import MeshPart

    zones_src = [o for o in doc.Objects if o.Label.startswith(("ZONE_", "ICON_"))]
    if not zones_src:
        raise SystemExit("no ZONE_* objects found")

    explicit = [o for o in doc.RootObjects if o.Label.startswith("BODY")]
    if explicit:
        # Each BODY_<id> is its own part; a bare "BODY" label means "everything".
        parts = []
        for o in explicit:
            pid = slug(o.Label[5:]) if o.Label.startswith("BODY_") else "body"
            solid = o.Shape
            if len(solid.Solids) != 1:
                solid = solid.removeSplitter()
            if len(solid.Solids) != 1:
                raise SystemExit("%s is not a single solid (%d)" % (o.Label, len(solid.Solids)))
            label = getattr(o, "PartLabel", "") or pid.replace("-", " ").title()
            colour = int(getattr(o, "PartColour", "0") or 0)
            parts.append({"id": pid, "label": label, "solid": solid, "colour": colour})
    else:
        bodies = [o for o in doc.RootObjects
                  if not o.Label.startswith(("ZONE_", "ICON_")) and hasattr(o, "Shape") and o.Shape.Solids]
        if not bodies:
            raise SystemExit("no solid objects found at the top level")
        solid = bodies[0].Shape
        for o in bodies[1:]:
            solid = solid.fuse(o.Shape)
        if len(bodies) > 1:
            solid = solid.removeSplitter()
        if len(solid.Solids) != 1:
            raise SystemExit("bodies do not fuse into a single solid (%d solids)" % len(solid.Solids))
        parts = [{"id": "body", "label": "Body", "solid": solid, "colour": 0}]
    log("parts: " + ", ".join(p["id"] for p in parts))

    zones = []
    for o in zones_src:
        m = ZONE_RE.match(o.Label)
        if not m:
            log("skipping %r: label does not match ZONE_/ICON_<id>[_<mode>[_<depth>]]" % o.Label)
            continue
        kind = "symbol" if m.group(1) == "ICON" else "text"
        zid, mode, depth = m.group(2), m.group(3) or "engrave", float(m.group(4) or 1.0)
        zones.append(zone_from_object(o, zid, kind, mode, depth, parts, log))
    if not zones:
        raise SystemExit("no valid zones")

    out_dir = os.path.join(out_root, tid)
    os.makedirs(out_dir, exist_ok=True)
    multi = len(parts) > 1
    for p in parts:
        mesh = MeshPart.meshFromShape(Shape=p["solid"], LinearDeflection=deflection,
                                      AngularDeflection=math.radians(12), Relative=False)
        mesh.removeDuplicatedPoints()
        if mesh.hasNonManifolds():
            log("WARNING: %s: mesh has non-manifold edges; the app will try to weld them" % p["id"])
        if not mesh.isSolid():
            log("WARNING: %s: mesh is not closed" % p["id"])
        pts, facets = mesh.Topology
        log("mesh %s: %d vertices, %d triangles" % (p["id"], len(pts), len(facets)))
        p["mesh"] = "%s.glb" % p["id"] if multi else "mesh.glb"
        with open(os.path.join(out_dir, p["mesh"]), "wb") as f:
            f.write(write_glb(pts, facets, tid, author))

    tpl = {"id": tid, "name": name, "units": "mm", "tags": tags, "author": author}
    if multi:
        tpl["parts"] = [{"id": p["id"], "label": p["label"], "mesh": p["mesh"], "colour": p["colour"]} for p in parts]
        if colours:
            tpl["colours"] = list(colours)
    else:
        tpl["mesh"] = parts[0]["mesh"]
    tpl["zones"] = zones
    if draft:
        tpl["published"] = False
    if os.environ.get("MEM3D_VERIFIED"):
        tpl["verified"] = True
    if os.environ.get("MEM3D_NOTES"):
        tpl["notes"] = os.environ["MEM3D_NOTES"]
    if os.environ.get("MEM3D_PRINT_INSTRUCTIONS"):
        tpl["printInstructions"] = os.environ["MEM3D_PRINT_INSTRUCTIONS"]
    with open(os.path.join(out_dir, "template.json"), "w") as f:
        json.dump(tpl, f, indent=2)
        f.write("\n")
    log("wrote %s" % out_dir)


def zone_from_object(o, zid, kind, mode, depth, parts, log):
    import FreeCAD
    import Part

    shape = o.Shape
    if shape.Faces:
        face = shape.Faces[0]
    else:  # a sketch: build the face from its wire
        face = Part.Face(Part.Wire(shape.Edges))
    if face.Surface.__class__.__name__ != "Plane":
        raise SystemExit("%s: zone face is not planar" % o.Label)

    origin = face.CenterOfMass
    n = face.normalAt(0, 0)
    n.normalize()
    # Which part is the zone on? The one containing a point just under the
    # face in either direction; that also tells us which way is "in".
    part, inward = None, None
    for p in parts:
        for sgn in (-1, 1):
            if p["solid"].isInside(origin + n * (0.2 * sgn), 1e-6, True):
                part, inward = p, sgn
                break
        if part:
            break
    if part is None:
        raise SystemExit("%s: zone face is not on any body's surface" % o.Label)
    if inward > 0:
        n = -n  # point the normal out of the solid
    # Text-up = the object's local +Y, projected into the face plane.
    up = o.Placement.Rotation.multVec(FreeCAD.Vector(0, 1, 0))
    up = up - n * up.dot(n)
    if up.Length < 1e-6:
        raise SystemExit("%s: local Y is parallel to the normal; rotate the rectangle" % o.Label)
    up.normalize()
    x = up.cross(n)  # right-handed with (x, up, n)

    # Zone box = extent of the face in the (x, up) frame.
    xs = [(v.Point - origin).dot(x) for v in face.Vertexes]
    ys = [(v.Point - origin).dot(up) for v in face.Vertexes]
    width, height = max(xs) - min(xs), max(ys) - min(ys)

    def prop(name, default):
        return getattr(o, name) if hasattr(o, name) and getattr(o, name) != "" else default

    z = {
        "id": zid,
        "label": prop("ZoneLabel", zid.replace("-", " ").title()),
        "kind": kind,
        "part": part["id"],
        "origin": r3(origin), "normal": r3(n), "up": r3(up),
        "width": r1(width), "height": r1(height),
        "mode": mode, "depth": depth,
        "maxLines": int(prop("MaxLines", 1)),
        "default": prop("Default", ""),
    }
    font = prop("Font", "")
    if font:
        z["font"] = font
    zc = prop("ZoneColour", "")
    if zc != "":
        z["colour"] = int(zc)
    log("%-6s %-12s on %-8s %s %.1fmm  %.0fx%.0f at (%.1f, %.1f, %.1f) n=(%.2f, %.2f, %.2f)" % (
        kind, zid, part["id"], mode, depth, width, height, origin.x, origin.y, origin.z, n.x, n.y, n.z))
    return z


def r1(v):
    return round(v, 2)


def r3(v):
    return [round(v.x, 3), round(v.y, 3), round(v.z, 3)]


def write_glb(points, facets, tid="", author=""):
    """Minimal binary glTF: one mesh, float32 positions + uint32 indices."""
    pos = struct.pack("<%df" % (len(points) * 3), *[c for p in points for c in (p.x, p.y, p.z)])
    idx = struct.pack("<%dI" % (len(facets) * 3), *[i for f in facets for i in f])
    pad = lambda b: b + b"\0" * ((4 - len(b) % 4) % 4)
    pos, idx = pad(pos), pad(idx)
    mn = [min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)]
    mx = [max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)]
    gltf = {
        "asset": {
            "version": "2.0", "generator": "mem3d freecad_export_template",
            "copyright": "\u00a9 %s. CC-BY-NC-SA-4.0 (noncommercial, share-alike) \u2014 https://creativecommons.org/licenses/by-nc-sa/4.0/" % author,
            "extras": {"license": "CC-BY-NC-SA-4.0", "author": author,
                       "source": "https://github.com/Jonesie/mem3d.templates/tree/main/templates/%s" % tid},
        },
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(points), "type": "VEC3", "min": mn, "max": mx},
            {"bufferView": 1, "componentType": 5125, "count": len(facets) * 3, "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
            {"buffer": 0, "byteOffset": len(pos), "byteLength": len(idx), "target": 34963},
        ],
        "buffers": [{"byteLength": len(pos) + len(idx)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    bin_ = pos + idx
    total = 12 + 8 + len(js) + 8 + len(bin_)
    return (struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(bin_), 0x004E4942) + bin_)


def _main_freecad():
    import FreeCAD

    model = os.environ.get("MEM3D_MODEL")
    if model:
        doc = FreeCAD.openDocument(model)
        out = os.environ["MEM3D_OUT"]
    elif FreeCAD.ActiveDocument and FreeCAD.ActiveDocument.FileName:
        doc = FreeCAD.ActiveDocument
        model = doc.FileName
        out = os.path.dirname(model)
    else:
        raise SystemExit("save the document first, or run via the CLI")

    stem = os.path.splitext(os.path.basename(model))[0]
    tid = os.environ.get("MEM3D_ID") or slug(stem)
    name = os.environ.get("MEM3D_NAME") or stem.replace("-", " ").replace("_", " ").title()
    author = os.environ.get("MEM3D_AUTHOR")
    if not author:
        raise SystemExit("--author is required (your GitHub username/id)")
    tags = [t.strip() for t in os.environ.get("MEM3D_TAGS", "").split(",") if t.strip()]
    draft = bool(os.environ.get("MEM3D_DRAFT"))
    deflection = float(os.environ.get("MEM3D_DEFLECTION", "0.05"))
    colours = [c.strip() for c in os.environ.get("MEM3D_COLOURS", "").split(",") if c.strip()]
    doc.recompute()
    export(doc, out, tid, name, author, tags, draft, deflection, colours, log=FreeCAD.Console.PrintMessage
           if not model else lambda s: print(s))


try:
    import FreeCAD  # noqa: F401  (only importable inside FreeCAD)
    _IN_FREECAD = True
except ImportError:
    _IN_FREECAD = False

# FreeCADCmd runs scripts with __name__ set to the file stem, the GUI macro
# runner uses __main__, and plain python uses __main__.
if _IN_FREECAD:
    _main_freecad()
elif __name__ == "__main__":
    _main_cli()
