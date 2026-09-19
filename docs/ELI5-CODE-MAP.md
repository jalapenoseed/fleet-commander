# Fleet Commander ELI5 code map

This branch is the teaching copy of Fleet Commander. It keeps the working game intact and adds
comments for someone who has never coded before.

You do **not** need to understand every file. Start with one number, make one small change, run the
tests, and then look at the result.

## The five-minute mental model

The game is a set of layers:

1. `dist/index.html` creates the buttons, labels, menus, and number inputs.
2. `dist/fleet-commander.js` connects those controls to the game systems.
3. `dist/fleet-commander-core.js` owns the fleet and advances every drone through time.
4. Formation, Boids, weather, combat, and planet files calculate what should happen next.
5. `dist/fleet-commander-renderer.js` draws the result. Camera files decide where you look from.
6. Replay files save copies of poses and play those copies without changing the live battle.

Think of the simulation as the board game rules and the renderer as the person drawing the board.
Changing how something looks should not silently change the rules, and changing the rules should not
require rebuilding the art.

## Coordinates and measurements

Most world positions look like `[x, y, z]` or `position.set(x, y, z)`:

- `x`: left/right. Negative is left; positive is right.
- `y`: height. `0` is the ground; larger numbers are higher.
- `z`: forward/back. The sign depends on which direction the camera faces, so test a small change.
- World distances are treated as **metres**.
- Speed is normally metres per second.
- Time is normally seconds. Animation frames receive `dt`, meaning the small time since the last frame.
- Angles in game data are often degrees, but Three.js calculations use radians. `Math.PI` is 180°.
- CSS uses screen units such as `px` (pixels), `rem` (text-relative size), `%`, and `dvh` (screen height).

Example: moving something from `[0, 20, -25]` to `[10, 30, -40]` moves it 10 m right, 10 m higher,
and 15 m farther along negative Z.

## Start here: common changes

| What you want to change           | File                               | Search for                             | What the number means                                       |
| --------------------------------- | ---------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| Maximum fleet size                | `dist/fleet-commander-core.js`     | `MAX_COMMANDER_DRONES`                 | Hard simulation limit; currently 10,000                     |
| Fleet/altitude boundary           | `dist/fleet-commander-core.js`     | `FIELD_LIMIT` / `ALTITUDE_LIMIT`       | Allowed metres from the center / above ground               |
| Drone speed and physical span     | `dist/fleet-commander-core.js`     | `COMMANDER_TYPES`                      | Metres per second and approximate metre span                |
| Starting drone count and type mix | `dist/fleet-commander-core.js`     | `createCommanderFleet`                 | The fleet built when no saved fleet is loaded               |
| Starting formation/location       | `dist/fleet-commander-core.js`     | `program.settings` / `objective`       | Shape, height, movement, and first objective                |
| Buildings/obstacles               | `dist/fleet-commander-core.js`     | `COMMANDER_OBSTACLES`                  | Center `x/z`; half-width `w`; half-depth `d`; height `h`    |
| Formation sizes and movement      | `dist/swarm-program.js`            | `DEFAULTS` / `PROGRAM_RANGES`          | Spacing, height, offsets, transition time, field strength   |
| Boids behavior                    | `dist/boids.js`                    | `BOID_DEFAULTS`                        | Separation, alignment, cohesion, radius, and force          |
| Overview camera                   | `dist/fleet-commander-renderer.js` | `this.distance` / `this.center`        | Starting zoom and point the camera looks around             |
| FPV feel                          | `dist/director-camera.js`          | `FPV_DEFAULTS`                         | FOV, look sensitivity, stabilization, smoothing, and tilt   |
| Camera locations                  | `dist/director-camera.js`          | `this.position.set`                    | Camera `x/y/z` positions for each view                      |
| Cinematic cut timing              | `dist/director-camera.js`          | `this.cutSeconds`                      | Seconds before choosing the next cinematic shot             |
| Battle size limit                 | `dist/combat-simulation.js`        | `COMBAT_LIMIT`                         | Maximum physics-driven combat aircraft                      |
| Battle starting positions         | `dist/combat-simulation.js`        | `battleSlot`                           | Formation spacing and altitude for both teams               |
| Battle difficulty                 | `dist/combat-ai.js`                | `COMBAT_DEFAULTS`                      | Speed, damage, aggression, evasion, reaction, and duration  |
| Battle presets                    | `dist/combat-ai.js`                | `COMBAT_PRESETS`                       | Counts, tactics, formations, payload choice, and tuning     |
| Weather                           | `dist/arena-weather.js`            | `WEATHER_DEFAULTS` / `WEATHER_PRESETS` | Rain, wind, direction, fog, lightning, and effect strengths |
| Planet gravity/air                | `dist/planet-physics.js`           | `PLANETS`                              | Gravity in m/s² and representative atmospheric density      |
| Mass and battery model            | `dist/planet-physics.js`           | `LAB_DEFAULTS` / `FRAME_MATERIALS`     | kg, Wh, watts, and optional cargo mass                      |
| Replay memory                     | `dist/replay-buffer.js`            | `0.099` / `180`                        | About 10 samples per second × 180 frames = 18 seconds       |
| Replay speed                      | `dist/simulation-lab-ui.js`        | `REPLAY_SPEEDS`                        | Allowed playback multipliers; `0.125` is ⅛ speed            |
| Sky colors and brightness         | `dist/director-environment.js`     | `PALETTES`                             | Sky, horizon, fog, sun, lighting, and exposure              |
| Graphics cost                     | `dist/scene-postfx.js`             | `GRAPHICS_QUALITY`                     | Resolution, shadows, samples, bloom, and detail distance    |
| Drone light strength              | `dist/swarm-lighting.js`           | `LIGHTING_PRESETS`                     | Beacon, spill, stage, bloom, and exposure                   |
| Menus and visible words           | `dist/index.html`                  | The text you see on screen             | HTML decides what controls exist and their IDs              |
| Screen sizes and layout           | `dist/fleet-commander.css`         | A class name from the HTML             | CSS changes color, width, height, spacing, and text size    |

