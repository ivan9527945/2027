import {
  BackSide,
  DirectionalLight,
  MeshDepthMaterial,
  RGBADepthPacking,
  PCFSoftShadowMap,
  HalfFloatType,
  UnsignedByteType,
  Clock,
  Color,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import type { Texture } from "three";
import {
  DEFAULT_GRADE,
  INK,
  PAPER,
  canvasTexture,
  clamp,
  deviceTier,
  smooth,
  spritePlane,
  toonMaterial,
} from "./core";
import chapterPlan from "./data/chapters.json";
import { CUE_NAMES, LOOP_NAMES, synthBuffer } from "./audio-synth";
import { projectElement } from "./annotate";
import { createRegistry } from "./elements";
import { PACE } from "./pace";
import { setupStoryText } from "./ui";
import { DEFAULT_STAGE, applyStand, setupStaging, stageCamera, stagedSort, updateSortKeys } from "./stage3d";

const SHARE_MODES = [
  "og",
  "x",
  "linkedin",
  "instagram",
  "story",
  "video",
  "video-wide",
  "story-video",
];
const shareParam =
  typeof location > "u"
    ? null
    : new URLSearchParams(location.search).get("share");
const shareMode = SHARE_MODES.includes(shareParam) ? shareParam : null;
const isShareVideo =
  shareMode === "video" ||
  shareMode === "video-wide" ||
  shareMode === "story-video";
const isShareTall =
  shareMode === "instagram" ||
  shareMode === "story" ||
  shareMode === "video" ||
  shareMode === "story-video";
if (shareMode) {
  document.documentElement.dataset.share = shareMode;
  document.documentElement.dataset.shareShape = isShareTall ? "tall" : "wide";
}
function markShareReady(i = 8) {
  if (shareMode) {
    window.dxlShareSeconds = i;
    window.dxlShareReady = true;
  }
}
// 章節清單來自 data/chapters.json；src/chapters/<id>.js 還沒寫的章先用佔位場景。
import { chapterModules, setModules } from "./registry";

// 引擎掛在 window 上的除錯物件與分享模式旗標
declare global {
  interface Window {
    __wa: any;
    __waReady?: boolean;
    dxlShareSeconds?: number;
    dxlShareReady?: boolean;
  }
}
// 專屬的 3D 場景：有 src/sets/<id>.js 的章用它當畫面，chapters/<id>.js 的平面版 build() 只留給終章

// 佔位場景：紙白底、墨色章名，下面一行列出這一章要畫的元素數量。
function placeholderChapter(plan) {
  const scene = new Scene();
  scene.background = new Color(PAPER);
  const camera = new PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 8);
  const count = plan.allElements ? 117 : plan.elements.length;
  const label = spritePlane(
    canvasTexture(2048, 512, (ctx, width, height) => {
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '600 150px "Noto Serif TC", "Songti TC", serif';
      ctx.fillText(plan.title, width / 2, height * 0.42);
      ctx.fillStyle = "#c8281e";
      ctx.font = '500 56px "Noto Serif TC", "Songti TC", serif';
      ctx.fillText(`${plan.id} · 待畫 ${count} 個元素`, width / 2, height * 0.78);
    }),
    { height: 1.6 },
  );
  scene.add(label);
  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.25 },
    captions: [{ from: 0.2, to: 0.8, text: `${plan.title}（佔位場景）` }],
    elements: [],
    update(progress) {
      label.position.y = (0.5 - progress) * 1.2;
    },
  };
}
const canvasEl = document.getElementById("view");
const scrollEl = document.getElementById("scroll");
const captionsEl = document.getElementById("captions");
const hintEl = document.getElementById("hint");
const query = new URLSearchParams(location.search);
const SHARE_SHOT = {
  id: "city",
  from: 0.2,
  to: 0.78,
  seconds: 8,
};
const shareStart = {
  id: "city",
  t: isShareVideo ? SHARE_SHOT.from : 0.2,
};
let pinned = shareMode
  ? shareStart
  : query.has("ch")
    ? {
        id: query.get("ch"),
        t: Number(query.get("t") ?? 0.5),
      }
    : null;
if (!pinned) {
  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  document.documentElement.classList.add("locked");
}
const renderer = new WebGLRenderer({
  canvas: canvasEl,
  antialias: false,
  powerPreference: "high-performance",
});
const maxPixelRatio = Math.min(
  window.devicePixelRatio,
  deviceTier.maxPixelRatio,
);
let pixelRatio = maxPixelRatio;
renderer.setPixelRatio(pixelRatio);
renderer.setTransparentSort(stagedSort);
renderer.setClearColor(328965, 1);
const bufferSize = new Vector2();
const resolutionUniform = {
  value: new Vector2(),
};
const hasFloatTargets =
  renderer.extensions.has("EXT_color_buffer_half_float") ||
  renderer.extensions.has("EXT_color_buffer_float");
const RENDER_TARGET_OPTIONS = {
  type: hasFloatTargets ? HalfFloatType : UnsignedByteType,
  samples: deviceTier.lowMemory ? 2 : 4, // 手機：多重取樣減半，省下約一半的渲染緩衝記憶體
  depthBuffer: true,
};
const renderTargetPool = [];
function getRenderTarget(index) {
  for (; renderTargetPool.length <= index;) {
    renderTargetPool.push(
      new WebGLRenderTarget(bufferSize.x, bufferSize.y, RENDER_TARGET_OPTIONS),
    );
  }
  return renderTargetPool[index];
}
const TRANSITION_KIND = {
  ink: 0,
  black: 1,
  white: 2,
  cut: 3,
  iris: 4,
  page: 5,
};
const compositeMaterial = new ShaderMaterial({
  depthTest: false,
  depthWrite: false,
  uniforms: {
    tA: {
      value: null,
    },
    tB: {
      value: null,
    },
    uMix: {
      value: 0,
    },
    uKind: {
      value: 0,
    },
    uTime: {
      value: 0,
    },
    uRes: resolutionUniform,
    uContrast: {
      value: DEFAULT_GRADE.contrast,
    },
    uThreshold: {
      value: DEFAULT_GRADE.threshold,
    },
    uRaw: {
      value: 0,
    },
    uExposure: {
      value: DEFAULT_GRADE.exposure,
    },
    uColor: {
      value: DEFAULT_GRADE.color,
    },
    uGrain: {
      value: DEFAULT_GRADE.grain,
    },
    uVignette: {
      value: DEFAULT_GRADE.vignette,
    },
    uGlow: {
      value: DEFAULT_GRADE.glow,
    },
  },
  vertexShader:
    "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    uniform sampler2D tA, tB;
    uniform float uMix, uKind, uTime, uContrast, uThreshold, uExposure, uColor, uGrain, uVignette, uGlow, uRaw;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
    vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec3 a = toSRGB(texture2D(tA, vUv).rgb);
      vec3 col = a;
      if (uMix > 0.0) {
        vec3 b = toSRGB(texture2D(tB, vUv).rgb);
        if (uKind < 0.5) {
          vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
          float v = 0.62 * fbm(p * 3.2 + 7.0) + 0.38 * length(p) * 1.25;
          float e = uMix * 1.3 - 0.15;
          float k = smoothstep(v - 0.012, v + 0.012, e);
          float edge = smoothstep(0.07, 0.0, abs(v - e)) * step(0.001, uMix) * step(uMix, 0.999);
          col = mix(a, b, k) * (1.0 - edge * 0.97);
        } else if (uKind < 1.5) {
          col = uMix < 0.5 ? a * (1.0 - smoothstep(0.0, 1.0, uMix * 2.0)) : b * smoothstep(0.0, 1.0, uMix * 2.0 - 1.0);
        } else if (uKind < 2.5) {
          col = uMix < 0.5 ? mix(a, vec3(1.0), smoothstep(0.0, 1.0, uMix * 2.0)) : mix(vec3(1.0), b, smoothstep(0.0, 1.0, uMix * 2.0 - 1.0));
        } else if (uKind < 3.5) {
          col = uMix < 0.5 ? a : b;
        } else {
          // iris：從畫面中心張開的圓形光圈，圈內是下一章，圈邊一道墨線（呼應封面的圓）
          vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
          float maxR = length(vec2(uRes.x / uRes.y, 1.0)) * 0.5 + 0.05;
          float r = uMix * maxR;
          float d = length(p);
          float k = smoothstep(r + 0.003, r - 0.003, d);
          float ring = smoothstep(0.022, 0.0, abs(d - r)) * step(0.001, uMix) * step(uMix, 0.999);
          col = mix(a, b, k) * (1.0 - ring * 0.97);
        }
        if (uKind > 4.5) {
          // page：一道斜的墨線從右往左掃過，線的右邊是下一章。方向與斜率照原作的翻頁（折線 x = fold - 0.22 * (1 - y)），
          // 所以這一章的畫面會從右上角開始被蓋掉，左下最後才消失，不會一開始就擋住畫面中央。
          float fold = mix(1.24, -0.03, uMix) - 0.22 * (1.0 - vUv.y);
          float k = step(fold, vUv.x);
          float line = smoothstep(0.006, 0.0, abs(vUv.x - fold)) * step(0.001, uMix) * step(uMix, 0.999);
          float shade = (1.0 - smoothstep(0.0, 0.05, vUv.x - fold)) * k * 0.22; // 墨線右側一小段陰影，像紙的厚度
          col = mix(a, b, k) * (1.0 - shade) * (1.0 - line * 0.97);
        }
      }
      col *= uExposure;
      vec3 raw = col; // 不經過三色處理的原色（終章退到真實世界時用）
      // Selective colour: what is strongly coloured keeps its colour, the rest goes to ink.
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      float sat = (mx - mn) / (mx + 1e-4);
      float keep = smoothstep(0.28, 0.62, sat) * smoothstep(0.04, 0.16, mx) * uColor;
      float w = 0.05;
      float ink = mix(l, smoothstep(uThreshold - w, uThreshold + w, l), uContrast);
      vec3 paper = mix(vec3(0.016), vec3(0.96, 0.95, 0.92), ink);
      vec3 hue = col / max(mx, 1e-4);
      vec3 colored = hue * mix(mx, smoothstep(0.08, 0.6, mx), uContrast * 0.6);
      col = mix(paper, colored, keep);
      col = mix(col, raw, uRaw);
      // Warm lift (visions, heaven)
      col += (vec3(1.0, 0.93, 0.8) - col) * uGlow * (0.35 + 0.65 * (1.0 - ink));
      // Vignette
      vec2 q = vUv - 0.5;
      col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(q * vec2(uRes.x / uRes.y * 0.75, 1.0)) * 1.15);
      // Grain
      float g = hash(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5;
      col += g * uGrain * 0.16;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
});
const compositeQuad = new Mesh(new PlaneGeometry(2, 2), compositeMaterial);
compositeQuad.frustumCulled = false;
const compositeScene = new Scene();
compositeScene.add(compositeQuad);
const compositeCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const portalUniforms = new Map();
const chapterContext = {
  renderer: renderer,
  resolution: resolutionUniform,
  portal(i) {
    if (!portalUniforms.has(i)) {
      portalUniforms.set(i, {
        value: null,
      });
    }
    return portalUniforms.get(i);
  },
};
let chapters = [];
let chapterStarts = [];
let totalDuration = 0;
// 章節的空殼：還沒建場景時就知道的東西（順序、長度、轉場）。建好之後場景等欄位直接加在同一個物件上，
// 卸載時再刪掉，所以 chapters 陣列裡的物件身分不變。
const STUB_KEYS = new Set(["id", "title", "duration", "enter", "plan", "built", "building", "elements"]);
function chapterStub(plan) {
  return { id: plan.id, title: plan.title, duration: PACE[plan.pace].duration, enter: PACE[plan.pace].enter ?? undefined, plan, built: false, elements: [] } as any;
}
/**
 * 建構中途讓出主執行緒。背景預建：等瀏覽器空閒（不搶畫面）。急件（開場的章、已經要畫卻還沒建好的章）：
 * 只讓出一個 macrotask，讓畫面和輸入有機會處理，但不等空閒（每段最多可能等 300 ms，累積起來會拖慢顯示）。
 * 一次全建的模式不讓出。
 */
