# User-authored GRIDRUNNER scenery

73 runtime assets and 24 albedo textures are converted from the user's original Blender files: 20 Field Camp 02 props, 10 Field Ops 01 props, and 43 Architecture 05 modules / furnished buildings. `Resources/ScenePacks/manifest.json` records each source, triangle count and content hash.

`Export-ScenePacks.py` opens the source files read-only with script execution disabled, evaluates authored modifiers, converts coordinates to Unity, retains UVs / material colors / metallic and smoothness, and groups triangles by material into gzip-compressed FCP1 files. `FleetPropImporter` builds Unity mesh/material prefab assets. Source Blender files are not overwritten. Architecture base-color images are retained; procedural Blender-only nodes are represented by their material inputs. This is not a claim of full Blender shader equivalence.

The original houses and utility buildings populate Juniper Junction, the mountain town, Northline, Harbor Point, creekside and rural scenes. All 30 camp / operations props furnish a compound beside the flight area. Architecture modules remain available as Unity assets for scene authoring. Clothing and the low-grade DJI model are not substituted for the approved high-quality drone pack.
