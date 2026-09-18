// Bounded pose playback, independent of live Rapier bodies. No resimulation.
const copy=v=>JSON.parse(JSON.stringify(v));
const eventTimelines=new WeakMap();
const stateDrone=d=>({id:d.id,name:d.name,type:d.type,color:d.color,team:d.team,pos:[...d.pos],velocity:[...d.velocity],target:[...d.target],home:[...d.home],yaw:d.yaw,attitude:{...d.attitude},physicsQuaternion:d.physicsQuaternion?[...d.physicsQuaternion]:undefined,mode:d.mode,battery:d.battery,health:d.health,ammo:d.ammo,combatSide:d.combatSide,combatRetreat:d.combatRetreat,override:d.override,order:d.order,beaconHex:d.beaconHex,ai:d.ai?{targetId:d.ai.targetId,state:d.ai.state}:undefined});
export class ReplayBuffer{
 constructor(){this.frames=[];this.clips=[];this.pending=[];this.lastEvent=0;this.lastSample=-Infinity;this.lastHighlight=-Infinity;this.sequence=0;this.generation=null;this.auto=true;}
 resetRun(sim){this.frames=[];this.pending=[];this.lastSample=-Infinity;this.lastHighlight=-Infinity;this.lastEvent=0;this.generation=sim.combat?.generation;}
 sample(sim){const combat=sim.combat;if(!combat?.enabled||!sim.running||sim.drones.length>256)return;
  if(this.generation!==combat.generation)this.resetRun(sim);const time=combat.time;
  if(time-this.lastSample<.099)return;this.lastSample=time;
  const frame={time,elapsed:sim.elapsed,drones:sim.drones.map(stateDrone),payloads:combat.payloads.map(p=>({id:p.id,side:p.side,pos:[...p.pos]})),events:combat.events.filter(e=>time-e.time<2).map(copy),teams:copy(combat.summary().teams)};
  this.frames.push(frame);while(this.frames.length>180)this.frames.shift();
  if(this.auto){for(const event of combat.events)if(event.id>this.lastEvent){this.lastEvent=event.id;if(['destroy','explosion','impact'].includes(event.type)&&time-this.lastHighlight>2.5){this.mark(event.type==='destroy'?'Aircraft down':event.type==='explosion'?'Blast highlight':'Impact',sim,event.droneId||event.attacker,event.time);}}
   if(time-this.lastHighlight>5){let pair=null,best=Infinity;const live=sim.drones.filter(d=>d.mode==='FLY');for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=live[i],b=live[j];if(a.combatSide===b.combatSide)continue;const dist=Math.hypot(...a.pos.map((v,k)=>v-b.pos[k]));if(dist>1.5&&dist<4&&dist<best&&Math.hypot(...a.velocity.map((v,k)=>v-b.velocity[k]))>7){pair=a;best=dist;}}if(pair)this.mark('Close call',sim,pair.id,time);}
  }
  for(const item of [...this.pending])if(time>=item.end){this.finish(item);this.pending.splice(this.pending.indexOf(item),1);}
 }
 mark(label,sim,subject='',time=sim.combat?.time){if(!Number.isFinite(time)||!this.frames.length)return false;this.lastHighlight=time;this.pending.push({id:++this.sequence,label,subject:subject||sim.drones.find(d=>d.mode==='FLY')?.id||'',time,start:Math.max(this.frames[0].time,time-5),end:time+2,context:{fleet:copy(sim.fleet),program:copy(sim.program),lab:copy(sim.lab||{}),planet:sim.lab?.planet||'earth'}});if(this.pending.length>4)this.pending.shift();return true;}
 finish(item){const frames=this.frames.filter(f=>f.time>=item.start&&f.time<=item.end);if(frames.length<2)return null;const clip={...item,frames:[...frames],start:frames[0].time,end:frames.at(-1).time};this.clips.unshift(clip);this.clips=this.clips.slice(0,6);return clip;}
 captureRecent(sim){if(this.frames.length<2)return null;const end=this.frames.at(-1).time;return this.finish({id:++this.sequence,label:'Manual highlight',subject:sim.drones.find(d=>d.mode==='FLY')?.id||'',time:end,start:Math.max(this.frames[0].time,end-8),end,context:{fleet:copy(sim.fleet),program:copy(sim.program),lab:copy(sim.lab||{}),planet:sim.lab?.planet||'earth'}});}
}
export function replayScene(clip,seconds,live){
 if(!eventTimelines.has(clip)){const events=new Map();for(const frame of clip.frames)for(const event of frame.events)events.set(event.id,event);eventTimelines.set(clip,[...events.values()]);}
 const t=Math.min(clip.end,Math.max(clip.start,clip.start+seconds)),frames=clip.frames;let upper=frames.findIndex(f=>f.time>=t);if(upper<0)upper=frames.length-1;const b=frames[upper],a=frames[Math.max(0,upper-1)],f=b.time===a.time?0:(t-a.time)/(b.time-a.time),byId=new Map(b.drones.map(d=>[d.id,d]));
 const drones=a.drones.map(d=>{const n=byId.get(d.id)||d,r={...d,pos:d.pos.map((v,j)=>v+(n.pos[j]-v)*f),velocity:[...d.velocity],attitude:{...d.attitude}};r.yaw=d.yaw+Math.atan2(Math.sin(n.yaw-d.yaw),Math.cos(n.yaw-d.yaw))*f;if(t>=b.time){r.mode=n.mode;r.health=n.health;r.physicsQuaternion=n.physicsQuaternion;}return r;});
 return {fleet:clip.context.fleet,program:clip.context.program,lab:clip.context.lab,drones,elapsed:a.elapsed+(b.elapsed-a.elapsed)*f,running:true,challenge:null,replay:true,combat:{enabled:true,time:t,generation:'replay-'+clip.id,events:eventTimelines.get(clip).filter(e=>e.time<=t&&t-e.time<2),payloads:a.payloads,summary:()=>({teams:a.teams})},metrics:()=>live.metrics()};
}
export function validateReplay(raw){
 if(raw?.kind!=='fleetcommander-replay'||raw.version!==1||!Array.isArray(raw.clip?.frames)||raw.clip.frames.length<2||raw.clip.frames.length>190)throw Error('Choose a Fleet Commander replay file.');
 const c=raw.clip;if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.end<=c.start||c.end-c.start>20||typeof c.label!=='string'||c.label.length>80||typeof c.subject!=='string')throw Error('Invalid replay timeline.');
 let last=-Infinity;for(const f of c.frames){if(!Number.isFinite(f.time)||f.time<=last||!Number.isFinite(f.elapsed)||!Array.isArray(f.drones)||f.drones.length>256)throw Error('Invalid replay frame.');last=f.time;
  for(const d of f.drones){if(typeof d.id!=='string'||!['scout','relay','cargo','engineer'].includes(d.type)||!['DOCK','QUEUED','FLY','RETURN','LAND','LANDED','FALLING','WRECK'].includes(d.mode)||![d.pos,d.velocity,d.target,d.home].every(p=>Array.isArray(p)&&p.length===3&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<10000))||!Number.isFinite(d.yaw)||!d.attitude||!Number.isFinite(d.attitude.pitch)||!Number.isFinite(d.attitude.roll)||!Number.isFinite(d.battery))throw Error('Invalid replay aircraft.');}
  if(!f.teams?.friendly||!f.teams?.enemy||!Array.isArray(f.events)||f.events.length>128||!Array.isArray(f.payloads)||f.payloads.length>128)throw Error('Invalid replay events.');
  if(new Set(f.drones.map(d=>d.id)).size!==f.drones.length)throw Error('Duplicate replay aircraft.');
  for(const team of [f.teams.friendly,f.teams.enemy])for(const key of ['total','flying','returning','landed','destroyed'])if(!Number.isInteger(team[key])||team[key]<0||team[key]>256)throw Error('Invalid replay team counts.');
  for(const e of f.events)if(!Number.isFinite(e.id)||!['destroy','drop','explosion','impact'].includes(e.type)||!Number.isFinite(e.time)||!Number.isFinite(e.power)||e.power<0||e.power>10)throw Error('Invalid replay event values.');
  for(const d of f.drones)if(d.physicsQuaternion&&(!Array.isArray(d.physicsQuaternion)||d.physicsQuaternion.length!==4||!d.physicsQuaternion.every(v=>Number.isFinite(v)&&Math.abs(v)<=1.001)))throw Error('Invalid replay orientation.');
  for(const p of [...f.events,...f.payloads])if(!Array.isArray(p.pos)||p.pos.length!==3||!p.pos.every(Number.isFinite))throw Error('Invalid replay position.');
 }
 if(Math.abs(c.start-c.frames[0].time)>.01||Math.abs(c.end-c.frames.at(-1).time)>.01||!c.context?.fleet?.options||!c.context?.program?.settings)throw Error('Invalid replay context.');
 return copy(c);
}
