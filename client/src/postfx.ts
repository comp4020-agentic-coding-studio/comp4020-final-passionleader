import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

// High quality's finish (plan 105): the scene goes through a few passes
// instead of straight to the screen. A soft bloom, so the sun on glass, lamps
// and lit windows glow; then the usual tone mapping (OutputPass reads the
// renderer's exposure, so day and night still work); then one cheap pass that
// grades the colour a little warmer and richer, darkens the corners and
// softens the very top and bottom of the screen, like a shallow depth of
// field. Low and Medium never load this: they render as before.

const FINISH = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    texel: { value: new THREE.Vector2(1 / 960, 1 / 540) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    varying vec2 vUv;
    void main() {
      // Depth-of-field-like softening: none across the middle where the player
      // stands, growing towards the top (far away) and a little at the bottom.
      float far = 0.8 * smoothstep(0.7, 1.0, vUv.y) + 0.4 * smoothstep(0.18, 0.0, vUv.y);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (far > 0.0) {
        vec2 r = texel * 1.6 * far;
        vec3 blur = c * 0.2;
        blur += texture2D(tDiffuse, vUv + vec2( r.x, 0.0)).rgb * 0.1;
        blur += texture2D(tDiffuse, vUv + vec2(-r.x, 0.0)).rgb * 0.1;
        blur += texture2D(tDiffuse, vUv + vec2(0.0,  r.y)).rgb * 0.1;
        blur += texture2D(tDiffuse, vUv + vec2(0.0, -r.y)).rgb * 0.1;
        blur += texture2D(tDiffuse, vUv + r).rgb * 0.1;
        blur += texture2D(tDiffuse, vUv - r).rgb * 0.1;
        blur += texture2D(tDiffuse, vUv + vec2(r.x, -r.y)).rgb * 0.1;
        blur += texture2D(tDiffuse, vUv + vec2(-r.x, r.y)).rgb * 0.1;
        c = mix(c, blur, min(far, 1.0));
      }
      // Grade: a touch more contrast and colour, the highlights a little warm.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.12);
      c = (c - 0.5) * 1.05 + 0.5;
      c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.95), smoothstep(0.4, 1.0, l));
      // Vignette: the corners about a fifth darker.
      vec2 d = vUv - 0.5;
      c *= 1.0 - 0.22 * smoothstep(0.25, 0.75, dot(d, d) * 2.0);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export type PostFx = { render(): void; setSize(w: number, h: number): void };

export function makePostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): PostFx {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  // Antialiased like the plain renderer (High has antialias on): a render target has none by default.
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // Only what is far brighter than sunlit paving (before tone mapping) blooms: sun glints on glass and
  // water, lamp heads, lit windows at night. At 0.92 the white paving itself glowed into a haze.
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.18, 0.35, 3.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FINISH);
  composer.addPass(finish);
  return {
    render: () => composer.render(),
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      finish.uniforms.texel!.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio()));
    },
  };
}
