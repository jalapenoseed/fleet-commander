import fs from 'node:fs';
import * as T from '../dist/three.js?v=0.6.0';
import {surfaceMaterial} from '../dist/scene-materials.js?v=0.6.0';
import {DirectorEnvironment} from '../dist/director-environment.js?v=0.6.0';
import {ScenePostFX} from '../dist/scene-postfx.js?v=0.6.0';
import {AircraftBeacons} from '../dist/aircraft-beacons.js?v=0.6.0';
import {SwarmLighting} from '../dist/swarm-lighting.js?v=0.6.0';
import {BattleEffects} from '../dist/battle-effects.js?v=0.6.0';
const shaders=[];
const counts={NUM_DIR_LIGHTS:1,NUM_POINT_LIGHTS:14,NUM_SPOT_LIGHTS:4,NUM_HEMI_LIGHTS:1,NUM_RECT_AREA_LIGHTS:0,NUM_DIR_LIGHT_SHADOWS:1,NUM_POINT_LIGHT_SHADOWS:0,NUM_SPOT_LIGHT_SHADOWS:0,NUM_SPOT_LIGHT_MAPS:0,NUM_SPOT_LIGHT_COORDS:0,NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS:0,NUM_CLIPPING_PLANES:0,UNION_CLIPPING_PLANES:0};
function resolve(s){s=s.replace(/#include <(\w+)>/g,(_,k)=>resolve(T.ShaderChunk[k]||''));for(const [k,v]of Object.entries(counts).sort((a,b)=>b[0].length-a[0].length))s=s.replaceAll(k,String(v));s=s.replace(/#pragma unroll_loop_start\s+for\s*\(\s*int i = (\d+); i < (\d+); i\s*\+\+\s*\)\s*{([\s\S]+?)}\s*#pragma unroll_loop_end/g,(_,a,b,body)=>Array.from({length:Number(b)-Number(a)},(_,j)=>body.replace(/\[\s*i\s*\]/g,'[ '+(j+Number(a))+' ]').replace(/UNROLLED_LOOP_INDEX/g,String(j+Number(a)))).join(''));return s;}
function pack(name,vs,frag,physical=false){const defines=physical?'#define USE_ENVMAP\n#define ENVMAP_TYPE_CUBE_UV\n#define ENVMAP_MODE_REFLECTION\n#define CUBEUV_TEXEL_WIDTH 0.0013020833\n#define CUBEUV_TEXEL_HEIGHT 0.0009765625\n#define CUBEUV_MAX_MIP 8.0\n#define USE_FOG\n#define USE_SHADOWMAP\n#define SHADOWMAP_TYPE_PCF_SOFT\n#define USE_COLOR\n#define USE_INSTANCING\n':'';
 const common='#version 300 es\nprecision highp float;\nprecision highp int;\n#define texture2D texture\n#define textureCube texture\n'+defines;
 const vertex=common+'#define attribute in\n#define varying out\nuniform mat4 modelMatrix,modelViewMatrix,viewMatrix,projectionMatrix;uniform mat3 normalMatrix;uniform vec3 cameraPosition;uniform bool isOrthographic;in vec3 position;in vec3 normal;in vec2 uv;in vec3 color;in mat4 instanceMatrix;\n'+resolve(vs.replace('attribute vec3 color;', ''));
 const fragment=common+'#define TONE_MAPPING\n#define varying in\n#define gl_FragColor pc_fragColor\nout highp vec4 pc_fragColor;uniform mat4 viewMatrix;uniform vec3 cameraPosition;uniform bool isOrthographic;\n'+T.ShaderChunk.tonemapping_pars_fragment+'\nvec3 toneMapping(vec3 color){return ACESFilmicToneMapping(color);}\n'+T.ShaderChunk.colorspace_pars_fragment+'\nvec4 linearToOutputTexel(vec4 value){return sRGBTransferOETF(value);}\n'+resolve(frag);
 shaders.push({name,vertex,fragment});
}
for(const kind of ['concrete','grass','glass','water','stone','metal']){const m=surfaceMaterial('#aaa',kind),s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};m.onBeforeCompile(s);pack(kind,s.vertexShader,s.fragmentShader,true);}
const scene=new T.Scene(),env=new DirectorEnvironment(scene,{});pack('sky',env.dome.material.vertexShader,env.dome.material.fragmentShader);env.dispose();
const post=new ScenePostFX({extensions:{has:()=>true},capabilities:{maxSamples:4}});for(const key of ['blur','composite'])pack(key,post[key].vertexShader,post[key].fragmentShader);post.dispose();
const root=new T.Scene(),beacons=new AircraftBeacons(root),lighting=new SwarmLighting(root);for(const [key,m]of [['beacons',beacons.points.material],['ground-pools',lighting.pools.material]])pack(key,m.vertexShader,m.fragmentShader);beacons.dispose();lighting.dispose();
const effects=new BattleEffects(root);pack('battle-particles',effects.points.material.vertexShader,effects.points.material.fragmentShader);effects.dispose();
fs.mkdirSync('qa-output',{recursive:true});fs.writeFileSync('qa-output/shaders.json',JSON.stringify(shaders));console.log('Exported',shaders.length,'shader programs, including physical lighting, fog, instancing and shadows.');
