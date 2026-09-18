const SECTIONS={combat:['Arena','01','COMMAND'],squads:['Squads','02','COMMAND'],fleet:['Fleet','03','COMMAND'],program:['Program','04','CREATE'],art:['Art studio','05','CREATE'],director:['Director','06','CREATE'],simulation:['Physics','07','LAB'],replays:['Replays','08','LAB'],memory:['Journal','09','LAB'],games:['Challenges','10','SYSTEM'],saves:['Saves','11','SYSTEM']};

export function mountCommandShell({say}){
 const $=id=>document.getElementById(id),workspace=document.querySelector('.workspace'),panel=document.querySelector('.control-panel'),tabs=document.querySelector('.tabs');
 document.body.classList.add('command-shell');panel.id='controlPanel';
 const playbook=$('battlePlaybook');if(playbook){const squads=document.createElement('section');squads.id='tab-squads';squads.className='tab-panel';squads.hidden=true;squads.innerHTML='<div class="section-heading"><span class="eyebrow">SQUAD PLAYBOOK</span><h2>Draw the next round.</h2><p>Compose fictional arena squads, assign game roles and save the playbook.</p></div>';squads.append(playbook);document.querySelector('.panel-scroll').append(squads);}
 const rail=document.createElement('nav');rail.className='command-rail';rail.setAttribute('aria-label','Command center');
 const title=document.createElement('div');title.className='panel-title';title.innerHTML='<span id="currentSection">Arena</span><button id="closePanel" aria-label="Close controls">×</button>';panel.prepend(title);
 for(const [id,[name,n,group]] of Object.entries(SECTIONS)){
  if(!$('tab-'+id))continue;let button=tabs.querySelector(`[data-tab="${id}"]`);
  if(!button){button=document.createElement('button');button.dataset.tab=id;}button.innerHTML=`<span aria-hidden="true">${n}</span><b>${name}</b>`;button.title=group+' / '+name;button.setAttribute('aria-controls','tab-'+id);button.addEventListener('click',()=>show(id));rail.append(button);
 }
 tabs.remove();workspace.prepend(rail);
 const tools=document.createElement('div');tools.className='shell-tools';tools.innerHTML='<button id="findControl" aria-label="Find a control">Find a control <kbd>/</kbd></button><button id="menuToggle" aria-controls="controlPanel" aria-expanded="true">Menu</button>';
 document.querySelector('.commander-header').append(tools);$('quickGames').hidden=true;
 document.querySelector('.wordmark small').textContent='SIMULATION SANDBOX / 08';document.querySelector('.module-title h1').textContent='Command center';document.querySelector('.module-title p').textContent='Earth · Moon · Mars';
 const dialog=document.createElement('dialog');dialog.className='command-search';dialog.setAttribute('aria-label','Find a control');dialog.innerHTML='<form method="dialog"><strong>Find a control</strong><button aria-label="Close search">×</button></form><label class="search-label">Search menus and settings<input id="controlQuery" type="search" placeholder="Try battery, camera, squads, replay…" autocomplete="off"></label><div id="controlResults"></div><p class="hint">/ opens search · Escape closes · Menu hides the inspector</p>';document.body.append(dialog);
 const setOpen=open=>{document.body.classList.toggle('inspector-closed',!open);$('menuToggle').setAttribute('aria-expanded',String(open));};
 function show(id){for(const p of document.querySelectorAll('.tab-panel'))p.hidden=p.id!=='tab-'+id;for(const b of rail.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(b.dataset.tab===id));$('currentSection').textContent=SECTIONS[id]?.[0]||id;setOpen(true);try{localStorage.setItem('fleetcommander.menu.v1',id);}catch{}document.querySelector('.panel-scroll').scrollTop=0;}
 const observer=new MutationObserver(()=>{const p=[...document.querySelectorAll('.tab-panel')].find(p=>!p.hidden);if(!p)return;const id=p.id.slice(4);$('currentSection').textContent=SECTIONS[id]?.[0]||id;for(const b of rail.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(b.dataset.tab===id));});for(const p of document.querySelectorAll('.tab-panel'))observer.observe(p,{attributes:true,attributeFilter:['hidden']});
 $('menuToggle').addEventListener('click',()=>setOpen(document.body.classList.contains('inspector-closed')));$('closePanel').addEventListener('click',()=>setOpen(false));
 // Collapsing groups never discards their input values or listeners.
 for(const details of document.querySelectorAll('.tab-panel details'))details.open=details.id==='battlePlaybook';
 let entries=[];
 function indexControls(){entries=[];for(const p of document.querySelectorAll('.tab-panel')){
  const section=p.id.slice(4);for(const el of p.querySelectorAll('label,summary,button[id]')){let target=el.matches('label')?el.querySelector('input,select,textarea'):el;if(!target)continue;const clone=el.cloneNode(true);for(const child of clone.querySelectorAll('input,select,textarea,output'))child.remove();const text=clone.textContent.trim().replace(/\s+/g,' ').slice(0,100);if(text)entries.push({section,text,target});}
 }}
 function results(){const q=$('controlQuery').value.trim().toLowerCase(),out=$('controlResults');out.replaceChildren();let matches=entries.filter(e=>(e.text+' '+SECTIONS[e.section]?.[0]).toLowerCase().includes(q)).slice(0,16);if(!q)matches=Object.entries(SECTIONS).filter(([id])=>$('tab-'+id)).map(([section,[text]])=>({section,text,target:$('tab-'+section)}));
  for(const item of matches){const b=document.createElement('button'),s=document.createElement('small');b.type='button';b.append(document.createTextNode(item.text));s.textContent=SECTIONS[item.section]?.[0]||item.section;b.append(s);b.addEventListener('click',()=>{dialog.close();show(item.section);let parent=item.target.parentElement;while(parent&&parent!==panel){if(parent.tagName==='DETAILS')parent.open=true;if(parent.dataset.taskPane)document.querySelector(`[data-task="${parent.dataset.taskPane}"]`)?.click();parent=parent.parentElement;}item.target.scrollIntoView({block:'center'});item.target.focus?.();item.target.classList.add('found-control');setTimeout(()=>item.target.classList.remove('found-control'),1400);});out.append(b);}
  if(!matches.length)out.textContent='No controls found. Try a shorter name.';
 }
 function openSearch(){indexControls();$('controlQuery').value='';results();dialog.showModal();$('controlQuery').focus();}
 $('findControl').addEventListener('click',openSearch);$('controlQuery').addEventListener('input',results);
 const keydown=e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&!e.target.isContentEditable){e.preventDefault();openSearch();}if(e.key==='Escape'&&!dialog.open)setOpen(false);};document.addEventListener('keydown',keydown);
 let initial='combat';try{const saved=localStorage.getItem('fleetcommander.menu.v1');if(SECTIONS[saved]&&$('tab-'+saved))initial=saved;}catch{}show(initial);if(matchMedia('(max-width:720px)').matches)setOpen(false);
 return {show,dispose(){observer.disconnect();document.removeEventListener('keydown',keydown);dialog.remove();}};
}
