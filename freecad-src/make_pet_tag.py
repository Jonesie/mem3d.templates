"""
Builds templates-src/pet-tag.FCStd: a round pet tag with a hanging hole,
a name zone on top and a phone zone underneath. Run with FreeCADCmd (or
python3 tools/freecad_export_template.py's flatpak invocation).

This is the reference for how to author a template: solids at the top level,
one Part::Plane per text zone labelled ZONE_<id>_<mode>_<depth>, with the
plane's Width (local Y) direction pointing text-up.
"""
import os
import FreeCAD as App
import Part

R, T = 15.0, 2.5           # tag radius, thickness
HOLE_R, HOLE_Y = 2.0, 11.0
RIM_W, RIM_H = 1.5, 1.0     # raised edge width, height

doc = App.newDocument("pet_tag")

disc = doc.addObject("Part::Cylinder", "Disc")
disc.Radius, disc.Height = R, T
hole = doc.addObject("Part::Cylinder", "Hole")
hole.Radius, hole.Height = HOLE_R, T + 2
hole.Placement = App.Placement(App.Vector(0, HOLE_Y, -1), App.Rotation())
tag = doc.addObject("Part::Cut", "Tag")
tag.Base, tag.Tool = disc, hole

# Raised edge: a 1.5 mm wide, 1 mm tall ring around the top face.
rim_outer = doc.addObject("Part::Cylinder", "RimOuter")
rim_outer.Radius, rim_outer.Height = R, RIM_H
rim_outer.Placement = App.Placement(App.Vector(0, 0, T), App.Rotation())
rim_inner = doc.addObject("Part::Cylinder", "RimInner")
rim_inner.Radius, rim_inner.Height = R - RIM_W, RIM_H + 2
rim_inner.Placement = App.Placement(App.Vector(0, 0, T - 1), App.Rotation())
rim = doc.addObject("Part::Cut", "Rim")
rim.Base, rim.Tool = rim_outer, rim_inner

# Two BODY_ solids → a two-part template: the rim can be printed in a
# second colour. They touch at z=T but don't overlap.
tag.Label = "BODY_tag"
tag.addProperty("App::PropertyString", "PartLabel", "Part").PartLabel = "Tag"
rim.Label = "BODY_rim"
rim.addProperty("App::PropertyString", "PartLabel", "Part").PartLabel = "Rim"
rim.addProperty("App::PropertyString", "PartColour", "Part").PartColour = "1"

# Top: name. Part::Plane's Placement is its corner; Length is X, Width is Y.
top = doc.addObject("Part::Plane", "ZoneName")
top.Label = "ZONE_name_engrave_0.8"
top.Length, top.Width = 22, 9
top.Placement = App.Placement(App.Vector(-11, -1 - 4.5, T), App.Rotation())
top.addProperty("App::PropertyString", "Default", "Zone").Default = "Wolfie"
top.addProperty("App::PropertyString", "ZoneLabel", "Zone").ZoneLabel = "Name"
top.addProperty("App::PropertyString", "ZoneColour", "Zone").ZoneColour = "1"

# Top, below the name: an optional adornment (ICON_ prefix), paw by default.
icon = doc.addObject("Part::Plane", "ZoneIcon")
icon.Label = "ICON_icon_engrave_0.8"
icon.Length, icon.Width = 8, 5.5
icon.Placement = App.Placement(App.Vector(-4, -9.5 - 2.75, T), App.Rotation())
icon.addProperty("App::PropertyString", "Default", "Zone").Default = "paw"
icon.addProperty("App::PropertyString", "ZoneLabel", "Zone").ZoneLabel = "Adornment"
icon.addProperty("App::PropertyString", "ZoneColour", "Zone").ZoneColour = "1"

# Underside: phone number, two lines. A hanging tag is flipped about its
# vertical (Y) axis to read the back, so rotate the plane 180° about Y: its
# normal points -Z and its local +Y (text-up) still points toward the hole.
# After the rotation local X runs toward world -X, so the corner is at +12.
bottom = doc.addObject("Part::Plane", "ZonePhone")
bottom.Label = "ZONE_phone_engrave_0.6"
bottom.Length, bottom.Width = 24, 14
bottom.Placement = App.Placement(App.Vector(12, 3 - 7, 0), App.Rotation(App.Vector(0, 1, 0), 180))
bottom.addProperty("App::PropertyString", "Default", "Zone").Default = "101-800-1000\nIf found"
bottom.addProperty("App::PropertyString", "ZoneLabel", "Zone").ZoneLabel = "Phone / message"
bottom.addProperty("App::PropertyString", "MaxLines", "Zone").MaxLines = "2"
bottom.addProperty("App::PropertyString", "Font", "Zone").Font = "OpenSans"
bottom.addProperty("App::PropertyString", "ZoneColour", "Zone").ZoneColour = "1"

doc.recompute()
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pet-tag.FCStd")
doc.saveAs(out)
print("saved", out)
