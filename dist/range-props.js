import * as T from './three.js?v=0.8.0';
import {surfaceMaterial} from './scene-materials.js?v=0.8.0';
export function buildRangeObstacles(boxes){
 const group=new T.Group(),wall=surfaceMaterial('#87918b','concrete'),roof=surfaceMaterial('#434e55','metal',{metalness:.65,roughness:.5}),dark=surfaceMaterial('#2c383c','metal',{metalness:.55,roughness:.42}),trim=surfaceMaterial('#b9b8a8','metal',{metalness:.4,roughness:.5});
 const add=(g,m,x,y,z,w,h,d)=>{const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;};
 for(const [i,b]of boxes.entries()){
  const building=new T.Group();building.position.set(b.x,0,b.z);group.add(building);add(building,wall,0,b.h/2,0,b.w*2,b.h,b.d*2);add(building,roof,0,b.h+.15,0,b.w*2+.6,.3,b.d*2+.6);
  // Panel joints, service doors and roof equipment keep the original collision envelope.
  for(let x=-b.w+2;x<b.w;x+=4){add(building,trim,x,b.h/2,b.d+.03,.045,b.h,.045);add(building,trim,x,b.h/2,-b.d-.03,.045,b.h,.045);}
  for(let y=3;y<b.h;y+=4){add(building,dark,0,y,b.d+.045,b.w*1.7,.07,.04);}
  add(building,dark,-b.w*.5,1.5,b.d+.065,1.6,3,.09);add(building,trim,-b.w*.5+.5,1.4,b.d+.13,.1,.35,.06);
  for(let x=-b.w+3;x<b.w;x+=5){add(building,dark,x,b.h-3,b.d+.06,2,1.8,.1);add(building,trim,x,b.h-2.05,b.d+.1,2.2,.1,.15);}
  for(let j=0;j<3;j++){add(building,roof,-b.w*.5+j*b.w*.5,b.h+.9,0,2.5,1.5,3.5);for(let k=0;k<5;k++)add(building,dark,-b.w*.5+j*b.w*.5,b.h+.95,k*.5-1,2.2,.1,.15);}
  const lamp=new T.Mesh(new T.BoxGeometry(1.8,.18,.15),new T.MeshStandardMaterial({color:'#d8edec',emissive:'#abd3d6',emissiveIntensity:2}));lamp.position.set(-b.w*.5,3.25,b.d+.15);building.add(lamp);
 }
 return group;
}
