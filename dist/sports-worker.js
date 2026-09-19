import { matchId, simulate, choosePlay, validateConfig } from './sports-sim.js?v=1.0.1';
let canceled = false;
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') {
    canceled = true;
    return;
  }
  if (data.type !== 'run') return;
  canceled = false;
  try {
    const config = validateConfig(data.config),
      records = [...(data.records || [])].slice(-300),
      keys = ['compact', 'wide', 'diamond'];
    const total =
      data.kind === 'compare' ? 18 : Math.min(180, Math.max(1, Number(data.count) || 30));
    for (let i = 0; i < total && !canceled; i++) {
      let next = { ...config, custom: [null, null] };
      if (data.kind === 'compare') {
        next.plays = [keys[Math.floor(i / 6)], keys[Math.floor(i / 2) % 3]];
        next.start = i % 2;
        if (config.mode === 'ctf') next.seed = ((config.seed + (i % 2) - 1) % 2147483647) + 1;
      } else {
        next.seed = ((config.seed + i - 1) % 2147483647) + 1;
        next.start = i % 2;
        next.plays = [0, 1].map((t) => choosePlay(records, config.mode, t, next.seed + t));
      }
      const result = simulate(next).result();
      result.id = matchId();
      records.push(result);
      if (records.length > 300) records.shift();
      self.postMessage({ type: 'result', result, completed: i + 1, total });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    self.postMessage({ type: 'done', canceled });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
