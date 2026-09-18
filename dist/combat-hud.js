import * as T from './three.js?v=0.8.0';
import {COMMANDER_OBSTACLES} from './fleet-commander-core.js?v=0.8.0';
import {DRONE_VIEWS} from './director-camera.js?v=0.8.0';
const p=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),ray=new T.Ray(),box=new T.Box3();
export function screenPoint(pos,camera,width,height){camera.updateMatrixWorld();p.fromArray(pos).project(camera);return p.z>=-1&&p.z<=1&&Math.abs(p.x)<1.05&&Math.abs(p.y)<1.05?[(p.x+1)*width/2,(1-p.y)*height/2]:null;}
export function occluded(pos,camera,obstacles){a.copy(camera.position);b.fromArray(pos).sub(a);const length=b.length();ray.set(a,b.normalize());for(const o of obstacles){box.min.set(o.x-o.w,0,o.z-o.d);box.max.set(o.x+o.w,o.h,o.z+o.d);const hit=ray.intersectBox(box,p);if(hit&&hit.distanceTo(a)<length-1)return true;}return false;}
export class CombatHUD{
 constructor(host){this.canvas=document.createElement('canvas');this.canvas.className='combat-overlay';this.canvas.setAttribute('aria-hidden','true');this.ctx=this.canvas.getContext('2d');this.health=true;this.hud=true;this.labels=true;host.append(this.canvas);}
 draw(sim,r){
  const c=this.ctx;if(!c)return;const w=r.width,h=r.height,dpr=Math.min(2,globalThis.devicePixelRatio||1);
  if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
  c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);if(r.clean)return;
  const onboard=DRONE_VIEWS.includes(r.view),d=sim.drones.find(o=>o.id===(r.view==='combat'?r.directorCamera.subject:r.selected));
  const active=!!sim.combat?.enabled,target=sim.drones.find(o=>o.id===d?.ai?.targetId&&o.mode==='FLY');
  if(active){const teams=sim.combat.summary().teams;c.font='bold 12px ui-monospace,monospace';c.fillStyle='#061219d9';c.fillRect(8,8,w-16,22);c.fillStyle='#6df4dc';c.fillText('F '+teams.friendly.flying+'/'+teams.friendly.total+' FLYING',16,23);c.fillStyle='#ffac72';c.textAlign='right';c.fillText('H '+teams.enemy.flying+'/'+teams.enemy.total+' FLYING',w-16,23);c.textAlign='left';}
  const project=pos=>r.renderer?screenPoint(pos,r.camera,w,h):r.project(pos),visible=pos=>!r.renderer||!occluded(pos,r.camera,sim.fleet.options.obstacles?COMMANDER_OBSTACLES:[]);
  const cast=active?sim.drones.filter(o=>o.mode==='FLY'&&(!onboard||o!==d)).sort((x,y)=>Math.hypot(...x.pos.map((v,j)=>v-(d?.pos[j]||0)))-Math.hypot(...y.pos.map((v,j)=>v-(d?.pos[j]||0)))).slice(0,80):[];
  c.font='12px ui-monospace,monospace';c.lineWidth=1;
  for(const o of cast){const point=project(o.pos);if(!point||!visible(o.pos))continue;const [x,y]=point;if(x<18||x>w-18||y<40||y>h-24)continue;
   const color=o.combatSide==='friendly'?'#6df4dc':'#ffac72',locked=o===target;
   if(this.health){c.fillStyle='#07151deb';c.fillRect(x-16,y-13,32,5);c.fillStyle=o.health<25?'#ff5d6e':color;c.fillRect(x-15,y-12,30*Math.max(0,o.health)/100,3);}
   if(onboard&&this.hud&&this.labels){const size=locked?18:11;c.strokeStyle=color;c.strokeRect(x-size,y-size,size*2,size*2);if(locked){c.fillStyle=color;c.fillText('TARGET · '+Math.round(Math.hypot(...o.pos.map((v,j)=>v-d.pos[j])))+' m',Math.min(w-140,x+22),y-18);}}
  }
  if(!onboard||!this.hud||!d)return;
  const color=d.combatSide==='enemy'?'#ffac72':'#9df9e3';c.fillStyle='#061219c9';c.fillRect(12,34,Math.min(w-24,350),56);c.fillStyle=color;
  c.fillText((d.combatSide||'SCOUT').toUpperCase()+' / '+d.id.toUpperCase(),22,51);
  c.fillText((d.mode==='FLY'?(d.ai?.state||d.override||d.order):d.mode).toUpperCase()+'   HULL '+Math.round(d.health??100)+'%',22,68);
  c.fillText(Math.hypot(...d.velocity).toFixed(1)+' m/s   ALT '+d.pos[1].toFixed(1)+' m   BAT '+Math.round(d.battery)+'%',22,84);
  c.strokeStyle=color;c.globalAlpha=.65;const x=w/2,y=h/2;c.beginPath();c.moveTo(x-18,y);c.lineTo(x-6,y);c.moveTo(x+6,y);c.lineTo(x+18,y);c.moveTo(x,y-12);c.lineTo(x,y-4);c.moveTo(x,y+4);c.lineTo(x,y+12);c.stroke();c.globalAlpha=1;
  if(active){const message=d.mode!=='FLY'?'MOTORS OFF · '+d.mode:target?d.ai?.state==='Payload run'?'PAYLOAD RUN · '+d.ammo+' remaining':'TRACKING '+target.id:'SCANNING / REFORMING';c.fillStyle=color;c.fillText(message,22,h-38);c.fillStyle='#bed0d8';c.fillText('SIM TELEMETRY · '+(this.labels?'detection boxes':'HUD only'),22,h-20);}
 }
 dispose(){this.canvas.remove();}
}
