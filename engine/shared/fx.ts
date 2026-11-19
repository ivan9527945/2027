import { canvasTexture, seededRandom, toonMaterial } from "../core";
import {
  AddEquation,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  OneMinusDstColorFactor,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  ZeroFactor,
} from "three";
import { fillEllipse } from "./draw";

// ---- 來自 chapters/grandmother.js ----

// 光柱貼圖（256×1024）：7 道模糊的直立梯形光束，底部窄、頂部寬，上下兩端淡出。
function makeLightShaftTexture() {
  return canvasTexture(256, 1024, (ctx, width, height) => {
    const rand = seededRandom(17);
    ctx.filter = "blur(12px)";
    for (let n = 0; n < 7; n++) {
      const centerX = width / 2 + (rand() - 0.5) * 70;
      const halfWidth = 18 + rand() * 40;
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "rgba(255,214,150,0)");
      gradient.addColorStop(0.15, `rgba(255,214,150,${0.25 + rand() * 0.2})`);
      gradient.addColorStop(1, "rgba(255,236,200,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(centerX - halfWidth * 0.6, height);
      ctx.lineTo(centerX - halfWidth * 1.3, 0);
      ctx.lineTo(centerX + halfWidth * 1.3, 0);
      ctx.lineTo(centerX + halfWidth * 0.6, height);
      ctx.fill();
    }
  });
}
// 天空球材質：uP 0→1 由夜空轉為天堂（光從上方先破開，過渡時偏金色而不是灰），
// 光源方向固定在上方偏後；光源周圍是白色核心、金色光環與緩慢旋轉的柔和光芒（uR 加強光芒），地平線以下是淡暖色霧。

// ---- 來自 chapters/goose.js ----

