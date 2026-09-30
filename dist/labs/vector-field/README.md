# Swarm Field Lab — Fleet Commander Lab 02

A mobile-friendly game sandbox for fields, squads, roles and scripted behavior. All ranges, signal effects and tag damage are abstract game rules, not real sensor/weapon modeling.

## Run

```bash
npm install
npm run dev -- --port 5188
```

Open `/labs/vector-field/`. On the current Windows preview, the separate Node server serves this checkout on port **5188**. Port **4173 belongs to Yolk Flip**; do not restart it for this lab.

## Command inspector

- **Squads:** select a squad and edit its role, onboard sensor, formation, play, assigned target, escort teammate, spacing, spin and avoidance/adaptation settings. Deploy a blue or red squad by tapping the arena. Remove a squad to free capacity.
- **Place:** add/move/remove targets and fields. Select a field to edit its type, radius, strength, affected team or enabled state. Add field makes another copy. A short tap places; dragging or pinching moves the camera without placing accidentally.
- **Scripts:** build ordered “when → then” reactions; add/edit/remove animation cues; play, pause, rewind, loop or scrub a formation sequence. Edit the same instructions as validated JSON. Save/load one script slot in this browser; this does not save the arena layout.
- **Forces:** attraction, vortex, separation, obstacle avoidance, wind, damping, formation pull, alignment, cohesion and hazard avoidance. Global forces combine with per-squad orders.
- **Learn:** ELI5 explanations of sensors, field effects, roles, plays, adaptation, reactions and the animator; live explanation for the selected squad and a developer readout.

The inspector starts closed on phones. Portrait uses a bounded bottom pane; landscape and desktop use a side pane. Each section scrolls independently. Drag the arena to orbit, pinch/scroll to zoom, or use Top view and Fit arena. Tap a drone to select its squad; tap a field emitter to edit it.

## Available systems

**Fields (14):** radar, optical, thermal, acoustic, RF, jammer, EMP pulse, damage, elimination, slow, repair, attract, repel, vortex. Fields may affect both teams, blue or red. Their effects remain active when tag combat is off. Strength affects continuous/motion effects; detection zones primarily use their radius and detection rule, and elimination is instant regardless of strength.

**Onboard sensors (5):** radar sees through obstacles; optical requires line of sight; thermal detects moving drones at full range and slow drones nearby; acoustic detects fast movement; RF detects functioning radio links. A squad remembers discovered field emitters until Reset swarm. Optical emitter discovery requires a clear line of sight.

**Roles (6):** scouts move quickly and sense farther; guards and strikers fire tags; jammers disrupt nearby enemies; medics heal nearby active allies; relays reduce jamming for nearby allies. Repair and medics do not revive disabled drones.

**Formations (8):** swarm, wedge, line, column, ring, grid, spiral, diamond. Formation extent is capped to fit the arena. Spin rotates the formation; spacing controls the distance between slots.

**Plays (8):** move, patrol, orbit, pincer, escort, attack, hold, retreat. Patrol visits all targets in list order. Escort requires a friendly squad. Hold stays at the deployment point. Attack/pincer pursue sensed enemies; only guards/strikers fire, and only with tag combat enabled. Retreat heads toward a friendly repair zone when one exists, otherwise home.

**Adaptive behavior:** rule-based hazard clearance, spreading out near known danger, link fallback and low-health retreat. This is inspectable, situational adaptation, not a trained or learning neural model. Avoidance steers around hazards but does not guarantee immunity to overlapping fields or insufficient clearance.

**Scenes:** Free sandbox (44 blue drones), Sensor obstacle course (scouts with relay escort and example reactions), Squad skirmish (80 drones split across four squads, opposing teams, medics, jammers and tag combat). Skirmish has a winner announcement when one team is eliminated. Load replaces the arena; Reset swarm revives/repositions drones and clears observations while preserving fields, targets, squad orders and scripts.

**Limits:** 240 drones, 8 squads, 20 fields, 10 targets; 4–60 drones per new squad, subject to remaining capacity. Disabled drones count toward capacity until their squad is removed or reset.

## Reaction / animator scripts

Each squad has an independent script. Rules check approximately four times per simulated second. The first newly true enabled condition wins; the condition must clear to rearm, and its cooldown must expire before another trigger. Health thresholds only apply to the `hurt` condition. A reaction suppresses timeline cues for at least two seconds or its configured cooldown, whichever is longer. Attack orders do not turn combat on by themselves.

Cues have unique times, formations, plays, spacing and spin. Formation/play changes happen on the cue; spacing and spin interpolate to the following cue. The drones physically move toward formation slots. Scrubbing pauses the selected timeline; global Pause freezes simulation and animation clocks. The example sequence is ring → wedge → grid → spiral.

```json
{
  "rules": [
    { "when": "jammed", "then": "evade", "threshold": 40, "cooldown": 4, "enabled": true },
    { "when": "hurt", "then": "retreat", "threshold": 40, "cooldown": 6, "enabled": true }
  ],
  "cues": [
    { "at": 0, "formation": "ring", "play": "move", "spacing": 1.2, "spin": 0.4 },
    { "at": 8, "formation": "wedge", "play": "patrol", "spacing": 1.7, "spin": 0 }
  ]
}
```

Scripts contain data only; there is no `eval` or arbitrary JavaScript execution. Invalid input is rejected without replacing the working script. Up to 12 rules and 12 cues per squad. Saved scripts use one localStorage slot per browser, with visible errors if storage is unavailable. Copy the JSON text to transfer it between devices.

## Implementation and checks

`simulation.js` holds rendering-independent game rules. `main.js` connects the UI and bundled Three.js renderer. Drone bodies/health bars are instanced; trails and tag beams use shared buffers. No new runtime dependencies or CDN downloads. Versioned module/style URLs avoid stale cached assets on the existing phone preview.

```bash
npm run test:vector
```

Checks cover field effects, team/enabled filters, line of sight, sensing, avoidance, combat gating, medics/relays, formation slots, timeline interpolation, reaction priority/rearming, malformed scripts, capacity limits, a 45-second skirmish, UI placement/editing, squad management, script save/load, scene loading, pause/reset, pinch calculations and viewport resize.

The UI test uses a stub GPU renderer. It does not prove WebGL appearance, iOS safe-area layout or actual touch performance. The cloud browser policy blocked visual QA earlier in this session; real iPhone portrait/landscape verification remains necessary. The running Windows server should be checked for the new HTML, CSS and both JavaScript modules after pulling.

## Design reference

The inspector and mobile controls build on [Human UI Design Skill](https://github.com/Shin1122/Human-UI-Design-Skill), the closest relevant match found for the user's “HumanTouch” helper. The simulation remains the primary screen; controls are grouped by task rather than overlaid over the arena.
