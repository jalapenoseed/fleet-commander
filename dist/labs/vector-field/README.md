# Vector Field Playground — Lab 01

A standalone Fleet Commander experiment for making vector fields playable.

## Run

From the repository root:

```bash
npm install
npm run dev
```

Open `/labs/vector-field/` on the development server. Keep this route when using a LAN preview from a phone.

## Controls

- **Tune field:** opens the inspector. Phones start with it closed so the arena stays visible. Portrait uses a bounded bottom inspector; landscape and desktop use a side inspector.
- **Place target:** tap or drag an open spot in the arena. The target remains inside the boundary and outside obstacles.
- **Camera:** drag to orbit; pinch or scroll to zoom. Top view and Fit arena restore useful viewpoints.
- **Pause / Resume:** freezes agent motion; controls remain usable.
- **Reset swarm:** redistributes the 100 agents and clears contacts and trails, including while paused. It preserves the selected forces and target.
- **Restore default field:** resets all six force parameters. Presets provide balanced, orbital, gathering and crosswind experiments.
- **Toy / Learn / Dev:** changes the inspector detail level. Learn explains forces; Dev shows current parameters and target coordinates.
- **Keyboard:** Space pauses, R resets, Escape closes the inspector and cancels target placement. Keyboard shortcuts do not interfere with focused form controls.

## Simulation

100 agents move on an XZ plane using attraction, vortex, separation, obstacle avoidance, wind and damping. The original force model is preserved. Shared-field arrows omit velocity damping and agent-specific separation; they are not a depiction of each agent's full net force. Contacts count collision resolutions, not unique agents or collisions. Near target means within 4 simulation units.

The arena now has brighter lighting, shadowed obstacles, a distinct amber target, mint directional agents and 24-segment fading trails sampled at 20 Hz. Camera framing follows the actual visible canvas when controls open, close or the screen rotates. Rendering uses the repository's bundled Three.js; no CDN, model download or new runtime dependency is required.

## Design reference

The mobile-first inspector and interaction cleanup apply guidance from [Human UI Design Skill](https://github.com/Shin1122/Human-UI-Design-Skill), especially its mobile UI and anti-AI UI references. This was the closest relevant match found for the requested “HumanTouch” helper. No third-party code or installation script was copied into the project.

## Verification

```bash
node verify-vector-field.mjs
node --check dist/labs/vector-field/main.js
```

The regression script checks the DOM and real Three.js scene/simulation objects with a stub renderer: pause/reset, presets, modes, layers, inspector, target placement, orbit, pinch calculations, canvas resize and finite agent/trail buffers. It does **not** verify GPU rendering or actual touch hardware.

JavaScript bundling and these regressions passed during the redesign. Final visual/browser QA was blocked by the cloud browser security policy. Still check on a real iPhone in portrait and landscape: safe areas, inspector scrolling, target placement, pinch/orbit, frame rate, lighting and context recovery.
