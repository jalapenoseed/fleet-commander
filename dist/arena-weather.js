import * as T from './three.js?v=0.8.0';
export class ArenaWeather{
 constructor(scene=null){this.enabled=false;this.reducedFlashes=false;this.time=0;this.next=12;this.flash=0;this.events=[];this.eventId=0;this.strikePosition=[100,0,-100];
  if(!scene)return;const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(720),3));g.setDrawRange(0,0);
  this.bolt=new T.LineSegments(g,new T.LineBasicMaterial({color:0xc7ddff,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));this.bolt.frustumCulled=false;scene.add(this.bolt);this.light=new T.PointLight(0xc6dcff,0,650,1.5);scene.add(this.light);
 }
 strike(cameraPosition={x:0,y:2,z:200}){
  if(this.time-(this.lastStrikeTime??-Infinity)<1.5)return false;this.lastStrikeTime=this.time;
  const id=++this.eventId,angle=id*2.399,x=Math.sin(angle)*240,z=-100+Math.cos(angle)*200;this.strikePosition=[x,0,z];this.flash=.42;
  const distance=Math.hypot(x-cameraPosition.x,cameraPosition.y,z-cameraPosition.z);this.events.push({id,type:'thunder',pos:[x,0,z],time:this.time+distance/343,power:1});if(this.events.length>24)this.events.shift();
  if(this.bolt){const a=this.bolt.geometry.attributes.position,vertices=[];let old=[x+12,230,z+18];for(let i=1;i<=22;i++){const p=[x+Math.sin(i*13.7+id)*13*(1-i/22),230*(1-i/22),z+Math.cos(i*7.3+id)*11*(1-i/22)];vertices.push(...old,...p);if(i%4===0){let b=p;for(let j=1;j<=3;j++){const n=[p[0]+j*11*Math.sin(i),p[1]-j*9,p[2]+j*8*Math.cos(i)];vertices.push(...b,...n);b=n;}}old=p;}a.array.set(vertices);a.needsUpdate=true;this.bolt.geometry.setDrawRange(0,vertices.length/3);this.light.position.set(x,90,z);}
 }
 update(dt,{running=true,reducedMotion=false,cameraPosition}={}){if(running){this.time+=dt;if(this.enabled&&this.time>=this.next){this.strike(cameraPosition);this.next=this.time+12+(this.eventId%4)*3;}this.flash=Math.max(0,this.flash-dt);}const reduced=this.reducedFlashes||reducedMotion;this.intensity=this.flash>0?(reduced?.025:Math.exp(-(.42-this.flash)*15)) :0;
  if(this.bolt){this.bolt.material.opacity=this.flash>0?(reduced?.15:Math.min(1,this.flash*6)):0;this.light.intensity=reduced?0:this.intensity*180000;}
 }
 dispose(){if(this.bolt){this.bolt.geometry.dispose();this.bolt.material.dispose();this.bolt.removeFromParent();this.light.dispose();this.light.removeFromParent();}}
}
