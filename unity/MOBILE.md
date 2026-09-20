# Fleet Commander Mobile branch

This branch is the mobile-first Unity variant of Fleet Commander.

## Base

- Branch: `mobile`
- Based on: `unity`
- Engine: Unity 6
- Same simulation, rules, scoring, drone definitions, formations, saves, and original drone assets as the desktop Unity branch.

## Mobile-specific behavior

- Landscape-first orientation with safe-area-aware controls.
- Left virtual stick: planar movement.
- Right drag region: aim / look.
- FIRE, BOOST, UP, DOWN, PULSE, and CAM touch controls.
- One-finger orbit while spectating and two-finger pinch zoom.
- Mobile runtime profile caps the starting quality tier at Medium and can adapt between Very Low, Low, and Medium according to sustained frame rate.
- HDR is disabled on mobile cameras to reduce bandwidth and thermal load.
- Desktop controls remain in the codebase and still work on non-mobile platforms.

## Performance intent

The first mobile target is a stable 60 fps presentation where hardware permits it. Swarm size is treated separately from visual detail so mobile can run the same rules with lower rendering cost.

Recommended initial presentation budgets:

- Low-end phone: 64-128 visible drones
- Mid-range phone: 128-256 visible drones
- High-end phone/tablet: 256-512 visible drones
- Larger simulations should use simplified/instanced presentation rather than one high-detail renderer per drone.

These are presentation budgets, not hard simulation limits.

## Build commands

From `unity/Tools`:

```powershell
.\Build-Mobile.ps1 -Platform Android
```

On a Mac with Unity iOS Build Support installed:

```powershell
.\Build-Mobile.ps1 -Platform iOS
```

Android output: `unity/Builds/Mobile/Android/FleetCommander.apk`

iOS output: `unity/Builds/Mobile/iOS` (Xcode project; final signing/archive is done with Xcode).

## Device testing

Do not treat Editor touch simulation as final acceptance. Validate on physical devices for safe areas, multi-touch flight, thermal throttling, battery drain, sustained frame time, UI legibility, orientation changes, and suspend/resume.