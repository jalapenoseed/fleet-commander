# Fleet Commander — Unity Port

This folder is the Unity port of Fleet Commander. The existing web/Vite implementation remains intact on this branch as the behavioral reference.

## Target
- Unity 6
- C#
- Standalone simulation core separated from presentation
- Initial capacity target: 0–2,000 drones, with architecture intended to scale further through Jobs/Burst/GPU instancing
- Full-detail selected/near drones; cheaper distant swarm presentation
- Deterministic fixed-step swarm simulation
- Explicit behavior stack reset/None semantics

## Port order
1. Core swarm state and fixed-step simulation
2. Boids + formation target generation
3. Fleet/group selection and behavior stack
4. Battery/mass/environment models
5. Renderer and beacon instancing
6. FPV/cinematic cameras
7. UI Toolkit command center
8. Save/load/replay
9. Director choreography and drawing/text/image targets
10. Optional Jobs/Burst/Entities acceleration

## Open
Open the `unity` folder as a Unity project.

The first scene can be assembled by adding a `SwarmSimulator` component to an empty GameObject and optionally assigning a simple drone prefab. The simulator can run with zero visual prefab and still maintains simulation state.
