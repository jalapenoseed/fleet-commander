import * as T from './three.js?v=0.8.0';
import {beaconColor} from './beacon-palette.js?v=0.8.0';
import {MAX_COMMANDER_DRONES,COMMANDER_OBSTACLES} from './fleet-commander-core.js?v=0.8.0';

export const LIGHTING_PRESETS={
 natural:{sky:'golden',exposure:0,beaconPower:1,spill:1,stage:1,bloom:.32,bloomRadius:1},
 show:{sky:'night',exposure:-.35,beaconPower:1.8,spill:1.3,stage:.08,bloom:.48,bloomRadius:1.25},
 inspection:{sky:'day',exposure:.25,beaconPower:.65,spill:1,stage:1,bloom:.12,bloomRadius:.6},
 cinematic:{sky:'dusk',exposure:-.15,beaconPower:1.4,spill:1.1,stage:.25,bloom:.4,bloomRadius:1.6}
};
const clamp=(v,a,b,f)=>Number.isFinite(Number(v))?T.MathUtils.clamp(Number(v),a,b):f;
export function lightingSettings(s={}){return {exposure:clamp(s.exposure,-2,2,0),beaconPower:clamp(s.beaconPower,0,3,1),spill:clamp(s.spill,0,2,1),stage:clamp(s.stage,0,1,1),bloomRadius:clamp(s.bloomRadius,.4,2,1)};}

// Bounded real surface lights plus a single instanced ground irradiance draw.
// Ground pools are an unshadowed approximation on the flat flight field; they
// never pretend to be ray-traced reflections or create one light per aircraft.
export class SwarmLighting{
 constructor(root){
  this.settings=lightingSettings();this.budget=8;this.colors=new Map();this.slots=Array(12).fill(null);
  this.lights=Array.from({length:12},()=>{const l=new T.PointLight(0xffffff,0,24,2);root.add(l);return l;});
  const base=new T.PlaneGeometry(2,2);base.rotateX(-Math.PI/2);
  const geometry=new T.InstancedBufferGeometry();geometry.index=base.index;geometry.attributes=base.attributes;
  for(const [name,size]of [['poolPosition',3],['poolColor',3],['poolShape',2]])geometry.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(MAX_COMMANDER_DRONES*size),size).setUsage(T.DynamicDrawUsage));
  geometry.instanceCount=0;
  const material=new T.ShaderMaterial({depthWrite:false,depthTest:true,transparent:true,blending:T.AdditiveBlending,uniforms:{wetness:{value:0}},vertexShader:`attribute vec3 poolPosition;attribute vec3 poolColor;attribute vec2 poolShape;varying vec2 poolUv;varying vec3 radiance;varying float height;
   void main(){poolUv=uv*2.-1.;height=poolShape.x;radiance=poolColor*poolShape.y;vec3 p=position*vec3(height*3.,1.,height*3.)+poolPosition;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
   fragmentShader:`varying vec2 poolUv;varying vec3 radiance;varying float height;uniform float wetness;
   void main(){float r2=dot(poolUv,poolUv);if(r2>1.)discard;float attenuation=1./pow(1.+r2*9.,1.5);float edge=1.-smoothstep(.65,1.,r2);gl_FragColor=vec4(radiance*attenuation*edge*(1.-wetness*.35),1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  this.pools=new T.Mesh(geometry,material);this.pools.frustumCulled=false;this.pools.renderOrder=1;root.add(this.pools);
 }
 configure(settings,quality='balanced',wetness=0){this.settings=lightingSettings(settings);this.budget={performance:4,balanced:8,cinema:12}[quality]||8;this.lights.forEach((l,i)=>l.visible=i<this.budget);this.pools.material.uniforms.wetness.value=clamp(wetness,0,1,0);}
 update(drones,camera,{dt=1/60,obstacles=true}={}){
  const {beaconPower,spill}=this.settings,a=this.pools.geometry.attributes,candidates=[];let count=0;
  for(const d of drones){
   const key=d.beaconHex||d.color;if(this.colors.size>8192)this.colors.clear();if(!this.colors.has(key))this.colors.set(key,new T.Color(d.beaconHex||beaconColor(d.color).hex));const color=this.colors.get(key),active=!['DOCK','QUEUED','LANDED'].includes(d.mode),power=beaconPower*spill*(active?1:.08),[x,y,z]=d.pos;
   const distance=(x-camera.position.x)**2+(y-camera.position.y)**2+(z-camera.position.z)**2;
   if(power>0&&distance<10000){const retained=this.slots.includes(d.id);const item={d,color,power,score:distance*(retained?.65:1)};let i=candidates.findIndex(c=>c.score>item.score);if(i<0)i=candidates.length;if(i<this.budget){candidates.splice(i,0,item);if(candidates.length>this.budget)candidates.pop();}}
   const h=Math.max(.65,y+.22),radius=h*3;
   // Suppress ground pools whose footprint could bleed through a range obstacle.
   const blocked=obstacles&&COMMANDER_OBSTACLES.some(b=>Math.abs(x-b.x)<b.w+radius&&Math.abs(z-b.z)<b.d+radius);
   if(power<=0||h>32||blocked||distance>700*700)continue;
   a.poolPosition.setXYZ(count,x,.055,z);a.poolColor.setXYZ(count,color.r,color.g,color.b);a.poolShape.setXY(count,h,Math.min(.8,6/(h*h))*power*(1-T.MathUtils.smoothstep(h,22,32)));count++;
  }
  this.pools.geometry.instanceCount=count;for(const key of ['poolPosition','poolColor','poolShape'])a[key].needsUpdate=true;
  const byId=new Map(candidates.map(c=>[c.d.id,c])),claimed=new Set();
  // Retain slots across sorting changes. Reassigned lights fade from zero.
  for(let i=0;i<this.lights.length;i++)if(i<this.budget&&byId.has(this.slots[i]))claimed.add(this.slots[i]);else this.slots[i]=null;
  const blend=1-Math.exp(-Math.min(.1,Math.max(0,dt))*12);
  for(let i=0;i<this.lights.length;i++){
   const l=this.lights[i];if(i<this.budget&&!this.slots[i]){const next=candidates.find(c=>!claimed.has(c.d.id));if(next){this.slots[i]=next.d.id;claimed.add(next.d.id);l.intensity=0;}}
   const item=byId.get(this.slots[i]);if(!item){l.intensity=0;continue;}l.position.fromArray(item.d.pos);l.position.y+=.22;l.color.copy(item.color);l.intensity=T.MathUtils.lerp(l.intensity,42*item.power,blend);
  }
 }
 dispose(){this.pools.geometry.dispose();this.pools.material.dispose();this.pools.removeFromParent();for(const l of this.lights){l.dispose();l.removeFromParent();}}
}
