import * as T from './three.js?v=0.8.0';
import {PLANETS} from './planet-physics.js?v=0.8.0';
// Bounded particles: hit sparks, blast fire, falling smoke and impact debris.
export class BattleEffects{
 constructor(scene){
  this.particles=[];this.lastEvent=0;this.smokeClock=0;this.matrix=new T.Matrix4();
  const g=new T.BufferGeometry();for(const [key,n]of [['position',3],['color',3],['size',1],['alpha',1]])g.setAttribute(key,new T.BufferAttribute(new Float32Array(768*n),n).setUsage(T.DynamicDrawUsage));g.setDrawRange(0,0);
  this.points=new T.Points(g,new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pixelRatio:{value:1}},vertexShader:`attribute vec3 color;attribute float size;attribute float alpha;varying vec3 vColor;varying float vAlpha;uniform float pixelRatio;
  void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*400.*pixelRatio/max(1.,-p.z),2.,160.);vColor=color;vAlpha=alpha;}`,
  fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;gl_FragColor=vec4(vColor,exp(-r*3.)*vAlpha*(1.-smoothstep(.6,1.,r)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`}));this.points.frustumCulled=false;this.points.renderOrder=4;scene.add(this.points);
  this.payloads=new T.InstancedMesh(new T.SphereGeometry(.3,8,6),new T.MeshStandardMaterial({color:0x303133,emissive:0xff6b22,emissiveIntensity:1.5,roughness:.5}),128);this.payloads.count=0;this.payloads.frustumCulled=false;scene.add(this.payloads);
  this.flash=new T.PointLight(0xff7733,0,55,2);scene.add(this.flash);this.flashTime=0;
  this.fragments=[];this.rings=[];this.generation=null;this.dummy=new T.Object3D();
  this.debris=new T.InstancedMesh(new T.BoxGeometry(1,.16,.38),new T.MeshStandardMaterial({color:0x454b54,metalness:.75,roughness:.46}),192);this.debris.count=0;this.debris.frustumCulled=false;this.debris.castShadow=true;this.debris.receiveShadow=true;scene.add(this.debris);
  this.shockwaves=new T.InstancedMesh(new T.TorusGeometry(1,.022,5,40),new T.MeshBasicMaterial({color:0xffbd72,transparent:true,opacity:.25,depthWrite:false,blending:T.AdditiveBlending}),20);this.shockwaves.count=0;this.shockwaves.frustumCulled=false;scene.add(this.shockwaves);
 }
 reset(){this.particles=[];this.fragments=[];this.rings=[];this.lastEvent=0;this.smokeClock=0;this.flashTime=0;this.generation=null;this.points.geometry.setDrawRange(0,0);this.debris.count=this.shockwaves.count=this.payloads.count=0;this.flash.intensity=0;}
 fracture(e){for(let i=0;i<(e.type==='destroy'?12:7);i++){const a=i*2.399+e.id*.63;this.fragments.push({pos:[...e.pos],velocity:[Math.sin(a)*(2+i%5),2+i%6,Math.cos(a)*(2+i%5)],rotation:[a,a*.7,a*.3],spin:[Math.sin(a)*6,Math.cos(a)*4,3],scale:.18+(i%5)*.12,age:0,life:8});}if(this.fragments.length>192)this.fragments.splice(0,this.fragments.length-192);if(e.type==='explosion'){this.rings.push({pos:[...e.pos],age:0});if(this.rings.length>20)this.rings.shift();}}
 spawn(pos,count,kind,power=1){
  for(let i=0;i<count;i++){const smoke=kind==='smoke',a=i*2.399+this.lastEvent*.7,speed=smoke?.35:(2+i%7)*power;
   this.particles.push({pos:[...pos],velocity:[Math.cos(a)*speed,smoke?1.6:1+i%8,Math.sin(a)*speed],age:0,life:smoke?2.5:.5+(i%7)*.17,size:smoke?1.5:kind==='explosion'?1.2:.18,smoke,color:smoke?[.08,.085,.095]:kind==='impact'?[3,1.4,.3]:[4,.7,.06]});}
  if(this.particles.length>768)this.particles.splice(0,this.particles.length-768);
 }
 update(sim,dt,pixelRatio=1){
  const combat=sim.combat,active=combat?.enabled;if(!active){this.reset();return;}
  if(this.generation!==combat.generation){this.reset();this.generation=combat.generation;}
  const planet=PLANETS[sim.lab?.planet]||PLANETS.earth;
  dt=sim.running?dt:0;
  for(const e of combat.events)if(e.id>this.lastEvent){this.lastEvent=e.id;if(['impact','explosion','destroy'].includes(e.type)){this.spawn(e.pos,e.type==='explosion'?42:12,e.type,e.power);if(e.type==='destroy'||e.type==='explosion')this.fracture(e);if(e.type==='explosion'){this.flash.position.fromArray(e.pos);this.flashTime=.2;}}}
  this.smokeClock+=dt;if(this.smokeClock>.12){this.smokeClock=0;if(planet.density>0)for(const d of sim.drones.filter(d=>d.mode==='FALLING'||d.health<40&&d.mode==='FLY').slice(0,40))this.spawn(d.pos,1,'smoke');}
  this.particles=this.particles.filter(p=>p.age<p.life);const a=this.points.geometry.attributes;this.particles.forEach((p,i)=>{p.age+=dt;p.velocity[1]+=(p.smoke?.15: -planet.gravity)*dt;for(let j=0;j<3;j++)p.pos[j]+=p.velocity[j]*dt;p.pos[1]=Math.max(.08,p.pos[1]);const fade=Math.max(0,1-p.age/p.life);a.position.setXYZ(i,...p.pos);a.color.setXYZ(i,...p.color);a.size.setX(i,p.size*(p.smoke?1+p.age:1));a.alpha.setX(i,fade*(p.smoke?.32:.85));});for(const attr of Object.values(a))attr.needsUpdate=true;this.points.geometry.setDrawRange(0,this.particles.length);this.points.material.uniforms.pixelRatio.value=pixelRatio;
  this.fragments=this.fragments.filter(p=>p.age<p.life);this.debris.count=this.fragments.length;this.fragments.forEach((p,i)=>{p.age+=dt;p.velocity[1]-=planet.gravity*dt;for(let j=0;j<3;j++){p.pos[j]+=p.velocity[j]*dt;p.rotation[j]+=p.spin[j]*dt;}if(p.pos[1]<.12){p.pos[1]=.12;p.velocity[1]=Math.abs(p.velocity[1])*.28;p.velocity[0]*=.88;p.velocity[2]*=.88;p.spin=p.spin.map(v=>v*.86);}this.dummy.position.fromArray(p.pos);this.dummy.rotation.set(...p.rotation);this.dummy.scale.setScalar(p.scale*Math.min(1,(p.life-p.age)*2));this.dummy.updateMatrix();this.debris.setMatrixAt(i,this.dummy.matrix);});this.debris.instanceMatrix.needsUpdate=true;
  this.rings=this.rings.filter(r=>r.age<.7);this.shockwaves.count=planet.density>0?this.rings.length:0;this.rings.forEach((r,i)=>{r.age+=dt;this.dummy.position.fromArray(r.pos);this.dummy.rotation.set(Math.PI/2,0,0);this.dummy.scale.setScalar(1+r.age*18);this.dummy.updateMatrix();if(i<this.shockwaves.count)this.shockwaves.setMatrixAt(i,this.dummy.matrix);});this.shockwaves.instanceMatrix.needsUpdate=true;
  this.payloads.count=combat.payloads.length;combat.payloads.forEach((p,i)=>{this.matrix.makeTranslation(...p.pos);this.payloads.setMatrixAt(i,this.matrix);});this.payloads.instanceMatrix.needsUpdate=true;
  this.flashTime=Math.max(0,this.flashTime-dt);this.flash.intensity=sim.fleet.options.reducedMotion?0:this.flashTime*1700;
 }
 dispose(){for(const o of [this.points,this.payloads,this.debris,this.shockwaves]){o.geometry.dispose();o.material.dispose();o.dispose?.();o.removeFromParent();}this.flash.dispose();this.flash.removeFromParent();}
}
