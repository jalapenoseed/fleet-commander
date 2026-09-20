# Foliage atlas source

`Assets/FleetCommander/Resources/FoliageAtlas.png` was generated with the built-in image-generation tool for this project on 2026-09-20. It is a 1254×1254 RGBA atlas; the original alpha channel is preserved. No external stock asset or photo cutout is bundled.

Prompt: photorealistic game foliage atlas on a transparent background, four whole trees in separate quadrants: Central Texas live oak, alpine fir, golden autumn aspen and scrub oak; neutral diffuse daylight, irregular detailed crowns, visible trunks, no labels/background/cast shadows. Revision: preserve the trees but add a clear transparent cross gutter and shrink each tree to fit its quadrant without touching adjacent trees. The tool's resulting alpha bounding boxes are used as UV rectangles; the bitmap is not cropped or repainted in code.

`SceneGeometry.FoliageCard` selects each rectangle and creates two crossed cards per tree. `FleetFoliage.shader` provides alpha-cutout shadows, lighting and slight wind movement. Alpha coverage is preserved for mipmaps. These cards improve distant forest detail; they are not full walk-around scanned tree meshes.
