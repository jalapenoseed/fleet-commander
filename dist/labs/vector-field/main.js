import * as THREE from "../../three.js";

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07101a, 0.018);
const camera = new THREE.PerspectiveCamera(52, innerWidth/innerHeight, .1, 500);
camera.position.set(0, 38, 42);
camera.lookAt(0,0,0);

scene.add(new THREE.HemisphereLight(0x9fd8ff,0x090b0d,2.0));
const sun = new THREE.DirectionalLight(0xffffff,3.2);
sun.position.set(15,28,14); scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(31,96),
  new THREE.MeshStandardMaterial({color:0x0a141d,roughness:.92,metalness:.08,transparent:true,opacity:.92})
);
floor.rotation.x=-Math.PI/2; floor.position.y=-.12; scene.add(floor);
const grid = new THREE.GridHelper(60,30,0x29445d,0x14283a);
grid.material.transparent=true; grid.material.opacity=.45; scene.add(grid);

const obstacleData=[
  {x:-9,z:-5,r:3.1},{x:5,z:-8,r:2.7},{x:10,z:4,r:3.4},{x:-5,z:9,r:2.5}
];
for(const o of obstacleData){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(o.r,o.r*.92,2.2,32),new THREE.MeshStandardMaterial({color:0x263849,roughness:.5,metalness:.5}));
  mesh.position.set(o.x,1,o.z); scene.add(mesh);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(o.r+.25,.06,8,48),new THREE.MeshBasicMaterial({color:0xff8d5c,transparent:true,opacity:.55}));
  ring.rotation.x=Math.PI/2; ring.position.set(o.x,.08,o.z); scene.add(ring);
}

const target = new THREE.Group();
const targetCore = new THREE.Mesh(new THREE.SphereGeometry(.7,24,16),new THREE.MeshStandardMaterial({color:0x8df0ff,emissive:0x1aa8c5,emissiveIntensity:4,roughness:.15}));
const targetRing = new THREE.Mesh(new THREE.TorusGeometry(1.7,.08,10,64),new THREE.MeshBasicMaterial({color:0x8df0ff,transparent:true,opacity:.7}));
targetRing.rotation.x=Math.PI/2; target.add(targetCore,targetRing); target.position.set(7,.55,7); scene.add(target);

const N=100;
const positions=[], velocities=[], agents=[];
const agentGeo=new THREE.ConeGeometry(.18,.6,6); agentGeo.rotateX(Math.PI/2);
const agentMat=new THREE.MeshStandardMaterial({color:0xd8f6ff,emissive:0x2b7d99,emissiveIntensity:1.4,roughness:.38,metalness:.28});
const trailGeo=new THREE.BufferGeometry();
const trailPositions=new Float32Array(N*2*3);
trailGeo.setAttribute("position",new THREE.BufferAttribute(trailPositions,3));
const trailMat=new THREE.LineBasicMaterial({color:0x5ed9ff,transparent:true,opacity:.28});
const trailLines=new THREE.LineSegments(trailGeo,trailMat); scene.add(trailLines);

function randomPos(){
  const a=Math.random()*Math.PI*2, r=8+Math.random()*18;
  return new THREE.Vector3(Math.cos(a)*r,.32,Math.sin(a)*r);
}
for(let i=0;i<N;i++){
  const p=randomPos(), v=new THREE.Vector3((Math.random()-.5)*2,0,(Math.random()-.5)*2);
  positions.push(p); velocities.push(v);
  const m=new THREE.Mesh(agentGeo,agentMat); m.position.copy(p); scene.add(m); agents.push(m);
}

const arrowGroup=new THREE.Group(); scene.add(arrowGroup);
const arrows=[];
for(let x=-24;x<=24;x+=4){
  for(let z=-24;z<=24;z+=4){
    const a=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(x,.08,z),1,0x4f8ab4,.28,.12);
    a.line.material.transparent=true; a.line.material.opacity=.35;
    a.cone.material.transparent=true; a.cone.material.opacity=.45;
    arrowGroup.add(a); arrows.push(a);
  }
}

const ui={};
for(const id of ["attraction","vortex","separation","avoid","wind","damping","vectors","trails"]) ui[id]=document.querySelector("#"+id);
for(const id of ["attraction","vortex","separation","avoid","wind","damping"]){
  const out=document.querySelector("#"+id+"Out");
  const sync=()=>out.textContent=Number(ui[id].value).toFixed(id==="damping"?2:1);
  ui[id].addEventListener("input",sync); sync();
}
ui.vectors.addEventListener("change",()=>arrowGroup.visible=ui.vectors.checked);
ui.trails.addEventListener("change",()=>trailLines.visible=ui.trails.checked);

let paused=false, collisions=0, pointerTarget=false;
const tmp=new THREE.Vector3(), tmp2=new THREE.Vector3(), force=new THREE.Vector3();
const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);

