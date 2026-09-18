// A game scenario recommender. It learns taste/variety from ratings, not targeting,
// weapon effectiveness, aircraft tactics or real-world operation.
export const SCENARIO_NAMES={skirmish:'Mixed skirmish',furball:'Collision dogfight',payload:'Payload hunt',endurance:'Long survival'};
export function journalData(raw){
 if(raw&&(raw.kind!=='fleetcommander-journal'||raw.version!==undefined&&raw.version!==1))throw Error('Choose a Fleet Commander journal.');
 const rows=(raw?.rounds||[]);if(!Array.isArray(rows)||rows.length>100)throw Error('Journal supports up to 100 rounds.');
 const rounds=rows.map(r=>{if(!r||typeof r.id!=='string'||r.id.length>100||!Number.isFinite(r.seconds)||r.seconds<0||r.seconds>10000||!Number.isFinite(r.friendly)||!Number.isFinite(r.enemy)||r.friendly<0||r.enemy<0||r.friendly>256||r.enemy>256||typeof r.result!=='string'||r.result.length>100||!['earth','moon','mars'].includes(r.planet))throw Error('Invalid journal round.');return {id:r.id,preset:Object.hasOwn(SCENARIO_NAMES,r.preset)?r.preset:'custom',seconds:r.seconds,friendly:r.friendly,enemy:r.enemy,result:r.result,planet:r.planet,rating:[-1,0,1].includes(r.rating)?r.rating:0};});
 return {kind:'fleetcommander-journal',version:1,rounds};
}
export function recommendScenario(data){
 const stats=Object.keys(SCENARIO_NAMES).map(key=>{const rounds=data.rounds.filter(r=>r.preset===key);return {key,plays:rounds.length,rating:rounds.reduce((s,r)=>s+r.rating,0)/Math.max(1,rounds.length)};});
 // Untried experiences first, then a bounded mix of preference and variety.
 const untried=stats.find(s=>!s.plays);if(untried)return {key:untried.key,reason:'Try an arena scenario you have not logged yet.'};
 const last=data.rounds.at(-1)?.preset;stats.sort((a,b)=>(b.rating+1/(b.plays+1)-(b.key===last?.8:0))-(a.rating+1/(a.plays+1)-(a.key===last?.8:0)));
 return {key:stats[0].key,reason:'Based on your ratings, with a preference for variety.'};
}