// 「薄如輕紗」的後牆材質。wallTexture 是街角後牆的貼圖；uCenter（牆面上的世界座標，uSize＝牆寬×牆高）為圓心、uRadius 為半徑。
// 圓內 alpha 降到約 0.03（只留經緯紗線紋理，越靠邊越明顯），邊緣用兩層 value noise 抖動並加一圈橘色亮邊。
// uWarm：火光把牆染暖的程度；uFade：牆面整體亮度；uTime：讓邊緣緩慢蠕動。
function makeGauzeWallMaterial(wallTexture) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      map: {
        value: wallTexture,
      },
      uCenter: {
        value: new Vector2(1.8, 1),
      },
      uRadius: {
        value: 0,
      },
      uWarm: {
        value: 0,
      },
      uFade: {
        value: 1,
      },
      uTime: {
        value: 0,
      },
      uSize: {
        value: new Vector2(BACK_WALL_WIDTH, WALL_HEIGHT),
      },
    },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      uniform sampler2D map; uniform vec2 uCenter, uSize; uniform float uRadius, uWarm, uFade, uTime;
      varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main() {
        vec3 wall = texture2D(map, vUv).rgb;
        vec2 p = vUv * uSize;
        float d = length((p - uCenter) * vec2(1.0, 1.15));
        float wob = (n(p * 2.2 + uTime * 0.15) - 0.5) * 0.5 + (n(p * 7.0) - 0.5) * 0.18;
        float edge = uRadius + wob * min(uRadius, 1.0);
        float m = smoothstep(edge, edge - 0.25, d);         // 1 = gauze
        // woven threads: a fine warp and weft, a little irregular
        vec2 q = p * 130.0;
        float th = max(smoothstep(0.9, 1.0, abs(sin(q.x + n(q * 0.03) * 2.0))), smoothstep(0.9, 1.0, abs(sin(q.y))));
        float weave = th * smoothstep(edge - 0.8, edge - 0.05, d); // the weave shows toward the fraying edge
        float alpha = mix(1.0, 0.03 + weave * 0.16, m);
        // the wall where the light falls is warmed, and the gauze glows at its fraying edge
        float lightPool = smoothstep(uRadius * 1.8 + 0.4, 0.0, d) * uWarm;
        vec3 col = wall * uFade;
        col = mix(col, col * vec3(1.0, 0.62, 0.3) + vec3(0.12, 0.04, 0.0), lightPool);
        float rim = smoothstep(0.22, 0.0, abs(d - edge + 0.08)) * step(0.02, uRadius);
        col = mix(col, vec3(1.0, 0.55, 0.12), rim * 0.85);
        col = mix(col, vec3(1.0, 0.7, 0.35), m * weave * 0.5);
        gl_FragColor = vec4(col, max(alpha, rim * 0.9));
        #include <colorspace_fragment>
      }`,
  });
}
// 餐廳後牆貼圖（1536×1024）：橘紅漸層壁紙＋菱形花紋、下方深色護牆板與金色腰線、
// 右側金框肖像畫、左側夜窗（窗外白點為雪）與紅窗簾、最後疊一層暖色暈影與雜點。

// ---- 來自 shared/c-girl.js ----

// toonMaterial 的可淡出版本：多一個 uFade uniform（0–1），最後輸出顏色乘上它。
function fadeToonMaterial(opts = {}) {
  const material = toonMaterial(opts);
  material.uniforms.uFade = {
    value: 1,
  };
  material.fragmentShader = material.fragmentShader
    .replace("uniform float uThreshold", "uniform float uFade, uThreshold")
    .replace(
      "gl_FragColor = vec4(col, 1.0);",
      "gl_FragColor = vec4(col * uFade, 1.0);",
    );
  return material;
}
// 劃火柴的全螢幕特效：貼在相機近平面前的兩張 2x2 quad（需掛在相機底下）。
// inv：白色＋(1-dst, 0) 混合，把畫面反相成負片；fx：放射速度線（220 個角度楔形，每 1/14 秒重抽）、
// 水平拖影（whip）、白閃（flash）。由外部設定 lines / whip / flash / invert（0–1）與 center（UV）。

class StrikeFx extends Group {
  lines = 0;
  invert = 0;
  whip = 0;
  flash = 0;
  center = new Vector2(0.5, 0.5);
  inv;
  fx;
  constructor() {
    super();
    const quad = new PlaneGeometry(2, 2);
    this.inv = new Mesh(
      quad,
      new MeshBasicMaterial({
        color: 16777215,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneMinusDstColorFactor,
        blendDst: ZeroFactor,
        toneMapped: false,
      }),
    );
    this.fx = new Mesh(
      quad,
      new ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: {
            value: 0,
          },
          uLines: {
            value: 0,
          },
          uWhip: {
            value: 0,
          },
          uFlash: {
            value: 0,
          },
          uInv: {
            value: 0,
          },
          uCenter: {
            value: new Vector2(0.5, 0.5),
          },
          uAspect: {
            value: 1,
          },
        },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform float uTime, uLines, uWhip, uFlash, uInv, uAspect; uniform vec2 uCenter; varying vec2 vUv;
          float h(float n){ return fract(sin(n * 91.7) * 43758.5453); }
          void main() {
            vec2 p = (vUv - uCenter) * vec2(uAspect, 1.0);
            float a = atan(p.y, p.x), r = length(p);
            float k = floor(a / 6.2832 * 220.0);
            float fr = fract(uTime * 9.0);
            float rnd = h(k + floor(uTime * 14.0) * 13.0);
            float wedge = 1.0 - abs(fract(a / 6.2832 * 220.0) - 0.5) * 2.0;
            float len = 0.18 + rnd * 0.5;
            float line = step(0.55, rnd) * smoothstep(0.35, 0.9, wedge) * smoothstep(len, len + 0.25, r);
            float ink = line * uLines;
            // whip: horizontal streaks
            float row = floor(vUv.y * 260.0);
            float s = h(row + floor(uTime * 20.0) * 7.0);
            float streak = step(0.6, s) * smoothstep(0.0, 0.3, fract(vUv.x * (0.6 + s) + s * 5.0 + uTime * 3.0));
            float wh = streak * uWhip;
            vec3 lineCol = mix(vec3(1.0), vec3(0.0), uInv);
            float alpha = max(ink, wh * 0.6);
            vec3 col = lineCol;
            col = mix(col, vec3(1.0), uFlash);
            alpha = max(alpha, uFlash);
            gl_FragColor = vec4(col, alpha);
          }`,
      }),
    );
    this.inv.renderOrder = 9998;
    this.fx.renderOrder = 9999;
    this.inv.frustumCulled = this.fx.frustumCulled = false;
    this.add(this.inv, this.fx);
  }
  update(time, camera) {
    // 每幀呼叫：把 quad 放到 near*2 的距離並縮放到剛好蓋滿視錐（多 2%），再把屬性寫進 uniform。
    // invert > 0.5 才顯示負片層；三個強度都接近 0 時隱藏 fx 層。
    const distance = camera.near * 2;
    const halfHeight = Math.tan(MathUtils.degToRad(camera.fov / 2)) * distance;
    this.position.set(0, 0, -distance);
    this.scale.set(halfHeight * camera.aspect * 1.02, halfHeight * 1.02, 1);
    const uniforms = this.fx.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uLines.value = this.lines;
    uniforms.uWhip.value = this.whip;
    uniforms.uFlash.value = this.flash;
    uniforms.uInv.value = this.invert > 0.5 ? 1 : 0;
    uniforms.uAspect.value = camera.aspect;
    uniforms.uCenter.value.copy(this.center);
    this.inv.visible = this.invert > 0.5;
    this.fx.visible =
      this.lines > 0.001 || this.whip > 0.001 || this.flash > 0.001;
  }
}
// 一縷上升的煙：底部對齊原點的直立平面，shader 畫兩條隨高度擺幅變大的正弦細線（越高越寬），
// 上下兩端淡出。update(time, amount) 的 amount 為不透明度 0–1。

