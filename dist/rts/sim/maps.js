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
};