function pauseBuild(isUrgent: () => boolean) {
  if (!lazyMode) return Promise.resolve();
  if (isUrgent()) return new Promise<void>((resolve) => setTimeout(resolve, 0));
  return nextIdle();
}
/**
 * 給一章建構用的 context：chapterContext 加上 yield()。場景在建構的段落之間呼叫 await chapterContext.yield?.()，
 * lazy 模式下等到瀏覽器空閒再繼續（一章拆成好幾個短任務，不會一次卡住畫面）；一次全建的模式立刻繼續。
 * 每一段的耗時記在 times.set（done() 記最後一段）。
 */
function buildContext(times, isUrgent: () => boolean = () => false) {
  const ctx = Object.create(chapterContext);
  times.set = [];
  let t = performance.now();
  const lap = () => times.set.push(Math.round(performance.now() - t));
  ctx.yield = async () => {
    lap();
    await pauseBuild(isUrgent);
    t = performance.now();
  };
  ctx.done = lap;
  return ctx;
}
function buildTimesOf(id: string) {
  const all = ((window as any).__buildTimes ??= {});
  return (all[id] ??= {});
}
/** 建出一章的場景（2D 平面版＋專屬 3D 場景），回傳章節物件；失敗時回傳佔位場景 */
async function createChapter(plan, isUrgent: () => boolean = () => false) {
  const load = chapterModules[`./chapters/${plan.id}.js`];
  if (!load) return placeholderChapter(plan);
  try {
    const module = await load();
    const loadSet = setModules[`./sets/${plan.id}.js`];
    if (loadSet && !query.has("flat")) {
      const flat = createRegistry(plan.id);
      // 各段耗時（毫秒）記在 window.__buildTimes[章 id]：flat = 平面版 build()，set = 3D 場景每一段，prewarm = 預熱
      const times = buildTimesOf(plan.id);
      const t0 = performance.now();
      const built = module.build(flat.register);
      times.flat = Math.round(performance.now() - t0);
      // lazy 模式：平面版和 3D 場景之間讓出主執行緒一次，一章的建構不會變成一整段卡住畫面的長任務
      const setModule = await loadSet();
      await pauseBuild(isUrgent);
      const ctx = buildContext(times, isUrgent);
      // 第三個參數把平面版交給 3D 場景：紙偶和貼圖直接沿用已經畫好的圖，不重畫
      const chapter = await setModule.default(ctx, plan, {
        parts: built.parts,
        object: (id) => flat.entries.find((entry) => entry.id === id)?.object,
      });
      ctx.done();
      chapter.set3d = true;
      chapter.group = built.group; // 平面版：給終章和共用世界用，不放進這一章自己的場景
      chapter.flatElements = flat.entries;
      return chapter;
    }
    const ctx = buildContext(buildTimesOf(plan.id), isUrgent);
    const chapter = await module.default(ctx, plan);
    ctx.done();
    return chapter;
  } catch (error) {
    console.error(`[world-ahead] chapter "${plan.id}" failed`, error);
    return placeholderChapter(plan);
  }
}
function finishChapter(stub, chapter) {
  Object.assign(stub, chapter);
  const plan = stub.plan;
  stub.id = plan.id;
  stub.title = plan.title;
  // 長度與進場轉場一律照節奏範本（pace.js），章節自己不能改
  stub.duration = PACE[plan.pace].duration;
  stub.enter = PACE[plan.pace].enter ?? undefined;
  stub.elements ??= [];
  stub.built = true;
  return stub;
}
const loadMark = (k: string) => (((window as any).__loadTimes ??= {})[k] = Math.round(performance.now() - LOAD_T0));
const LOAD_T0 = performance.now();
// lazy 模式（預設）：章節捲到附近才建（見下方 buildChapter／manageChapters）。
// ?flat（每一章都立在共用世界裡，需要全部的平面版）、?only、?placeholders、分享拍攝模式維持一次全建。
let lazyMode = false;
// 終章的封面另外逐章建平面版來烘（bakeWorldLazily）：lazy 模式（別章多半還沒建），或 ?only（別章根本不載入）。
// 其他一次全建的模式（?flat、分享拍攝）所有平面版都在，照原本在預熱時烘。
let lazyBake = false;
async function loadChapters() {
  // 載入各階段的時間（毫秒），除錯用：window.__loadTimes
  const mark = loadMark;
  await document.fonts.ready.catch(() => {});
  mark('fonts');
  // 還沒畫的章預設直接跳過，讓已完成的章連續播放；網址加 ?placeholders 才顯示佔位場景。
  const showPlaceholders = query.has("placeholders");
  // ?only=a,b 只載入指定的章（截圖檢查用，載入快很多）
  const only = query.get("only")?.split(",");
  const plans = chapterPlan.filter(
    (plan) => (showPlaceholders || chapterModules[`./chapters/${plan.id}.js`]) && (!only || only.includes(plan.id)),
  );
  lazyMode = !showPlaceholders && !only && !query.has("flat") && !shareMode;
  lazyBake = lazyMode || Boolean(only);
  chapters = plans.map(chapterStub);
  chapterStarts = [];
  totalDuration = 0;
  for (const chapter of chapters) {
    chapterStarts.push(totalDuration);
    totalDuration += chapter.duration;
  }
  if (lazyMode) {
    // 只先建開場會看到的章（和 prewarm 第一段同一組），其他章交給 manageChapters
    const first = firstChapters();
    await Promise.all([...first].map((k) => buildChapter(k, true)));
    mark('firstBuilt');
    buildCaptionList();
    resize();
    for (const k of first) prewarmChapter(chapters[k]);
    mark('prewarm:first');
    mark('prewarm');
    manageChapters();
    return;
  }
  // 也走 buildChapter（有去重複）：載入期間畫面迴圈碰到還沒建好的章會要求建構，不能各建一份
  await Promise.all(chapters.map((_, k) => buildChapter(k)));
  mark('allBuilt');
  buildCaptionList();
  setupWorld();
  resize();
  mark('world');
  prewarm(mark);
  mark('prewarm');
}
/** 開場要先準備好的章：起點（序章或 ?ch= 指定的章）、前後各一章、起點的 portal */
function firstChapters() {
  const first = new Set<number>();
  const start = pinned ? Math.max(0, chapters.findIndex((c) => c.id === pinned.id)) : 0;
  for (const k of [start - 1, start, start + 1]) if (chapters[k]) first.add(k);
  const portals = { prologue: ["stage"] }; // 還沒建好的章不知道自己的 portal；目前只有序章在開場就需要
  for (const id of chapters[start]?.portals ?? portals[chapters[start]?.id] ?? []) {
    const k = chapters.findIndex((x) => x.id === id);
    if (k >= 0) first.add(k);
  }
  return first;
}

