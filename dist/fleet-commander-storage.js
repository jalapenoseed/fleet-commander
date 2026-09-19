import { validateCommanderFleet } from './fleet-commander-core.js?v=0.9.0';
export const FLEET_STORAGE_KEY = 'fleetcommander.fleets.v1';
export function parseFleetFile(text) {
  if (typeof text !== 'string' || text.length > 2000000)
    throw Error('Fleet files must be smaller than 2 MB.');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Error('This file is not valid JSON.');
  }
  return validateCommanderFleet(raw);
}
export function readFleetLibrary(storage) {
  const text = storage.getItem(FLEET_STORAGE_KEY);
  if (!text) return [];
  if (text.length > 4800000)
    throw Error('Saved fleet library is too large. Export and clear old setups.');
  const raw = JSON.parse(text);
  if (!Array.isArray(raw) || raw.length > 20) throw Error('Saved fleet library could not be read.');
  return raw.map(validateCommanderFleet);
}
export function saveNamedFleet(storage, fleet) {
  const valid = validateCommanderFleet(fleet),
    all = readFleetLibrary(storage),
    i = all.findIndex((f) => f.name === valid.name);
  if (i >= 0) all[i] = valid;
  else {
    if (all.length >= 20)
      throw Error(
        'Twenty fleets are saved. Use an existing name to replace one, or export this fleet.',
      );
    all.push(valid);
  }
  const text = JSON.stringify(all.map(compactFleet));
  if (text.length > 2400000)
    throw Error('Fleet storage is full. Export large fleets as JSON instead.');
  storage.setItem(FLEET_STORAGE_KEY, text);
  return valid;
}

export function compactFleet(fleet) {
  const { fleetIds, groups, activeIds, ...program } = fleet.program;
  return {
    ...fleet,
    program: { ...program, enabled: false, running: false, time: 0, activeIds: [] },
  };
}