## Safe recipe: change one measurement

1. Create or switch to your own branch.
2. Find the setting using the table above.
3. Change one value only. Keep the old value in your notes.
4. Run `npm run format`.
5. Run `npm test`.
6. For lighting/shader changes, also run `npm run test:shaders`.
7. Open the game and check the change from more than one camera.

If a value keeps snapping back, search for the same setting name. A validator may intentionally keep
it inside a safe range. Update the default, validation range, and matching HTML input together.

## Safe recipe: move or resize a world object

A box in `COMMANDER_OBSTACLES` looks like this:

```js
{ x: -76, z: -32, w: 12, d: 16, h: 17 }
```

- `x` and `z` move its center across the field.
- `w` is its half-width, so `w: 12` makes it about 24 m wide.
- `d` is its half-depth, so `d: 16` makes it about 32 m deep.
- `h` is its height above the ground.

The renderer and collision system both read this same list. That is important: changing only a visual
mesh can leave an invisible collision box behind, while changing only collision data can create an
invisible wall.

## Safe recipe: add a camera view

1. Add its name to `DIRECTED_VIEWS` in `dist/director-camera.js`.
2. Add a branch in `DirectorCamera.update` that chooses `this.position`, `this.target`, and `fov`.
3. Add the option/button to `dist/index.html` or the appropriate UI module.
4. Make the button call `renderer.setView(yourName)` like the existing views.
5. Add a test next to the camera tests in `verify-director.mjs` or `verify-next-update.mjs`.

Copying a nearby camera and changing its offset is easier than starting with an empty function.

## Safe recipe: add a weather preset

Copy one entry inside `WEATHER_PRESETS` in `dist/arena-weather.js`, give it a new key and visible name,
then change its settings. Values such as rain/fog/lightning are normally `0` to `1`; wind speed is
bounded to `0`–`35`, wind direction is `0`–`360` degrees, and gust is bounded to `0`–`25`.

Keep planet rules in mind: terrestrial rain and lightning are disabled outside Earth by design.

## Safe recipe: add a planet

1. Add the planet to `PLANETS` in `dist/planet-physics.js`.
2. Give it gravity, density, a sky key, a scenery key, and an honest note.
3. Add matching sky/scenery definitions in `dist/director-environment.js`.
4. Decide whether weather and constrained rotors should work there.
5. Add tests for gravity, atmosphere, and scene construction.

## Files you normally should not edit

- `dist/three.js`: third-party Three.js engine bundle.
- `dist/vendor/rapier.mjs`: third-party Rapier physics engine.
- `dist/GLTFLoader.js` and `dist/BufferGeometryUtils.js`: third-party loading/geometry helpers.
- `dist/assets/`: models and textures. Edit their source art rather than random binary bytes.
- `node_modules/`: downloaded packages; changes disappear after reinstalling.

## Tiny JavaScript glossary

- `const`: a named value that will not be reassigned.
- `let`: a named value that can change.
- `function name(...) { ... }`: a reusable set of instructions.
- `class`: a blueprint for objects that hold data and behavior.
- `this`: the current object created from a class.
- `[]`: a list. Positions use three-item lists such as `[x, y, z]`.
- `{}`: an object with named properties such as `{ speed: 24 }`.
- `=>`: a short function.
- `?.`: use a property only if the object exists.
- `??`: use the value on the right only when the value on the left is missing.
- `===`: strict equality comparison.
- `Math.min` / `Math.max`: keep a value below or above a boundary.
- `clamp(value, min, max)`: keep a value between two boundaries.
- `export`: lets another file import and use the value.
- `import`: brings an exported value into the current file.

## Suggested reading order

1. `dist/index.html`
2. `dist/fleet-commander.js`
3. `dist/fleet-commander-core.js`
4. `dist/swarm-program.js`
5. `dist/fleet-commander-renderer.js`
6. `dist/director-camera.js`
7. One focused system such as weather, combat, or replay

Search the repository for `ELI5:` to jump directly to teaching comments beside the important code.

## Rebuilding the project from scratch

Build in this order so each stage is testable:

1. Make an HTML page with one canvas and Launch/Pause/Land buttons.
2. Represent one drone with position, velocity, target, battery, and mode.
3. Add a fixed-step/update loop using `dt`.
4. Add a formation function that returns one target per drone.
5. Add the renderer and overview camera.
6. Add many drones, spatial neighbor lookup, and Boids.
7. Add saved fleet validation before browser storage/import/export.
8. Add weather, lighting, scenery, and audio as separate optional layers.
9. Add combat as a smaller Rapier-driven mode instead of replacing the 10,000-drone show simulation.
10. Add pose recording/replay last, keeping playback isolated from live physics.

That order mirrors how the current code is separated and gives you a working checkpoint after every
major step.
