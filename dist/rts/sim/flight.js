// Multirotor flight model, deterministic.
//
// A drone has throttle, yaw, pitch and roll, just like a real quadcopter:
//   pitch  tilts the nose down/up  -> thrust pushes it forward/back  (accel = g·tan(pitch))
//   roll   tilts sideways          -> thrust pushes it left/right    (accel = g·tan(roll))
//   yaw    spins it on the spot    -> changes where the nose (and its gun) points
//   throttle changes total thrust  -> climb or descend
// Signs are from the pilot's seat: +pitch = nose down, +roll = right side down, +yaw = turn right.
// Drag balances thrust, so top speed is reached at maximum tilt. Tilt and yaw are rate-limited
// per airframe: scouts snap around, heavy assault drones lean slowly.
//
// AI-flown drones use an autopilot that turns a desired velocity into the same attitude targets
// a pilot would set with the sticks. Player-flown drones take stick input directly in "angle
// mode": stick deflection sets the tilt angle, the yaw stick sets turn rate, and the throttle
// stick sets climb rate (centered = hold altitude).

import { dsin, dcos, dtan, datan2, wrapAngle, clamp } from './dmath.js';
import { DT, ROLES, GRAVITY as G } from './defs.js';

export const F_PILOT = 16,
  F_FIRE = 32;
export const STICK_STEPS = 32;
export const MAX_ALTITUDE = 40;
export const MIN_ALTITUDE = 0.4;

// Stick values are quantized so commands are exact and compact on the wire.
export const quantize = (v) => Math.round(clamp(Number(v) || 0, -1, 1) * STICK_STEPS) / STICK_STEPS;

const DRAG = ROLES.map((r) => (G * dtan(r.flight.tilt)) / r.speed);
export const COS_CONE = ROLES.map((r) => dcos(Math.min(r.flight.cone, 3.14159)));

// Advance one drone's attitude, velocity and altitude. (wantVx, wantVz) is the autopilot's
// desired velocity; (faceX, faceZ) is where it would like the nose to point. Returns the
// vertical impact speed if the drone hit the ground this tick (for crash damage), else 0.
export function flightStep(w, i, wantVx, wantVz, faceX, faceZ, jammed) {
  const f = ROLES[w.role[i]].flight,
    drag = DRAG[w.role[i]];
  const tiltMax = f.tilt * (jammed ? 0.7 : 1);
  let yaw = w.yaw[i],
    pitchDes,
    rollDes,
    yawRate,
    vyDes;
  if (w.flags[i] & F_PILOT) {
    const s = i * 4,
      st = w.stick;
    vyDes = st[s] * f.climb * 1.5;
    yawRate = -st[s + 1] * f.yawRate; // +yaw stick turns the nose to the pilot's right
    pitchDes = st[s + 2] * tiltMax;
    rollDes = st[s + 3] * tiltMax;
  } else {
    if (faceX * faceX + faceZ * faceZ > 0.25)
      yawRate = clamp(wrapAngle(datan2(faceX, faceZ) - yaw) * 6, -f.yawRate, f.yawRate);
    else yawRate = 0;
    // Velocity loop with drag feed-forward -> desired acceleration in the world frame.
    const ax = (wantVx - w.vx[i]) * 2.5 + drag * w.vx[i],
      az = (wantVz - w.vz[i]) * 2.5 + drag * w.vz[i];
    // Rotate into the body frame. Nose = (sin yaw, cos yaw); the pilot's right = (-cos yaw, sin yaw).
    const sy = dsin(yaw),
      cy = dcos(yaw);
    pitchDes = clamp(datan2(ax * sy + az * cy, G), -tiltMax, tiltMax);
    rollDes = clamp(datan2(-ax * cy + az * sy, G), -tiltMax, tiltMax);
    vyDes = clamp((f.alt - w.py[i]) * 1.8, -f.climb, f.climb);
  }
  yaw = wrapAngle(yaw + yawRate * DT);
  w.yaw[i] = yaw;
  w.yawRate[i] = yawRate;
  const step = f.tiltRate * DT;
  w.pitch[i] += clamp(pitchDes - w.pitch[i], -step, step);
  w.roll[i] += clamp(rollDes - w.roll[i], -step, step);
  // Thrust vector from attitude, minus drag.
  const sy = dsin(yaw),
    cy = dcos(yaw),
    fa = G * dtan(w.pitch[i]),
    ra = G * dtan(w.roll[i]);
  w.vx[i] += (fa * sy - ra * cy - drag * w.vx[i]) * DT;
  w.vz[i] += (fa * cy + ra * sy - drag * w.vz[i]) * DT;
  w.vy[i] += clamp((vyDes - w.vy[i]) * 5, -14, 14) * DT;
  w.py[i] += w.vy[i] * DT;
  let impact = 0;
  if (w.py[i] < MIN_ALTITUDE) {
    impact = -w.vy[i];
    w.py[i] = MIN_ALTITUDE;
    w.vy[i] = 0;
  } else if (w.py[i] > MAX_ALTITUDE) {
    w.py[i] = MAX_ALTITUDE;
    if (w.vy[i] > 0) w.vy[i] = 0;
  }
  return impact;
}
