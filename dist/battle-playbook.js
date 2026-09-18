// Coach-authored routes feed the existing fictional arena AI, not hardware.
import {COMBAT_TACTICS} from './combat-ai.js?v=0.8.0';
export const PLAYBOOK_KEY='fleetcommander.playbook.v1';
const clone=v=>JSON.parse(JSON.stringify(v));
export function blankPlaybook(){return {kind:'fleet-battle-playbook',version:1,name:'My battle',counts:{friendly:12,enemy:12},squads:['friendly','enemy'].flatMap(side=>Array.from({length:3},(_,i)=>({id:side+'-'+i,side,name:['Left wing','Center','Right wing'][i],type:i===1?'cargo':'scout',tactic:i===1?'bomber':'interceptor',altitude:30+i*8,delay:i*2,finish:'attack',route:[]})))};}
export function validatePlaybook(raw){
 if(!raw||raw.kind!=='fleet-battle-playbook'||raw.version!==1||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>48)throw Error('Choose a valid battle playbook.');
 const base=blankPlaybook();for(const side of ['friendly','enemy'])if(!Number.isInteger(raw.counts?.[side])||raw.counts[side]<1||raw.counts[side]>255)throw Error('Each faction needs 1–255 drones.');
 if(raw.counts.friendly+raw.counts.enemy>256)throw Error('Combat is limited to 256 total drones.');
 if(!Array.isArray(raw.squads)||raw.squads.length!==6)throw Error('A playbook needs three squads per faction.');
 return {...base,name:raw.name.trim(),counts:{...raw.counts},squads:base.squads.map(defaults=>{const s=raw.squads.find(s=>s.id===defaults.id);
  if(!s||s.side!==defaults.side||!['scout','relay','cargo','engineer'].includes(s.type)||!Object.hasOwn(COMBAT_TACTICS,s.tactic)||!['attack','hold','patrol','retreat'].includes(s.finish)||!Number.isFinite(s.altitude)||s.altitude<8||s.altitude>120||!Number.isFinite(s.delay)||s.delay<0||s.delay>60||!Array.isArray(s.route)||s.route.length>24||s.route.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>160)))throw Error('Invalid squad route or settings.');
  return {...defaults,type:s.type,tactic:s.tactic,altitude:s.altitude,delay:s.delay,finish:s.finish,route:s.route.map(p=>[...p])};})};
}
export function playbookPreset(name){const p=blankPlaybook();p.name=name==='pincer'?'Double pincer':name==='ambush'?'Delayed ambush':'Head-on scrimmage';for(const s of p.squads){const sign=s.side==='friendly'?-1:1,i=Number(s.id.at(-1)),z=(i-1)*35;
 s.route=name==='pincer'?[[sign*85,z],[sign*35,z*2],[-sign*30,z]]:name==='ambush'?[[sign*85,z],[sign*45,z],[0,z*.4]]:[[sign*80,z],[0,z]];s.delay=name==='ambush'?i*7:0;}return p;}
export function squadFor(plan,d){return plan?.squads.find(s=>s.id===d.combatSide+'-'+d.combatIndex%3);}
export function squadPoint(s,d,index=0){const p=s.route[index]||[d.combatSide==='friendly'?-85:85,(Number(s.id.at(-1))-1)*35],rank=Math.floor(d.combatIndex/3),column=rank%4;
 return [p[0]+(Math.floor(rank/4))*5,s.altitude,p[1]+(column-1.5)*5];}
