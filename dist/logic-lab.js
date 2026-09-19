const bit = (v) => (v ? 1 : 0);
export const LOGIC_GATES = Object.freeze({
  AND: 'AND',
  OR: 'OR',
  XOR: 'XOR',
  NAND: 'NAND',
  NOR: 'NOR',
  NOT: 'NOT A',
});
export function gateOutput(gate, a, b = false) {
  a = !!a;
  b = !!b;
  switch (gate) {
    case 'AND':
      return a && b;
    case 'OR':
      return a || b;
    case 'XOR':
      return a !== b;
    case 'NAND':
      return !(a && b);
    case 'NOR':
      return !(a || b);
    case 'NOT':
      return !a;
    default:
      throw Error('Unknown logic gate.');
  }
}
export function truthTable(gate) {
  return [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ].map(([a, b]) => ({ a, b, out: bit(gateOutput(gate, a, b)) }));
}
export function fullAdder(a, b, carryIn) {
  a = !!a;
  b = !!b;
  carryIn = !!carryIn;
  const first = a !== b;
  return { sum: bit(first !== carryIn), carry: bit((a && b) || (carryIn && first)) };
}
export function numberFormats(value) {
  const decimal = Math.max(0, Math.min(999999999, Math.trunc(Number(value) || 0)));
  return { decimal, binary: decimal.toString(2), hex: '0x' + decimal.toString(16).toUpperCase() };
}
export const LOGIC_RULES = Object.freeze({
  battery: { name: 'LOW BATTERY AND AWAY FROM BASE → RETURN', gate: 'AND' },
  weather: { name: 'RAIN OR HIGH WIND → LIMIT SPEED', gate: 'OR' },
  tracking: { name: 'ENEMY DETECTED AND SIGNAL GOOD → TRACK', gate: 'AND' },
});
