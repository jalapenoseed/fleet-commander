// Fictional drone arena. Payloads and damage are game abstractions, not a
// real-aircraft control or weapons model. Rapier owns collision response.
import {PLANETS} from './planet-physics.js?v=0.8.0';
import {COMMANDER_TYPES,COMMANDER_OBSTACLES} from './fleet-commander-core.js?v=0.8.0';
import {combatSettings,COMBAT_TACTICS,resetCombatBrain,combatDecision,alliedSeparation} from './combat-ai.js?v=0.8.0';
import {squadFor,squadPoint,playbookOrder,validatePlaybook} from './battle-playbook.js?v=0.8.0';
let engine;
const loadEngine=()=>engine??=import('./vendor/rapier.mjs').then(async({default:R})=>{await R.init();return R;});
const vec=p=>({x:p[0],y:p[1],z:p[2]}),arr=p=>[p.x,p.y,p.z];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mag=p=>Math.hypot(...p);
const dead=d=>['FALLING','WRECK'].includes(d.mode);
const attitudeRotation=d=>{const x=d.attitude.pitch/2,y=d.yaw/2,z=d.attitude.roll/2,sx=Math.sin(x),cx=Math.cos(x),sy=Math.sin(y),cy=Math.cos(y),sz=Math.sin(z),cz=Math.cos(z);return {x:sx*cy*cz+cx*sy*sz,y:cx*sy*cz-sx*cy*sz,z:cx*cy*sz-sx*sy*cz,w:cx*cy*cz+sx*sy*sz};};
export const COMBAT_LIMIT=256;
export const BATTLE_FORMATIONS={wedge:'Attack wedge',line:'Wide line',shield:'Shield ring',pincer:'Split pincer'};
export function battleSlot(i,n,side,shape){
 const sign=side==='friendly'?-1:1,base=sign*62,row=Math.floor(i/10),col=i%10-(Math.min(10,n)-1)/2;
 if(shape==='line')return [base+row*sign*7,26+row*5,col*6];
 if(shape==='shield'){const layer=Math.floor(i/20),count=Math.min(20,n-layer*20),a=(i%20)/Math.max(1,count)*Math.PI*2,radius=20+layer*5;return [base+Math.cos(a)*radius,30+layer*6,Math.sin(a)*radius];}
 if(shape==='pincer')return [base+sign*row*6,25+row*5,(i%2?1:-1)*(18+Math.floor(i/2)%10*3)];
 return [base+Math.abs(col)*sign*5+row*6*sign,26+row*5,col*6];
}
export class CombatSimulation{
 constructor(sim){this.sim=sim;this.enabled=false;this.loading=false;this.events=[];this.eventId=0;this.generation=0;this.formations={friendly:'wedge',enemy:'pincer'};this.tactics={friendly:'balanced',enemy:'balanced'};this.settings=combatSettings();this.friendlyFire=false;this.autoPayloads=true;this.engaged=false;this.payloads=[];this.time=0;this.impacts=0;this.detonations=0;sim.combat=this;}
 configure(patch){this.settings=combatSettings({...this.settings,...patch});return this.settings;}
 setTactic(side,tactic){if(!['friendly','enemy'].includes(side)||!Object.hasOwn(COMBAT_TACTICS,tactic))return;this.tactics[side]=tactic;for(const d of this.sim.drones)if(d.combatSide===side&&d.ai)d.ai.nextDecision=0;}
 async start(){
  const sim=this.sim;if(this.enabled||this.loading)throw Error('Combat is already active or loading.');if(sim.challenge&&!sim.challenge.finished)throw Error('Return to free flight before starting combat.');
  if(sim.drones.length<2||sim.drones.length>COMBAT_LIMIT)throw Error('Combat needs 2–256 aircraft. Use Fleet to build a smaller arena roster; shows still support 10,000.');
  this.loading=true;const generation=++this.generation,roster=sim.drones;let R;
  try{R=await loadEngine();}catch(error){this.loading=false;throw Error('Collision engine could not load. Combat was not started; the show sandbox is unchanged.');}
  if(generation!==this.generation||roster!==sim.drones){this.loading=false;return false;}
  this.loading=false;this.seed=sim.snapshot();this.saved=this.seed;this.R=R;this.world=new R.World({x:0,y:-(PLANETS[sim.lab?.planet]?.gravity||9.81),z:0});this.queue=new R.EventQueue(true);this.bodies=new Map();this.colliders=new Map();this.payloads=[];this.events=[];this.time=0;this.battleTime=0;this.finishedAt=null;this.impacts=0;this.detonations=0;this.accumulator=0;this.engaged=false;this.winner='';
  this.world.createCollider(R.ColliderDesc.cuboid(1600,.5,1600).setTranslation(0,-.5,0).setFriction(.85));
  if(sim.fleet.options.obstacles)for(const b of COMMANDER_OBSTACLES)this.world.createCollider(R.ColliderDesc.cuboid(b.w,b.h/2,b.d).setTranslation(b.x,b.h/2,b.z));
  for(const x of [0,12])this.world.createCollider(R.ColliderDesc.cuboid(.5,1.2,.5).setTranslation(x,1.2,62));
  if(this.playbook)this.playbook=validatePlaybook(this.playbook);
  const split=this.playbook?Math.min(sim.drones.length-1,this.playbook.counts.friendly):Math.ceil(sim.drones.length/2);
  sim.drones.forEach((d,i)=>{
   const side=i<split?'friendly':'enemy',index=i<split?i:i-split,n=i<split?split:sim.drones.length-split;
   d.combatSide=side;d.combatIndex=index;d.combatCount=n;d.originalColor=d.color;d.color=side==='friendly'?'cyan':'orange';d.health=100;d.ammo=d.type==='cargo'?6:3;d.cooldown=2+i*.07;d.mode='FLY';d.override='Combat formation';d.combatRetreat=false;d.order='hold';d.pos=battleSlot(index,n,side,this.formations[side]);d.home=[...d.pos];d.home[1]=.7;d.target=[...d.pos];d.velocity=[0,0,0];d.attitude={pitch:0,roll:0};d.yaw=side==='friendly'?Math.PI/2:-Math.PI/2;delete d.physicsQuaternion;
   const squad=squadFor(this.playbook,d);if(squad){d.type=squad.type;d.pos=squadPoint(squad,d);d.home=[...d.pos];d.home[1]=.7;d.ammo=d.type==='cargo'?6:3;}
   const radius=Math.max(.42,COMMANDER_TYPES[d.type].span*.6),mass=d.type==='cargo'?3:1;
   this.clearRoofs(d.pos,radius+3);this.clearRoofs(d.home,radius+.1);d.target=[...d.pos];
   const body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...d.pos).setGravityScale(0).setLinearDamping(.18*(PLANETS[sim.lab?.planet]?.density??1.225)/1.225).setAngularDamping(.8).setCcdEnabled(true));body.lockRotations(true,true);
   const col=this.world.createCollider(R.ColliderDesc.ball(radius).setMass(mass).setFriction(.65).setRestitution(.22).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),body);
   this.bodies.set(d.id,{body,collider:col,radius,mass,drone:d});this.colliders.set(col.handle,{drone:d});
   resetCombatBrain(d);
  });
  // Existing color-group selectors must address the temporary faction colors too.
  sim.fleet.roster.forEach((entry,i)=>entry.color=sim.drones[i].color);
  this.enabled=true;sim.running=true;sim.program.running=false;sim.program.enabled=false;sim.challenge=null;sim.lastResult=null;sim.notice='Two factions ready. Engage to begin the dogfight, or inspect their formations.';return true;
 }
 clearRoofs(position,clearance){if(this.sim.fleet.options.obstacles)for(const box of COMMANDER_OBSTACLES)if(Math.abs(position[0]-box.x)<box.w+clearance&&Math.abs(position[2]-box.z)<box.d+clearance)position[1]=Math.max(position[1],box.h+clearance);return position;}
 emit(type,pos,power=1,extra={}){this.events.push({id:++this.eventId,type,pos:[...pos],power,time:this.time,...extra});if(this.events.length>128)this.events.shift();}
 engage(){if(!this.enabled)return;if(this.winner){this.sim.notice='Round complete. Reset combat or start another AI battle.';return;}this.engaged=true;this.sim.running=true;this.sim.notice='AI dogfight active. Both factions choose targets and fly their own attacks.';}
 ceaseFire(){this.engaged=false;for(const d of this.sim.drones){if(d.battery>=12)d.combatRetreat=false;if(d.ai){d.ai.state='Formation';d.ai.breakUntil=d.ai.evadeUntil=0;}}this.sim.notice='Cease fire. Surviving drones reform; released payloads remain live.';}
 retreat(ids){for(const d of this.sim.drones)if(ids.includes(d.id)&&!dead(d))d.combatRetreat=true;this.sim.notice='Selected survivors are returning to their combat staging pads.';}
 damage(d,amount,cause='Impact',attacker=null){
  if(dead(d)||!Number.isFinite(amount)||amount<=0)return;d.health=Math.max(0,d.health-amount);d.override=cause;
  if(d.health>0)return;const b=this.bodies.get(d.id)?.body;if(!b)return;d.mode='FALLING';d.override='Motors failed';b.resetForces(true);b.setGravityScale(1,true);b.lockRotations(false,true);b.setRotation(attitudeRotation(d),true);const seed=d.combatIndex+1;b.setAngvel({x:1.6+Math.sin(seed)*2,y:.8,z:2.2*Math.cos(seed)},true);this.emit('destroy',d.pos,1,{side:d.combatSide,droneId:d.id,attacker});
 }
 drop(id){
  if(!this.enabled||!this.sim.running)return false;const d=this.sim.drones.find(d=>d.id===id);if(!d||dead(d)||d.mode!=='FLY'||d.ammo<=0||d.cooldown>0||d.pos[1]<3||this.payloads.length>=128)return false;
  d.ammo--;d.cooldown=this.settings.payloadCooldown;const position=[d.pos[0],d.pos[1]-this.bodies.get(d.id).radius-.45,d.pos[2]],R=this.R;
  const body=this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(...position).setLinvel(d.velocity[0],d.velocity[1]-2,d.velocity[2]).setCcdEnabled(true).setLinearDamping(.03*(PLANETS[this.sim.lab?.planet]?.density??1.225)/1.225));
  const col=this.world.createCollider(R.ColliderDesc.ball(.22).setMass(.4).setRestitution(0).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),body);
  const payload={id:'payload-'+(++this.eventId),owner:d.id,side:d.combatSide,body,collider:col,pos:position,born:this.time,hit:false};this.payloads.push(payload);this.colliders.set(col.handle,{payload});this.emit('drop',position,.4);return true;
 }
 explode(payload){
  if(!this.payloads.includes(payload))return;const pos=arr(payload.body.translation());this.emit('explosion',pos,1.4);this.detonations++;
  for(const d of this.sim.drones){if(dead(d)||(!this.friendlyFire&&d.combatSide===payload.side))continue;const delta=d.pos.map((v,j)=>v-pos[j]),distance=mag(delta),radius=11;if(distance>radius)continue;const force=1-distance/radius;this.damage(d,125*force*this.settings.damage,'Payload blast',payload.owner);const b=this.bodies.get(d.id);b.body.applyImpulse(vec(delta.map(v=>v/Math.max(.5,distance)*force*12*b.mass)),true);}
  this.colliders.delete(payload.collider.handle);this.world.removeRigidBody(payload.body);this.payloads.splice(this.payloads.indexOf(payload),1);
 }
 step(dt){
  if(!this.enabled||!this.sim.running)return;this.accumulator+=clamp(dt,0,.05);let steps=0;
  while(this.accumulator>=1/60&&steps++<3){this.tick(1/60);this.accumulator-=1/60;}
 }
 tick(dt){
  const sim=this.sim;this.time+=dt;if(this.engaged)this.battleTime+=dt;sim.elapsed+=dt;this.world.timestep=dt;const previous=new Map(),assignments=new Map(),alive=sim.drones.filter(d=>!dead(d)&&d.mode==='FLY');
  for(const d of sim.drones){
   const entry=this.bodies.get(d.id),b=entry.body;previous.set(d.id,arr(b.linvel()));if(dead(d)||d.mode==='LANDED')continue;
   if(!sim.fleet.options.unlimited)d.battery=Math.max(0,d.battery-dt*(.08+mag(d.velocity)*.003)*sim.fleet.options.batteryDrain);
   if(d.battery<=0){this.damage(d,100,'Battery exhausted');continue;}if(d.battery<12||this.engaged&&d.health<=this.settings.retreatHealth)d.combatRetreat=true;
   d.cooldown=Math.max(0,d.cooldown-dt);let target=this.clearRoofs(battleSlot(d.combatIndex,d.combatCount,d.combatSide,this.formations[d.combatSide]),entry.radius+3);
   if(this.engaged&&!d.combatRetreat){
    const decision=playbookOrder(this.playbook,d,this.battleTime)||combatDecision(d,alive,this.payloads,this.time,this.settings,squadFor(this.playbook,d)?.tactic||this.tactics[d.combatSide],this.autoPayloads,assignments);
    if(decision){target=decision.target;if(decision.drop&&this.drop(d.id))d.ai.breakUntil=this.time+1.2;}d.override=d.ai.state;
   }
   if(d.combatRetreat){target=[...d.home];d.ai.state=d.battery<12?'Battery return':'Retreat';d.override=d.ai.state;}else if(!this.engaged){d.ai.state='Formation';d.override=this.winner?'Round complete':'Formation';}
   target=[clamp(target[0],-200,200),clamp(target[1],d.combatRetreat?entry.radius+.1:3,150),clamp(target[2],-200,200)];d.target=target;
   const velocity=arr(b.linvel()),max=COMMANDER_TYPES[d.type].speed*(.5+d.health*.005)*this.settings.speed,delta=target.map((v,j)=>v-d.pos[j]),distance=mag(delta),speed=Math.min(max,distance*1.7),desired=delta.map(v=>v/Math.max(.01,distance)*speed),separation=alliedSeparation(d,alive),accel=desired.map((v,j)=>(v-velocity[j])*3+separation[j]);
   const a=mag(accel),limit=30*this.settings.speed;if(a>limit)for(let j=0;j<3;j++)accel[j]*=limit/a;b.resetForces(true);b.addForce(vec(accel.map(v=>v*entry.mass)),true);
   if(mag(velocity)>.3)d.yaw=Math.atan2(velocity[0],velocity[2]);d.attitude={pitch:clamp(-accel[2]*.014,-.5,.5),roll:clamp(accel[0]*.014,-.6,.6)};
   if(d.combatRetreat&&distance<.5&&mag(velocity)<1){d.mode='LANDED';d.ai.state='Landed';b.setGravityScale(1,true);b.resetForces(true);}
  }
  this.world.step(this.queue);
  this.queue.drainCollisionEvents((a,b,started)=>{
   if(!started)return;const A=this.colliders.get(a),B=this.colliders.get(b);
   for(const [hit,other]of [[A,B],[B,A]]){
    if(hit?.payload){if(other?.drone?.id===hit.payload.owner&&this.time-hit.payload.born<.25)continue;hit.payload.hit=true;}
    const d=hit?.drone;if(!d||dead(d)||d.mode==='LANDED'||other?.payload)continue;
    const va=previous.get(d.id)||[0,0,0],vb=previous.get(other?.drone?.id)||[0,0,0],speed=mag(va.map((v,j)=>v-vb[j]));
    if(speed<2)continue;this.impacts++;this.damage(d,Math.min(100,(speed-2)*5.5)*this.settings.damage,'Collision',other?.drone?.id);this.emit('impact',d.pos,Math.min(1.5,speed/20));
   }
  });
  for(const d of sim.drones){const b=this.bodies.get(d.id).body;d.pos=arr(b.translation());d.velocity=arr(b.linvel());if(dead(d)){const q=b.rotation();d.physicsQuaternion=[q.x,q.y,q.z,q.w];if(b.isSleeping()||(mag(d.velocity)<.18&&d.pos[1]<1.5)){d.mode='WRECK';d.override='Destroyed / reset combat to repair';}}}
  for(const p of [...this.payloads]){p.pos=arr(p.body.translation());if(p.hit||this.time-p.born>12||p.pos[1]<.25)this.explode(p);}
  if(this.engaged){const force=side=>sim.drones.filter(d=>d.combatSide===side&&d.mode==='FLY'&&!d.combatRetreat),friendly=force('friendly'),enemy=force('enemy'),expired=this.settings.roundSeconds>0&&this.battleTime>=this.settings.roundSeconds;
   if(!friendly.length||!enemy.length||expired){const score=ds=>ds.reduce((n,d)=>n+100+d.health,0),a=score(friendly),b=score(enemy);this.engaged=false;this.finishedAt=this.time;this.winner=a===b?'Draw':a>b?'Friendly victory':'Hostile victory';if(expired)this.winner+=' · time limit';sim.notice=this.winner+'. Wrecks remain until reset.';}
  }
 }
 summary(){const teams={};for(const side of ['friendly','enemy']){const all=this.sim.drones.filter(d=>d.combatSide===side);teams[side]={total:all.length,flying:all.filter(d=>d.mode==='FLY').length,returning:all.filter(d=>d.mode==='FLY'&&d.combatRetreat).length,landed:all.filter(d=>d.mode==='LANDED').length,destroyed:all.filter(dead).length};}return {friendly:teams.friendly.flying,enemy:teams.enemy.flying,teams,wrecks:this.sim.drones.filter(dead).length,payloads:this.payloads.length,impacts:this.impacts,detonations:this.detonations};}
 stop(){this.generation++;this.loading=false;this.enabled=false;this.engaged=false;this.world?.free();this.queue?.free();this.world=null;this.queue=null;this.payloads=[];this.events=[];this.bodies?.clear();this.colliders?.clear();}
 exit(){const saved=this.saved;this.stop();if(saved)this.sim.load(saved);this.sim.notice='Combat ended. Original fleet setup restored.';}
}
