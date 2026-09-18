import assert from 'node:assert/strict';
import * as T from './dist/three.js';
import {CommanderSimulation,createCommanderFleet} from './dist/fleet-commander-core.js';
import {DIRECTOR_SHOWS,directorShow,showAct} from './dist/director-shows.js';
import {DIRECTOR_STYLES,showPosition} from './dist/show-motion.js';
import {sampleSwarmProgram,programOptions} from './dist/swarm-program.js';
import {DirectorCamera,CINEMATIC_SHOTS} from './dist/director-camera.js';
import {DirectorEnvironment,SCENERIES,SKIES} from './dist/director-environment.js';
for(const n of [1,6,100,2001,5000,10000])for(const style of Object.keys(DIRECTOR_STYLES))for(const t of [0,10,40,95,128]){
 const points=new Set();for(let i=0;i<n;i++){const p=showPosition(style,i,n,t);assert(p.every(Number.isFinite));assert(Math.abs(p[0])<1024&&Math.abs(p[2]-30)<1024&&p[1]+65>1&&p[1]+65<320,`${style}/${n}/${i}: ${p}`);points.add(p.map(x=>x.toFixed(3)).join(','));}assert.equal(points.size,n,`${style} targets are distinct at ${n}`);
}
const sim=new CommanderSimulation(createCommanderFleet(100)),ids=sim.drones.map(d=>d.id);sim.drones[3].battery=56;sim.launch();for(let i=0;i<150;i++)sim.step(.05);
for(const [key,s]of Object.entries(DIRECTOR_SHOWS)){
 const positions=sim.drones.map(d=>[...d.pos]),charge=sim.drones.map(d=>d.battery),bodies=[...sim.drones];sim.apply(directorShow(sim.snapshot(),key));
 assert.deepEqual(sim.drones.map(d=>d.id),ids);assert.deepEqual(sim.drones.map(d=>d.pos),positions);assert.deepEqual(sim.drones.map(d=>d.battery),charge);assert(sim.drones.every((d,i)=>d===bodies[i]));
 for(const [at,style]of s.acts){assert.equal(programOptions(sim.program,ids[0],at+.01).show,style);assert.equal(showAct(key,at+.01).name,s.acts.find(a=>a[0]===at)[2]);assert(sampleSwarmProgram(sim.program,ids[0],{time:at+.01}).target.every(Number.isFinite));}
 assert.equal(programOptions(sim.program,ids[0],s.duration+.01).show,s.acts[0][1]);
 for(const boundary of [...s.acts.slice(1).map(a=>a[0]),s.duration]){const a=sampleSwarmProgram(sim.program,ids[0],{time:boundary-.0001}).target,b=sampleSwarmProgram(sim.program,ids[0],{time:boundary+.0001}).target;assert(Math.hypot(...a.map((v,i)=>v-b[i]))<.02,'smooth act boundary '+key+'/'+boundary);}
}
assert.throws(()=>directorShow(createCommanderFleet(0),'fireworks'),/at least one/);
const cam=new T.PerspectiveCamera(),rig=new DirectorCamera(),d=sim.drones[1];d.pos=[42,80,-17];d.yaw=Math.PI/2;d.attitude={pitch:.1,roll:.25};
assert.equal(rig.update(cam,sim,'fpv',d,.016),d.id);assert(cam.position.distanceTo(new T.Vector3(...d.pos))<2);assert(cam.getWorldDirection(new T.Vector3()).x>.9);assert.equal(cam.fov,88);
rig.update(cam,sim,'ground',d,.016);assert(Math.abs(cam.position.y-1.7)<1e-10);const old=cam.position.clone();rig.keys.add('w');rig.update(cam,sim,'ground',d,.5);assert(cam.position.distanceTo(old)>8);assert(Math.abs(cam.position.y-1.7)<1e-10);rig.look(100,100);assert(!rig.groundAutoAim);rig.resetGround();assert(rig.groundAutoAim);
const labels=[];for(let i=0;i<6;i++){rig.time=i*rig.cutSeconds;rig.update(cam,sim,'cinematic',d,0);assert(cam.position.toArray().every(Number.isFinite));assert(cam.quaternion.toArray().every(Number.isFinite));assert(rig.label.startsWith(CINEMATIC_SHOTS[i]));labels.push(rig.label);if(i===3)assert(sim.drones.some(d=>d.id===rig.hiddenId));}
sim.running=false;const clock=rig.time;rig.update(cam,sim,'cinematic',d,1);assert.equal(rig.time,clock);sim.running=true;sim.fleet.options.reducedMotion=true;rig.update(cam,sim,'cinematic',d,1);assert.equal(rig.time,clock);rig.next();assert(rig.time>clock);
sim.load(createCommanderFleet(0));for(const view of ['fpv','ground','cinematic']){rig.update(cam,sim,view,null,.016);assert(cam.position.toArray().every(Number.isFinite));}
const scene=new T.Scene(),renderer={};const env=new DirectorEnvironment(scene,renderer);for(const key of Object.keys(SCENERIES)){env.setScenery(key);assert(env.backdrop.children.length>0);}for(const key of Object.keys(SKIES)){env.setSky(key);assert(Number.isFinite(renderer.toneMappingExposure));if(key==='lunar')assert.equal(scene.fog,null);else assert(scene.fog.far>scene.fog.near);}env.update(cam);assert(env.dome.position.equals(cam.position));env.dispose();assert.equal(scene.children.length,0);
console.log('PASS: all 4 shows at 1–10,000 distinct targets, full timelines, actual body/energy preservation, selected FPV transform, eye-level walking, 6 cinematic shots, pause/reduced motion, empty cameras, 4 scenery / 6 sky scene construction.');
