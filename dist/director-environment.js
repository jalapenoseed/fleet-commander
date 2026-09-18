import * as T from './three.js?v=0.8.0';
import {surfaceMaterial,SURFACE_NOISE,disposeGroup} from './scene-materials.js?v=0.8.0';
export const SCENERIES={stadium:'Stadium bowl',coast:'Coastal launch site',alpine:'Alpine valley',city:'City waterfront',moon:'Lunar test range',mars:'Martian test range'};
export const SKIES={day:'Clear daylight',golden:'Golden hour',sunset:'Coral sunset',dusk:'Blue hour',night:'Starry night',blackout:'Pitch black · moon & stars',lunar:'Lunar vacuum',martian:'Martian daylight'};
const PALETTES={
 lunar:{top:'#000000',horizon:'#000000',fog:'#000000',sun:'#fff9ed',elevation:.32,ambient:.06,direct:3.5,exposure:1,night:0,vacuum:1},
 martian:{top:'#493a34',horizon:'#d4a984',fog:'#b48668',sun:'#fff0d4',elevation:.35,ambient:.7,direct:1.5,exposure:1.1,night:0,mars:1},
 day:{top:'#2476b4',horizon:'#c6dfed',fog:'#aec7cd',sun:'#fff0d4',elevation:.68,ambient:1.1,direct:3.2,exposure:1,night:0},
 golden:{top:'#4275ab',horizon:'#f9c790',fog:'#bca68d',sun:'#ffd49e',elevation:.18,ambient:.95,direct:3,exposure:1,night:.1},
 sunset:{top:'#283962',horizon:'#f2a080',fog:'#8e858f',sun:'#ffaf79',elevation:.055,ambient:.9,direct:1.6,exposure:1.1,night:.5},
 dusk:{top:'#102542',horizon:'#839cbd',fog:'#596e85',sun:'#c6d4ff',elevation:.025,ambient:.8,direct:.65,exposure:1.25,night:.9},
 night:{top:'#020916',horizon:'#263d5b',fog:'#162b40',sun:'#bfd4ff',elevation:.4,ambient:.45,direct:.5,exposure:1.45,night:1},
 blackout:{top:'#000001',horizon:'#010205',fog:'#000001',sun:'#d4e0fa',elevation:.4,ambient:0,direct:0,exposure:1,night:1,black:1}
};
const random=(i,seed=1)=>{const n=Math.sin(i*127.1+seed*311.7)*43758.5453;return n-Math.floor(n);};
function smooth(a,b,x){const t=T.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}
function terrainNoise(x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);return T.MathUtils.lerp(T.MathUtils.lerp(random(ix+iz*157,9),random(ix+1+iz*157,9),u),T.MathUtils.lerp(random(ix+(iz+1)*157,9),random(ix+1+(iz+1)*157,9),u),v);}
export function terrainHeight(x,z,coastal=false){
 const edge=smooth(1080,1620,Math.max(Math.abs(x),Math.abs(z))),ridge=1-Math.abs(terrainNoise(x*.0015,z*.0015)*2-1);
 const detail=terrainNoise(x*.006,z*.006)*65+terrainNoise(x*.018,z*.018)*24+terrainNoise(x*.05,z*.05)*7;
 return Math.max(-.15,edge*(45+ridge*ridge*ridge*530+detail)*(coastal?smooth(-1600,-900,z):1)-.15);
}
function box(group,material,x,y,z,w,h,d){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;}
function batch(group,geometry,material,items,shadow=false){const mesh=new T.InstancedMesh(geometry,material,items.length),dummy=new T.Object3D();for(let i=0;i<items.length;i++){const p=items[i];dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(p.rx||0,p.ry||0,p.rz||0);dummy.scale.set(p.sx||1,p.sy||1,p.sz||1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);return mesh;}
export class DirectorEnvironment{
 constructor(scene,renderer){
  this.scene=scene;this.renderer=renderer;this.scenery='';this.sky='';this.wetness=0;this.clouds=.4;this.haze=1;this.materials=[];this.lights=[];this.clock=0;this.exposureEV=0;this.stageLevel=1;
  this.hemisphere=new T.HemisphereLight(0xc1d6ff,0x3f4138,1);this.sunlight=new T.DirectionalLight(0xffe3c0,3);this.sunlight.castShadow=true;this.sunlight.shadow.mapSize.set(2048,2048);Object.assign(this.sunlight.shadow.camera,{left:-220,right:220,top:220,bottom:-220,near:1,far:2200});this.sunlight.shadow.bias=-.00015;this.sunlight.shadow.normalBias=.3;this.sunlight.shadow.radius=3;scene.add(this.hemisphere,this.sunlight,this.sunlight.target);
  const groundMat=this.material('#50604a','grass');this.ground=new T.Mesh(new T.PlaneGeometry(10000,10000),groundMat);this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.18;this.ground.receiveShadow=true;scene.add(this.ground);
  this.skyUniforms={zenith:{value:new T.Color()},horizon:{value:new T.Color()},sunColor:{value:new T.Color()},sunDirection:{value:new T.Vector3()},cloudCover:{value:.4},skyTime:{value:0},night:{value:0},blackout:{value:0},atmosphere:{value:1}};
  this.dome=new T.Mesh(new T.SphereGeometry(7000,48,24),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:this.skyUniforms,vertexShader:'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 skyDirection;uniform vec3 zenith;uniform vec3 horizon;uniform vec3 sunColor;uniform vec3 sunDirection;uniform float cloudCover;uniform float skyTime;uniform float night;
 uniform float blackout;uniform float atmosphere;
 ${SURFACE_NOISE}
 void main(){vec3 d=normalize(skyDirection);float h=max(d.y,0.);float mu=max(dot(d,sunDirection),0.);vec3 c=mix(horizon,zenith,pow(h,.42));
 float mie=pow(mu,12.)*.28+pow(mu,80.)*.4;c+=sunColor*mie*(1.-night*.82)*atmosphere;float disc=smoothstep(.9997,.99992,mu);c+=sunColor*disc*8.;
 vec3 cloudPoint=d/max(.08,d.y)*2.2+vec3(skyTime*.0014,0,skyTime*.0005);float cloud=grFbm(cloudPoint);float coverage=smoothstep(.74-cloudCover*.35,.88-cloudCover*.26,cloud)*smoothstep(.02,.22,d.y);float silver=pow(mu,6.);vec3 cloudColor=mix(horizon*.6,vec3(.92,.94,.97),.5)*(1.-night*.8);cloudColor+=sunColor*silver*.35;c=mix(c,cloudColor,coverage*.82*atmosphere);
 // A visible cratered moon is independent of the world's illumination.
 if(blackout>.5){float craters=.65+.35*grNoise(d*1300.);c=mix(horizon,zenith,pow(h,.42))+sunColor*disc*craters*1.6;}
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`}));this.dome.renderOrder=-20;scene.add(this.dome);
  const positions=[];for(let i=0;i<1300;i++){const y=.08+random(i)*.92,a=i*2.39996323,r=Math.sqrt(1-y*y)*6200;positions.push(Math.cos(a)*r,y*6200,Math.sin(a)*r);}const starGeometry=new T.BufferGeometry();starGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));this.stars=new T.Points(starGeometry,new T.PointsMaterial({color:0xcadfff,size:random(2)*5+4,fog:false,transparent:true,opacity:.8,depthWrite:false}));scene.add(this.stars);
  this.backdrop=new T.Group();scene.add(this.backdrop);this.setScenery('stadium');this.setSky('golden');
 }
 material(color,kind='concrete',extra={}){const m=surfaceMaterial(color,kind,extra);this.materials.push(m);return m;}
 setSky(key){if(!SKIES[key])return;this.envDirty||=this.sky!==key;this.sky=key;const p=PALETTES[key],u=this.skyUniforms;u.zenith.value.set(p.top);u.horizon.value.set(p.horizon);u.sunColor.value.set(p.sun);u.sunDirection.value.set(-.6,p.elevation,-.8).normalize();u.night.value=p.night;
  u.blackout.value=p.black||0;u.atmosphere.value=p.vacuum?0:1;u.cloudCover.value=(p.vacuum||p.mars)?0:this.clouds;this.scene.environmentIntensity=p.black?0:.8;
  this.scene.fog=p.vacuum?null:new T.Fog(p.fog,(p.mars?360:700)/this.haze,(p.mars?4800:6200)/this.haze);this.hemisphere.intensity=p.ambient;this.hemisphere.color.set(p.horizon);this.sunlight.intensity=p.direct;this.sunlight.color.set(p.sun);this.renderer.toneMappingExposure=p.exposure*Math.pow(2,this.exposureEV);this.stars.visible=p.night>.7;this.stars.material.opacity=p.night*.85;
  for(const m of this.materials)if(m.userData.surface)m.userData.surface.nightLight.value=p.black?0:p.night;for(const light of this.lights)light.intensity=p.black?0:light.userData.power*(.12+p.night*.88)*this.stageLevel;if(this.fixtureMaterial)this.fixtureMaterial.emissiveIntensity=p.black?0:3*this.stageLevel;
 }
 setLighting({exposure=0,stage=1}={}){this.exposureEV=exposure;this.stageLevel=stage;this.setSky(this.sky||'golden');}
 setAtmosphere({wetness=this.wetness,clouds=this.clouds,haze=this.haze}={}){this.envDirty||=this.clouds!==T.MathUtils.clamp(clouds,0,1);this.wetness=T.MathUtils.clamp(wetness,0,1);this.clouds=T.MathUtils.clamp(clouds,0,1);this.haze=T.MathUtils.clamp(haze,.5,2);for(const m of this.materials)if(m.userData.surface)m.userData.surface.wetness.value=this.wetness;this.skyUniforms.cloudCover.value=this.clouds;this.setSky(this.sky||'golden');}
 setQuality(q){this.sunlight.shadow.mapSize.set(q.shadows,q.shadows);this.sunlight.shadow.map?.dispose();this.sunlight.shadow.map=null;}
 setScenery(key){if(!SCENERIES[key]||key===this.scenery)return;this.scenery=key;disposeGroup(this.backdrop);this.lights=[];this.materials=[this.ground.material];
  const concrete=this.material('#8a8c85'),metal=this.material('#343e44','metal',{metalness:.8,roughness:.4}),stone=this.material('#6a706a','stone'),glass=this.material('#5b7584','glass',{metalness:.65,roughness:.66}),warm=new T.MeshStandardMaterial({color:'#ffffff',emissive:'#ffdca8',emissiveIntensity:3,roughness:.3});
  this.fixtureMaterial=warm;
  this.ground.material.color.set({stadium:'#50654b',coast:'#a99a76',alpine:'#536447',city:'#535b57',moon:'#737479',mars:'#a27350'}[key]);
  // Smooth height-field ridges begin beyond the simulator's existing ±1024 m boundary.
  const terrain=new T.PlaneGeometry(9600,9600,192,192);terrain.rotateX(-Math.PI/2);const pos=terrain.attributes.position,colors=[];for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);let h=terrainHeight(x,z,key==='coast'||key==='city');if(key==='moon'||key==='mars'){const cr=Math.hypot(x-1700,z+1600),rim=Math.exp(-Math.pow((cr-450)/90,2))*105,bowl=-Math.exp(-Math.pow(cr/360,4))*65;h=Math.max(-.15,h+rim+bowl);}pos.setY(i,h-.12);const c=new T.Color(key==='moon'?'#707279':key==='mars'?'#966748':'#475b50').lerp(new T.Color(key==='moon'?'#a6a8ae':key==='mars'?'#c18f65':'#797a70'),smooth(150,430,h));if(key==='alpine')c.lerp(new T.Color('#c7d0cf'),smooth(450,570,h));colors.push(c.r,c.g,c.b);}terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3));terrain.computeVertexNormals();const mountains=new T.Mesh(terrain,this.material('#ffffff','stone',{vertexColors:true}));mountains.receiveShadow=true;this.backdrop.add(mountains);
  if(key==='stadium')this.buildStadium(concrete,metal,warm);
  if(key==='coast'||key==='city'){
   this.water=new T.Mesh(new T.PlaneGeometry(9600,5000,1,1),this.material('#214e61','water',{metalness:.45,roughness:.22,envMapIntensity:1.5}));this.water.rotation.x=-Math.PI/2;this.water.position.set(0,.06,-3700);this.backdrop.add(this.water);
   box(this.backdrop,concrete,0,1,-1195,3000,2,8);for(let i=-12;i<=12;i++){box(this.backdrop,metal,i*100,2.3,-1191,.18,2.6,.18);}box(this.backdrop,metal,0,3.1,-1191,2400,.12,.12);
  }
  if(key==='city')this.buildCity(concrete,glass,metal,warm);
  if(key==='alpine'||key==='coast')this.buildNature(stone,key);
  if(key==='moon'||key==='mars')this.buildPlanet(key);
  // A detailed launch apron gives the close/ground views readable scale and material.
  const apron=new T.Mesh(new T.PlaneGeometry(62,68),concrete);apron.rotation.x=-Math.PI/2;apron.position.set(0,.01,88);apron.receiveShadow=true;this.backdrop.add(apron);
  const lamps=[];for(let i=0;i<16;i++)for(const x of [-31,31])lamps.push({x,y:.2,z:56+i*4,sx:.2,sy:.12,sz:.6});batch(this.backdrop,new T.BoxGeometry(1,1,1),warm,lamps);
  this.setAtmosphere();
 }
 buildPlanet(key){
  const material=this.material(key==='moon'?'#8b8d91':'#b27d54','stone',{roughness:.96}),rocks=[];
  for(let i=0;i<520;i++){const a=i*2.399963,r=1140+random(i,22)*900,x=Math.sin(a)*r,z=Math.cos(a)*r;if(Math.max(Math.abs(x),Math.abs(z))<1080)continue;const h=terrainHeight(x,z),scale=1+Math.pow(random(i,8),3)*17;rocks.push({x,y:h+scale*.2,z,sx:scale,sy:scale*(.4+random(i,11)),sz:scale*(.6+random(i,12)),ry:a,rx:random(i,19)});}
  batch(this.backdrop,new T.IcosahedronGeometry(1,1),material,rocks,true);
  // Distant terrain is scenery; the flight/collision field remains flat.
 }
 buildStadium(concrete,metal,warm){
  const positions=[],indices=[],seats=[],pillars=[],roofRibs=[],steps=128,rows=18;for(let row=0;row<=rows;row++)for(let i=0;i<=steps;i++){const a=i/steps*Math.PI*2;positions.push(Math.sin(a)*(620+row*7),5+row*2.2,Math.cos(a)*(510+row*7));}
  for(let r=0;r<rows;r++)for(let i=0;i<steps;i++){const a=r*(steps+1)+i,b=a+steps+1;indices.push(a,b,a+1,a+1,b,b+1);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();const bowl=new T.Mesh(geo,concrete);bowl.material.side=T.DoubleSide;bowl.receiveShadow=true;bowl.castShadow=true;this.backdrop.add(bowl);
  for(let row=0;row<18;row++)for(let i=0;i<256;i++){if(i%16<2)continue;const a=i/256*Math.PI*2;seats.push({x:Math.sin(a)*(625+row*7),y:6.1+row*2.2,z:Math.cos(a)*(515+row*7),sx:3.3,sy:1.5,sz:1.2,ry:a});}batch(this.backdrop,new T.BoxGeometry(1,1,1),this.material('#344d60','metal',{roughness:.55,metalness:.25}),seats);
  for(let i=0;i<64;i++){const a=i/64*Math.PI*2;roofRibs.push({x:Math.sin(a)*733,y:63,z:Math.cos(a)*624,sx:2,sy:1.4,sz:110,ry:a,rx:-.14});pillars.push({x:Math.sin(a)*775,y:30,z:Math.cos(a)*664,sx:1.2,sy:60,sz:1.2});}batch(this.backdrop,new T.BoxGeometry(1,1,1),metal,roofRibs,true);batch(this.backdrop,new T.CylinderGeometry(1,1,1,8),metal,pillars,true);
  const ring=new T.Shape(),hole=new T.Path();ring.absellipse(0,0,786,678,0,Math.PI*2,false);hole.absellipse(0,0,674,566,0,Math.PI*2,true);ring.holes.push(hole);const canopy=new T.Mesh(new T.ShapeGeometry(ring,96),this.material('#b7b9ae','metal',{metalness:.3,roughness:.5,side:T.DoubleSide}));canopy.rotation.x=-Math.PI/2;canopy.position.y=65;canopy.castShadow=true;canopy.receiveShadow=true;this.backdrop.add(canopy);
  const field=new T.Mesh(new T.PlaneGeometry(130,210),this.material('#426845','grass'));field.rotation.x=-Math.PI/2;field.position.set(0,.015,-30);field.receiveShadow=true;this.backdrop.add(field);const lineMat=new T.MeshStandardMaterial({color:'#d3d9bd',roughness:.9});for(let i=-4;i<=4;i++){const stripe=new T.Mesh(new T.PlaneGeometry(130,.25),lineMat);stripe.rotation.x=-Math.PI/2;stripe.position.set(0,.03,-30+i*22);this.backdrop.add(stripe);}for(const x of [-64,64])box(this.backdrop,lineMat,x,.02,-30,.25,.02,210);
  for(const x of [-650,650])for(const z of [-390,390]){box(this.backdrop,metal,x,50,z,1.4,100,1.4);const panel=box(this.backdrop,warm,x,102,z,22,4,2);panel.lookAt(0,20,0);const light=new T.SpotLight('#d0e4ff',240000,1300,.55,.7,1.7);light.position.set(x,101,z);light.target.position.set(x*.25,0,z*.2);light.userData.power=240000;this.backdrop.add(light,light.target);this.lights.push(light);}
 }
 buildCity(concrete,glass,metal,warm){
  for(let i=0;i<56;i++){const x=(i%28-13.5)*87,z=-1490-Math.floor(i/28)*280-random(i,4)*90,h=55+Math.pow(random(i,2),1.4)*310,w=35+random(i,3)*32,d=38+random(i,6)*35;
   box(this.backdrop,glass,x,h/2,z,w,h,d);box(this.backdrop,concrete,x,5,z,w+12,10,d+12);box(this.backdrop,metal,x,h+1,z,w+2,2,d+2);
   if(i%3===0)box(this.backdrop,glass,x,h+17,z,w*.7,34,d*.7);for(let j=0;j<3;j++)box(this.backdrop,metal,x-w*.3+j*w*.25,h+3,z,4,5,7);
   if(i%5===0){box(this.backdrop,metal,x,h+22,z,.7,44,.7);box(this.backdrop,warm,x,h+44,z,1.2,1.2,1.2);}
  }
  for(const x of [-1050,1050]){box(this.backdrop,concrete,x,2,0,20,4,1900);for(let i=-8;i<=8;i++){box(this.backdrop,metal,x,6,i*100,.3,12,.3);box(this.backdrop,warm,x,12,i*100,3,.3,.7);}}
 }
 buildNature(stone,key){
  const trunks=[],crowns=[],rocks=[];for(let i=0;i<480;i++){const a=i*2.3999632,r=1160+random(i,8)*620,x=Math.sin(a)*r,z=Math.cos(a)*r;if(Math.max(Math.abs(x),Math.abs(z))<1100||(key==='coast'&&z<-950))continue;const y=terrainHeight(x,z,key==='coast'),h=10+random(i,4)*17;trunks.push({x,y:y+h*.35,z,sx:.55,sy:h*.7,sz:.55});for(let j=0;j<4;j++)crowns.push({x,y:y+h*(.48+j*.12),z,sx:h*(.23-j*.04),sy:h*.34,sz:h*(.23-j*.04)});}
  batch(this.backdrop,new T.CylinderGeometry(.7,1,1,7),this.material('#605449','stone'),trunks,true);batch(this.backdrop,new T.ConeGeometry(1,1,18,5),this.material('#294e3c','grass'),crowns,true);
  for(let i=0;i<90;i++){const a=i*2.39,r=1050+random(i)*300,x=Math.sin(a)*r,z=Math.cos(a)*r;if(Math.max(Math.abs(x),Math.abs(z))<1080||(key==='coast'&&z<-1150))continue;rocks.push({x,y:terrainHeight(x,z,key==='coast'),z,sx:4+random(i,2)*12,sy:3+random(i,3)*9,sz:6+random(i,5)*9,ry:a});}batch(this.backdrop,new T.IcosahedronGeometry(1,2),stone,rocks,true);
 }
 update(camera,time=0){
  this.clock=time;this.dome.position.copy(camera.position);this.stars.position.copy(camera.position);this.skyUniforms.skyTime.value=time;for(const m of this.materials)if(m.userData.surface)m.userData.surface.surfaceTime.value=time;
  const ahead=camera.getWorldDirection(new T.Vector3()).multiplyScalar(180).add(camera.position),focus=new T.Vector3(T.MathUtils.clamp(ahead.x,-950,950),0,T.MathUtils.clamp(ahead.z,-950,950));this.sunlight.target.position.copy(focus);this.sunlight.position.copy(focus).addScaledVector(this.skyUniforms.sunDirection.value,1400);this.sunlight.target.updateMatrixWorld();
  if(this.envDirty&&this.renderer.isWebGLRenderer&&this.renderer.extensions.has('EXT_color_buffer_float')){this.envDirty=false;this.pmrem??=new T.PMREMGenerator(this.renderer);const skyScene=new T.Scene(),skyMesh=new T.Mesh(this.dome.geometry,this.dome.material);skyScene.add(skyMesh);const target=this.pmrem.fromScene(skyScene,.04,.1,10000);const old=this.environmentTarget;this.environmentTarget=target;this.scene.environment=target.texture;this.scene.environmentIntensity=this.sky==='blackout'?0:.8;old?.dispose();}
 }
 dispose(){disposeGroup(this.backdrop);this.backdrop.removeFromParent();for(const root of [this.ground,this.dome,this.stars]){root.geometry.dispose();root.material.dispose();root.removeFromParent();}this.scene.environment=null;this.environmentTarget?.dispose();this.pmrem?.dispose();this.hemisphere.removeFromParent();this.sunlight.shadow.map?.dispose();this.sunlight.removeFromParent();this.sunlight.target.removeFromParent();}
}