function params(){
  return {
    attraction:+ui.attraction.value,vortex:+ui.vortex.value,separation:+ui.separation.value,
    avoid:+ui.avoid.value,wind:+ui.wind.value,damping:+ui.damping.value
  };
}
function fieldAt(pos, index=-1){
  const p=params(); force.set(0,0,0);
  tmp.subVectors(target.position,pos); tmp.y=0;
  const d=Math.max(1,tmp.length());
  force.addScaledVector(tmp.normalize(),p.attraction*Math.min(1,d/8));
  tmp2.set(-tmp.z,0,tmp.x);
  force.addScaledVector(tmp2,p.vortex/(1+d*.12));
  force.x+=p.wind;

  for(const o of obstacleData){
    tmp.set(pos.x-o.x,0,pos.z-o.z);
    const od=tmp.length(), reach=o.r+4.2;
    if(od<reach) force.addScaledVector(tmp.normalize(),p.avoid*(1-od/reach));
  }
  if(index>=0){
    for(let j=0;j<N;j++){
      if(j===index) continue;
      tmp.subVectors(pos,positions[j]); tmp.y=0;
      const sd=tmp.length();
      if(sd>0.001&&sd<2.2) force.addScaledVector(tmp.normalize(),p.separation*(1-sd/2.2));
    }
  }
  return force;
}
function reset(){
  collisions=0;
  for(let i=0;i<N;i++){positions[i].copy(randomPos()); velocities[i].set((Math.random()-.5)*1.5,0,(Math.random()-.5)*1.5);}
}
document.querySelector("#reset").addEventListener("click",reset);
const pauseBtn=document.querySelector("#pause");
function togglePause(){paused=!paused;pauseBtn.textContent=paused?"Resume":"Pause";}
pauseBtn.addEventListener("click",togglePause);

const modes=document.querySelectorAll(".mode"), lesson=document.querySelector("#lesson"), dev=document.querySelector("#devPanel");
modes.forEach(b=>b.addEventListener("click",()=>{
  modes.forEach(x=>x.classList.remove("active")); b.classList.add("active");
  lesson.classList.toggle("hidden",b.dataset.mode!=="learn");
  dev.classList.toggle("hidden",b.dataset.mode!=="dev");
}));

let yaw=0,pitch=.72,distance=56,dragging=false,lastX=0,lastY=0;
function updateCamera(){
  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  camera.position.set(Math.sin(yaw)*cp*distance,sp*distance,Math.cos(yaw)*cp*distance);
  camera.lookAt(0,0,0);
}
updateCamera();

canvas.addEventListener("pointerdown",e=>{dragging=true;pointerTarget=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener("pointermove",e=>{
  if(!dragging) return;
  const dx=e.clientX-lastX,dy=e.clientY-lastY; lastX=e.clientX;lastY=e.clientY;
  if(Math.hypot(dx,dy)>3) pointerTarget=true;
  yaw-=dx*.006; pitch=Math.max(.25,Math.min(1.35,pitch-dy*.006)); updateCamera();
});
canvas.addEventListener("pointerup",e=>{
  dragging=false; canvas.releasePointerCapture(e.pointerId);
  if(pointerTarget) return;
  const r=canvas.getBoundingClientRect();
  mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  raycaster.setFromCamera(mouse,camera);
  const hit=new THREE.Vector3();
  if(raycaster.ray.intersectPlane(plane,hit)){hit.y=.55;target.position.copy(hit);}
});
canvas.addEventListener("wheel",e=>{distance=Math.max(24,Math.min(90,distance+e.deltaY*.03));updateCamera()},{passive:true});
addEventListener("keydown",e=>{if(e.code==="Space"){e.preventDefault();togglePause()} if(e.key.toLowerCase()==="r")reset()});

const clock=new THREE.Clock();
let frames=0,lastStats=0;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(.03,clock.getDelta());
  const time=clock.elapsedTime;
  targetRing.rotation.z=time*.4;
  targetCore.scale.setScalar(1+Math.sin(time*3)*.08);

  if(!paused){
    const p=params();
    let avg=0,near=0;
    for(let i=0;i<N;i++){
      const pos=positions[i], vel=velocities[i], old=pos.clone();
      const f=fieldAt(pos,i).clone();
      vel.addScaledVector(f,dt);
      vel.multiplyScalar(Math.exp(-p.damping*dt));
      const speed=vel.length();
      if(speed>7) vel.multiplyScalar(7/speed);
      pos.addScaledVector(vel,dt);

      const radial=Math.hypot(pos.x,pos.z);
      if(radial>29){tmp.set(pos.x,0,pos.z).normalize();vel.reflect(tmp).multiplyScalar(.7);pos.x=tmp.x*28.8;pos.z=tmp.z*28.8;}
      for(const o of obstacleData){
        const dx=pos.x-o.x,dz=pos.z-o.z,d=Math.hypot(dx,dz);
        if(d<o.r+.3){collisions++;const nx=dx/(d||1),nz=dz/(d||1);pos.x=o.x+nx*(o.r+.35);pos.z=o.z+nz*(o.r+.35);vel.x+=nx*2;vel.z+=nz*2;}
      }
      avg+=vel.length(); if(pos.distanceTo(target.position)<4) near++;
      const m=agents[i]; m.position.copy(pos);
      if(vel.lengthSq()>.01)m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),vel.clone().normalize());
      trailPositions[i*6]=old.x;trailPositions[i*6+1]=.24;trailPositions[i*6+2]=old.z;
      trailPositions[i*6+3]=pos.x;trailPositions[i*6+4]=.24;trailPositions[i*6+5]=pos.z;
    }
    trailGeo.attributes.position.needsUpdate=true;
    if(time-lastStats>.15){
      document.querySelector("#speedStat").textContent=(avg/N).toFixed(2);
      document.querySelector("#collisionStat").textContent=collisions;
      document.querySelector("#goalStat").textContent=Math.round(near/N*100)+"%";
      lastStats=time;
    }
  }

  if(frames++%3===0 && arrowGroup.visible){
    for(const a of arrows){
      const f=fieldAt(a.position).clone(); f.y=0;
      const len=Math.min(2.2,.35+f.length()*.2);
      if(f.lengthSq()>.0001)a.setDirection(f.normalize());
      a.setLength(len,.22,.1);
    }
  }
  dev.textContent=JSON.stringify({target:{x:+target.position.x.toFixed(2),z:+target.position.z.toFixed(2)},params:params(),agents:N,collisions},null,2);
  renderer.render(scene,camera);
}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
addEventListener("resize",resize);resize();animate();