// ---- lazy 建構（2026-11-19 使用者要求「各章的 build() 改成捲到附近才建立」） ----
// 每一章建好的場景（canvas 畫的貼圖、幾何、3D 模型）都很佔記憶體，一次全建在手機上會超過 iOS Safari 的上限。
// - 開場只建 firstChapters()；其他章在瀏覽器空閒時一章一章建（一次一章，不擋畫面）。
// - 桌機：最後全部建好，之後不卸載（和原本一樣）。
// - 記憶體吃緊的裝置（deviceTier.lowMemory）：只建正在看的章的前一章到後兩章；超出前兩章到後三章的整章卸載
//   （GPU 資源釋放、物件交給 GC），捲回來時重建。章節都用固定種子的亂數，重建出來和原本一樣。
// - 捲得比建構快、畫到還沒建好的章：那一章立刻建（不等空閒），建好之前畫面是底色。
const idleCall = (fn) => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 50));
const nextIdle = () => new Promise((resolve) => idleCall(resolve));
/** urgent：馬上要畫的章（見 pauseBuild）；背景正在建的章被要求成急件時，剩下的段落改用急件的讓出方式 */
function buildChapter(k, urgent = false) {
  const stub = chapters[k];
  if (!stub) return Promise.resolve();
  if (stub.built) return Promise.resolve(stub);
  if (urgent) stub.urgent = true;
  stub.building ??= createChapter(stub.plan, () => Boolean(stub.urgent)).then((chapter) => {
    stub.building = null;
    delete stub.urgent;
    finishChapter(stub, chapter);
    loadMark('built:' + stub.id);
    buildCaptionList();
    residentKey = "";
    if (lazyBake && stub.bakeWorld && !stub.isWorldBaked?.()) void bakeWorldLazily(stub); // 其他情況由 prewarmChapter 烘 // 烘過的封面會留著（見 cover.ts）
    return stub;
  });
  return stub.building;
}
/** 依目前看的章決定要建／要卸載哪些章（手機才卸載） */
function chapterWindow(pad: number, ahead: number) {
  const lo = Math.min(...residentIndices), hi = Math.max(...residentIndices);
  const want = new Set<number>();
  for (let k = lo - pad; k <= hi + ahead; k++) if (chapters[k]) want.add(k);
  for (const k of [...want]) {
    for (const id of chapters[k].portals ?? []) {
      const j = chapters.findIndex((c) => c.id === id);
      if (j >= 0) want.add(j);
    }
  }
  return want;
}
let pumping = false;
function manageChapters() {
  if (!lazyMode || !chapters.length) return;
  if (deviceTier.lowMemory) {
    const keep = chapterWindow(2, 3);
    chapters.forEach((chapter, k) => {
      if (chapter.built && !keep.has(k)) unloadChapter(k);
    });
  }
  if (pumping) return;
  pumping = true;
  // 一次建一章、預熱，空閒時再挑下一章：先建正在看的章，再往後、最後往前
  const step = async () => {
    const want = deviceTier.lowMemory ? chapterWindow(1, 2) : new Set(chapters.map((_, k) => k));
    const cur = Math.min(...residentIndices);
    const todo = [...want].filter((k) => !chapters[k].built).sort((a, b) => (a >= cur ? a - cur : (cur - a) * 1.5) - (b >= cur ? b - cur : (cur - b) * 1.5));
    if (!todo.length) {
      pumping = false;
      if (chapters.every((c) => c.built) && !(window as any).__loadTimes?.['prewarm:all']) loadMark('prewarm:all');
      return;
    }
    const k = todo[0];
    await buildChapter(k);
    await nextIdle(); // 建構和預熱（編 shader、傳貼圖、畫一次）分成兩段
    if (chapters[k].built && !chapters[k].prewarmed) prewarmChapter(chapters[k]);
    // 預熱完如果不在常駐視窗裡，GPU 資源馬上釋放
    residentKey = "";
    updateResidency(residentIndices);
    idleCall(step);
  };
  idleCall(step);
}
/** 卸載一章：GPU 資源（其他已建好的章沒在用的）釋放，場景等欄位刪掉，只留空殼 */
function unloadChapter(k) {
  const chapter = chapters[k];
  if (!chapter?.built) return;
  const others: Resources = { textures: new Set(), geometries: new Set() };
  chapters.forEach((other, j) => {
    if (j !== k && other.built) collectResources(other.scene, others);
  });
  const mine = collectResources(chapter.scene, { textures: new Set(), geometries: new Set() });
  for (const texture of mine.textures) if (!others.textures.has(texture) && !(texture as any).isRenderTargetTexture) texture.dispose();
  for (const geometry of mine.geometries) if (!others.geometries.has(geometry)) geometry.dispose();
  chapter.shadowLight?.shadow.map?.dispose();
  chapter.dispose?.(); // 章節自己要釋放的東西（目前沒有章用到；終章烘好的封面刻意留著）
  for (const key of Object.keys(chapter)) if (!STUB_KEYS.has(key)) delete chapter[key];
  chapter.built = false;
  chapter.elements = [];
  cameraFollow.delete(k);
  residentKey = "";
  buildCaptionList();
}
/**
 * 終章：螢幕上的整張封面要從每一章的平面版烘出來。lazy 模式下別章多半沒建，
 * 所以另外逐章建一份平面版（空閒時一章一章來），全部到齊後烘一次，然後丟掉。
 */
async function bakeWorldLazily(chapter) {
  const flats = [];
  const release = () => {
    const used: Resources = { textures: new Set(), geometries: new Set() };
    for (const other of chapters) if (other.built) collectResources(other.scene, used);
    for (const flat of flats) {
      flat.group.removeFromParent();
      const mine = collectResources(flat.group, { textures: new Set(), geometries: new Set() });
      for (const texture of mine.textures) if (!used.textures.has(texture) && !(texture as any).isRenderTargetTexture) texture.dispose();
      for (const geometry of mine.geometries) if (!used.geometries.has(geometry)) geometry.dispose();
    }
  };
  for (const plan of chapterPlan) {
    const load = chapterModules[`./chapters/${plan.id}.js`];
    if (plan.id === chapter.id || !load) continue;
    await nextIdle();
    if (!chapter.built) return release(); // 等待期間終章被卸載了
    try {
      const module = await load();
      if (!module.build) continue;
      const registry = createRegistry(plan.id);
      const built = module.build(registry.register);
      flats.push({ id: plan.id, group: built.group, flatElements: registry.entries });
    } catch (error) {
      console.error(`[world-ahead] flat "${plan.id}" failed`, error);
    }
  }
  if (!chapter.built) return release();
  setupStaging(flats); // 圖層順序（地景先畫）和一次全建時一樣
  for (const flat of flats) chapter.worldScene.add(flat.group);
  applyStand(0, null);
  chapter.bakeWorld(renderer);
  setupStaging([]); // 立體化的登記只有烘焙用得到，清掉才不會留住這些物件
  release();
  loadMark('baked');
}

