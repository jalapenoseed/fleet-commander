import {bindCameraControls} from './camera-input.js?v=0.8.0';
import {BattleEffects} from './battle-effects.js?v=0.8.0';
import {ArenaWeather} from './arena-weather.js?v=0.8.0';
import {SwarmLighting,lightingSettings} from './swarm-lighting.js?v=0.8.0';
import {ScenePostFX,GRAPHICS_QUALITY} from './scene-postfx.js?v=0.8.0';
import {buildRangeObstacles} from './range-props.js?v=0.8.0';
import {DirectorCamera,DIRECTED_VIEWS} from './director-camera.js?v=0.8.0';
import {CombatHUD} from './combat-hud.js?v=0.8.0';
import {DirectorEnvironment} from './director-environment.js?v=0.8.0';
import * as T from './three.js?v=0.8.0';
import {DroneFleet,makeDrone} from './airframes.js?v=0.8.0';
import {COMMANDER_TYPES,COMMANDER_OBSTACLES,MAX_COMMANDER_DRONES} from './fleet-commander-core.js?v=0.8.0';
import {AircraftBeacons} from './aircraft-beacons.js?v=0.8.0';
import {beaconColor} from './beacon-palette.js?v=0.8.0';

// Reuse the reference airframes. Every mesh part is drawn once per airframe type,
// with instance transforms, rather than cloning a whole model for each drone.
export function instanceParts(model,scene,capacity=MAX_COMMANDER_DRONES){
 model.updateMatrixWorld(true);const parts=[];
 model.traverse(source=>{if(!source.isMesh)return;const mesh=new T.InstancedMesh(source.geometry,source.material,capacity);mesh.count=0;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=capacity<=100;scene.add(mesh);parts.push({mesh,local:source.matrixWorld.clone()});});return parts;
}
const vector=new T.Vector3(),transform=new T.Matrix4(),combined=new T.Matrix4(),rotation=new T.Quaternion(),angles=new T.Euler(0,0,0,'YXZ'),unit=new T.Vector3(1,1,1);
export function fillInstances(parts,drones){for(const part of parts){part.mesh.count=drones.length;drones.forEach((d,i)=>{vector.fromArray(d.pos);angles.set(d.attitude.pitch,d.yaw,d.attitude.roll,'YXZ');if(d.physicsQuaternion)rotation.fromArray(d.physicsQuaternion);else rotation.setFromEuler(angles);transform.compose(vector,rotation,unit);combined.multiplyMatrices(transform,part.local);part.mesh.setMatrixAt(i,combined);});part.mesh.instanceMatrix.needsUpdate=true;}}
export class CommanderRenderer{
 constructor(host,{onObjective=()=>{},onStatus=()=>{}}={}){
  this.host=host;this.onObjective=onObjective;this.onStatus=onStatus;this.view='orbit';this.azimuth=.2;this.elevation=.24;this.distance=310;this.center=new T.Vector3(0,55,-20);this.quality='balanced';this.showGrid=false;this.selected='drone-001';this.detail={};this.proxy={};this.failed=new Set();this.disposed=false;this.lastFleet=null;this.directorCamera=new DirectorCamera();this.clean=false;this.lighting=lightingSettings();this.haze=1;
  const canvas=document.createElement('canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','Fleet practice field. Click to place the objective; use view controls to inspect the swarm.');
  try{this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.setup3D();this.canvas=canvas;this.kind='3D · swarm lighting';}
  catch(error){this.startupError=error.message;this.weather?.dispose();this.weather=null;this.battleEffects?.dispose();this.environment?.dispose();this.swarmLighting?.dispose();this.postfx?.dispose();this.lamps?.dispose();this.renderer?.dispose();this.renderer=null;this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Fleet tactical field. Click to place the objective.');this.ctx=this.canvas.getContext('2d');this.kind='Tactical view · '+(this.startupError?.includes('WebGL')?'WebGL unavailable':'3D initialization failed');}
  this.weather??=new ArenaWeather();this.cameraZoom=1;host.append(this.canvas);this.combatHUD=new CombatHUD(host);this.onStatus(this.kind);this.bindControls();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
 }
 setup3D(){
  this.scene=new T.Scene();this.scene.background=new T.Color('#111e23');this.scene.fog=new T.Fog('#111e23',700,2400);this.camera=new T.PerspectiveCamera(50,1,.08,10000);
  this.renderer.setPixelRatio(Math.min(1.75,devicePixelRatio||1));this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.environment=new DirectorEnvironment(this.scene,this.renderer);this.postfx=new ScenePostFX(this.renderer);this.postfx.setQuality(this.quality);this.weather=new ArenaWeather(this.scene);this.battleEffects=new BattleEffects(this.scene);this.wreckParts={};
  const grid=new T.GridHelper(440,44,0x546260,0x2d3c3e);grid.position.y=.02;this.scene.add(grid);this.grid=grid;
  this.boxes=buildRangeObstacles(COMMANDER_OBSTACLES);this.scene.add(this.boxes);
  // Two fixed flight anchors: a control station and a charger. No rider/world scene.
  this.stationLights=[];for(const [x,color]of [[0,0x73d9c5],[12,0xf4c778]]){const station=new T.Group();const base=new T.Mesh(new T.CylinderGeometry(2.5,2.5,.3,24),new T.MeshStandardMaterial({color:0x364d56,metalness:.4,roughness:.6}));base.position.y=.15;station.add(base);const mast=new T.Mesh(new T.BoxGeometry(.8,2,.8),new T.MeshStandardMaterial({color:0x2d3e45}));mast.position.y=1.2;station.add(mast);const light=new T.Mesh(new T.BoxGeometry(1.1,.18,1.1),new T.MeshBasicMaterial({color}));light.position.y=2.3;station.add(light);this.stationLights.push(light);station.position.set(x,0,62);this.scene.add(station);}
  this.objective=new T.Group();const ring=new T.Mesh(new T.TorusGeometry(11,.18,6,64),new T.MeshBasicMaterial({color:0xf5e6a7}));ring.rotation.x=Math.PI/2;this.objective.add(ring);const ring2=ring.clone();ring2.rotation.x=0;this.objective.add(ring2);this.scene.add(this.objective);
  this.selectedRing=new T.Mesh(new T.TorusGeometry(2,.08,5,24),new T.MeshBasicMaterial({color:0xffffff}));this.selectedRing.rotation.x=Math.PI/2;this.scene.add(this.selectedRing);
  this.swarmLighting=new SwarmLighting(this.scene);this.lamps=new AircraftBeacons(this.scene);this.beacons=this.lamps.points;this.beaconMaterial=this.beacons.material;
  for(const [type,def]of Object.entries(COMMANDER_TYPES)){const proxy=makeDrone(0x929c8f);proxy.scale.setScalar(def.span/1.8);this.proxy[type]=instanceParts(proxy,this.scene);const wreck=proxy.clone(true);wreck.traverse(o=>{if(!o.isMesh)return;o.material=new T.MeshStandardMaterial({color:0x282725,roughness:.95,metalness:.15});o.geometry=o.geometry.clone();const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i);if(x>.2&&z>.1)a.setXYZ(i,x*.65,a.getY(i)-.16,z*.8);}a.needsUpdate=true;o.geometry.computeVertexNormals();});this.wreckParts[type]=instanceParts(wreck,this.scene,256);}
  this.loader=new DroneFleet(new T.Scene());this.loader.setQuality('HIGH');
 }
 async loadType(type){
  if(this.detail[type]||this.failed.has(type))return;if(this.loading?.has(type))return;this.loading??=new Set();this.loading.add(type);
  const ok=await this.loader.load(type);if(this.disposed)return;if(ok){const model=this.loader.records[type].model.clone();model.updateMatrixWorld(true);model.traverse(o=>{if(o.isMesh&&o.material.emissiveIntensity>0)o.material.emissiveIntensity=Math.min(.35,o.material.emissiveIntensity);});this.detail[type]=instanceParts(model,this.scene,100);}else this.failed.add(type);
  this.onStatus(this.kind+(this.failed.size?' · simplified airframes':''));
 }
 resize(){const rect=this.host.getBoundingClientRect();this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);if(this.renderer){this.renderer.setSize(this.width,this.height,false);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();this.postfx?.resize(this.width*this.renderer.getPixelRatio(),this.height*this.renderer.getPixelRatio());}else{const dpr=Math.min(2,devicePixelRatio||1);this.canvas.width=this.width*dpr;this.canvas.height=this.height*dpr;this.ctx?.setTransform(dpr,0,0,dpr,0,0);}}
 setGraphics({quality=this.quality,bloom=.32,wetness=0,clouds=.4,haze=1,grid=false,...lighting}={}){this.lighting=lightingSettings(lighting);this.haze=haze;this.quality=quality in GRAPHICS_QUALITY?quality:'balanced';const q=GRAPHICS_QUALITY[this.quality];this.showGrid=grid;if(!this.renderer)return;const pixelRatio=Math.min(q.pixelRatio,devicePixelRatio||1),resize=pixelRatio!==this.renderer.getPixelRatio();if(resize)this.renderer.setPixelRatio(pixelRatio);if(this.appliedQuality!==this.quality){this.environment.setQuality(q);this.postfx.setQuality(this.quality);this.appliedQuality=this.quality;}this.environment.setLighting(this.lighting);this.environment.setAtmosphere({wetness,clouds,haze});this.swarmLighting.configure(this.lighting,this.quality,wetness);this.postfx.strength=bloom;this.postfx.radius=this.lighting.bloomRadius;if(resize)this.resize();}
 setEnvironment(scenery,sky){this.environment?.setScenery(scenery);this.environment?.setSky(sky);this.blackout=sky==='blackout';for(const light of this.stationLights||[])light.visible=!this.blackout;this.boxes?.traverse(o=>{if(o.material?.emissive){o.material.userData.originalEmission??=o.material.emissiveIntensity;o.material.emissiveIntensity=this.blackout?0:o.material.userData.originalEmission;}});}
 zoomBy(factor){if(!Number.isFinite(factor)||factor<=0)return;if(DIRECTED_VIEWS.includes(this.view)){this.cameraZoom=Math.max(.65,Math.min(4,this.cameraZoom/factor));}else this.distance=Math.max(8,Math.min(1800,this.distance*factor));}
 resetCamera(){this.cameraZoom=1;this.azimuth=.2;this.elevation=.24;this.directorCamera.resetGround();this.setView(this.view);}
 setView(view){this.directorCamera.setView();this.view=view;if(this.camera){this.camera.fov=50;this.camera.updateProjectionMatrix();}this.distance=view==='follow'?20:view==='orbit'?310:240;this.center.set(0,55,-20);}
 bindControls(){
  this.unbindCamera=bindCameraControls(this);
 }
 worldPoint(x,y){
  const altitude=this.lastFleet?.objective?.[1]||28;
  if(this.renderer){const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);const point=new T.Vector3();if(ray.ray.intersectPlane(this.view==='front'?new T.Plane(new T.Vector3(0,0,1),-(this.lastFleet?.objective[2]||0)):new T.Plane(new T.Vector3(0,1,0),-altitude),point))return point.toArray();return this.lastFleet?.objective||[0,28,0];}
  const scale=this.mapScale();if(this.view==='front')return [(x-this.width/2)/scale,Math.max(8,(this.height*.75-y)/scale),this.lastFleet?.objective[2]||0];return [(x-this.width/2)/scale,altitude,(y-this.height*.5)/scale];
 }
 mapScale(){return Math.min(this.width,this.height)/(this.distance*1.2);}
 project(p){const s=this.mapScale();return this.view==='front'?[this.width/2+p[0]*s,this.height*.75-p[1]*s]:[this.width/2+p[0]*s,this.height*.5+p[2]*s];}
 render(sim,dt=1/60){
  this.host.parentElement?.classList.toggle('has-hud',!!sim.combat?.enabled||['fpv','mounted','shoulder'].includes(this.view));
  this.lastFleet=sim.fleet;this.weather.update(dt,{running:sim.running,reducedMotion:sim.fleet.options.reducedMotion,cameraPosition:this.camera?.position});if(!this.renderer){this.drawMap(sim);this.combatHUD.draw(sim,this);return;}
  const selected=sim.drones.find(d=>d.id===this.selected)||sim.drones[0];
  const directed=DIRECTED_VIEWS.includes(this.view);let hiddenId='';
  if(directed)hiddenId=this.directorCamera.update(this.camera,sim,this.view,selected,dt);
  else if(this.view==='follow'&&selected){this.center.fromArray(selected.pos);this.camera.position.copy(this.center).add(new T.Vector3(Math.sin(this.azimuth)*this.distance,Math.sin(this.elevation)*this.distance,Math.cos(this.azimuth)*this.distance));}
  else if(this.view==='top')this.camera.position.set(0,this.distance,1);
  else if(this.view==='front')this.camera.position.set(0,30,this.distance);
  else this.camera.position.copy(this.center).add(new T.Vector3(Math.sin(this.azimuth)*Math.cos(this.elevation)*this.distance,Math.sin(this.elevation)*this.distance,Math.cos(this.azimuth)*Math.cos(this.elevation)*this.distance));
  if(!directed)this.camera.lookAt(this.view==='top'?new T.Vector3():this.view==='front'?new T.Vector3(0,30,0):this.center);this.boxes.visible=sim.fleet.options.obstacles;this.objective.position.fromArray(sim.fleet.objective);this.objective.visible=!(this.view==='front'&&['word','drawing'].includes(sim.program.settings.shape));if(selected)this.selectedRing.position.fromArray(selected.pos);this.selectedRing.visible=!!selected&&this.view==='follow'&&!this.clean;this.objective.visible&&=!this.clean&&!directed;this.grid.visible=this.showGrid&&!this.clean&&!directed;this.environment.update(this.camera,sim.fleet.options.reducedMotion?0:sim.elapsed);
  const large=sim.drones.length>256,live=sim.drones.filter(d=>!['FALLING','WRECK'].includes(d.mode));
  const zoom=directed?this.cameraZoom:1;if(this.camera.zoom!==zoom){this.camera.zoom=zoom;this.camera.updateProjectionMatrix();}if(this.blackout)this.objective.visible=false;
  for(const type of Object.keys(COMMANDER_TYPES)){const drones=live.filter(d=>d.type===type&&d.id!==hiddenId);if(drones.length)this.loadType(type);const near=[],far=[];for(const d of drones){const distance=this.camera.position.distanceTo(vector.fromArray(d.pos));if(this.detail[type]&&distance<GRAPHICS_QUALITY[this.quality].detail&&near.length<(large?24:100))near.push(d);else far.push(d);}fillInstances(this.proxy[type],far);if(this.detail[type])fillInstances(this.detail[type],near);fillInstances(this.wreckParts[type],sim.drones.filter(d=>d.type===type&&['FALLING','WRECK'].includes(d.mode)));}
  this.lamps.update(hiddenId?live.filter(d=>d.id!==hiddenId):live,this.camera,{time:sim.elapsed,size:sim.fleet.options.beaconSize,pixelRatio:this.renderer.getPixelRatio(),reducedMotion:sim.fleet.options.reducedMotion,intensity:this.lighting.beaconPower,haze:this.haze});this.swarmLighting.update(live,this.camera,{dt,obstacles:sim.fleet.options.obstacles});this.battleEffects.update(sim,dt,this.renderer.getPixelRatio());this.postfx.render(this.scene,this.camera);this.combatHUD.draw(sim,this);
 }
 drawMap(sim){
  const c=this.ctx;if(!c)return;const w=this.width,h=this.height,s=this.mapScale();c.clearRect(0,0,w,h);c.fillStyle='#132126';c.fillRect(0,0,w,h);c.lineWidth=1;c.strokeStyle='#243339';
  const line=(a,b)=>{const p=this.project(a),q=this.project(b);c.beginPath();c.moveTo(...p);c.lineTo(...q);c.stroke();};
  if(!this.clean)for(let v=-220;v<=220;v+=20){if(this.view==='front'){line([v,0,0],[v,100,0]);line([-220,v,0],[220,v,0]);}else{line([v,0,-220],[v,0,220]);line([-220,0,v],[220,0,v]);}}
  c.strokeStyle='#52635e';if(this.view!=='front')for(const box of sim.fleet.options.obstacles?COMMANDER_OBSTACLES:[]){const [x,y]=this.project([box.x,0,box.z]);c.fillStyle='#35453f';c.fillRect(x-box.w*s,y-box.d*s,box.w*2*s,box.d*2*s);c.strokeRect(x-box.w*s,y-box.d*s,box.w*2*s,box.d*2*s);}
  const text=(p,label,color='#9eafaa')=>{if(this.clean)return;const [x,y]=this.project(p);c.fillStyle=color;c.font='11px monospace';c.fillText(label,x+9,y-9);};
  if(this.view!=='front'){text([0,0,62],'CONTROL STATION');text([12,0,78],'CHARGER');const [px,py]=this.project([-24,0,70]);c.strokeStyle='#566754';c.strokeRect(px,py,48*s,45*s);}
  if(!this.clean&&!(this.view==='front'&&['word','drawing'].includes(sim.program.settings.shape))){
  const [ox,oy]=this.project(sim.fleet.objective);c.strokeStyle=sim.challenge?.color?beaconColor(sim.challenge.color).hex:'#e5dbaa';c.lineWidth=1.5;c.beginPath();c.arc(ox,oy,Math.max(11,11*s),0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(ox-5,oy);c.lineTo(ox+5,oy);c.moveTo(ox,oy-5);c.lineTo(ox,oy+5);c.stroke();text(sim.fleet.objective,'OBJECTIVE',c.strokeStyle);
  }
  for(const d of sim.drones){const [x,y]=this.project(d.pos),active=['FLY','RETURN'].includes(d.mode),size=Math.max(1,sim.fleet.options.beaconSize*.17);c.globalAlpha=active?1:.3;
   if(active){const angle=d.yaw;c.strokeStyle=d.beaconHex||beaconColor(d.color).hex;c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x-Math.sin(angle)*size*2,y-Math.cos(angle)*size*2);c.stroke();}
   if(['FALLING','WRECK'].includes(d.mode)){c.globalAlpha=1;c.strokeStyle=d.mode==='FALLING'?'#fa993f':'#758086';c.beginPath();c.moveTo(x-3,y-3);c.lineTo(x+3,y+3);c.moveTo(x+3,y-3);c.lineTo(x-3,y+3);c.stroke();continue;}
   c.fillStyle=d.beaconHex||beaconColor(d.color).hex;c.beginPath();c.ellipse(x,y,size,Math.max(1,size*Math.abs(Math.cos(d.attitude.roll))),d.attitude.pitch,0,Math.PI*2);c.fill();c.fillStyle='#fffef3';c.beginPath();c.arc(x,y,Math.max(1,size*.26),0,Math.PI*2);c.fill();c.globalAlpha=1;
   if(d.id===this.selected&&!this.clean){c.strokeStyle='#d9e2da';c.lineWidth=1;c.beginPath();c.arc(x,y,size+4,0,Math.PI*2);c.stroke();}
  }
  for(const p of sim.combat?.payloads||[]){const [x,y]=this.project(p.pos);c.fillStyle='#ffc05b';c.fillRect(x-2,y-2,4,4);}for(const e of sim.combat?.events||[])if(e.type==='explosion'&&sim.combat.time-e.time<.7){const [x,y]=this.project(e.pos);c.strokeStyle='#ffb347';c.beginPath();c.arc(x,y,Math.max(2,(sim.combat.time-e.time)*30),0,Math.PI*2);c.stroke();}
  c.fillStyle='#92a4a5';c.font='11px monospace';if(!this.clean)c.fillText(this.view==='front'?'FRONT ELEVATION / 20 m GRID':'N ↑    20 m GRID',18,h-18);
 }
 dispose(){this.combatHUD?.dispose();this.disposed=true;this.unbindCamera?.();this.resizeObserver.disconnect();this.weather?.dispose();this.battleEffects?.dispose();for(const parts of Object.values(this.wreckParts||{}))for(const {mesh}of parts){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();mesh.removeFromParent();}this.environment?.dispose();this.swarmLighting?.dispose();this.postfx?.dispose();this.lamps?.dispose();this.renderer?.dispose();this.canvas.remove();}
}
