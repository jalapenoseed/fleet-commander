// Deterministic game AI: targets, attack runs, evasive breaks and allied spacing.
export const COMBAT_TACTICS={balanced:'Mixed squadron',interceptor:'Interceptors',bomber:'Payload hunters',evasive:'Evasive skirmishers'};
export const COMBAT_DEFAULTS=Object.freeze({speed:1,damage:1,aggression:.65,evasion:.35,reaction:.4,retreatHealth:15,payloadCooldown:3.5,roundSeconds:120});
const limits={speed:[.4,1.6],damage:[0,2],aggression:[0,1],evasion:[0,1],reaction:[.15,1.5],retreatHealth:[0,60],payloadCooldown:[1,10],roundSeconds:[0,600]};
export function combatSettings(input={}){return Object.fromEntries(Object.entries(COMBAT_DEFAULTS).map(([key,fallback])=>[key,Number.isFinite(input[key])?Math.max(limits[key][0],Math.min(limits[key][1],input[key])):fallback]));}
export const COMBAT_PRESETS={
 skirmish:{name:'Mixed skirmish',description:'Interceptors and payload crews choose targets, evade threats and withdraw when damaged.',count:24,tactics:['balanced','balanced'],formations:['wedge','pincer'],payloads:true,settings:{}},
 furball:{name:'Collision dogfight',description:'Fast interceptors commit to close collisions. No automatic payloads; no damage retreat.',count:32,tactics:['interceptor','interceptor'],formations:['line','wedge'],payloads:false,settings:{speed:1.25,aggression:1,evasion:.1,retreatHealth:0}},
 payload:{name:'Payload hunt',description:'Friendly bombers try overhead drops against an evasive hostile squadron.',count:24,tactics:['bomber','evasive'],formations:['shield','pincer'],payloads:true,settings:{speed:.85,aggression:.55,evasion:.65,damage:.8}},
 endurance:{name:'Long survival',description:'Slower flights, lighter damage and earlier retreats keep the battle going longer.',count:48,tactics:['balanced','evasive'],formations:['shield','line'],payloads:true,settings:{speed:.8,damage:.35,aggression:.4,evasion:.75,retreatHealth:30,roundSeconds:300}}
};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const unit=(x,z)=>{const length=Math.max(.01,Math.hypot(x,z));return [x/length,z/length];};
export function resetCombatBrain(d){d.ai={targetId:'',nextDecision:0,evadeUntil:0,nextEvade:0,breakUntil:0,lastHealth:d.health,state:'Formation',decisions:0};}
export function combatDecision(d,alive,payloads,time,settings,tactic,autoPayloads,assignments=new Map()){
 const brain=d.ai;let enemy=alive.find(o=>o.id===brain.targetId&&o.combatSide!==d.combatSide&&!o.combatRetreat);
 if(!enemy||time>=brain.nextDecision){
  let best=Infinity;enemy=null;for(const other of alive){if(other.combatSide===d.combatSide||other.combatRetreat)continue;
   const score=distance(other.pos,d.pos)*(1+(assignments.get(other.id)||0)*.24)+other.health*(.12*settings.aggression);
   if(score<best){best=score;enemy=other;}
  }
  brain.targetId=enemy?.id||'';brain.nextDecision=time+settings.reaction*(.85+(d.combatIndex%5)*.07);brain.decisions++;
 }
 if(!enemy){brain.state='Regroup';return null;}assignments.set(enemy.id,(assignments.get(enemy.id)||0)+1);
 const dx=enemy.pos[0]-d.pos[0],dz=enemy.pos[2]-d.pos[2],range=distance(enemy.pos,d.pos),[ux,uz]=unit(dx,dz),side=d.combatIndex%2?1:-1;
 const evasion=Math.min(1,settings.evasion+(tactic==='evasive'?.2:0)),hurt=d.health<brain.lastHealth-.5,threat=payloads.some(p=>p.side!==d.combatSide&&p.pos[1]>d.pos[1]&&distance(p.pos,d.pos)<10);
 const chance=(Math.sin(d.combatIndex*31.7+Math.floor(time)*7.1)+1)/2;
 if(time>=brain.nextEvade&&evasion>0&&(hurt||threat||(range<7&&chance<evasion*(1-settings.aggression*.5)))){brain.evadeUntil=time+.5+evasion;brain.nextEvade=time+2.5+settings.aggression*2;}
 brain.lastHealth=d.health;
 if(time<brain.evadeUntil){brain.state='Evade';return {target:[d.pos[0]-uz*side*15,d.pos[1]+4,d.pos[2]+ux*side*15],drop:false};}
 if(time<brain.breakUntil){brain.state='Break away';return {target:[d.pos[0]+ux*12-uz*side*8,d.pos[1]+2,d.pos[2]+uz*12+ux*side*8],drop:false};}
 const bomber=autoPayloads&&d.ammo>0&&(tactic==='bomber'||tactic==='evasive'||tactic==='balanced'&&(d.type==='cargo'||d.type==='engineer'||d.combatIndex%4===0));
 const lead=.12+settings.aggression*.22,target=enemy.pos.map((p,j)=>p+enemy.velocity[j]*lead);
 if(bomber){target[1]+=6;brain.state='Payload run';const drop=Math.hypot(dx,dz)<6&&d.pos[1]>enemy.pos[1]+3&&d.pos[1]<enemy.pos[1]+15&&d.cooldown<=0;return {target,drop};}
 brain.state='Intercept';target[1]+=Math.sin(time*1.1+d.combatIndex)*.3;
 if(settings.aggression<.45&&range<6){brain.breakUntil=time+.7;brain.state='Break away';target[0]-=uz*side*12;target[1]+=3;target[2]+=ux*side*12;}
 return {target,drop:false};
}
export function alliedSeparation(d,alive){const out=[0,0,0];for(const other of alive){if(other===d||other.combatSide!==d.combatSide)continue;const delta=d.pos.map((v,j)=>v-other.pos[j]),dist=Math.hypot(...delta);if(dist>0&&dist<3.6)for(let j=0;j<3;j++)out[j]+=delta[j]/dist*(3.6-dist)*3;}return out;}
