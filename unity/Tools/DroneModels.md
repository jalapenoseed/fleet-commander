# Drone asset provenance and build format

The four detailed models are the existing approved **Blender reference pack 02**
meshes used by the browser edition:

| Unity asset | Existing source |
| --- | --- |
| Scout | `dist/assets/drones/GR_SCOUT_01.glb.gz` |
| Relay | `dist/assets/drones/GR_RELAY_01.glb.gz` |
| Cargo | `dist/assets/drones/GR_CARGO_01.glb.gz` |
| Utility | `dist/assets/drones/GR_UTILITY_01.glb.gz` |

No replacement stock model or external mesh download is involved. Geometry,
UVs, normals, original material boundaries, and rotor pivots are retained.
Node transforms are baked. The same 180-degree heading and vertical centering
used by `dist/airframes.js` are applied; models face +Z with +Y up. UV V is
flipped from glTF's image convention to Unity's. Uniform presentation scales
produce widths of 1.6, 2, 3, and 2 visual meters. The source dimensions remain
recorded in `DroneModels.manifest.json`; this is a game presentation scale.

All twelve assets (four frames × three distance levels) now use approved source geometry.
Distance meshes are deterministic material-aware simplifications; see the 1.1 section below.
Rebuild with `python unity/Tools/Generate-DroneModels.py` (Python and NumPy).
The detailed source models are unchanged.

## FCM1 mesh container

The `.fleetmesh` files are deterministic gzip compressed binary, not downloaded
at runtime. `Editor/FleetMeshImporter.cs` imports them into ordinary readable
Unity meshes and a GameObject with semantic child mesh names. Unity includes the
imported resources in player builds; Python and the importer are unnecessary
on a player's machine.

The uncompressed little-endian layout is:

1. Four ASCII bytes `FCM1`.
2. Signed 32-bit surface count.
3. For every surface: signed 32-bit UTF-8 name byte length, name bytes, signed
   32-bit vertex count, signed 32-bit triangle-index count.
4. For that surface: eight 32-bit floats per vertex (position XYZ, normal XYZ,
   UV XY), followed by signed 32-bit triangle indices.

Surfaces are named `Panel`, `Rubber`, `OffWhite`, `Anodized`, `Galvanized`,
`Optical`, `MarkingDark`, `Metal`, `MarkingLight`, `Emission`, `Carbon`, `Copper`,
`Glass`, `Trim`, `Accent`, and `Prop`. All levels retain the semantic material surfaces. Each surface
becomes a separate mesh so the renderer can use GPU instancing and skin materials
without depending on embedded browser material definitions. Original surface
names and the mapping are preserved in the manifest.

The importer checks count bounds and triangle indices, retains mesh readability,
generates tangents from the preserved UVs/normals, and chooses 32-bit indices
when required. Compression keeps source-control and transfer size small without
discarding mesh detail.

## Original surface textures and skins

`Sync-DroneTextures.py` copies the original texture PNGs from
`dist/assets/drones/textures` into `Resources/DroneTextures` without modifying
their bytes. The 48 aircraft textures retain separate albedo, normal, roughness,
metalness, and ambient-occlusion maps; no packed proprietary mask is created.
The unused concrete set stays with the browser source. Import metadata sets
albedo to sRGB, scalar maps to linear, normals to Unity normal-map import, and
repeat/clamp modes to match the original material family.

`DroneRenderer` binds the original material surfaces, adds six paint tints to the
body panels, preserves optics/metal/rubber/carbon/trim, and animates the preserved
rotors on the GPU from simulation time. Detail is selected by projected size, not a fixed cap on detailed aircraft.
Selected aircraft and the current broadcast subject retain full geometry when visible.
Every level keeps separate materials.


## Unity 1.3 distance meshes

All four aircraft now have three geometry levels from the same approved pack. Full source
meshes remain unchanged. `Derive-DroneLODs.py` uses NumPy to cluster original surface
vertices, retaining material names and averaged UVs/normals. Medium meshes keep about
22–31k triangles; far meshes keep 1,478–1,999 triangles. At the far level, collapsed tiny surfaces retain their largest original triangle rather than restoring an entire high-resolution part.
The old boxes/duct proxy meshes and single-material silhouettes are no longer rendered.

High quality uses full geometry at 12 projected pixels, medium at 7 pixels, and far
below that. Selected aircraft use full geometry above 4 pixels; broadcast subjects
above 5. Performance and Maximum detail move those thresholds. Frustum culling
applies before instancing. This prevents nearby aircraft turning into low-detail
proxies while avoiding millions of invisible triangles in a distant swarm.
Every level uses the original separate PBR textures and animated rotor surfaces. These
are visual distance approximations, not alternate source models. Rebuild with:

```sh
python unity/Tools/Generate-DroneModels.py
# or regenerate distance levels only:
python unity/Tools/Derive-DroneLODs.py
```