class SmokeWisp extends Mesh<BufferGeometry, ShaderMaterial> {
  constructor(width = 0.12, height = 0.5) {
    const geometry = new PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    super(
      geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: {
            value: 0,
          },
          uAmt: {
            value: 0,
          },
          uRatio: {
            value: height / width,
          },
        },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform float uTime, uAmt, uRatio; varying vec2 vUv;
          void main() {
            float y = vUv.y;
            float x = 0.5 + sin(y * 11.0 - uTime * 1.7) * 0.2 * y + sin(y * 5.0 - uTime * 0.9 + 1.3) * 0.16 * y * y;
            float w = 0.006 + y * 0.022;
            float d = abs(vUv.x - x) / w;
            float x2 = 0.5 + sin(y * 8.0 - uTime * 1.3 + 2.0) * 0.26 * y;
            float d2 = abs(vUv.x - x2) / (w * 0.6);
            float dd = min(d, d2 + (1.0 - smoothstep(0.15, 0.4, y)) * 9.0);
            float outer = smoothstep(2.2, 1.6, dd), inner = smoothstep(1.0, 0.4, dd);
            float a = outer * smoothstep(0.0, 0.05, y) * smoothstep(1.0, 0.45, y) * uAmt;
            gl_FragColor = vec4(vec3(0.95 * inner), a);
          }`,
      }),
    );
    this.frustumCulled = false;
  }
  update(time, amount) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uAmt.value = amount;
    this.visible = amount > 0.001;
  }
}
// 風的筆觸：橫向平面上兩條波動的白色細線，分段出現並向 +x 流動，左右兩端淡出。
// update(time, amount) 的 amount 為不透明度 0–1。

class WindStreaks extends Mesh<BufferGeometry, ShaderMaterial> {
  constructor(width, height) {
    super(
      new PlaneGeometry(width, height),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: {
            value: 0,
          },
          uAmt: {
            value: 1,
          },
        },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform float uTime, uAmt; varying vec2 vUv;
          void main() {
            float a = 0.0;
            for (int i = 0; i < 2; i++) {
              float fi = float(i);
              float yc = 0.35 + fi * 0.3 + sin(vUv.x * 3.0 + fi) * 0.05;
              float y = yc + sin(vUv.x * 14.0 - uTime * 2.2 + fi * 2.1) * 0.12 * vUv.x;
              float w = 0.012 + 0.012 * vUv.x;
              float seg = smoothstep(0.55, 0.8, sin(vUv.x * 4.0 - uTime * 1.1 + fi * 1.7) * 0.5 + 0.5);
              a = max(a, smoothstep(w, w * 0.3, abs(vUv.y - y)) * seg);
            }
            a *= smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.6, vUv.x) * uAmt;
            gl_FragColor = vec4(vec3(0.95), a);
          }`,
      }),
    );
  }
  update(time, amount) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uAmt.value = amount;
    this.visible = amount > 0.001;
  }
}
// 牆角場景的尺寸（世界單位）：後牆在 z = -RECESS_DEPTH，寬 BACK_WALL_WIDTH、高 WALL_HEIGHT；
// 側牆在 x = 0，從 z = 0 到 -RECESS_DEPTH；前牆在 z = 0，x 從 -7 到 0。
// GIRL_POSITION 為女孩坐的位置；SHADOW_EDGE_X 為牆角陰影在後牆上的邊界 x；LIGHT_DIR 為卡通材質的光線方向。

