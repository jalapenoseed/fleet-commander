// Stateless, bounded steering; callers supply a frozen neighbor snapshot.
// Formation/task navigation and emergency collision handling retain authority.
export const BOID_DEFAULTS={boids:'none',boidSeparation:1.4,boidAlignment:.6,boidCohesion:.35,boidAvoidance:1.5,boidAttraction:.3,boidMatching:.5,boidRadius:32,boidDistance:6,boidForce:8};
export const BOID_RANGES={boidSeparation:[0,3],boidAlignment:[0,3],boidCohesion:[0,3],boidAvoidance:[0,3],boidAttraction:[0,3],boidMatching:[0,3],boidRadius:[8,48],boidDistance:[2,16],boidForce:[0,16]};
export const BOID_LABELS={boidSeparation:'Separation',boidAlignment:'Heading alignment',boidCohesion:'Cohesion',boidAvoidance:'Obstacle avoidance',boidAttraction:'Target attraction',boidMatching:'Velocity matching',boidRadius:'Neighbor radius (m)',boidDistance:'Personal space (m)',boidForce:'Steering limit (m/s²)'};
const length=v=>Math.hypot(...v);
const limit=(v,max)=>{const m=length(v);return m>max?v.map(x=>x*max/m):v;};
const unit=v=>{const m=length(v);return m>1e-6?v.map(x=>x/m):[0,0,0];};
export function boidSteering(body,{id=body.id,peers=[],target=body.pos,targetVelocity=[0,0,0],obstacles=[],settings=BOID_DEFAULTS}={}){
 if(settings.boids!=='on')return [0,0,0];
 const s={...BOID_DEFAULTS,...settings},separation=[0,0,0],heading=[0,0,0],center=[0,0,0],velocity=[0,0,0];let count=0,headingCount=0;
 for(const peer of peers){
  if(peer.id===id||peer.task||['DOCK','RETURN','RETURN HOME','LANDED','PERCHED','RELAY','MANUAL'].includes(peer.mode))continue;
  const delta=body.pos.map((v,j)=>v-peer.pos[j]),distance=length(delta);if(distance>s.boidRadius)continue;
  count++;for(let j=0;j<3;j++){center[j]+=peer.pos[j];velocity[j]+=peer.velocity[j];}
  if(length(peer.velocity)>.1){headingCount++;const direction=unit(peer.velocity);for(let j=0;j<3;j++)heading[j]+=direction[j];}
  const space=Math.min(s.boidRadius,s.boidDistance);
  if(distance<space){const direction=distance>1e-6?unit(delta):[String(id)<String(peer.id)?-1:1,0,0];for(let j=0;j<3;j++)separation[j]+=direction[j]*(1-distance/space)*8;}
 }
 const currentSpeed=length(body.velocity),alignment=headingCount?unit(heading).map((v,j)=>v*currentSpeed-body.velocity[j]):[0,0,0];
 const cohesion=count?center.map((v,j)=>(v/count-body.pos[j])*.25):[0,0,0];
 const matching=count?velocity.map((v,j)=>v/count-body.velocity[j]):targetVelocity.map((v,j)=>v-body.velocity[j]);
 // Arrive at the existing assignment/formation target instead of inventing a new orbit.
 const attraction=limit(target.map((v,j)=>(v-body.pos[j])*.6),12).map((v,j)=>v+targetVelocity[j]-body.velocity[j]);
 const avoidance=[0,0,0],probe=body.pos.map((v,j)=>v+body.velocity[j]*.75),margin=4;
 for(const box of obstacles){
  if(box.drone===false)continue;
  const lo=[box.x-box.w-margin,(box.minY??0)-margin,box.z-box.d-margin],hi=[box.x+box.w+margin,(box.maxY??box.h??12)+margin,box.z+box.d+margin];
  // Sweep the look-ahead segment: thin walls cannot slip between its endpoints.
  let enter=0,exit=1;for(let j=0;j<3;j++){const delta=probe[j]-body.pos[j];if(Math.abs(delta)<1e-8){if(body.pos[j]<lo[j]||body.pos[j]>hi[j]){exit=-1;break;}}else{const a=(lo[j]-body.pos[j])/delta,b=(hi[j]-body.pos[j])/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}}
  if(enter<=exit&&exit>=0&&enter<=1){avoidance[1]+=10;avoidance[0]-=body.velocity[0]*.5;avoidance[2]-=body.velocity[2]*.5;}
 }
 const terms=[[separation,s.boidSeparation],[alignment,s.boidAlignment],[cohesion,s.boidCohesion],[avoidance,s.boidAvoidance],[attraction,s.boidAttraction],[matching,s.boidMatching]],out=[0,0,0];
 for(const [term,weight]of terms){const bounded=limit(term,10);for(let j=0;j<3;j++)out[j]+=bounded[j]*weight;}
 return limit(out,s.boidForce);
}
