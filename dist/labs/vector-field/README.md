# Vector Field Playground — Lab 01

A standalone Fleet Commander experiment for making vector fields playable.

## Run

From the repository root:

```bash
npm install
npm run dev
```

Then open:

```
http://localhost:5173/labs/vector-field/
```

## Current slice

- 100 simulated agents on an XZ plane
- draggable/orbitable 3D view
- movable target
- attraction + vortex + separation + obstacle avoidance + wind + damping
- sampled vector arrows
- trails
- collision / speed / target metrics
- Toy, Learn, and Dev display modes
- keyboard reset/pause

## Experiment

Try to move most of the swarm near the target while keeping collisions low. Change one force at a time and observe how the trajectories and sampled vector field respond.

The intent is to evolve this into both an educational visualization and a reusable swarm-behavior laboratory for Fleet Commander.