const WALL_HEIGHT = 7;

const BACK_WALL_WIDTH = 7;

// ---- 來自 shared/d-fx.js ----

// 裝置像素比，上限 1.75。
const cappedPixelRatio = () => Math.min(window.devicePixelRatio, 1.75);
// 蠟燭升為星星的粒子。position＝蠟燭位置，aStar＝對應的星星位置，aSeed＝每顆的隨機值。
// uOn：由下往上點亮（與蠟燭的 y 比較）；uRise 0→1：每顆依 aSeed 錯開起飛，從蠟燭位置 mix 到星星位置，途中帶橫向飄移。
// 片段著色器：水滴形火焰＋蠟燭小白棒 → 上升時拉長成帶尾巴的火星並由橘變金變白 → 最後變成星點（少數大顆有十字星芒與閃爍）。
// uSize：火焰的世界尺寸；uStar：星點的像素尺寸；uViewH：視窗高度（px）；uFade：整體亮度。

class CandleStars extends Points<BufferGeometry, ShaderMaterial> {
  constructor(candlePositions, starPositions, size = 0.16) {
    const count = candlePositions.length / 3;
    const geometry = new BufferGeometry();
    const seeds = new Float32Array(count);
    const rand = seededRandom(77);
    for (let a = 0; a < count; a++) {
      seeds[a] = rand();
    }
    geometry.setAttribute("position", new BufferAttribute(candlePositions, 3));
    geometry.setAttribute("aStar", new BufferAttribute(starPositions, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    super(
      geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: {
            value: 0,
          },
          uOn: {
            value: 0,
          },
          uRise: {
            value: 0,
          },
          uSize: {
            value: size,
          },
          uViewH: {
            value: 900,
          },
          uStar: {
            value: 3,
          },
          uFade: {
            value: 1,
          },
        },
        vertexShader: `
          attribute vec3 aStar; attribute float aSeed;
          uniform float uTime, uOn, uRise, uSize, uViewH, uStar;
          varying float vR, vA, vF, vSeed, vTw, vBig;
          void main() {
            float d = aSeed * 0.45;
            float r = clamp((uRise - d) / 0.55, 0.0, 1.0);
            float e = 1.0 - pow(1.0 - r, 2.2);
            vec3 p = mix(position, aStar, e);
            // a lazy drift on the way up, like sparks on warm air
            float arc = sin(r * 3.1416);
            p.x += sin(r * 5.0 + aSeed * 30.0) * 1.2 * arc;
            p.z += cos(r * 4.0 + aSeed * 21.0) * 0.6 * arc;
            p.y += sin(uTime * 0.7 + aSeed * 40.0) * 0.02 * (1.0 - r);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float big = step(fract(aSeed * 13.7), 0.1);
            float world = uSize * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 0.05);
            float star = uStar * mix(0.55 + 0.5 * fract(aSeed * 7.1), 2.6 + 1.6 * fract(aSeed * 3.3), big);
            float tw = pow(max(0.0, sin(uTime * (0.6 + fract(aSeed * 5.3) * 1.4) + aSeed * 80.0)), 24.0);
            // rising, a flame stretches into a spark with a tail
            float comet = smoothstep(0.0, 0.15, r) * (1.0 - smoothstep(0.55, 0.85, r));
            gl_PointSize = clamp(mix(world * (1.0 + 1.6 * comet), star * 3.0 * (1.0 + 0.6 * tw * big), smoothstep(0.35, 0.9, r)), 1.0, 160.0);
            vR = r;
            vA = smoothstep(position.y - 0.6, position.y + 0.2, uOn);
            vF = 0.78 + 0.22 * sin(uTime * (9.0 + aSeed * 7.0) + aSeed * 90.0) * sin(uTime * (3.0 + aSeed * 2.0));
            vTw = tw;
            vSeed = aSeed;
            vBig = big;
          }`,
        fragmentShader: `
          uniform float uFade;
          varying float vR, vA, vF, vSeed, vTw, vBig;
          void main() {
            vec2 q = gl_PointCoord - vec2(0.5);
            q.y = -q.y;
            float comet = smoothstep(0.0, 0.15, vR) * (1.0 - smoothstep(0.55, 0.85, vR));
            float stretch = 1.0 + 1.6 * comet;
            // flame: teardrop, base at y = -0.12, tip at 0.38 (squeezed when the sprite grows)
            vec2 fq = q * stretch;
            fq.y = q.y * mix(stretch, 1.0, comet * 0.85) + comet * 0.18;
            float y = (fq.y + 0.12) / 0.5;
            float w = mix(0.13, 0.0, clamp(y, 0.0, 1.0)) * sqrt(clamp(y * 4.0 + 0.2, 0.0, 1.0));
            float body = smoothstep(1.0, 0.5, abs(fq.x) / max(w, 1e-3)) * step(-0.05, y) * step(y, 1.0);
            float core = smoothstep(0.6, 0.0, abs(fq.x) / max(w, 1e-3)) * smoothstep(0.7, 0.1, y);
            float halo = exp(-dot(fq, fq) * 22.0) * 0.55;
            // a sparkle when a candle catches the eye
            float glint = (smoothstep(0.025, 0.0, abs(fq.x)) * smoothstep(0.35, 0.0, abs(fq.y - 0.05)) + smoothstep(0.02, 0.0, abs(fq.y - 0.05)) * smoothstep(0.25, 0.0, abs(fq.x))) * vTw * (1.0 - comet);
            // the candle: a little white stick under the flame, gone once it lifts off
            float stick = step(abs(fq.x), 0.035) * step(fq.y, -0.13) * step(-0.42, fq.y) * (1.0 - smoothstep(0.0, 0.05, vR));
            // rising, it cools: orange, to gold, to white
            float cool = smoothstep(0.1, 0.75, vR);
            vec3 hot = mix(vec3(1.0, 0.36, 0.03), vec3(1.0, 0.72, 0.3), cool);
            vec3 hotCore = mix(vec3(1.0, 0.93, 0.7), vec3(1.0, 1.0, 0.96), cool);
            vec3 flame = mix(hot, hotCore, core) * body * 1.5 * vF + mix(vec3(1.0, 0.45, 0.06), vec3(1.0, 0.85, 0.6), cool) * halo * vF;
            flame += vec3(1.0, 0.9, 0.7) * glint * 1.2;
            flame += vec3(0.92, 0.9, 0.84) * stick * 0.8;
            // the spark's tail, trailing down
            float tail = smoothstep(0.03, 0.0, abs(q.x)) * smoothstep(-0.5, 0.1, q.y) * step(q.y, 0.15) * comet;
            flame += mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.9, 0.75), cool) * tail * 0.9;
            // star: white points, a few bright ones with soft glow and cross spikes
            float rr = length(q);
            float spikes = (smoothstep(0.03, 0.0, abs(q.x)) + smoothstep(0.03, 0.0, abs(q.y))) * smoothstep(0.5, 0.0, rr);
            float s = smoothstep(0.14, 0.02, rr) + exp(-rr * rr * 50.0) * 0.5 * vBig + spikes * (0.25 + 0.6 * vTw) * vBig;
            vec3 star = mix(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.86, 0.6), step(0.85, fract(vSeed * 3.9))) * s * mix(0.55, 1.3, vBig) * (0.85 + 0.3 * vTw);
            vec3 col = mix(flame, star, smoothstep(0.6, 0.95, vR)) * vA * uFade;
            if (max(col.r, max(col.g, col.b)) < 0.004) discard;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    this.frustumCulled = false;
  }
  update(time, viewHeight) {
    // 每幀更新時間與視窗高度（用來把世界尺寸換算成 gl_PointSize）。
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uViewH.value = viewHeight;
  }
}
// 跟著鏡頭的落雪粒子：位置是 0..1 的隨機值，在 vertex shader 裡用 fract 在 uBox 大小的盒子內循環，盒子中心為 uCenter。
// uFall：下落速度；uTravel：額外的垂直位移；uStretch：把雪花橫向壓扁成直條並放大；uWarm 0→1：由白轉金；uMax：點大小上限（px）。

class WarmSnow extends Points {
  constructor(count = 1800, box = new Vector3(14, 12, 14)) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const rand = seededRandom(91);
    for (let t = 0; t < count * 3; t++) {
      positions[t] = rand();
    }
    for (let t = 0; t < count; t++) {
      seeds[t] = rand();
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
          uCenter: {
            value: new Vector3(),
          },
          uBox: {
            value: box,
          },
          uTravel: {
            value: 0,
          },
          uStretch: {
            value: 0,
          },
          uWarm: {
            value: 0,
          },
          uSize: {
            value: 70,
          },
          uPx: {
            value: cappedPixelRatio(),
          },
          uOpacity: {
            value: 1,
          },
          uMax: {
            value: 24,
          },
          uFall: {
            value: 0.6,
          },
        },
        vertexShader: `
          attribute float aSeed;
          uniform float uTime, uTravel, uSize, uPx, uStretch, uMax, uFall;
          uniform vec3 uCenter, uBox;
          varying float vA, vS, vSeed;
          void main() {
            vec3 p = position;
            float s = 0.6 + aSeed * 0.8;
            p.y = fract(p.y - (uTime * uFall * s + uTravel) / uBox.y);
            p.x = fract(p.x + (uTime * 0.25 * s + sin(uTime * 0.7 + aSeed * 40.0) * 0.3) / uBox.x);
            vec3 w = uCenter + (p - 0.5) * uBox;
            vec4 mv = modelViewMatrix * vec4(w, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = min(uSize * (0.35 + aSeed * aSeed) * (1.0 + uStretch * 2.0) / max(-mv.z, 0.1), uMax) * uPx;
            vA = smoothstep(0.0, 0.08, p.y) * smoothstep(1.0, 0.92, p.y) * smoothstep(0.0, 0.06, p.x) * smoothstep(1.0, 0.94, p.x);
            vS = uStretch; vSeed = aSeed;
          }`,
        fragmentShader: `
          uniform float uWarm, uOpacity;
          varying float vA, vS, vSeed;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            q.x *= 1.0 + vS * 5.0;
            float d = length(q);
            float a = smoothstep(0.5, 0.18, d) * vA * uOpacity;
            if (a < 0.01) discard;
            vec3 gold = mix(vec3(1.0, 0.72, 0.22), vec3(1.0, 0.9, 0.6), vSeed);
            gl_FragColor = vec4(mix(vec3(1.0), gold, uWarm), a);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.frustumCulled = false;
  }
}
// 一道火光拖痕（加法混合的長條平面）：uHead 是頭部在 uv.x 上的位置，uTail 是尾巴長度，尾端變細；uFade 為亮度。
// length / width 為平面的世界尺寸。

class FireStreak extends Mesh {
  constructor(length = 30, width = 0.9) {
    super(
      new PlaneGeometry(length, width),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uHead: {
            value: 0,
          },
          uTail: {
            value: 0.5,
          },
          uFade: {
            value: 1,
          },
        },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: `
          uniform float uHead, uTail, uFade; varying vec2 vUv;
          void main() {
            float x = vUv.x, y = abs(vUv.y - 0.5) * 2.0;
            float behind = uHead - x;
            float trail = step(0.0, behind) * smoothstep(uTail, 0.0, behind);
            float thick = mix(0.08, 1.0, smoothstep(uTail, 0.0, behind));
            float core = smoothstep(thick, 0.0, y) * trail;
            float head = exp(-pow((x - uHead) * 26.0, 2.0) - y * y * 3.0);
            vec3 col = vec3(1.0, 0.36, 0.03) * core * 1.1 + vec3(1.0, 0.7, 0.2) * pow(core, 4.0) * 0.6 + vec3(1.0, 0.9, 0.7) * head * 2.0 + vec3(1.0, 0.4, 0.05) * exp(-pow((x - uHead) * 9.0, 2.0) - y * y) * 0.6;
            gl_FragColor = vec4(col * uFade, 1.0);
          }`,
      }),
    );
    this.frustumCulled = false;
    this.renderOrder = 50;
  }
}
// 城鎮天際線剪影貼圖：一排寬高隨機的房子，約三分之一是階梯山牆，其餘是斜屋頂並在左坡積雪，部分有煙囪。
// opts：w / h 尺寸、ink 剪影色、snow 積雪色、windows 窗戶顏色（給了才畫窗）、spire 是否加一座教堂尖塔。

