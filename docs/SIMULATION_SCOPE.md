# Fleet Commander simulation scope

This is a fictional game sandbox with an educational, non-combat component ledger. It is not a validated real-world flight or weapon simulator. It does not contain hardware control, weapon design, targeting-model training or real-world tactical optimization interfaces.

## Reference environments

| Environment | Gravity (m/s²) | Representative air density (kg/m³) | Rotor constraint                             |
| ----------- | -------------: | ---------------------------------: | -------------------------------------------- |
| Earth       |           9.81 |                              1.225 | Existing arcade flight controller            |
| Moon        |           1.62 |                                  0 | Conventional rotors cannot lift              |
| Mars        |           3.73 |                              0.016 | Current Earth-style game frames cannot hover |

Moon and Mars constants come from NASA's [Moon Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html) and [Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html), consulted 18 September 2026. Mars density varies with season, location and altitude. The value above is a representative surface value; this build does not resolve that variability. Earth uses standard approximate near-surface values.

Arcade lift bypasses rotor feasibility so the fictional arena remains playable on other worlds. It must not be read as a propulsion solution. Falling bodies use the selected uniform gravity; linear damping scales with representative density. Neither parameter makes the controller a full aerodynamic simulation. Light and visual effects are artistic approximations. Thermal cycling, radiation, pressure-dependent battery behavior, terrain contact outside the flat field and detailed propeller aerodynamics are not implemented.

## Component ledger

The listed frame, motors, propellers, electronics and landing gear masses are illustrative, not a bill of materials for a physical aircraft. Battery assembly mass, inert cargo mass, Wh and baseline W can be entered for educational endurance accounting. Total mass is the sum of the component rows. Weight equals mass multiplied by gravity. A constant-draw energy budget divides Wh by W; it is not a promise of actual flight duration.

In free flight, the optional energy ledger consumes Wh over simulation time, with the existing accelerated-drain control and a simple movement load multiplier. Mass changes the arcade acceleration cap. All four game airframe classes use the same ledger in this first pass; calibrated per-airframe profiles remain future work. The arena keeps its original abstract health, payload and battery balance.

## Replay and memory

Replays store poses and events, not a physics-engine snapshot. They never replace live Rapier bodies. They are sampled at 10 Hz and interpolate between samples; fast impacts may occur between recorded frames. Recreated particles need not exactly match the original frame. Audio is not captured by pose replay; ordinary video recording remains a separate feature.

The journal remembers completed round summaries and ratings on the current browser. Its recommendation explores unplayed scenarios, then balances ratings and variety. It does not learn tactics. Use JSON export to preserve either journal or clips across devices or browser-storage clearing.

## Effects package review

| Candidate                                                           | License shown by source | Possible use                                     | Status                |
| ------------------------------------------------------------------- | ----------------------- | ------------------------------------------------ | --------------------- |
| [Kenney Particle Pack](https://kenney.nl/assets/particle-pack)      | CC0                     | Smoke, hit and spark textures; 80 512×512 assets | Reviewed, not bundled |
| [EffekseerForWebGL](https://github.com/effekseer/EffekseerForWebGL) | MIT                     | Authored animated effects in Three.js/WebGL      | Reviewed, not bundled |

Effekseer's repository also links its newer WebGPU/WebGL implementation. Any integration should pin a release and inspect the licenses of the selected effect data as well as the runtime. The current build uses its own small bounded visual effect pools: 768 particles, 192 cosmetic fragments and 20 shock rings. Wreck meshes remain on the ground until arena reset.

## Next work

1. Test 3D scene appearance, replay cameras and touch drawer behavior on the target iPhone and PC.
2. Add per-airframe civilian endurance profiles with explicit measured-data provenance and uncertainty; keep them out of combat design tooling.
3. Author detachable damaged airframe parts and a small licensed effects texture atlas.
4. Add higher-rate replay capture as an optional memory/performance tradeoff and a replay video-export flow.
5. Improve colliding terrain and obstacle geometry while preserving the existing save formats.
