// 不依賴 DOM 與引擎的工具：數學、種子亂數、canvas 繪圖、貼圖平面、卡通材質、雪與火焰粒子。
import {
  UniformsLib,
  UniformsUtils,
  AdditiveBlending,
  NormalBlending,
  FrontSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  Quaternion,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
} from "three";
import type { ColorRepresentation, Side, Texture } from "three";

const isCoarsePointer =
  typeof matchMedia < "u" && matchMedia("(pointer: coarse)").matches;
const isSmallScreen =
  typeof screen < "u" && Math.min(screen.width, screen.height) <= 600;
const deviceTier = {
  texScale: isCoarsePointer ? (isSmallScreen ? 0.5 : 0.7) : 1,
  maxPixelRatio: isCoarsePointer ? 1.5 : 1.75,
  shadowMap: isCoarsePointer ? 1024 : 2048,
  // 粒子數量的倍率與是否畫投影陰影：手機減半、不畫陰影
  particleScale: isCoarsePointer ? 0.5 : 1,
  shadows: !isCoarsePointer,
  // 真的投影陰影（shadow map，第四輪）：所有裝置都開，手機用 1024 的陰影貼圖（各章已經不再用平面投影）
  shadowMaps: true,
  // 記憶體吃緊的裝置（手機、平板）：iOS Safari 分頁超過約 1 GB 就會被系統砍掉（「重複發生問題」）。
  // 開啟時渲染目標用較少的多重取樣、終章烘焙用較小的貼圖，而且只讓目前章節附近的資源常駐 GPU（見 main.ts 的 updateResidency）。
  lowMemory: isCoarsePointer,
};
const INK = "#050505";
const PAPER = "#f2efe6";
const FLAME_YELLOW = "#ffc24a";
const FLAME_ORANGE = "#ff6a10";
const DEFAULT_GRADE = {
  contrast: 0.8,
  threshold: 0.42,
  exposure: 1,
  color: 1,
  grain: 0.35,
  vignette: 0.6,
  glow: 0,
  raw: 0, // 0 = 紅黑白三色；1 = 不處理的原色
};
const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const lerp = (a_, b_, t) => a_ + (b_ - a_) * t;
const linearstep = (x, from, to_) => clamp((x - from) / (to_ - from));
const smooth = (t_) => t_ * t_ * (3 - 2 * t_);
const easeInOutCubic = (t_) =>
  t_ < 0.5 ? 4 * t_ * t_ * t_ : 1 - Math.pow(-2 * t_ + 2, 3) / 2;
const easeOutCubic = (t_) => 1 - Math.pow(1 - t_, 3);
const envelope = (x, inStart, inEnd, outStart, outEnd) =>
  smooth(linearstep(x, inStart, inEnd)) *
  (1 - smooth(linearstep(x, outStart, outEnd)));
