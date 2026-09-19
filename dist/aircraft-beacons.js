import * as T from './three.js?v=0.9.0';
import { beaconColor } from './beacon-palette.js?v=0.9.0';
import { MAX_COMMANDER_DRONES } from './fleet-commander-core.js?v=0.9.0';

// Optical point-spread function: a tiny emitter, faint glare and a brief white
// identification strobe. Surface illumination is managed by SwarmLighting.
export class AircraftBeacons {
  constructor(root) {
    this.colors = new Map();
    const geometry = new T.BufferGeometry();
    for (const [name, size] of [
      ['position', 3],
      ['color', 3],
      ['power', 1],
      ['phase', 1],
    ])
      geometry.setAttribute(
        name,
        new T.BufferAttribute(new Float32Array(MAX_COMMANDER_DRONES * size), size).setUsage(
          T.DynamicDrawUsage,
        ),
      );
    geometry.setDrawRange(0, 0);
    const material = new T.ShaderMaterial({
      uniforms: {
        size: { value: 9 },
        time: { value: 0 },
        steady: { value: 0 },
        intensity: { value: 1 },
        haze: { value: 1 },
      },
      vertexShader: `
   attribute vec3 color; attribute float power; attribute float phase;
   uniform float size; uniform float time; uniform float steady; uniform float intensity; uniform float haze;
   varying vec3 lampColor; varying float lampPower; varying float flash;
   void main(){vec4 view=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*view;
    float distanceToEye=max(1.0,-view.z);
    gl_PointSize=clamp(size*(0.72+14.0/distanceToEye),3.0,28.0);
    lampColor=color;lampPower=power*intensity*exp(-distanceToEye*.00022*haze);
    float cycle=fract(time*0.7+phase);flash=(1.0-steady)*(1.0-smoothstep(0.015,0.07,cycle));
   }`,
      fragmentShader: `
   varying vec3 lampColor; varying float lampPower; varying float flash;
   void main(){vec2 p=(gl_PointCoord-0.5)*2.0;float r2=dot(p,p);
    float footprint=max(fwidth(p.x),fwidth(p.y));float core=exp(-r2/(.010+footprint*footprint*.35)),halo=exp(-r2*11.0)*0.16;
    float rays=exp(-min(p.x*p.x,p.y*p.y)*850.0)*exp(-r2*14.0)*0.045;
    float light=(core+halo+rays)*lampPower;if(light<0.002)discard;
    vec3 color=mix(lampColor,vec3(1.0,0.98,0.91),clamp(core*0.22+flash*0.45,0.0,1.0));
    gl_FragColor=vec4(color*(5.0+flash*1.5),min(light,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
   }`,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: T.AdditiveBlending,
      toneMapped: true,
    });
    this.points = new T.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    root.add(this.points);
  }
  update(
    drones,
    camera,
    { time = 0, size = 9, pixelRatio = 1, reducedMotion = false, intensity = 1, haze = 1 } = {},
  ) {
    const a = this.points.geometry.attributes;
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i],
        pos = d.pos,
        active = !['DOCK', 'QUEUED', 'LANDED'].includes(d.mode);
      a.position.setXYZ(i, pos[0], pos[1] + 0.22, pos[2]);
      const key = d.beaconHex || d.color;
      if (this.colors.size > 8192) this.colors.clear();
      if (!this.colors.has(key))
        this.colors.set(key, new T.Color(d.beaconHex || beaconColor(d.color).hex));
      const color = this.colors.get(key);
      a.color.setXYZ(i, color.r, color.g, color.b);
      a.power.setX(i, active ? 1 : 0.16);
      a.phase.setX(i, (Number(d.id.slice(6)) * 0.618034) % 1);
    }
    for (const attr of Object.values(a)) attr.needsUpdate = true;
    this.points.geometry.setDrawRange(0, drones.length);
    Object.assign(this.points.material.uniforms.size, { value: size * pixelRatio });
    this.points.material.uniforms.time.value = time;
    this.points.material.uniforms.steady.value = reducedMotion ? 1 : 0;
    this.points.material.uniforms.intensity.value = intensity;
    this.points.material.uniforms.haze.value = haze;
  }
  clear() {
    this.points.geometry.setDrawRange(0, 0);
  }
  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points.removeFromParent();
  }
}