export function playbookOrder(plan,d,time){const s=squadFor(plan,d);if(!s)return null;const brain=d.ai;brain.routeIndex??=0;
 if(time<s.delay){brain.state='Waiting '+(s.delay-time).toFixed(0)+'s';return {target:squadPoint(s,d),drop:false};}
 const index=Math.min(brain.routeIndex,s.route.length-1);
 if(brain.routeIndex<s.route.length){const target=squadPoint(s,d,index);if(Math.hypot(...target.map((v,j)=>v-d.pos[j]))<5)brain.routeIndex++;brain.state=s.name+' · route '+Math.min(brain.routeIndex+1,s.route.length)+'/'+s.route.length;return {target,drop:false};}
 if(s.finish==='attack')return null;
 if(s.finish==='retreat'){d.combatRetreat=true;brain.state='Retreat';return {target:[...d.home],drop:false};}
 if(s.finish==='patrol'&&s.route.length>1)brain.routeIndex=0;
 brain.state=s.finish==='patrol'?'Patrol':'Hold position';return {target:squadPoint(s,d,Math.max(0,index)),drop:false};
}
export function downloadJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function mountPlaybook({sim,combat,launch,say,guard}){
 let plan=blankPlaybook(),selected='friendly-0',pen=false,last=null;try{const saved=localStorage.getItem(PLAYBOOK_KEY);if(saved)plan=validatePlaybook(JSON.parse(saved));}catch{}
 const root=document.createElement('details');root.id='battlePlaybook';root.innerHTML=`<summary>Coach board · build your own battle</summary><p class="hint">Three squads per side. Draw a route, choose when each squad starts, then decide what it does at the end. Cyan circles are friendlies; orange crosses are hostiles.</p>
 <label>Playbook name<input id="playName" maxlength="48"></label><div class="form-row"><label>Friendly drones<input id="playFriendly" type="number" min="1" max="255"></label><label>Hostile drones<input id="playEnemy" type="number" min="1" max="255"></label></div>
 <label>Starting play<select id="playPreset"><option value="blank">Blank board</option><option value="pincer">Double pincer</option><option value="ambush">Delayed ambush</option><option value="scrimmage">Head-on scrimmage</option></select></label><button id="loadPlayPreset">Load starting play</button>
 <label>Squad to coach<select id="playSquad">${plan.squads.map(s=>`<option value="${s.id}">${s.side==='friendly'?'Friendly':'Hostile'} · ${s.name}</option>`).join('')}</select></label>
 <canvas id="coachBoard" width="600" height="420" tabindex="0" aria-label="Battle route board. Tap or drag to add waypoints. Arrow keys move the cursor, Enter adds a waypoint."></canvas><p class="hint">Top-down field · ±160 m. Tap or drag to draw; use arrows + Enter on a keyboard. Up to 24 waypoints. Existing routes stay visible.</p>
 <div class="form-row"><button id="undoWaypoint">Undo waypoint</button><button id="clearRoute">Clear squad route</button></div>
 <div class="form-row"><label>Airframe<select id="squadFrame"><option value="scout">Scout</option><option value="relay">Relay</option><option value="cargo">Cargo</option><option value="engineer">Utility</option></select></label><label>Combat role<select id="squadTactic">${Object.entries(COMBAT_TACTICS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label></div>
 <div class="form-row"><label>Altitude (m)<input id="squadAltitude" type="number" min="8" max="120"></label><label>Start delay (s)<input id="squadDelay" type="number" min="0" max="60"></label></div><label>After the route<select id="squadFinish"><option value="attack">Engage enemy with AI</option><option value="hold">Hold position</option><option value="patrol">Repeat patrol route</option><option value="retreat">Return and land</option></select></label>
 <button id="runPlaybook" class="primary wide">Run this battle</button><button id="disablePlaybook" class="wide">Use normal AI presets instead</button><p id="playStatus" role="status"></p>
 <div class="form-row"><button id="savePlaybook">Save on device</button><button id="exportPlaybook">Export playbook</button></div><label>Import playbook<input id="importPlaybook" type="file" accept="application/json,.json"></label>`;
 document.getElementById('tab-combat').append(root);const $=id=>root.querySelector('#'+id),board=$('coachBoard'),ctx=board.getContext('2d'),squad=()=>plan.squads.find(s=>s.id===selected);let cursor=[0,0];
 function draw(){if(!ctx)return;ctx.clearRect(0,0,600,420);ctx.fillStyle='#0b2026';ctx.fillRect(0,0,600,420);ctx.strokeStyle='#25434a';ctx.lineWidth=1;for(let x=0;x<=600;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,420);ctx.stroke();}for(let y=0;y<=420;y+=42){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(600,y);ctx.stroke();}
  const project=p=>[(p[0]/320+.5)*600,(p[1]/320+.5)*420];
  for(const s of plan.squads){ctx.strokeStyle=s.side==='friendly'?'#6df4dc':'#ffac72';ctx.fillStyle=ctx.strokeStyle;ctx.globalAlpha=s.id===selected?1:.4;ctx.lineWidth=s.id===selected?3:1.5;ctx.beginPath();s.route.forEach((p,i)=>{const [x,y]=project(p);ctx[i?'lineTo':'moveTo'](x,y);});ctx.stroke();s.route.forEach((p,i)=>{const [x,y]=project(p);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();if(i===0){ctx.font='14px monospace';ctx.fillText(s.id[0].toUpperCase()+Number(s.id.at(-1)),x+7,y-7);}});}
  ctx.globalAlpha=1;if(combat.enabled)for(const d of sim.drones){const [x,y]=project([d.pos[0],d.pos[2]]);ctx.fillStyle=d.mode==='FLY'?(d.combatSide==='friendly'?'#b5ffee':'#ffd6ad'):'#637178';ctx.fillRect(x-2,y-2,4,4);}
  const [x,y]=project(cursor);ctx.strokeStyle='#ffffff';ctx.strokeRect(x-5,y-5,10,10);
 }
 function read(){plan.name=$('playName').value;plan.counts={friendly:Number($('playFriendly').value),enemy:Number($('playEnemy').value)};Object.assign(squad(),{type:$('squadFrame').value,tactic:$('squadTactic').value,altitude:Number($('squadAltitude').value),delay:Number($('squadDelay').value),finish:$('squadFinish').value});}
 function refresh(){const s=squad();$('playName').value=plan.name;$('playFriendly').value=plan.counts.friendly;$('playEnemy').value=plan.counts.enemy;for(const [key,id]of [['type','squadFrame'],['tactic','squadTactic'],['altitude','squadAltitude'],['delay','squadDelay'],['finish','squadFinish']])$(id).value=s[key];draw();}
 function add(point){const route=squad().route;if(route.length>=24){$('playStatus').textContent='24 waypoints reached. Undo a point to continue.';return;}cursor=point;route.push(point);draw();}
 const point=e=>{const r=board.getBoundingClientRect();return [Math.max(-160,Math.min(160,(e.clientX-r.left)/r.width*320-160)),Math.max(-160,Math.min(160,(e.clientY-r.top)/r.height*320-160))];};
 board.addEventListener('pointerdown',e=>{if(e.button!==0)return;pen=true;last=point(e);add(last);board.setPointerCapture?.(e.pointerId);});board.addEventListener('pointermove',e=>{if(!pen)return;const p=point(e);if(Math.hypot(p[0]-last[0],p[1]-last[1])>14){last=p;add(p);}});for(const type of ['pointerup','pointercancel','lostpointercapture'])board.addEventListener(type,()=>pen=false);
 board.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.key))return;e.preventDefault();if(e.key==='Enter')add([...cursor]);else{cursor=cursor.map((v,i)=>Math.max(-160,Math.min(160,v+(i===0?(e.key==='ArrowRight'?8:e.key==='ArrowLeft'?-8:0):(e.key==='ArrowDown'?8:e.key==='ArrowUp'?-8:0)))));draw();}});
 root.addEventListener('change',e=>{if(!['playSquad','playPreset','importPlaybook'].includes(e.target.id))read();});$('playSquad').addEventListener('change',()=>{read();selected=$('playSquad').value;refresh();});$('undoWaypoint').onclick=()=>{squad().route.pop();draw();};$('clearRoute').onclick=()=>{squad().route=[];draw();};
 $('loadPlayPreset').onclick=()=>{plan=$('playPreset').value==='blank'?blankPlaybook():playbookPreset($('playPreset').value);refresh();$('playStatus').textContent='Starting play loaded into the editor. Run this battle to apply.';};
 $('savePlaybook').onclick=guard(()=>{read();plan=validatePlaybook(plan);localStorage.setItem(PLAYBOOK_KEY,JSON.stringify(plan));$('playStatus').textContent='Playbook saved on this device.';});$('exportPlaybook').onclick=guard(()=>{read();downloadJSON(validatePlaybook(plan),'fleet-battle-playbook.json');});
 $('importPlaybook').onchange=guard(async()=>{const file=$('importPlaybook').files?.[0];try{if(!file)return;if(file.size>64000)throw Error('Playbooks must be under 64 KB.');plan=validatePlaybook(JSON.parse(await file.text()));refresh();$('playStatus').textContent='Imported. Run to apply or Save to keep on this device.';}finally{$('importPlaybook').value='';}});
 $('runPlaybook').onclick=guard(async()=>{read();const valid=validatePlaybook(plan);combat.playbook=clone(valid);await launch({count:valid.counts.friendly+valid.counts.enemy,engage:true});$('playStatus').textContent='Running '+valid.name+'. Edits take effect on the next Run.';});
 $('disablePlaybook').onclick=()=>{combat.playbook=null;$('playStatus').textContent='Normal AI restored. Use Start AI battle for a new roster.';say('Coach routes disabled. Standard AI controls the current battle.');};
 refresh();return {update:()=>{if(root.open)draw();}};
}
