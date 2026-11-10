import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Постобробка під макет hud.jpg: світіння (bloom) емісивних частин — очей ворогів, ламп,
 * спалахів, — потім ACES і фінальна корекція: глибші тіні, червоний відтінок у темряві, віньєтка.
 * Bloom рахується на половинній роздільності: на інтегрованій графіці різниця на око мала, а час — удвічі менший.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.55 },
    contrast: { value: 1.12 },
    saturation: { value: 1.12 },
    shadowTint: { value: new THREE.Color(0.2, 0.03, 0.03) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float contrast;
    uniform float saturation;
    uniform vec3 shadowTint;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      // Тіні з червоним відтінком аварійного світла, світлі ділянки не чіпаємо.
      c += shadowTint * pow(1.0 - clamp(l, 0.0, 1.0), 4.0) * 0.35;
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class PostFx {
  private readonly composer: EffectComposer | null;
  private readonly bloom: UnrealBloomPass | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    enabled: boolean,
  ) {
    if (!enabled) {
      this.composer = null;
      return;
    }
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    // HDR-ціль з MSAA: світіння бачить значення понад 1, а краї лишаються гладкими.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.45, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass(GradeShader));
    this.composer = composer;
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  setSize(w: number, h: number): void {
    if (!this.composer) return;
    const pr = this.renderer.getPixelRatio();
    this.composer.setSize(w, h);
    this.bloom?.resolution.set((w * pr) / 2, (h * pr) / 2);
  }
}
