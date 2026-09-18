import * as T from './three.js?v=0.8.0';
export const SURFACE_NOISE=`
float grHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float grNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(grHash(i),grHash(i+vec3(1,0,0)),f.x),mix(grHash(i+vec3(0,1,0)),grHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(grHash(i+vec3(0,0,1)),grHash(i+vec3(1,0,1)),f.x),mix(grHash(i+vec3(0,1,1)),grHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float grFbm(vec3 p){return grNoise(p)*.55+grNoise(p*2.03)*.28+grNoise(p*4.09)*.12+grNoise(p*8.17)*.05;}
`;
// Keep the standard physical lighting/shadow/environment path. Only surface
// albedo, microscopic relief, roughness and window emission are procedural.
export function surfaceMaterial(color,kind='concrete',extra={}){
 const m=new T.MeshStandardMaterial({color,roughness:.85,metalness:0,...extra});
 const uniforms={surfaceTime:{value:0},nightLight:{value:1},wetness:{value:0}};m.userData.surface=uniforms;
 const mode={concrete:0,grass:1,glass:2,water:3,stone:4,metal:5}[kind]??0;
 m.customProgramCacheKey=()=>`fleet-surface-3-${mode}`;
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader='varying vec3 surfacePosition;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 surfaceWorld=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nsurfaceWorld=instanceMatrix*surfaceWorld;\n#endif\nsurfacePosition=(modelMatrix*surfaceWorld).xyz;\n#include <project_vertex>`);
  shader.fragmentShader=`varying vec3 surfacePosition;uniform float surfaceTime;uniform float nightLight;uniform float wetness;\n${SURFACE_NOISE}\n`+shader.fragmentShader;
  let colorCode=`float grain=grFbm(surfacePosition*.65);float macro=grNoise(surfacePosition*.025);diffuseColor.rgb*=.72+grain*.36+macro*.18;`;
  if(kind==='grass')colorCode+=`float stripe=step(.5,fract(surfacePosition.z/22.));diffuseColor.rgb*=mix(.86,1.08,stripe);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.75,.8,.42),grNoise(surfacePosition*.12)*.3);`;
  if(kind==='concrete')colorCode+=`vec2 seam=abs(fract(surfacePosition.xz/8.+.5)-.5);float joint=1.-smoothstep(.005,.018,min(seam.x,seam.y));diffuseColor.rgb*=1.-joint*.22;`;
  if(kind==='glass')colorCode=`vec2 cells=vec2((surfacePosition.x+surfacePosition.z)/3.4,surfacePosition.y/3.6);vec2 cell=fract(cells);float pane=step(.12,cell.x)*step(.14,cell.y)*step(cell.x,.86)*step(cell.y,.82);float occupied=step(.46,grHash(vec3(floor(cells),7.)));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.12,.2,.25),pane*.75);`;
  if(kind==='water')colorCode=`float grain=grNoise(surfacePosition*.06);diffuseColor.rgb*=.8+.25*grain;`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n'+colorCode);
  let bump=`float heightDetail=grNoise(surfacePosition*8.)*.016+grNoise(surfacePosition*1.5)*.04;`;
  if(kind==='grass')bump=`float heightDetail=grNoise(surfacePosition*12.)*.055+grNoise(surfacePosition*1.8)*.08;`;
  if(kind==='water')bump=`float heightDetail=sin(surfacePosition.x*.21+surfacePosition.z*.15+surfaceTime*.85)*.20+sin(surfacePosition.x*.48-surfacePosition.z*.3+surfaceTime*1.2)*.06+grNoise(surfacePosition*1.2+vec3(surfaceTime*.15,0,0))*.03;`;
  if(kind!=='glass')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n${bump}
   vec3 dq0=dFdx(-vViewPosition),dq1=dFdy(-vViewPosition);vec3 r0=cross(dq1,normal),r1=cross(normal,dq0);float determinant=dot(dq0,r0);float detailFade=1.-smoothstep(1.,8.,length(fwidth(surfacePosition)));normal=normalize((abs(determinant)+1e-9)*normal-sign(determinant)*(dFdx(heightDetail)*r0+dFdy(heightDetail)*r1)*detailFade);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor-wetness*.45${kind==='glass'?'-pane*.48':'+(grain-.5)*.1'},.08,1.);`);
  if(kind==='glass')shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(1.0,.66,.31)*pane*occupied*nightLight*1.8;');
 };
 return m;
}
export function disposeGroup(root){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.clear();}
