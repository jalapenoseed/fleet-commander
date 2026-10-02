import { dsin, dcos } from './dmath.js';

// Maps are point-symmetric so 1v1 starts are fair: every feature at (x, z) has a twin at (-x, -z).

function mirrored(list) {
  return list.flatMap((p) => [p, { ...p, x: -p.x, z: -p.z }]);
}

export const MAPS = {
  delta: {
    key: 'delta',
    label: 'Delta Basin',
    blurb:
      'Two plateaus split by a rocky basin. Contested wells sit on the flanks and in the middle.',
    half: 80,
    starts: [
      { x: -56, z: 52 },
      { x: 56, z: -52 },
    ],
    wells: [
      ...mirrored([
        { x: -44, z: 56 },
        { x: -58, z: 38 },
        { x: -40, z: 8 },
        { x: -6, z: 48 },
      ]),
      { x: 0, z: 0 },
    ],
    obstacles: [
      ...mirrored([
        { x: -24, z: 24, r: 6 },
        { x: -34, z: -18, r: 5 },
        { x: 14, z: 36, r: 4.5 },
        { x: -12, z: 8, r: 3.5 },
        { x: -64, z: 0, r: 7 },
        { x: -4, z: 66, r: 6.5 },
      ]),
      { x: 30, z: 30, r: 5 },
      { x: -30, z: -30, r: 5 },
    ],
  },
  rivers: {
    key: 'rivers',
    label: 'Twin Rivers',
    blurb: 'Two rock ridges split the field into three lanes. Fords are the only quick way across.',
    half: 88,
    starts: [
      { x: -68, z: 8 },
      { x: 68, z: -8 },
    ],
    wells: [
      ...mirrored([
        { x: -72, z: 30 },
        { x: -66, z: -20 },
        { x: -40, z: 58 },
        { x: -44, z: -52 },
        { x: -6, z: 40 },
      ]),
      { x: 0, z: 0 },
    ],
    // Ridge at x = -24 with fords at z = -34 and z = 22 (mirrored ridge at x = 24).
    obstacles: mirrored(
      [-80, -66, -52, -16, -2, 8, 38, 52, 66, 80].map((z, k) => ({
        x: -24 + (k % 2) * 3,
        z,
        r: 6.5,
      })),
    ),
  },
  crater: {
    key: 'crater',
    label: 'Crater Ring',
    blurb:
      'A ring of rock around a rich central crater with four gates. Hold the middle, win the war.',
    half: 76,
    starts: [
      { x: -54, z: -54 },
      { x: 54, z: 54 },
    ],
    wells: [
      ...mirrored([
        { x: -60, z: -36 },
        { x: -36, z: -62 },
        { x: -8, z: 7 },
        { x: 50, z: -50 },
      ]),
      { x: 0, z: 0 },
    ],
    // Ring of rocks at radius 32, gaps at the four diagonals.
    obstacles: mirrored(
      [10, 25, 65, 80, 100, 115, 155, 170].map((deg) => {
        const a = (deg * 3.141592653589793) / 180;
        return { x: dcos(a) * 32, z: dsin(a) * 32, r: 6 };
      }),
    ),
  },
};