function seededRandom(seed = 1) {
  let e = seed >>> 0;
  return () => {
    e |= 0;
    e = (e + 1831565813) | 0;
    let t = Math.imul(e ^ (e >>> 15), 1 | e);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** canvasTexture 產生的畫布，另外記住邏輯尺寸（lw／lh） */
type LogicalCanvas = HTMLCanvasElement & { lw?: number; lh?: number };
function canvasTexture(width, height, draw) {
  const scale = deviceTier.texScale;
  const canvas: LogicalCanvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.lw = width;
  canvas.lh = height;
  const ctx = canvas.getContext("2d");
  if (scale !== 1) {
    ctx.scale(canvas.width / width, canvas.height / height);
  }
  draw(ctx, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
/** spritePlane 的選項 */
interface SpritePlaneOptions {
  height?: number;
  anchor?: [number, number];
  opacity?: number;
  color?: ColorRepresentation;
  additive?: boolean;
  x?: number;
  y?: number;
  z?: number;
}
function spritePlane(texture, opts: SpritePlaneOptions = {}) {
  const image = texture.image;
  const height = opts.height ?? 1;
  const width = (height * image.width) / image.height;
  const geometry = new PlaneGeometry(width, height);
  const [a, o] = opts.anchor ?? [0.5, 0.5];
  geometry.translate((0.5 - a) * width, (0.5 - o) * height, 0);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: opts.opacity ?? 1,
    color: opts.color ?? 16777215,
    blending: opts.additive ? AdditiveBlending : NormalBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
  mesh.renderOrder = Math.round((opts.z ?? 0) * 100);
  return mesh;
}
function catmullRom2D(points, segments = 12) {
  if (points.length < 3) {
    return points.slice();
  }
  const t = [];
  for (let n = 0; n < points.length - 1; n++) {
    const r = points[Math.max(0, n - 1)];
    const s = points[n];
    const a = points[n + 1];
    const o = points[Math.min(points.length - 1, n + 2)];
    for (let c = 0; c < segments; c++) {
      const l = c / segments;
      const u = l * l;
      const h = u * l;
      t.push([
        0.5 *
          (2 * s[0] +
            (-r[0] + a[0]) * l +
            (2 * r[0] - 5 * s[0] + 4 * a[0] - o[0]) * u +
            (-r[0] + 3 * s[0] - 3 * a[0] + o[0]) * h),
        0.5 *
          (2 * s[1] +
            (-r[1] + a[1]) * l +
            (2 * r[1] - 5 * s[1] + 4 * a[1] - o[1]) * u +
            (-r[1] + 3 * s[1] - 3 * a[1] + o[1]) * h),
      ]);
    }
  }
  t.push(points[points.length - 1]);
  return t;
}
function brushStroke(ctx, points, width, color = INK, taper = 1) {
  const s = catmullRom2D(points);
  if (s.length < 2) {
    return;
  }
  const a = [];
  const o = [];
  for (let c = 0; c < s.length; c++) {
    const l = s[Math.max(0, c - 1)];
    const u = s[Math.min(s.length - 1, c + 1)];
    let h = -(u[1] - l[1]);
    let f = u[0] - l[0];
    const p = Math.hypot(h, f) || 1;
    h /= p;
    f /= p;
    const _ = c / (s.length - 1);
    const v = (width / 2) * (1 - taper + taper * Math.sin(Math.PI * _) ** 0.6);
    a.push([s[c][0] + h * v, s[c][1] + f * v]);
    o.push([s[c][0] - h * v, s[c][1] - f * v]);
  }
  ctx.beginPath();
  ctx.moveTo(a[0][0], a[0][1]);
  for (const c of a) {
    ctx.lineTo(c[0], c[1]);
  }
  for (let c = o.length - 1; c >= 0; c--) {
    ctx.lineTo(o[c][0], o[c][1]);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function fillSmoothShape(ctx, points, color = INK) {
  const n = catmullRom2D([...points, points[0], points[1]], 10);
  ctx.beginPath();
  ctx.moveTo(n[0][0], n[0][1]);
  for (const r of n) {
    ctx.lineTo(r[0], r[1]);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
function spatter(
  ctx,
  cx,
  cy,
  radius,
  count,
  dotSize,
  color = INK,
  random = seededRandom(7),
) {
  ctx.fillStyle = color;
  for (let c = 0; c < count; c++) {
    const l = random() * Math.PI * 2;
    const u = Math.pow(random(), 0.7) * radius;
    const h = dotSize * (0.2 + random() ** 3);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(l) * u, cy + Math.sin(l) * u, h, 0, Math.PI * 2);
    ctx.fill();
  }
}
function hatch(
  ctx,
  width,
  height,
  angle,
  spacing,
  lineWidth = 1.2,
  color = INK,
  random = seededRandom(3),
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const c = Math.hypot(width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate(angle);
  for (let l = -c / 2; l < c / 2; l += spacing) {
    ctx.lineWidth = lineWidth * (0.6 + random() * 0.8);
    ctx.beginPath();
    ctx.moveTo(-c / 2 + random() * 10, l + random() * 1.5);
    ctx.lineTo(c / 2 - random() * 10, l + random() * 1.5);
    ctx.stroke();
  }
  ctx.restore();
}
function radialGlowTexture(color = "#ffffff", size = 256, falloff = 2) {
  return canvasTexture(size, size, (n) => {
    const r = new Color(color);
    const s = `${Math.round(r.r * 255)},${Math.round(r.g * 255)},${Math.round(r.b * 255)}`;
    const a = n.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    for (let o = 0; o <= 10; o++) {
      a.addColorStop(o / 10, `rgba(${s},${Math.pow(1 - o / 10, falloff)})`);
    }
    n.fillStyle = a;
    n.fillRect(0, 0, size, size);
  });
}
// 卡通材質（2026-11-19 第四輪改寫：使用者要求「添加更多細節紋理及陰影」）。
// - 受光面是底色，背光面是陰影色；兩者之間不再是一條硬邊，而是一段「版畫的排線」：越背光線越密，
//   像入口那隻眼睛的銅版畫風格。排線在世界座標裡（依法線挑一個投影面），所以鏡頭移動時不會在畫面上滑動；
//   太遠、線太密時改成平均的灰，不會閃爍。
// - 接收真的投影陰影（shadow map）：場景裡有開了 castShadow 的 DirectionalLight 時，被擋住的地方也用同一種排線變暗。
//   引擎（main.js 的 setupShadows）替每一章的 3D 場景加這盞燈、讓物件投影，並讓陰影的範圍跟著鏡頭看的地方走。
// - 支援 InstancedMesh。
// opts：color、shade、light（光的方向，和陰影燈一致）、threshold、rim、rimColor、map、side、hatch（排線間距，世界單位，0 = 不排線）
/** toonMaterial 的選項 */
interface ToonMaterialOptions {
  color?: ColorRepresentation;
  shade?: ColorRepresentation;
  light?: Vector3;
  threshold?: number;
  rim?: number;
  rimColor?: ColorRepresentation;
  map?: Texture | null;
  side?: Side;
  hatch?: number;
  scratch?: number;
  scratchColor?: ColorRepresentation;
}
function toonMaterial(opts: ToonMaterialOptions = {}) {
  const uniforms = UniformsUtils.merge([
    UniformsLib.lights,
    {
      uColor: { value: new Color(opts.color ?? PAPER) },
      uShade: { value: new Color(opts.shade ?? "#080808") },
      uLight: { value: new Vector3() },
      uThreshold: { value: opts.threshold ?? 0.2 },
      uRim: { value: opts.rim ?? 0.8 },
      uRimColor: { value: new Color(opts.rimColor ?? "#ffffff") },
      uFlamePos: { value: new Vector3() },
      uFlameColor: { value: new Color(FLAME_ORANGE) },
      uFlame: { value: 0 },
      map: { value: null },
      uHasMap: { value: opts.map ? 1 : 0 },
      uHatch: { value: opts.hatch ?? 0.045 },
      // 刮版畫（scratchboard）：黑色的東西底色和陰影色都是黑，排線看不到；開了之後改在受光面刻出紙白的細線，
      // 越受光線越多，黑色的人物也看得出體積。預設關，figure.js 替黑色的衣服、頭髮打開。
      uScratch: { value: opts.scratch ?? 0 },
      uScratchColor: { value: new Color(opts.scratchColor ?? PAPER) },
      // 霧：離鏡頭 uFogNear 到 uFogFar 之間，顏色漸漸變成 uFogColor（預設關閉）
      uFogColor: { value: new Color(PAPER) },
      uFogNear: { value: 1e8 },
      uFogFar: { value: 1e9 },
    },
  ]);
  uniforms.uLight.value.copy(opts.light ?? new Vector3(-0.4, 0.8, 0.5)).normalize();
  uniforms.map.value = opts.map ?? null;
  return new ShaderMaterial({
    side: opts.side ?? FrontSide,
    lights: true,
    uniforms,
    vertexShader: `
      #include <common>
      #include <shadowmap_pars_vertex>
      varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vDepth;
      void main() {
        vUv = uv;
        mat4 m = modelMatrix;
        vec3 objectNormal = normal;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 worldPosition = m * vec4(position, 1.0);
        vW = worldPosition.xyz;
        vDepth = -(viewMatrix * worldPosition).z;
        vN = normalize(transpose(inverse(mat3(m))) * objectNormal); // 法線矩陣：不等比縮放時明暗才正確
        vec3 transformedNormal = normalize((viewMatrix * vec4(vN, 0.0)).xyz);
        #include <shadowmap_vertex>
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }`,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform vec3 uColor, uShade, uLight, uRimColor, uFlamePos, uFlameColor;
      uniform float uThreshold, uRim, uFlame, uHasMap, uFogNear, uFogFar, uHatch, uScratch;
      uniform vec3 uScratchColor;
      uniform vec3 uFogColor;
      varying float vDepth;
      uniform sampler2D map;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      // 排線：coverage 0 = 沒有線（全亮），1 = 整片陰影色。
      float hatch(vec3 N, float coverage) {
        if (uHatch <= 0.0) return step(0.5, coverage);
        vec3 a = abs(N);
        vec2 p = a.x > a.y && a.x > a.z ? vW.zy : (a.y > a.z ? vW.xz : vW.xy);
        float c1 = (p.x + p.y) / uHatch;
        float w = fwidth(c1);
        float lines = smoothstep(1.0 - coverage - w, 1.0 - coverage + w, fract(c1));
        // 很背光的地方再交叉一組線
        float c2 = (p.x - p.y) / uHatch;
        float cross = smoothstep(1.0 - (coverage - 0.55) * 1.6 - w, 1.0 - (coverage - 0.55) * 1.6 + w, fract(c2)) * step(0.55, coverage);
        float ink = max(lines, cross);
        // 線太密（太遠或太斜）時改成平均的灰，避免閃爍
        return mix(ink, coverage, smoothstep(0.25, 0.6, w));
      }
      void main() {
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vW);
        vec3 base = uColor;
        if (uHasMap > 0.5) base *= texture2D(map, vUv).rgb;
        float shadow = getShadowMask();
        // 受光程度：法線與光的夾角（門檻以上 0.32 的範圍是排線帶），再乘上投影陰影
        float tone = clamp((dot(N, uLight) - uThreshold) / 0.32, 0.0, 1.0);
        tone = min(tone, smoothstep(0.15, 0.85, shadow));
        float coverage = 1.0 - tone;
        vec3 col = mix(base, uShade, coverage >= 0.995 ? 1.0 : (coverage <= 0.005 ? 0.0 : hatch(N, coverage)));
        if (uScratch > 0.0) {
          // 刮版畫：受光的程度（含投影陰影）決定白線的多寡，最亮處約四成是白線；背光與陰影裡保持全黑
          // 只在明顯受光的地方刻少量的線（最多兩成），黑色剪影仍然是主體；線太密（遠景）時整個淡掉，不變成灰
          float lightAmt = pow(clamp((dot(N, uLight) - 0.15) / 0.75, 0.0, 1.0), 2.0) * smoothstep(0.15, 0.85, shadow);
          vec3 a = abs(N);
          vec2 p = a.x > a.y && a.x > a.z ? vW.zy : (a.y > a.z ? vW.xz : vW.xy);
          float c = (p.x * 0.8 + p.y) / uHatch;
          float w = fwidth(c);
          // 線距較寬（figure.js 給 0.06）、最多約一成是白線、只在正對光的那一側，線距在畫面上太密時淡掉；近景大面積受光時也不會變成條紋西裝
          float cov = lightAmt * 0.1;
          float white = smoothstep(1.0 - cov - w, 1.0 - cov + w, fract(c)) * (1.0 - smoothstep(0.12, 0.3, w));
          col = mix(col, uScratchColor, white * uScratch);
        }
        vec3 L = uFlamePos - vW;
        float d = length(L);
        float f = max(dot(N, L / d), 0.0) * uFlame / (1.0 + d * d * 2.0);
        col += uFlameColor * (smoothstep(0.08, 0.12, f) * 0.7 + smoothstep(0.3, 0.34, f) * 0.6);
        float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col = mix(col, uRimColor, smoothstep(0.55, 0.6, rim) * uRim);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
/** Snow 的選項 */
interface SnowOptions {
  count?: number;
  box?: Vector3;
  center?: Vector3;
  size?: number;
  speed?: number;
  wind?: number;
  color?: ColorRepresentation;
  opacity?: number;
}
class Snow extends Points<BufferGeometry, ShaderMaterial> {
  constructor(e: SnowOptions = {}) {
    const t = e.count ?? 3e3;
    const n = new Float32Array(t * 3);
    const r = new Float32Array(t);
    const s = seededRandom(t);
    for (let c = 0; c < t; c++) {
      n[c * 3] = s();
      n[c * 3 + 1] = s();
      n[c * 3 + 2] = s();
      r[c] = s();
    }
    const a = new BufferGeometry();
    a.setAttribute("position", new BufferAttribute(n, 3));
    a.setAttribute("aSeed", new BufferAttribute(r, 1));
    const o = e.box ?? new Vector3(20, 14, 20);
    super(
      a,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: {
            value: 0,
          },
          uBox: {
            value: o,
          },
          uCenter: {
            value: e.center ?? new Vector3(),
          },
          uSize: {
            value: e.size ?? 90,
          },
          uSpeed: {
            value: e.speed ?? 1.2,
          },
          uWind: {
            value: e.wind ?? 0.6,
          },
          uColor: {
            value: new Color(e.color ?? "#ffffff"),
          },
          uOpacity: {
            value: e.opacity ?? 1,
          },
          uPx: {
            value: Math.min(window.devicePixelRatio, 2),
          },
        },
        vertexShader: `
          attribute float aSeed;
          uniform float uTime, uSize, uSpeed, uWind, uPx;
          uniform vec3 uBox, uCenter;
          varying float vA;
          void main() {
            vec3 p = position;
            float s = 0.55 + aSeed * 0.9;
            p.y = fract(p.y - uTime * uSpeed * s / uBox.y);
            p.x = fract(p.x + (uTime * uWind * s + sin(uTime * (0.6 + aSeed) + aSeed * 40.0) * 0.4) / uBox.x);
            p.z = fract(p.z + sin(uTime * 0.4 + aSeed * 17.0) * 0.15 / uBox.z);
            vec3 w = uCenter + (p - 0.5) * uBox;
            vec4 mv = modelViewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = min(uSize * (0.3 + aSeed * aSeed) * uPx / max(-mv.z, 0.1), 42.0 * uPx);
            vA = smoothstep(0.0, 0.06, p.y) * smoothstep(1.0, 0.94, p.y) * smoothstep(0.0, 0.05, p.x) * smoothstep(1.0, 0.95, p.x);
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uOpacity;
          varying float vA;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.25, d) * vA * uOpacity;
            if (a < 0.01) discard;
            gl_FragColor = vec4(uColor, a);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.frustumCulled = false;
  }
  update(e) {
    this.material.uniforms.uTime.value = e;
  }
}
class Flame extends Group {
  intensity = 1;
  size;
  core;
  halo;
  constructor(e = 0.3, t = 3) {
    super();
    this.size = e;
    const n = new PlaneGeometry(e * 0.55, e);
    n.translate(0, e * 0.42, 0);
    this.core = new Mesh(
      n,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: {
            value: 0,
          },
          uI: {
            value: 1,
          },
        },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform float uTime, uI; varying vec2 vUv;
          float h(float n){ return fract(sin(n)*43758.5453); }
          float noise(float x){ float i=floor(x), f=fract(x); return mix(h(i), h(i+1.0), f*f*(3.0-2.0*f)); }
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float y = vUv.y;
            float sway = (noise(uTime * 7.0) - 0.5) * 0.35 * y * y;
            p.x -= sway;
            float lick = 1.0 + (noise(uTime * 11.0 + 3.0) - 0.5) * 0.25;
            // teardrop: wide round bottom, pointed top
            float w = mix(0.55, 0.0, pow(y, 1.4)) * sqrt(max(y * 3.0, 0.0)) * 1.15;
            float d = abs(p.x) / max(w, 1e-3);
            float body = smoothstep(1.0, 0.6, d) * smoothstep(0.98 * lick, 0.6 * lick, y) * smoothstep(0.0, 0.12, y);
            float core = smoothstep(0.75, 0.0, d) * smoothstep(0.65, 0.2, y) * smoothstep(0.05, 0.2, y);
            vec3 col = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.78, 0.25), smoothstep(0.2, 0.8, 1.0 - d));
            col = mix(col, vec3(1.0, 0.97, 0.85), core);
            col = mix(vec3(0.15, 0.3, 1.0), col, smoothstep(0.06, 0.2, y));
            float a = body * uI;
            gl_FragColor = vec4(col * a * 1.6, a);
          }`,
      }),
    );
    this.halo = new Mesh(
      new PlaneGeometry(t, t),
      new MeshBasicMaterial({
        map: radialGlowTexture(FLAME_ORANGE, 256, 2.2),
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.halo.position.y = e * 0.45;
    this.add(this.halo, this.core);
    this.renderOrder = 999;
    this.core.renderOrder = 1e3;
    this.halo.renderOrder = 999;
  }
  update(e, t) {
    const n =
      0.85 +
      Math.sin(e * 23) * 0.05 +
      Math.sin(e * 37.7) * 0.05 +
      Math.sin(e * 5.3) * 0.05;
    const r = Math.max(0, this.intensity);
    this.core.material.uniforms.uTime.value = e;
    this.core.material.uniforms.uI.value = Math.min(1, r);
    this.core.scale.setScalar(
      0.4 + 0.6 * Math.min(1, r) + Math.max(0, r - 1) * 0.6,
    );
    this.halo.material.opacity = Math.min(1, r) * n * 0.85;
    this.halo.scale.setScalar((0.6 + 0.4 * r) * n);
    this.visible = r > 0.001;
    this.quaternion.copy(t.quaternion);
    if (this.parent) {
      const s = new Quaternion();
      this.parent.getWorldQuaternion(s);
      this.quaternion.premultiply(s.invert());
    }
  }
  heart(e = new Vector3()) {
    return this.localToWorld(e.set(0, this.size * 0.4, 0));
  }
}

export {
  isCoarsePointer,
  isSmallScreen,
  deviceTier,
  INK,
  PAPER,
  FLAME_YELLOW,
  FLAME_ORANGE,
  DEFAULT_GRADE,
  clamp,
  lerp,
  linearstep,
  smooth,
  easeInOutCubic,
  easeOutCubic,
  envelope,
  seededRandom,
  canvasTexture,
  spritePlane,
  catmullRom2D,
  brushStroke,
  fillSmoothShape,
  spatter,
  hatch,
  radialGlowTexture,
  toonMaterial,
  Snow,
  Flame,
};