// 雲朵貼圖：30 個模糊的圓團疊成一朵雲，由下而上依序是暖橘邊、灰色底、白色亮面。
function makeCloudTexture(seed) {
  const rand = seededRandom(seed);
  return canvasTexture(1024, 420, (ctx) => {
    const puffs = [];
    for (let o = 0; o < 30; o++) {
      const along = rand();
      const radius = 40 + rand() * 110 * Math.sin(along * Math.PI) + 20;
      puffs.push([
        90 + along * 844,
        420 * 0.62 - Math.sin(along * Math.PI) * 420 * 0.22 * rand() - 10,
        radius,
      ]);
    }
    ctx.filter = "blur(5px)";
    for (const [puffX, puffY, puffR] of puffs) {
      fillEllipse(
        ctx,
        puffX,
        puffY - 7,
        puffR * 1.02,
        puffR * 0.74,
        "rgba(255,184,70,0.95)",
      );
    }
    for (const [puffX, puffY, puffR] of puffs) {
      fillEllipse(
        ctx,
        puffX,
        puffY + puffR * 0.2,
        puffR,
        puffR * 0.7,
        "rgba(206,198,186,0.95)",
      );
    }
    for (const [puffX, puffY, puffR] of puffs) {
      const gradient = ctx.createRadialGradient(
        puffX - puffR * 0.15,
        puffY - puffR * 0.35,
        0,
        puffX,
        puffY,
        puffR,
      );
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.6, "#fbf6ec");
      gradient.addColorStop(1, "rgba(236,228,214,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(puffX, puffY, puffR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.filter = "none";
  });
}
// 放射光芒貼圖：從中心向外的 rayCount 道模糊扇形光束。rgb 為 "r,g,b" 字串。

function makeLightRaysTexture(seed = 3, rgb = "255,236,200", rayCount = 26) {
  const rand = seededRandom(seed);
  return canvasTexture(1024, 1024, (ctx) => {
    ctx.translate(1024 / 2, 1024 / 2);
    ctx.filter = "blur(10px)";
    for (let o = 0; o < rayCount; o++) {
      const angle = (o / rayCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const halfAngle = 0.025 + rand() * 0.07;
      const rayLength = 1024 * (0.3 + rand() * 0.2);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rayLength);
      const alpha = 0.25 + rand() * 0.5;
      gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
      gradient.addColorStop(0.5, `rgba(${rgb},${alpha * 0.45})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, rayLength, angle - halfAngle, angle + halfAngle);
      ctx.closePath();
      ctx.fill();
    }
    ctx.filter = "none";
  });
}
// 放射尖刺貼圖：140 根從外緣指向中心的細長三角形，中央留空。

function makeRadialSpikesTexture(seed = 5, color = "#ffffff") {
  const rand = seededRandom(seed);
  return canvasTexture(1024, 1024, (ctx) => {
    ctx.translate(1024 / 2, 1024 / 2);
    for (let s = 0; s < 140; s++) {
      const angle = rand() * Math.PI * 2;
      const innerRadius = 160 + rand() * 200;
      const thickness = 2 + rand() * 9;
      ctx.rotate(0);
      ctx.beginPath();
      ctx.moveTo(
        Math.cos(angle - thickness / 900) * innerRadius,
        Math.sin(angle - thickness / 900) * innerRadius,
      );
      ctx.lineTo(Math.cos(angle) * 1024, Math.sin(angle) * 1024);
      ctx.lineTo(
        Math.cos(angle + thickness / 900) * innerRadius,
        Math.sin(angle + thickness / 900) * innerRadius,
      );
      ctx.fillStyle = color;
      ctx.fill();
    }
  });
}
// 鏡頭軌道：把 [{t, pos, at, fov, roll}] 關鍵影格轉成位置與注視點兩條 centripetal Catmull-Rom 曲線。
// 回傳 (time) => { pos, at, fov, roll }；每段內用 60% smoothstep + 40% 線性的緩動，fov 與 roll 做線性內插。
// 注意回傳的 pos / at 是重複使用的同一組 Vector3。

export {
  makeLightShaftTexture,
  makeGauzeWallMaterial,
  fadeToonMaterial,
  StrikeFx,
  SmokeWisp,
  WindStreaks,
  WALL_HEIGHT,
  BACK_WALL_WIDTH,
  cappedPixelRatio,
  CandleStars,
  WarmSnow,
  FireStreak,
  makeCloudTexture,
  makeLightRaysTexture,
  makeRadialSpikesTexture,
};
