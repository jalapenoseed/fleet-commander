import * as T from './three.js?v=0.9.0';

/**
 * ELI5: Post-processing happens after the 3D scene is drawn. It adds restrained
 * beacon bloom and final color output. Higher quality costs more GPU work but
 * never changes how many drones are simulated or where they fly.
 */

// ELI5: `detail` is the distance for detailed aircraft; shadow values are texture sizes.
export const GRAPHICS_QUALITY = {
  performance: { pixelRatio: 1, shadows: 1024, samples: 0, bloom: false, detail: 45 },
  balanced: { pixelRatio: 1.5, shadows: 2048, samples: 2, bloom: true, detail: 90 },
  cinema: { pixelRatio: 2, shadows: 4096, samples: 4, bloom: true, detail: 160 },
};
const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
export class ScenePostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.available = !!renderer.extensions.has('EXT_color_buffer_float');
    this.enabled = this.available;
    this.strength = 0.32;
    this.radius = 1;
    this.width = 1;
    this.height = 1;
    const opts = {
      type: this.available ? T.HalfFloatType : T.UnsignedByteType,
      minFilter: T.LinearFilter,
      magFilter: T.LinearFilter,
      depthBuffer: false,
    };
    this.sceneTarget = new T.WebGLRenderTarget(1, 1, { ...opts, depthBuffer: true });
    this.levels = Array.from({ length: 3 }, () => ({
      a: new T.WebGLRenderTarget(1, 1, opts),
      b: new T.WebGLRenderTarget(1, 1, opts),
    }));
    this.blurA = this.levels[0].a;
    this.blurB = this.levels[0].b;
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new T.Mesh(new T.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.blur = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: {
        image: { value: null },
        direction: { value: new T.Vector2() },
        threshold: { value: 0 },
      },
      vertexShader,
      fragmentShader: `varying vec2 vUv;uniform sampler2D image;uniform vec2 direction;uniform float threshold;
 vec3 sampleBright(vec2 uv){vec3 c=texture2D(image,uv).rgb;float l=max(c.r,max(c.g,c.b));float soft=clamp(l-threshold+.5,0.,1.);float contribution=max(l-threshold,soft*soft*.25)/max(l,.0001);return threshold>0.?c*contribution:c;}
 void main(){vec3 c=sampleBright(vUv)*.227027;c+=(sampleBright(vUv+direction*1.384615)+sampleBright(vUv-direction*1.384615))*.316216;c+=(sampleBright(vUv+direction*3.230769)+sampleBright(vUv-direction*3.230769))*.070270;gl_FragColor=vec4(c,1.);}`,
    });
    this.composite = new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        image: { value: this.sceneTarget.texture },
        bloom: { value: this.levels[0].a.texture },
        bloomWide: { value: this.levels[1].a.texture },
        bloomVeil: { value: this.levels[2].a.texture },
        strength: { value: this.strength },
      },
      vertexShader,
      fragmentShader: `varying vec2 vUv;uniform sampler2D image;uniform sampler2D bloom;uniform sampler2D bloomWide;uniform sampler2D bloomVeil;uniform float strength;
 void main(){vec3 glow=texture2D(bloom,vUv).rgb*.55+texture2D(bloomWide,vUv).rgb*.30+texture2D(bloomVeil,vUv).rgb*.15;
 vec3 c=texture2D(image,vUv).rgb+glow*strength;float vignette=1.-.08*pow(length((vUv-.5)*1.25),2.);gl_FragColor=vec4(c*vignette,1.);
 #include <tonemapping_fragment>
 // Preserve bright LED hue while keeping the filmic luminance shoulder.
 float peak=max(c.r,max(c.g,c.b));vec3 hue=c/max(peak,.0001);float mappedPeak=max(gl_FragColor.r,max(gl_FragColor.g,gl_FragColor.b));
 gl_FragColor.rgb=mix(gl_FragColor.rgb,hue*mappedPeak,smoothstep(1.2,5.,peak)*.65);
 #include <colorspace_fragment>
 }`,
    });
  }
  setQuality(key) {
    const q = GRAPHICS_QUALITY[key] || GRAPHICS_QUALITY.balanced;
    this.enabled = q.bloom && this.available;
    const samples = Math.min(q.samples, this.renderer.capabilities.maxSamples || 0);
    if (samples !== this.sceneTarget.samples) {
      this.sceneTarget.samples = samples;
      this.sceneTarget.dispose();
    }
  }
  resize(w, h) {
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    this.sceneTarget.setSize(this.width, this.height);
    this.levels.forEach((level, i) => {
      for (const t of [level.a, level.b])
        t.setSize(Math.max(1, this.width >> (i + 2)), Math.max(1, this.height >> (i + 2)));
    });
  }
  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }
  render(scene, camera) {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(scene, camera);
    for (let i = 0; i < this.levels.length; i++) {
      const { a, b } = this.levels[i],
        source = i ? this.levels[i - 1].a : this.sceneTarget;
      this.blur.uniforms.image.value = source.texture;
      this.blur.uniforms.threshold.value = i ? 0 : 1.15;
      this.blur.uniforms.direction.value.set(this.radius / source.width, 0);
      this.pass(this.blur, b);
      this.blur.uniforms.image.value = b.texture;
      this.blur.uniforms.threshold.value = 0;
      this.blur.uniforms.direction.value.set(0, this.radius / b.height);
      this.pass(this.blur, a);
    }
    this.composite.uniforms.strength.value = Number.isFinite(this.strength)
      ? T.MathUtils.clamp(this.strength, 0, 0.8)
      : 0.32;
    this.pass(this.composite, null);
  }
  dispose() {
    this.sceneTarget.dispose();
    for (const l of this.levels) {
      l.a.dispose();
      l.b.dispose();
    }
    this.blur.dispose();
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}