// 預熱：載入時先把每一章的 shader 編譯好、貼圖上傳到 GPU。
// 不做的話，每一章第一次出現在畫面上那一幀才做這些事，捲動時會卡一下；
// 最明顯的是終章：它會一次放進所有章的平面版元素（約 500 張貼圖），第一次進入時卡了 145 毫秒。
// ---- 真的投影陰影（第四輪，2026-11-19 使用者要求「添加陰影」） ----
// 每一章的 3D 場景加一盞會投影的平行光，方向和這一場景卡通材質的 uLight 一致（材質自己算明暗，這盞燈只負責陰影）。
// 卡通材質的物件都投影也接收陰影（userData.noShadow 的除外）；有透明貼圖的紙偶用貼圖的 alpha 投出輪廓的影子。
// 陰影的範圍每一幀跟著鏡頭看的地方走（camera.userData.focus，沒有就取鏡頭前方），大小依距離調整，所以近景的影子很細、遠景也有影子。
renderer.shadowMap.enabled = deviceTier.shadowMaps;
renderer.shadowMap.type = PCFSoftShadowMap;
function setupShadows(chapter) {
  if (!deviceTier.shadowMaps || !chapter.set3d) return;
  let lightDir = null;
  chapter.scene.traverse((o) => {
    const u = o.material?.uniforms;
    if (!lightDir && u?.uLight && u.uThreshold) lightDir = u.uLight.value.clone().normalize();
  });
  if (!lightDir) return;
  if (!chapter.shadowLight) {
    const light = new DirectionalLight(0xffffff, 0); // 強度 0：不影響任何受光材質，只投影
    light.castShadow = true;
    light.shadow.mapSize.set(deviceTier.shadowMap, deviceTier.shadowMap);
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 2.5;
    light.userData.dir = lightDir;
    chapter.scene.add(light, light.target);
    chapter.shadowLight = light;
  }
  enableShadowCasters(chapter.scene);
}
function enableShadowCasters(scene) {
  scene.traverse((o) => {
    if (!o.isMesh || o.userData.noShadow || o.userData.shadowSet) return;
    o.userData.shadowSet = true;
    // 多材質的 mesh（例如圓盤：側面、頂面、底面各一個材質）：純色的 MeshBasic 逐一換成只接收陰影的卡通材質，其他照舊
    if (Array.isArray(o.material)) {
      o.material = o.material.map((part) =>
        part?.isMeshBasicMaterial && !part.map && !part.transparent && !part.vertexColors && part.side !== BackSide && part.fog !== false
          ? flatShadowMaterial(part, scene)
          : part,
      );
      const opaque = o.material.every((part) => !part?.transparent);
      o.receiveShadow = opaque;
      o.castShadow = opaque && o.material.some((part) => part?.uniforms?.uThreshold);
      return;
    }
    const material = o.material;
    if (material?.uniforms?.uThreshold && !material.transparent) {
      o.castShadow = o.receiveShadow = true;
    } else if (material?.isMeshBasicMaterial && material.map && material.alphaTest > 0 && !material.transparent) {
      // 紙偶：用貼圖的 alpha 投出輪廓
      o.castShadow = true;
      o.customDepthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: material.map, alphaTest: material.alphaTest });
    } else if (material?.isMeshBasicMaterial && !material.map && !material.transparent && !material.vertexColors && material.side !== BackSide && material.fog !== false) {
      // 純色的地面、牆、遠山：MeshBasicMaterial 不能接收陰影，換成同色、永遠受光的卡通材質（只顯示投影陰影的排線）
      o.material = flatShadowMaterial(material, scene);
      o.receiveShadow = true;
      if (o.userData.castShadow) o.castShadow = true;
    } else if (o.userData.castShadow) {
      o.castShadow = true;
    }
  });
}
const flatShadowCache = new Map();
function flatShadowMaterial(basic, scene) {
  const key = basic.uuid;
  if (flatShadowCache.has(key)) return flatShadowCache.get(key);
  const color = basic.color.clone();
  const material = toonMaterial({ color, shade: color.clone().multiplyScalar(0.08), threshold: -2, rim: 0, side: basic.side });
  // 霧：沿用場景的 Fog（卡通材質的霧是自己的 uniform）
  if (scene.fog?.isFog) {
    material.uniforms.uFogColor.value.copy(scene.fog.color);
    material.uniforms.uFogNear.value = scene.fog.near;
    material.uniforms.uFogFar.value = scene.fog.far;
  }
  flatShadowCache.set(key, material);
  return material;
}
const shadowFocus = new Vector3(), shadowForward = new Vector3();
function fitShadow(chapter) {
  const light = chapter.shadowLight;
  if (!light) return;
  const camera = chapter.camera;
  const focus = camera.userData.focus;
  camera.getWorldDirection(shadowForward);
  const distance = focus ? Math.max(0.5, camera.position.distanceTo(focus)) : 8;
  if (focus) shadowFocus.copy(focus);
  else shadowFocus.copy(camera.position).addScaledVector(shadowForward, distance);
  // 涵蓋畫面寬度再加一些（畫面外的東西也要能把影子投進來）
  const half = Math.min(80, distance * Math.tan((camera.fov * Math.PI) / 360) * Math.max(1, camera.aspect) * 1.6 + 1.5);
  const cam = light.shadow.camera;
  cam.left = cam.bottom = -half;
  cam.right = cam.top = half;
  cam.near = 0.05;
  cam.far = half * 8;
  cam.updateProjectionMatrix();
  light.target.position.copy(shadowFocus);
  light.position.copy(shadowFocus).addScaledVector(light.userData.dir, half * 4);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();
}

// 預熱分兩段（2026-11-19 使用者要求「初始化載入太慢」）：
// 1. 開場會看到的章（序章、它的 portal 看到的舞台；直接跳章時是那一章和前後一章）在開始前同步做完；
// 2. 其他章在瀏覽器空閒時一章一章做（requestIdleCallback），不擋開場。使用者捲到之前通常早就做完了；
//    終章的整張封面烘焙排在最後。
// 每一章要做的：陰影燈、編譯 shader、上傳貼圖、實際畫一次（陰影貼圖與依光源數量編譯的 shader 只有真的畫過才會建立）。
function prewarmChapter(chapter) {
  const started = performance.now();
  setupShadows(chapter);
  attachWorld(chapter);
  const textures = new Set<Texture>();
  chapter.scene.traverse((object) => {
    const material = object.material;
    if (!material) return;
    for (const value of Object.values(material as Record<string, any>)) if (value?.isTexture) textures.add(value);
    for (const uniform of Object.values((material.uniforms ?? {}) as Record<string, any>)) if (uniform?.value?.isTexture) textures.add(uniform.value);
  });
  renderer.compile(chapter.scene, chapter.camera);
  for (const texture of textures) renderer.initTexture(texture);
  if (chapter.bakeWorld && !lazyBake) {
    // lazy 模式和 ?only 改由 bakeWorldLazily 烘（別章沒建或不載入）
    // 終章把整張封面（每一章的平面版元素）烘成一張貼圖，之後不用每一幀畫上千個物件
    for (const other of worldGroups) {
      restore(other.rest);
      chapter.worldScene.add(other.group);
    }
    applyStand(0, null);
    chapter.bakeWorld(renderer);
  }
  const target = getRenderTarget(0);
  chapter.camera.aspect = frame.aspect || 1;
  chapter.camera.updateProjectionMatrix();
  chapter.update(0.5, frame);
  if (chapter.shadowLight) enableShadowCasters(chapter.scene); // update 裡才建立的物件
  fitShadow(chapter);
  renderer.setRenderTarget(target);
  renderer.render(chapter.scene, chapter.camera);
  renderer.setRenderTarget(null);
  chapter.prewarmed = true;
  buildTimesOf(chapter.id).prewarm = Math.round(performance.now() - started);
}
function prewarm(mark = (_k: string) => {}) {
  const first = new Set<number>();
  const start = pinned ? Math.max(0, chapters.findIndex((c) => c.id === pinned.id)) : 0;
  for (const k of [start - 1, start, start + 1]) if (chapters[k]) first.add(k);
  for (const c of chapters[start]?.portals ?? []) {
    const k = chapters.findIndex((x) => x.id === c);
    if (k >= 0) first.add(k);
  }
  for (const k of first) prewarmChapter(chapters[k]);
  mark("prewarm:first");
  // 其他章：依故事順序，終章（要烘整張封面）最後
  const rest = chapters.map((_, k) => k).filter((k) => !first.has(k)).sort((a, b) => Number(!!chapters[a].bakeWorld) - Number(!!chapters[b].bakeWorld) || a - b);
  const idle = (fn) => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 50));
  const next = () => {
    const k = rest.shift();
    if (k === undefined) return mark("prewarm:all");
    // 使用者已經捲到這一章附近就立刻做（不等空閒）
    prewarmChapter(chapters[k]);
    // 手機：預熱完（shader 編好、陰影建好）如果不在常駐視窗裡，資源馬上釋放，記憶體不會一路累積
    residentKey = "";
    updateResidency(residentIndices);
    idle(next);
  };
  idle(next);
}
/** 使用者捲得比背景預熱快時：畫某一章之前若還沒預熱，先做完 */
function ensurePrewarmed(index) {
  const chapter = chapters[index];
  if (chapter && !chapter.prewarmed) prewarmChapter(chapter);
}

