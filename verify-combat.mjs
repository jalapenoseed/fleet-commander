import assert from 'node:assert/strict';
import {CommanderSimulation,createCommanderFleet,COMMANDER_OBSTACLES} from './dist/fleet-commander-core.js';
import {CombatSimulation,battleSlot,BATTLE_FORMATIONS} from './dist/combat-simulation.js';
import {DirectorEnvironment} from './dist/director-environment.js';
import {ArenaWeather} from './dist/arena-weather.js';
import {BattleEffects} from './dist/battle-effects.js';
import {ArenaAudio} from './dist/arena-audio.js';
import * as T from './dist/three.js?v=0.6.0';
const ticks=(s,n)=>{for(let i=0;i<n;i++)s.step(1/60);};
for(const n of [2,24,256])for(const shape of Object.keys(BATTLE_FORMATIONS)){const slots=Array.from({length:n},(_,i)=>battleSlot(i,n,'friendly',shape));assert(slots.every(p=>p.every(Number.isFinite)));assert.equal(new Set(slots.map(p=>p.join(','))).size,n);}
const s=new CommanderSimulation(createCommanderFleet(24,'mixed')),original=JSON.stringify(s.snapshot()),c=new CombatSimulation(s);await c.start();assert.equal(c.bodies.size,24);assert.equal(c.summary().friendly,12);assert.equal(c.summary().enemy,12);
const paused=s.drones.map(d=>[...d.pos]);s.running=false;ticks(s,100);assert.deepEqual(s.drones.map(d=>d.pos),paused);s.running=true;
assert.throws(()=>s.apply(s.snapshot()),/Exit combat/);assert.throws(()=>s.startChallenge('hunt'),/Exit combat/);
c.engage();ticks(s,1800);assert(c.impacts>0);assert(c.summary().wrecks>0);assert(c.detonations>0);assert(s.drones.every(d=>[...d.pos,...d.velocity,d.health].every(Number.isFinite)));assert(s.drones.filter(d=>d.mode==='WRECK').every(d=>d.pos[1]<35));
const wreck=s.drones.find(d=>['FALLING','WRECK'].includes(d.mode));assert(wreck.physicsQuaternion);const mode=wreck.mode;s.launch();assert.equal(wreck.mode,mode);s.recharge();assert.equal(wreck.health,0);
c.ceaseFire();assert(!c.engaged);c.exit();assert.equal(JSON.stringify(s.snapshot()),original);assert(s.drones.every(d=>d.mode==='DOCK'&&d.health===undefined));
// Isolated CCD impact against a building, with actual dynamic response.
s.load(createCommanderFleet(2));await c.start();const d=s.drones[0],b=c.bodies.get(d.id).body,wall=COMMANDER_OBSTACLES[0];b.setTranslation({x:wall.x-wall.w-2,y:4,z:wall.z},true);b.setLinvel({x:70,y:0,z:0},true);d.pos=[wall.x-wall.w-2,4,wall.z];d.velocity=[70,0,0];c.engaged=false;ticks(s,6);assert(d.health<100);assert(d.pos[0]<wall.x+wall.w,'cannot tunnel through building');
// A wreck accelerates downward and stays collidable on the ground.
const f=s.drones[1],fb=c.bodies.get(f.id).body;fb.setTranslation({x:0,y:35,z:0},true);fb.setLinvel({x:0,y:0,z:0},true);f.pos=[0,35,0];c.damage(f,100);ticks(s,60);assert(f.pos[1]<32&&f.velocity[1]<-5);ticks(s,600);assert.equal(f.mode,'WRECK');assert(f.pos[1]>=0&&f.pos[1]<1.5);c.exit();
// Payload contact explosion, ammo, cooldown, and explicit friendly blast toggle.
s.load(createCommanderFleet(2));await c.start();const bomber=s.drones[0],target=s.drones[1];const move=(drone,p)=>{drone.pos=[...p];c.bodies.get(drone.id).body.setTranslation({x:p[0],y:p[1],z:p[2]},true);c.bodies.get(drone.id).body.setLinvel({x:0,y:0,z:0},true);};move(bomber,[0,9,0]);move(target,[0,1,0]);bomber.cooldown=0;assert(c.drop(bomber.id));assert.equal(bomber.ammo,2);assert(!c.drop(bomber.id));const p=c.payloads[0];p.body.setTranslation({x:0,y:.1,z:0},true);c.tick(1/60);assert.equal(c.payloads.length,0);assert(target.health<100);assert.equal(bomber.health,100);c.exit();
const scene=new T.Scene(),r={},env=new DirectorEnvironment(scene,r);env.setSky('blackout');assert.equal(env.hemisphere.intensity,0);assert.equal(env.sunlight.intensity,0);assert.equal(scene.environmentIntensity,0);assert(env.stars.visible);assert.equal(env.skyUniforms.blackout.value,1);assert(env.lights.every(l=>l.intensity===0));env.dispose();
const weather=new ArenaWeather(scene);weather.strike({x:0,y:2,z:200});assert(weather.events[0].time>weather.time);assert(weather.bolt.geometry.drawRange.count>44);weather.update(.01,{reducedMotion:true});assert.equal(weather.light.intensity,0);const t=weather.time;weather.update(1,{running:false});assert.equal(weather.time,t);weather.dispose();
const fx=new BattleEffects(scene);fx.update(s,.016);assert.equal(fx.payloads.count,0);fx.dispose();assert.equal(scene.children.length,0);
const tooBig=new CommanderSimulation(createCommanderFleet(257)),large=new CombatSimulation(tooBig);await assert.rejects(()=>large.start(),/2–256/);assert(!large.enabled);
// All supported formations must spawn clear of the practice buildings at maximum capacity.
for(const shape of Object.keys(BATTLE_FORMATIONS)){s.load(createCommanderFleet(256,'mixed'));c.formations={friendly:shape,enemy:shape};await c.start();for(const d of s.drones)for(const box of COMMANDER_OBSTACLES){const radius=c.bodies.get(d.id).radius;if(Math.abs(d.pos[0]-box.x)<box.w+radius&&Math.abs(d.pos[2]-box.z)<box.d+radius)assert(d.pos[1]>box.h+radius);}c.exit();}
// Thunder is heard in arrival order, not strike order, and old sounds are not replayed after mute.
const audio=new ArenaAudio(),heard=[];audio.enabled=true;audio.context={currentTime:0,state:'running'};audio.master={gain:{setTargetAtTime(){}}};audio.event=e=>heard.push(e.id);const sounds={drones:[],running:true},storm={time:2,events:[{id:1,time:3},{id:2,time:2}]};audio.update(sounds,storm);assert.deepEqual(heard,[2]);storm.time=3;audio.update(sounds,storm);assert.deepEqual(heard,[2,1]);audio.enabled=false;storm.events.push({id:3,time:4});audio.update(sounds,storm);audio.enabled=true;storm.time=5;audio.update(sounds,storm);assert.deepEqual(heard,[2,1]);
console.log('PASS: 24-body dogfight, CCD impacts, payload blasts/ammo, gravity wrecks, show isolation, 256-body staging, black sky, reduced lightning and distance-delayed sound events.');
