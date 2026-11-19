import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import { seededRandom } from "../core";

// 雪花粒子（Points）。每顆粒子的 position 是 0..1 的隨機值，在 vertex shader 乘上 uBox 後
// 下落、隨風橫移，再用 fract() 包回以 uCenter（相機位置）為中心的盒子內，所以雪永遠跟著相機、無限循環。
// opts：count（預設 4000）、box（Vector3，預設 24×18×24）、size（80）、speed（1.3）、wind（0.7）、opacity（1）。
// uStreak：0..1，放大點並在 fragment 把 y 壓扁成拖影；盒子邊緣 8% 以 smoothstep 淡出（vA）。
/** SnowBox 的選項 */
interface SnowBoxOptions {
  count?: number;
  box?: Vector3;
  size?: number;
  speed?: number;
  wind?: number;
  opacity?: number;
}
class SnowBox extends Points<BufferGeometry, ShaderMaterial> {
  constructor(opts: SnowBoxOptions = {}) {
    const count = opts.count ?? 4e3;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const rand = seededRandom(count * 7 + 3);
    for (let s = 0; s < count; s++) {
      positions[s * 3] = rand();
      positions[s * 3 + 1] = rand();
      positions[s * 3 + 2] = rand();
      seeds[s] = rand();
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    super(
      geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: {
            value: 0,
          },
          uBox: {
            value: opts.box ?? new Vector3(24, 18, 24),
          },
          uCenter: {
            value: new Vector3(),
          },
          uSize: {
            value: opts.size ?? 80,
          },
          uSpeed: {
            value: opts.speed ?? 1.3,
          },
          uWind: {
            value: opts.wind ?? 0.7,
          },
          uOpacity: {
            value: opts.opacity ?? 1,
          },
          uStreak: {
            value: 0,
          },
          uPx: {
            value: Math.min(window.devicePixelRatio, 1.75),
          },
        },
        vertexShader: `
          attribute float aSeed;
          uniform float uTime, uSize, uSpeed, uWind, uPx, uStreak;
          uniform vec3 uBox, uCenter;
          varying float vA; varying float vS;
          void main() {
            float s = 0.55 + aSeed * 0.9;
            vec3 base = position * uBox;
            base.y -= uTime * uSpeed * s;
            base.x += uTime * uWind * s + sin(uTime * (0.6 + aSeed) + aSeed * 40.0) * 0.5;
            base.z += sin(uTime * 0.4 + aSeed * 17.0) * 0.3;
            vec3 q = fract((base - uCenter) / uBox + 0.5);
            vec3 w = uCenter + (q - 0.5) * uBox;
            vec4 mv = modelViewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * (0.3 + aSeed * aSeed) * uPx * (1.0 + uStreak * 3.0) / max(-mv.z, 0.1);
            vec3 e = smoothstep(0.0, 0.08, q) * smoothstep(1.0, 0.92, q);
            vA = e.x * e.y * e.z;
            vS = uStreak;
          }`,
        fragmentShader: `
          uniform float uOpacity;
          varying float vA; varying float vS;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            p.y *= 1.0 + vS * 10.0;
            float d = length(p);
            float a = smoothstep(0.5, 0.2, d) * vA * uOpacity;
            if (a < 0.01) discard;
            gl_FragColor = vec4(vec3(1.0), a);
          }`,
      }),
    );
    this.frustumCulled = false;
  }
  update(time, camera) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCenter.value.copy(camera.position);
  }
}
// 依視窗長寬比調整相機垂直 FOV（角度）。aspect 小於 refAspect（直式螢幕）時，
// 先算出 refAspect 下的水平視角，再求在目前 aspect 下維持該水平視角所需的垂直 FOV，
// 朝它內插 85%，並以 maxFov 為上限；否則直接用 baseFov。
function fitFovToAspect(camera, baseFov, refAspect = 1.3, maxFov = 95) {
  const aspect = camera.aspect;
  let fov = baseFov;
  if (aspect < refAspect) {
    const halfHorizontalFov = Math.atan(
      Math.tan((baseFov * Math.PI) / 360) * refAspect,
    );
    fov = (Math.atan(Math.tan(halfHorizontalFov) / aspect) * 360) / Math.PI;
    fov = Math.min(maxFov, lerp(baseFov, fov, 0.85));
  }
  camera.fov = fov;
  camera.updateProjectionMatrix();
}
// 線性內插
const lerp = (from, to, amount) => from + (to - from) * amount;
// 平貼地面的貼圖平面（繞 X 轉 -90°），不寫深度並用 polygonOffset 避免與地面 z-fighting。
// opts：opacity、additive（true 用 AdditiveBlending）。
function groundDecal(texture, width, height, opts: { opacity?: number; additive?: boolean } = {}) {
  const mesh = new Mesh(
    new PlaneGeometry(width, height),
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: opts.opacity ?? 1,
      blending: opts.additive ? AdditiveBlending : NormalBlending,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
// 一維 value noise：sin 雜湊 + smoothstep 內插，回傳值範圍 -0.5..0.5。seed 用來取得互不相關的序列。
function noise1D(pos, seed = 0) {
  const hash = (cellIndex) => {
    const scrambled = Math.sin(cellIndex * 127.1 + seed * 311.7) * 43758.5453;
    return scrambled - Math.floor(scrambled);
  };
  const cell = Math.floor(pos);
  const frac = pos - cell;
  const eased = frac * frac * (3 - 2 * frac);
  return hash(cell) * (1 - eased) + hash(cell + 1) * eased - 0.5;
}

export { SnowBox, groundDecal, fitFovToAspect, noise1D };