// ---- GPU 資源的常駐視窗（lazy loading，2026-11-19 使用者回報「實體手機無法開啟」） ----
// 原本每一章的貼圖、幾何、陰影貼圖預熱後全部常駐 GPU，手機上加起來超過 1 GB，iOS Safari 直接把分頁砍掉。
// 記憶體吃緊的裝置（deviceTier.lowMemory）只讓「正在畫的章、前後各一章、它們的 portal」常駐；
// 其他章的資源釋放掉（shader 程式保留，所以重新載入只是重傳貼圖、幾何，不用重新編譯）。
// 捲到某一章的前一章時它就進入視窗，在那時先上傳，進場那一幀不會卡。
// three.js 對 dispose 過的貼圖／幾何下次用到會自動重傳，所以就算漏判也只是多傳一次，不會畫錯。
// 渲染目標的貼圖（portal、終章烘好的封面）不能釋放：內容是畫出來的，釋放就沒了。
type Resources = { textures: Set<Texture>; geometries: Set<any> };
function collectResources(root, out: Resources, skip?: Set<any>) {
  const visit = (object) => {
    if (skip?.has(object)) return;
    if (object.geometry) out.geometries.add(object.geometry);
    const materials = [object.material, object.customDepthMaterial, object.customDistanceMaterial].flat().filter(Boolean);
    for (const material of materials) {
      for (const value of Object.values(material as Record<string, any>)) if (value?.isTexture) out.textures.add(value);
      for (const uniform of Object.values((material.uniforms ?? {}) as Record<string, any>)) {
        const v = uniform?.value;
        if (v?.isTexture) out.textures.add(v);
        else if (Array.isArray(v)) for (const t of v) if (t?.isTexture) out.textures.add(t);
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  return out;
}
const isStaged = (chapter) => !chapter.set3d && !chapter.bakeWorld && Boolean(chapter.group || chapter.showsWholeWorld);
let residentKey = "";
function updateResidency(indices: number[]) {
  if (!deviceTier.lowMemory || !chapters.length) return;
  const keep = new Set<number>();
  for (const i of indices) {
    for (const k of [i - 1, i, i + 1]) if (chapters[k]) keep.add(k);
    for (const id of chapters[i]?.portals ?? []) {
      const k = chapters.findIndex((c) => c.id === id);
      if (k >= 0) keep.add(k);
    }
  }
  const key = [...keep].sort((a, b) => a - b).join(",");
  if (key === residentKey) return;
  residentKey = key;
  // 平面版元素（世界群組）是所有「立在封面上」的章共用的，會被借進正在畫的那一章的場景：分開處理
  const worldRoots = new Set(worldGroups.map((w) => w.group));
  const worldNeeded = [...keep].some((k) => isStaged(chapters[k]));
  const kept: Resources = { textures: new Set(), geometries: new Set() };
  for (const k of keep) if (chapters[k].built) collectResources(chapters[k].scene, kept, worldNeeded ? undefined : worldRoots);
  if (worldNeeded) for (const root of worldRoots) collectResources(root, kept);
  const far: Resources = { textures: new Set(), geometries: new Set() };
  chapters.forEach((chapter, k) => {
    if (keep.has(k) || !chapter.built || !chapter.prewarmed) return;
    collectResources(chapter.scene, far, worldRoots);
    if (chapter.shadowLight?.shadow.map) {
      chapter.shadowLight.shadow.map.dispose();
      chapter.shadowLight.shadow.map = null; // 下次畫到時 three.js 會重建
    }
    chapter.evicted = true;
  });
  if (!worldNeeded) for (const root of worldRoots) collectResources(root, far);
  for (const texture of far.textures) if (!kept.textures.has(texture) && !(texture as any).isRenderTargetTexture) texture.dispose();
  for (const geometry of far.geometries) if (!kept.geometries.has(geometry)) geometry.dispose();
  // 進入視窗、之前被釋放過的章：先把貼圖傳上去（幾何在第一次畫的時候傳，成本很小）
  let reload = false;
  for (const k of keep) {
    if (chapters[k].evicted) reload = true;
    chapters[k].evicted = false;
  }
  if (reload) for (const texture of kept.textures) if (!(texture as any).isRenderTargetTexture) renderer.initTexture(texture);
}
let residentIndices = [0];
let lastWindowKey = "";
const captionList = [];
function buildCaptionList() {
  captionList.length = 0;
  chapters.forEach((i, e) => {
    for (const t of i.captions ?? []) {
      const n = t.kind ?? "narration";
      if (n !== "sfx") {
        captionList.push({
          ch: e,
          from: t.from,
          to: t.to,
          text: t.text,
          kind: n,
          on: false,
        });
      }
    }
  });
  captionList.sort(
    (i, e) =>
      chapterStarts[i.ch] +
      i.from * chapters[i.ch].duration -
      (chapterStarts[e.ch] + e.from * chapters[e.ch].duration),
  );
}
const captionEls = [0, 1].map(() => {
  const i = document.createElement("p");
  i.className = "cap";
  captionsEl.append(i);
  return i;
});
let captionSlot = 0;
let shownCaption = null;
// 字幕逐字出現（中文沒有空白可切詞）。每個字的延遲寫在 --d，由 CSS 做淡入。
function showCaption(caption) {
  if (caption === shownCaption) {
    return;
  }
  shownCaption = caption;
  const outgoing = captionEls[captionSlot];
  if (outgoing.classList.contains("in")) {
    outgoing.classList.remove("in");
    outgoing.classList.add("out");
  }
  if (!caption) {
    return;
  }
  captionSlot = 1 - captionSlot;
  const incoming = captionEls[captionSlot];
  incoming.className = `cap ${caption.kind}`;
  incoming.textContent = "";
  const chars = Array.from(caption.text as string);
  const revealSeconds = Math.min(chars.length * 0.045, 3.5);
  chars.forEach((char, index) => {
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = char;
    span.style.setProperty(
      "--d",
      `${(0.2 + (index / Math.max(chars.length - 1, 1)) * revealSeconds).toFixed(2)}s`,
    );
    incoming.append(span);
  });
  incoming.offsetWidth;
  incoming.classList.add("in");
}
// 環境音與音效都是程式合成的（audio-synth.js），沒有音檔。
const AMBIENT_LOOPS = LOOP_NAMES;
const SFX_CUES = CUE_NAMES;
let audioCtx = null;
let masterGain = null;
let ambientBus = null;
let mixBus = null;
const MIX_GAIN = 0.6;
const loopGains = new Map();
const bufferCache = new Map();
// 聲音一律開著（使用者要求移除開關）；只有分享截圖模式靜音。按下入口的眼睛時才建立 AudioContext（瀏覽器規定）。
let soundOn = !shareMode;
function loadSound(name) {
  if (!audioCtx) {
    return Promise.resolve(null);
  }
  if (!bufferCache.has(name)) {
    bufferCache.set(name, Promise.resolve(synthBuffer(audioCtx, name)));
  }
  return bufferCache.get(name);
}
function initAudio() {
  const i = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (i) {
    i.type = "playback";
  }
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioCtx.destination);
  mixBus = audioCtx.createGain();
  mixBus.gain.value = MIX_GAIN;
  // 陰森感（使用者要求）：所有聲音先濾掉一些高頻（像隔著牆、在暗處），再加一個 4.5 秒的長殘響（空曠的大廳）。
  // 殘響的脈衝響應是兩聲道各自的雜訊，指數衰減並越來越悶；乾聲 0.8、濕聲 0.55。
  const darken = audioCtx.createBiquadFilter();
  darken.type = "lowpass";
  darken.frequency.value = 4200;
  darken.Q.value = 0.4;
  mixBus.connect(darken);
  const dry = audioCtx.createGain();
  dry.gain.value = 0.8;
  darken.connect(dry).connect(masterGain);
  const reverb = audioCtx.createConvolver();
  const irSeconds = 4.5, irLength = Math.floor(audioCtx.sampleRate * irSeconds);
  const ir = audioCtx.createBuffer(2, irLength, audioCtx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = ir.getChannelData(channel);
    let seed = 9001 + channel * 77, y = 0;
    for (let i = 0; i < irLength; i++) {
      seed = (seed * 16807) % 2147483647;
      const t = i / irLength;
      y += ((seed / 2147483647) * 2 - 1 - y) * (0.6 - 0.5 * t); // 越後面越悶
      data[i] = y * Math.pow(1 - t, 2.2);
    }
  }
  reverb.buffer = ir;
  const wet = audioCtx.createGain();
  wet.gain.value = 0.55;
  darken.connect(reverb).connect(wet).connect(masterGain);
  ambientBus = audioCtx.createGain();
  ambientBus.connect(mixBus);
  for (const e of AMBIENT_LOOPS) {
    const t = audioCtx.createGain();
    t.gain.value = 0;
    t.connect(ambientBus);
    loopGains.set(e, t);
    loadSound(e).then((n) => {
      if (!n || !audioCtx) {
        return;
      }
      const r = audioCtx.createBufferSource();
      r.buffer = n;
      r.loop = true;
      r.connect(t);
      r.start(0, Math.random() * n.duration);
    });
  }
  SFX_CUES.forEach((e) => loadSound(e));
  audioCtx.addEventListener("statechange", onAudioState);
  applyMasterGain();
}
function applyMasterGain() {
  if (audioCtx && masterGain) {
    masterGain.gain.setTargetAtTime(
      soundOn && audioCtx.state === "running" ? 1 : 0,
      audioCtx.currentTime,
      0.7, // 約 2 秒淡入
    );
  }
}
// 聲音第一次真的開始（AudioContext 進入 running）時：淡入並補一聲倒放的鈸
let audioGreeted = false;
function onAudioState() {
  applyMasterGain();
  if (!audioGreeted && soundOn && audioCtx?.state === "running") {
    audioGreeted = true;
    playCue("reverseSwell");
  }
}
async function unlockAudio(i) {
  if (soundOn) {
    if (!audioCtx) {
      initAudio();
    }
    if (audioCtx.state === "suspended") {
      await audioCtx.resume().catch(() => {});
    }
    applyMasterGain();
  }
}
for (const i of ["pointerdown", "keydown", "touchend", "click"]) {
  window.addEventListener(i, unlockAudio, {
    passive: true,
  });
}
function playCue(name) {
  if (!(!soundOn || !audioCtx || !masterGain)) {
    loadSound(name).then((e) => {
      if (!e || !audioCtx || !mixBus) {
        return;
      }
      const t = audioCtx.createBufferSource();
      t.buffer = e;
      const n = audioCtx.createGain();
      n.gain.value = 0.9;
      t.connect(n).connect(mixBus);
      t.start();
    });
  }
}
// 沒有入口頁（2026-11-19 使用者要求移除）：載入完成就直接開始，鏡頭自己捲進第一章。
// 聲音：瀏覽器規定沒有使用者的點擊、觸碰或按鍵之前不能出聲。所以——
//   1. 載入完成時就先建立 AudioContext 並試著啟動：瀏覽器允許的話（例如常來這個網站、或使用者設定允許自動播放）就直接有聲音；
//   2. 否則等使用者第一次點擊、觸碰、按鍵（含用方向鍵或空白鍵捲動）時啟動；滾輪和觸控板捲動不算，這是瀏覽器的限制；
//   3. 聲音一啟動就用約 2 秒慢慢淡入，並補一聲倒放的鈸，不會突然很大聲。
function enterStory() {
  soundOn = !shareMode;
  document.documentElement.classList.remove("locked");
  if (pinned) return;
  if (soundOn) {
    if (!audioCtx) initAudio();
    audioCtx.resume().catch(() => {});
  }
  autoScrollIn();
}
const AUTO_SCROLL_TARGET = 1.05;
let hintAnchor = -1;
function autoScrollIn() {
  const i = window.scrollY;
  const e = AUTO_SCROLL_TARGET * viewportHeight;
  const t = performance.now() + 500;
  const n = 3500;
  let r = false;
  const s = () => (r = true);
  const a = ["wheel", "touchstart", "keydown", "pointerdown"];
  a.forEach((c) =>
    window.addEventListener(c, s, {
      passive: true,
      once: true,
    }),
  );
  const o = (c) => {
    const l = clamp((c - t) / n);
    if (!r) {
      window.scrollTo(0, i + (e - i) * easeInOutSine(l));
    }
    if (!r && l < 1) {
      requestAnimationFrame(o);
    } else {
      a.forEach((u) => window.removeEventListener(u, s));
      hintAnchor = window.scrollY / viewportHeight;
    }
  };
  requestAnimationFrame(o);
}
const easeInOutSine = (t_) => -(Math.cos(Math.PI * t_) - 1) / 2;

// ---- 滾動放慢、更柔順（2026-11-19 使用者要求；「一次滑到下一段劇情」的做法使用者又取消了） ----
// 滾輪與觸控板：攔下原本的捲動，把每一次的捲動量打 4.5 折累加到目標位置，畫面再用約 0.45 秒的時間常數慢慢追上目標，
// 所以每一下滾得比較短、停得比較軟，連續滾動也是一條平順的曲線。手機的手指拖曳、捲軸拖曳、鍵盤仍用瀏覽器原本的捲動。
const WHEEL_SCALE = 0.6; // 2026-11-19 使用者要求加快一點（原 0.45）
const WHEEL_FOLLOW = 0.45; // 秒
let wheelTarget = null;
let wheelLast = 0;
let wheelPos = 0; // 自己記的小數位置：scrollTo 會捨入到整數像素，每一幀只前進零點幾像素時讀回 scrollY 會卡住
window.addEventListener(
  "wheel",
  (event) => {
    if (pinned || event.ctrlKey) return; // ctrl + 滾輪是縮放，不攔
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? viewportHeight : 1;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (wheelTarget === null) wheelTarget = window.scrollY;
    wheelTarget = clamp(wheelTarget + event.deltaY * unit * WHEEL_SCALE, 0, max);
    if (!wheelLast) {
      wheelLast = performance.now();
      wheelPos = window.scrollY;
      requestAnimationFrame(followWheel);
    }
  },
  { passive: false },
);
function followWheel(now) {
  const dt = clamp((now - wheelLast) / 1000, 0, 0.1);
  wheelLast = now;
  wheelPos += (wheelTarget - wheelPos) * (1 - Math.exp(-dt / WHEEL_FOLLOW));
  if (Math.abs(wheelTarget - wheelPos) < 0.5) wheelPos = wheelTarget;
  window.scrollTo(0, wheelPos);
  if (wheelPos !== wheelTarget) requestAnimationFrame(followWheel);
  else {
    wheelLast = 0;
    wheelTarget = null;
  }
}
// 用捲軸或鍵盤捲動時，下一次滾輪從目前的位置開始算
window.addEventListener("scroll", () => {
  if (!wheelLast) wheelTarget = null;
}, { passive: true });


let viewportHeight = window.innerHeight;
let storyTime = 0;
let scrollTarget = 0;
const pointerSmoothed = new Vector2();
const pointerRaw = new Vector2();
const POINTER_GAIN = 2.5;
const pointer = new Vector2();
// 量測 100lvh 的探針由伺服器端渲染（components/Experience.tsx）：引擎在 React 水合之前就會跑到這裡，
// 自己往 body 加元素會讓水合失敗。找不到（例如別的頁面）才自己建一個。
const lvhProbe =
  document.getElementById("lvh-probe") ??
  Object.assign(document.createElement("div"), { className: "lvh-probe" });
if (!lvhProbe.isConnected) document.body.append(lvhProbe);
const measureViewportHeight = () => lvhProbe.offsetHeight || window.innerHeight;
let lastSize = {
  w: 0,
  h: 0,
};
function resize() {
  viewportHeight = measureViewportHeight();
  const i = window.innerWidth;
  lastSize = {
    w: i,
    h: viewportHeight,
  };
  renderer.setSize(i, viewportHeight, false);
  renderer.getDrawingBufferSize(bufferSize);
  resolutionUniform.value.copy(bufferSize);
  for (const e of renderTargetPool) {
    e.setSize(bufferSize.x, bufferSize.y);
  }
  scrollEl.style.height = `${(totalDuration + 1) * viewportHeight}px`;
}
window.addEventListener("resize", () => {
  if (
    window.innerWidth !== lastSize.w ||
    Math.abs(measureViewportHeight() - lastSize.h) > 1
  ) {
    resize();
  }
});
let frameTimeSum = 0;
let frameCount = 0;
let lastPixelRatioChange = 0;
function adaptPixelRatio(dt, time) {
  if (
    document.hidden ||
    dt > 0.25 ||
    ((frameTimeSum += dt), frameCount++, frameTimeSum < 1.5)
  ) {
    return;
  }
  const t = frameTimeSum / frameCount;
  frameTimeSum = frameCount = 0;
  let n = pixelRatio;
  if (t > 1 / 40 && pixelRatio > 0.75) {
    n = Math.max(0.75, pixelRatio - 0.25);
  } else {
    if (
      t < 1 / 57 &&
      pixelRatio < maxPixelRatio &&
      time - lastPixelRatioChange > 8
    ) {
      n = Math.min(maxPixelRatio, pixelRatio + 0.25);
    }
  }
  if (n !== pixelRatio) {
    pixelRatio = n;
    lastPixelRatioChange = time;
    renderer.setPixelRatio(pixelRatio);
    resize();
  }
}
// 滑鼠移動造成的鏡頭視差已移除（使用者要求移除所有 hover 效果）；pointer 永遠是 (0, 0)。
window.addEventListener(
  "scroll",
  () => (scrollTarget = window.scrollY / viewportHeight),
  {
    passive: true,
  },
);
const clock = new Clock();
const frame = {
  time: 0,
  dt: 0,
  width: 0,
  height: 0,
  aspect: 1,
  pointer: pointer,
};
const lastProgress = new Map();
const grade = {
  ...DEFAULT_GRADE,
};
const loopLevels = new Map();
let prevStoryTimeForSpeed = 0;
let scrollSpeed = 0;
function chapterProgress(index) {
  return (storyTime - chapterStarts[index]) / chapters[index].duration;
}
function currentTransition() {
  let index = 0;
  for (
    ;
    index < chapters.length - 1 && storyTime >= chapterStarts[index + 1];
  ) {
    index++;
  }
  const enterLength = (n) => {
    const r = chapters[n].enter;
    return !r || r.kind !== "cut" ? (r?.length ?? 0.8) : 0;
  };
  const enterKind = (n) => TRANSITION_KIND[chapters[n].enter?.kind ?? "ink"];
  if (
    index > 0 &&
    enterLength(index) > 0 &&
    storyTime < chapterStarts[index] + enterLength(index) / 2
  ) {
    const n = smooth(
      clamp(
        (storyTime - (chapterStarts[index] - enterLength(index) / 2)) /
          enterLength(index),
      ),
    );
    return [index - 1, index, n, enterKind(index)];
  }
  if (
    index < chapters.length - 1 &&
    enterLength(index + 1) > 0 &&
    storyTime > chapterStarts[index + 1] - enterLength(index + 1) / 2
  ) {
    const n = smooth(
      clamp(
        (storyTime - (chapterStarts[index + 1] - enterLength(index + 1) / 2)) /
          enterLength(index + 1),
      ),
    );
    return [index, index + 1, n, enterKind(index + 1)];
  }
  return [index, index, 0, 0];
}
const renderedThisFrame = new Map();
let renderTargetCursor = 0;
// ---- 共用世界 ----
// 每一章的場景裡除了自己的元素，也放進其他所有章的元素（停在封面上的靜止狀態），
// 這樣鏡頭移動時看到的是同一個連續的世界，不會看到某一章的地景被切掉的邊。
// three.js 的物件只能有一個父節點，所以是在每次要畫某一章之前，把別章的群組「借」進它的場景。
const worldGroups = []; // { chapter, group, rest }
function snapshot(group) {
  const rest = [];
  group.traverse((object) => {
    const material = object.material;
    rest.push({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      visible: object.visible,
      opacity: material && "opacity" in material ? material.opacity : null,
      uniforms: material?.uniforms
        ? Object.entries(material.uniforms as Record<string, any>).filter(([, u]) => typeof u.value === "number").map(([name, u]) => [name, u.value])
        : null,
    });
  });
  return rest;
}
function restore(rest) {
  for (const state of rest) {
    const { object } = state;
    object.position.copy(state.position);
    object.quaternion.copy(state.quaternion);
    object.scale.copy(state.scale);
    object.visible = state.visible;
    if (state.opacity !== null) object.material.opacity = state.opacity;
    if (state.uniforms) for (const [name, value] of state.uniforms) object.material.uniforms[name].value = value;
  }
}
function setupWorld() {
  setupStaging(chapters); // 先插入立體化的樞紐，再記錄靜止狀態
  worldGroups.length = 0;
  for (const chapter of chapters) {
    if (chapter.group) worldGroups.push({ chapter, group: chapter.group, rest: snapshot(chapter.group) });
  }
  // 終章（showsWholeWorld）沒有自己的元素：可查看的是每一章登記過的全部
  for (const chapter of chapters) {
    if (chapter.showsWholeWorld) chapter.elements = chapters.flatMap((other) => (other.group ? (other.flatElements ?? other.elements) : []));
  }
}
function attachWorld(chapter) {
  if (chapter.set3d || chapter.bakeWorld || (!chapter.group && !chapter.showsWholeWorld)) return; // 專屬 3D 場景、烘焙過的終章、佔位場景不放
  for (const other of worldGroups) {
    if (other.chapter !== chapter) restore(other.rest);
    if (other.group.parent !== chapter.scene) chapter.scene.add(other.group);
  }
}

// 鏡頭緩衝：章節算出來的鏡頭位置是捲動進度的純函式，捲得快或關鍵格之間變化急的時候會有頓挫。
// 這裡讓實際的鏡頭以約 0.2 秒的時間常數追上算出來的位置（位置、方向、fov 都是），把頓挫抹平。
// 這一章上一幀沒有被畫（剛進入畫面）、或用 ?ch= 固定畫面時直接對齊，不追。
const cameraFollow = new Map(); // index -> { pos, quat, fov, frame }
let renderFrameNumber = 0;
function smoothCamera(index, camera) {
  const state = cameraFollow.get(index);
  const fresh = !state || state.frame < renderFrameNumber - 1 || pinned;
  if (fresh) {
    cameraFollow.set(index, { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, frame: renderFrameNumber });
    return;
  }
  // 下一章是硬切的話，接近結尾時逐漸不追（最後一格要和下一章的第一格完全對上）
  const progress = chapterProgress(index);
  const next = chapters[index + 1];
  const release = next?.enter?.kind === "cut" ? smooth(clamp((progress - 0.86) / 0.12)) : 0;
  const k = Math.max(1 - Math.exp(-frame.dt / 0.28), release); // 約 0.28 秒的鏡頭緩衝（更柔順）
  state.pos.lerp(camera.position, k);
  state.quat.slerp(camera.quaternion, k);
  state.fov += (camera.fov - state.fov) * k;
  state.frame = renderFrameNumber;
  camera.position.copy(state.pos);
  camera.quaternion.copy(state.quat);
  camera.fov = state.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function renderChapter(index) {
  if (renderedThisFrame.has(index)) {
    return renderedThisFrame.get(index);
  }
  if (!chapters[index].built) {
    // 還沒建好（捲得比背景建構快）：立刻建，建好之前這一章畫成底色
    void buildChapter(index, true).then(() => {
      if (chapters[index].built && !chapters[index].prewarmed) prewarmChapter(chapters[index]);
    });
    const blank = getRenderTarget(renderTargetCursor++);
    renderer.setRenderTarget(blank);
    renderer.clear();
    renderer.setRenderTarget(null);
    renderedThisFrame.set(index, blank);
    return blank;
  }
  ensurePrewarmed(index);
  const chapter = chapters[index];
  for (const r of chapter.portals ?? []) {
    const s = chapters.findIndex((a) => a.id === r);
    if (s >= 0 && s !== index) {
      chapterContext.portal(r).value = renderChapter(s).texture;
    }
  }
  attachWorld(chapter);
  const staged = !chapter.set3d && !chapter.bakeWorld && Boolean(chapter.group || chapter.showsWholeWorld);
  if (staged) {
    // 章節的 update 裡若要量立起來之後的位置（例如序章推進水晶球），矩陣要先是立好的
    const before = chapter.stage ?? DEFAULT_STAGE;
    applyStand(before.stand, before.standChapter ?? chapter.id);
    chapter.scene.updateMatrixWorld(true);
  }
  const progress = chapterProgress(index);
  chapter.camera.aspect = frame.aspect;
  chapter.camera.updateProjectionMatrix();
  chapter.update(progress, frame);
  smoothCamera(index, chapter.camera);
  if (staged) {
    const stage = chapter.stage ?? DEFAULT_STAGE;
    applyStand(stage.stand, stage.standChapter ?? chapter.id); // update 改過位置之後再立一次
    stageCamera(chapter.camera, stage);
    chapter.scene.updateMatrixWorld(true);
    updateSortKeys(chapter.camera);
  }
  fitShadow(chapter);
  const target = getRenderTarget(renderTargetCursor++);
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(chapter.scene, chapter.camera);
  renderer.setRenderTarget(null);
  renderedThisFrame.set(index, target);
  return target;
}
function blendGrade(from, to_, mix) {
  for (const n of Object.keys(DEFAULT_GRADE)) {
    const r = from.grade?.[n] ?? DEFAULT_GRADE[n];
    const s = to_.grade?.[n] ?? DEFAULT_GRADE[n];
    grade[n] = r + (s - r) * mix;
  }
}
const SHOW_CAPTIONS = query.has("captions");
function tick() {
  requestAnimationFrame(tick);
  if (!chapters.length) {
    return;
  }
  const dt = Math.min(clock.getDelta(), 0.1);
  frame.dt = dt;
  frame.time += dt;
  frame.width = bufferSize.x;
  frame.height = bufferSize.y;
  frame.aspect = bufferSize.x / bufferSize.y;
  adaptPixelRatio(dt, frame.time);
  pointerSmoothed.lerp(pointerRaw, 1 - Math.exp(-dt * 2.5));
  pointer.copy(pointerSmoothed).multiplyScalar(POINTER_GAIN);
  if (pinned) {
    const _ = Math.max(
      0,
      chapters.findIndex((v) => v.id === pinned.id),
    );
    storyTime = chapterStarts[_] + pinned.t * chapters[_].duration;
  } else {
    storyTime += (scrollTarget - storyTime) * (1 - Math.exp(-dt * 3)); // 原作是 6；調慢，起停更柔和（第五輪再從 4 調到 3）
    if (Math.abs(scrollTarget - storyTime) < 1e-4) {
      storyTime = scrollTarget;
    }
  }
  storyTime = clamp(storyTime, 0, totalDuration);
  renderedThisFrame.clear();
  renderFrameNumber++;
  renderTargetCursor = 0;
  const [fromIndex, toIndex, mix, kind] = currentTransition();
  residentIndices = fromIndex === toIndex ? [fromIndex] : [fromIndex, toIndex];
  const windowKey = residentIndices.join(",");
  if (windowKey !== lastWindowKey) {
    lastWindowKey = windowKey;
    manageChapters(); // 換章了：建附近的章、（手機）卸載遠的章
  }
  updateResidency(residentIndices);
  const fromTarget = renderChapter(fromIndex);
  const toTarget = mix > 0 ? renderChapter(toIndex) : fromTarget;
  const fromChapter = chapters[fromIndex];
  const toChapter = chapters[toIndex];
  blendGrade(fromChapter, toChapter, mix);
  const uniforms = compositeMaterial.uniforms;
  uniforms.tA.value = fromTarget.texture;
  uniforms.tB.value = toTarget.texture;
  uniforms.uMix.value = fromIndex === toIndex ? 0 : mix;
  uniforms.uKind.value = kind;
  uniforms.uTime.value = frame.time;
  uniforms.uContrast.value = grade.contrast;
  uniforms.uThreshold.value = grade.threshold;
  uniforms.uExposure.value = grade.exposure;
  uniforms.uRaw.value = grade.raw;
  uniforms.uColor.value = grade.color;
  uniforms.uGrain.value = grade.grain;
  uniforms.uVignette.value = grade.vignette;
  uniforms.uGlow.value = grade.glow;
  renderer.render(compositeScene, compositeCamera);
  for (const _ of new Set([fromIndex, toIndex])) {
    const v = chapterProgress(_);
    const m = lastProgress.get(_);
    if (m !== undefined && v > m && v - m < 0.2) {
      for (const d of chapters[_].cues ?? []) {
        if (m < d.at && v >= d.at) {
          playCue(d.cue);
        }
      }
    }
    lastProgress.set(_, v);
  }
  for (const _ of lastProgress.keys()) {
    if (_ !== fromIndex && _ !== toIndex) {
      lastProgress.delete(_);
    }
  }
  if (audioCtx && soundOn) {
    for (const _ of AMBIENT_LOOPS) {
      const v =
        (fromChapter.sound?.[_] ?? 0) * (fromIndex === toIndex ? 1 : 1 - mix) +
        (fromIndex === toIndex ? 0 : (toChapter.sound?.[_] ?? 0) * mix);
      if (Math.abs((loopLevels.get(_) ?? -1) - v) > 0.005) {
        loopGains.get(_)?.gain.setTargetAtTime(v, audioCtx.currentTime, 0.25);
        loopLevels.set(_, v);
      }
    }
  }
  let activeCaption = null;
  for (const caption of captionList) {
    const p =
      caption.ch === fromIndex || caption.ch === toIndex
        ? chapterProgress(caption.ch)
        : NaN;
    if (p >= caption.from && p <= caption.to) {
      activeCaption = caption;
    }
  }
  // 字幕預設不顯示（使用者要求全部移除）。各章的字幕文字仍留在資料裡，網址加 ?captions 可以叫出來對照。
  showCaption(SHOW_CAPTIONS ? activeCaption : null);
  hintEl.style.opacity =
    hintAnchor < 0
      ? "0"
      : String(0.75 * (1 - smooth(clamp((storyTime - hintAnchor) / 0.3))));
  const progress = storyTime / totalDuration;
  scrollSpeed +=
    (Math.abs(storyTime - prevStoryTimeForSpeed) / Math.max(dt, 0.001) -
      scrollSpeed) *
    (1 - Math.exp(-dt * 5));
  prevStoryTimeForSpeed = storyTime;
}
window.__wa = {
  go(i, e) {
    pinned = {
      id: i,
      t: e,
    };
  },
  free() {
    pinned = null;
  },
  get info() {
    return {
      ...renderer.info.memory,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(),
    };
  },
  get audio() {
    return {
      state: audioCtx?.state ?? "none",
      on: soundOn,
    };
  },
  get captions() {
    return captionList.map((i) => ({
      chapter: chapters[i.ch].id,
      text: i.text,
      kind: i.kind,
    }));
  },
  /** 目前這一章已登記元素的螢幕外框（CSS 像素），供標註層與測試使用。 */
  get elements() {
    const [fromIndex] = currentTransition();
    const chapter = chapters[fromIndex];
    return chapter.elements.map((entry) => ({
      id: entry.id,
      count: entry.count ?? null,
      box: projectElement(entry.object, chapter.camera, window.innerWidth, viewportHeight),
    }));
  },
  /** 捲到某一章的某個進度（正常捲動模式用；帶 ?ch= 固定畫面時改用 go）。 */
  scrollTo(id, t = 0.3) {
    const index = chapters.findIndex((chapter) => chapter.id === id);
    if (index < 0) return;
    if (pinned) {
      pinned = { id, t };
      return;
    }
    window.scrollTo({ top: (chapterStarts[index] + t * chapters[index].duration) * viewportHeight, behavior: "smooth" });
  },
  /** 某個元素編號在哪一章（終章以外） */
  chapterOf(elementId) {
    return chapters.find((chapter) => chapter.id !== "cover" && (chapter.plan?.elements.includes(elementId) || chapter.elements.some((entry) => entry.id === elementId)))?.id ?? null;
  },
  get current() {
    const [fromIndex, toIndex, mix] = currentTransition();
    return chapters[mix > 0.5 ? toIndex : fromIndex].id;
  },
  /** 量測用：某一章在 progress 時的鏡頭位置、注視點、fov（會呼叫該章的 update） */
  cameraAt(id, progress) {
    const chapter = chapters.find((c) => c.id === id);
    if (!chapter?.built) return null; // lazy 模式下還沒建好的章
    chapter.camera.aspect = frame.aspect || innerWidth / innerHeight;
    chapter.update(progress, frame);
    const c = chapter.camera, f = c.userData.focus;
    return { pos: c.position.toArray(), at: f ? f.toArray() : null, fov: c.fov };
  },
  /** 除錯用：某一章的 three.js 場景（還沒建好的章是 null） */
  scene(id) {
    return chapters.find((c) => c.id === id)?.scene ?? null;
  },
  get chapters() {
    return chapters.map((i, e) => ({
      id: i.id,
      start: chapterStarts[e],
      duration: i.duration,
    }));
  },
};
resize();
loadChapters().then(() => {
  document.body.classList.add("ready");
  setupStoryText(window.__wa);
  enterStory();
  window.__waReady = true;
  if (shareMode) {
    setTimeout(() => {
      markShareReady(SHARE_SHOT.seconds);
      if (!isShareVideo) {
        return;
      }
      const i = performance.now();
      const e = (t) => {
        const n = clamp((t - i) / (SHARE_SHOT.seconds * 1e3));
        pinned = {
          id: SHARE_SHOT.id,
          t:
            SHARE_SHOT.from +
            (SHARE_SHOT.to - SHARE_SHOT.from) * easeInOutSine(n),
        };
        if (n < 1) {
          requestAnimationFrame(e);
        }
      };
      requestAnimationFrame(e);
    }, 2500);
  }
  if (!pinned) {
    scrollTarget = storyTime = window.scrollY / viewportHeight;
  }
});
tick();
