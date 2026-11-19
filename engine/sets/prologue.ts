// prologue 的 3D 場景：觀星台（PRD-3D 6.1）。
// 夜裡的山坡：左邊是架著望遠鏡的觀星者，右邊白色的圓台上立著水晶球；地面往遠處隆起，盡頭是富士山的輪廓。
// 節奏範本 book：
//   open 0.10–0.30（原作封面張開）→ 鏡頭從觀星者背後繞到側面，水晶球的光芒亮起；
//   pages 0.30–0.64（原作翻三頁）→ 沿望遠鏡的方向移到水晶球前；0.47–0.64 球裡的星芒收掉、下一章的畫面從球心張開；
//   cameraSettle 0.62 → 鏡頭停在球前；dive 0.62–1 → 推進球裡，到 1.0 球裡的畫面蓋滿螢幕，硬切到 stage 看不出來。
// 第二輪：觀星者是一層層有厚度的白色人形（兩條腿、軀幹、頭、兩隻手臂各在不同的深度，交疊的地方有黑邊），站在一圈白色光圈圍起來的觀星台上；
// 星星是立體的四芒星，散在不同的距離；山坡上一叢叢灌木（封面上這塊黑色夜空的上緣就是這樣一球一球的），越遠越淡進黑色的霧裡。
import {
  BackSide, BufferAttribute, BufferGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide, Group, Mesh,
  PerspectiveCamera, PlaneGeometry, Points, RingGeometry, Scene, ShaderMaterial, SphereGeometry, Vector2, Vector3,
} from "three";
import { clamp, deviceTier, linearstep, seededRandom, smooth, toonMaterial } from "../core";
import { createRegistry } from "../elements";
import { PACE } from "../pace";
import { applyCameraShot, makeCameraTrack, widenFovForNarrowAspect } from "../shared/camera";
import { addFog } from "../shared/set/env";
import { box, cylinder, extrude, lathe, makePalette, sphere } from "../shared/set/model";
import { inkOutline, makeFigure } from "../shared/set/figure";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：夜裡只有風和很低的恐懼低鳴，遠處有人在耳語；水晶球亮起時一串走音的風鈴（0.14）；球心張開時一句聽不清楚的耳語（0.5）；推進球裡時倒放的鈸湧上來（0.72），低沉的合唱越來越近。
const soundScript = soundTrack([[0, { dread: 0.22, whisper: 0.12, wind: 0.15, night: 0.08 }], [0.45, { dread: 0.25, whisper: 0.15, wind: 0.1, choir: 0.08 }], [0.7, { dread: 0.3, space: 0.15, choir: 0.22 }]]);

const K = 0.025; // 觀星者這一組：封面 1 像素 = 0.025 單位（封面的 2.5 倍大）
const TRIPOD_X = -2.4; // 三腳架頂端（封面 505,1188）的位置
const FEET_PY = 1237; // 封面上腳底的 y
const ax = (px) => TRIPOD_X + (px - 505) * K; // 封面像素 → 世界 x
const ay = (py) => (FEET_PY - py) * K; // 封面像素 → 高度

const R = 0.62; // 水晶球半徑
const TERRACE_TOP = 0.1;
const PEDESTAL_H = 0.9;
const BALL = new Vector3(2.2, TERRACE_TOP + PEDESTAL_H + 0.59 * R + R, 0); // 球心
const DISC_R = R * 0.9; // 球裡那個畫面的半徑
const DECK_TOP = 0.03; // 觀星者腳下那塊白色觀星台的高度
const FOG: [number, number] = [15, 62]; // 黑色的霧：近處不受影響，遠處的灌木和星星淡進夜色

// 水晶球四周的光芒：[角度（度，0 朝右、逆時針）, 內半徑, 外半徑]，單位是封面像素（球半徑 27）；和平面版同一組數字
const RAYS = [[0, 36, 50], [26, 37, 50], [52, 38, 50], [78, 38, 52], [100, 38, 52], [128, 37, 49], [154, 36, 48], [180, 36, 50], [208, 37, 50], [-28, 37, 50]];

/** 兩點之間的一根細桿 */
function strut(material, from, to, radius, segments = 8) {
  const a = new Vector3(...from), b = new Vector3(...to);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, a.distanceTo(b), segments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

/** 四芒星的輪廓（封面上星星的畫法：四個尖角之間往中心凹進去） */
function sparkleOutline(r, waist = 0.12) {
  const points = [];
  for (let quarter = 0; quarter < 4; quarter++) {
    const a = (quarter * Math.PI) / 2, b = a + Math.PI / 2, c = a + Math.PI / 4;
    for (let i = 0; i < 7; i++) {
      const t = i / 7, k0 = (1 - t) * (1 - t), k1 = 2 * t * (1 - t), k2 = t * t;
      points.push([
        r * (k0 * Math.cos(a) + k1 * waist * Math.cos(c) + k2 * Math.cos(b)),
        r * (k0 * Math.sin(a) + k1 * waist * Math.sin(c) + k2 * Math.sin(b)),
      ]);
    }
  }
  return points;
}
/** 立體的四芒星：兩片有厚度的星形十字交叉，從哪個方向看都是四個尖角 */
function makeSparkle(material, r) {
  const star = new Group();
  const blade = extrude(material, sparkleOutline(r), r * 0.14);
  const cross = blade.clone();
  cross.rotation.y = Math.PI / 2;
  blade.userData.noShadow = cross.userData.noShadow = true;
  star.add(blade, cross);
  return star;
}

/** 一叢灌木：幾顆大小不一的球擠在一起，黑色的球體靠白色的邊緣光勾出一球一球的輪廓 */
function makeBush(material, random, size) {
  const bush = new Group();
  const count = 4 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const r = size * (0.42 + random() * 0.4);
    const x = (i - (count - 1) / 2) * size * 0.55 + (random() - 0.5) * size * 0.2;
    bush.add(sphere(material, r, x, r * (0.55 + random() * 0.5), (random() - 0.5) * size * 0.5, 12, 8));
  }
  return bush;
}

/** 山坡：近處平、往遠處隆起。黑色的地面上一排排白色的短線，靠它們的透視看出地面往遠處延伸。 */
function makeHillside() {
  const geometry = new PlaneGeometry(320, 320, 96, 96);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const rise = smooth(clamp((-z - 9) / 36, 0, 1));
    position.setY(i, rise * 5.2 + rise * Math.sin(x * 0.09 + 1.3) * 1.1);
  }
  const material = new ShaderMaterial({
    uniforms: { uInk: { value: new Color(BLACK) }, uLine: { value: new Color(WHITE) } },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform vec3 uInk, uLine; varying vec3 vW;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main() {
        float row = vW.z / 1.5;
        float id = floor(row), f = fract(row);
        float x = vW.x * 0.3 + hash(id) * 9.0;
        float len = 0.2 + hash(floor(x) + id * 7.0) * 0.45;
        float dash = step(fract(x), len) * step(0.35, hash(floor(x) * 1.7 + id));
        float d = distance(vW, cameraPosition);
        // 線寬隨距離加粗一點，遠處才不會碎成雜點；更遠就淡掉
        float line = step(abs(f - 0.5), 0.016 + d * 0.0012) * dash * (1.0 - smoothstep(18.0, 44.0, d)); // 遠處漸漸淡掉（霧）
        gl_FragColor = vec4(mix(uInk, uLine, line), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new Mesh(geometry, material);
}

/** 有遠近的星空：一大片散在不同距離的光點，會閃爍。近的大、遠的小，鏡頭移動時彼此有視差。 */
function makeStarField(count) {
  const random = seededRandom(98);
  const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const azimuth = random() * Math.PI * 2, elevation = 0.06 + random() * 1.35, radius = 45 + random() * random() * 110;
    positions[i * 3] = Math.cos(azimuth) * Math.cos(elevation) * radius;
    positions[i * 3 + 1] = Math.sin(elevation) * radius;
    positions[i * 3 + 2] = Math.sin(azimuth) * Math.cos(elevation) * radius;
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  const points = new Points(geometry, new ShaderMaterial({
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio, 2) }, uColor: { value: new Color(WHITE) } },
    vertexShader: `
      attribute float aSeed; uniform float uTime, uPx; varying float vOn;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float twinkle = 0.75 + 0.25 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 40.0);
        gl_PointSize = (260.0 + aSeed * 460.0) * twinkle * uPx / max(-mv.z, 1.0);
        vOn = step(0.12, twinkle * (0.3 + aSeed));
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vOn;
      void main() {
        vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
        if (pow(q.x, 0.6) + pow(q.y, 0.6) > 1.0 || vOn < 0.5) discard; // 四芒星的形狀
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  points.frustumCulled = false;
  return points;
}

/**
 * 球裡的畫面（#117）：一片永遠正對鏡頭的圓盤，放在球心。
 * 螢幕空間取樣（原作書本插畫的做法）：盤上每一點顯示的是下一章此刻畫面的同一個螢幕位置，
 * 所以圓盤蓋滿螢幕時畫面已經全是下一章。uBulge > 0 時邊緣的影像被球面折彎、盤緣壓暗，推進時歸零。
 */
function makePortalDisc(portal, resolution) {
  const material = new ShaderMaterial({
    uniforms: {
      uPortal: portal,
      uRes: resolution,
      uHasPortal: { value: 0 },
      uReveal: { value: 0 }, // 畫面從球心張開的程度
      uBulge: { value: 1 }, // 球面的折射與高光；俯衝時降到 0
      uCenter: { value: new Vector2(0.5, 0.5) }, // 球心在螢幕上的位置（0–1）
      uRed: { value: new Color(RED) },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D uPortal; uniform vec2 uRes, uCenter; uniform float uHasPortal, uReveal, uBulge; uniform vec3 uRed;
      varying vec2 vUv;
      void main() {
        vec2 d = (vUv - 0.5) * 2.0;
        float r = length(d);
        // 還沒張開時：黑色的玻璃
        vec3 col = vec3(0.0);
        vec2 uv = gl_FragCoord.xy / uRes;
        uv = uCenter + (uv - uCenter) * (1.0 + 0.55 * uBulge * r * r);
        vec3 scene = uHasPortal > 0.5 ? texture2D(uPortal, uv).rgb : vec3(0.91, 0.89, 0.84);
        scene *= mix(1.0, smoothstep(1.0, 0.8, r), uBulge); // 盤緣是玻璃的厚度，往外變暗
        col = mix(col, scene, step(r, uReveal * 1.03));
        // 高光：左側一道紅色的弧（封面上的畫法），左上一點白色的反光
        float angle = atan(d.y, d.x);
        float arc = step(abs(r - 0.76), 0.035) * (step(2.5, angle) + step(angle, -2.25));
        float glint = step(length(d - vec2(-0.42, 0.52)), 0.07);
        col = mix(col, uRed, arc * step(0.3, uBulge));
        col = mix(col, vec3(0.92, 0.9, 0.85), glint * step(0.3, uBulge));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const disc = new Mesh(new CircleGeometry(DISC_R, 64), material);
  disc.userData.noShadow = true;
  return disc;
}

/**
 * 兩節手臂的解算：調整肩膀（x、z）與手肘（x）的角度，讓 makeFigure 的手掌落在世界座標 target 上。
 * 用座標下降法慢慢逼近（只在建場景時算一次），之後每一幀只疊上呼吸之類的小擺動。
 */
function reachTo(figure, side, target) {
  const j = figure.userData.joints;
  const shoulder = j[`shoulder${side}`], elbow = j[`elbow${side}`];
  const hand = elbow.children.find((child) => child.isMesh && Math.abs(child.position.y + 0.31) < 0.001);
  const at = new Vector3();
  const error = () => {
    figure.updateMatrixWorld(true);
    return hand.getWorldPosition(at).distanceTo(target);
  };
  const params = [[shoulder.rotation, "x", -3.0, 1.0], [shoulder.rotation, "z", -1.2, 1.2], [shoulder.rotation, "y", -0.8, 0.8], [elbow.rotation, "x", -2.4, 0]];
  let best = error();
  for (let step = 0.4; step > 0.002; step *= 0.6) {
    for (let round = 0; round < 6; round++) {
      for (const [rotation, axis, lo, hi] of params) {
        for (const delta of [step, -step]) {
          const before = rotation[axis];
          rotation[axis] = Math.min(hi, Math.max(lo, before + delta));
          const e = error();
          if (e < best - 1e-6) best = e;
          else rotation[axis] = before;
        }
      }
    }
  }
  return best;
}

export default function createPrologueSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(BLACK);
  const camera = new PerspectiveCamera(38, 1, 0.03, 500);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.5, 0.8, 0.6]);
  const white = mat.flat(WHITE);
  const { open, pages, cameraSettle, dive } = PACE.book.beats;

  addFog(scene, mat, BLACK, ...FOG);
  const starWhite = mat.flat(WHITE, false); // 發光的東西不被霧吃掉

  // ---- 環境：山坡、遠處的富士山 ----
  scene.add(makeHillside());
  // 富士山：車床做的黑色山體（靠白色的邊緣光勾出兩側的稜線）、白色的雪頂。它在霧的範圍之外，用自己的材質，不受霧影響
  const fuji = new Group();
  fuji.add(
    lathe(toonMaterial({ color: "#141414", shade: BLACK, light: mat.light, rim: 0.9, rimColor: WHITE, threshold: 0.15, side: DoubleSide }), [[30, 0], [19, 3.4], [11.5, 7.6], [6.4, 11.6], [3.6, 14.2], [2.9, 14.9]], 40),
    lathe(starWhite, [[6.6, 11.3], [5.2, 12.1], [3.7, 14.2], [3.0, 14.95], [0, 14.7]], 12), // 邊數少，雪線才有鋸齒
  );
  fuji.position.set(-16, 4.2, -78);
  scene.add(fuji);

  // 山坡上的灌木（封面上這塊黑色夜空的上緣）：近處幾叢，往遠處一排排，越遠越淡
  const bushRandom = seededRandom(97);
  const bushes = new Group();
  const hillY = (x, z) => { const rise = smooth(clamp((-z - 9) / 36, 0, 1)); return rise * 5.2 + rise * Math.sin(x * 0.09 + 1.3) * 1.1; };
  const bushSpots = [[-6.8, -3.0, 0.7], [-5.0, -5.4, 0.9], [-9.4, -1.0, 0.6], [6.8, -3.8, 0.8], [8.4, -1.6, 0.6], [-0.4, -6.2, 0.8], [7.8, 2.6, 0.5]];
  for (let row = 0; row < 3; row++) {
    const z = -10 - row * 8, count = 8 + row * 2;
    for (let i = 0; i < count; i++) {
      if (bushRandom() < 0.5) continue; // 一叢一叢、中間留空：看得到後面的山坡和富士山
      bushSpots.push([(i - (count - 1) / 2) * (3.6 + row * 0.8) + (bushRandom() - 0.5) * 2, z + (bushRandom() - 0.5) * 3, 0.8 + row * 0.25 + bushRandom() * 0.4]);
    }
  }
  for (const [x, z, size] of bushSpots) {
    const bush = makeBush(mat.ink, bushRandom, size);
    bush.position.set(x, hillY(x, z) - size * 0.12, z);
    bushes.add(bush);
  }
  scene.add(bushes);

  // ---- #98 星星：封面上的五顆四芒星是立體的星形，掛在不同的距離；位置照封面的排法，鏡頭走到正側面（0.30）時和封面一樣 ----
  // 後面再散一些小的四芒星和一整片有遠近的星點
  const stars = new Group();
  const starSpots = [[-2.9, 5.45, -14, 0.46], [0.53, 6.96, -20, 0.36], [2.36, 4.39, -12, 0.52], [2.35, 2.5, -17, 0.56], [-1.13, 4.94, -25, 0.36]];
  for (const [x, y, z, r] of starSpots) {
    const star = makeSparkle(starWhite, r);
    star.position.set(x, y, z);
    stars.add(star);
  }
  register(98, stars, { count: 5 });
  const extraStars = new Group();
  const starRandom = seededRandom(981);
  const faint = mat.flat(WHITE); // 這些會被霧吃掉一點：遠的比較暗
  for (let i = 0; i < Math.round(22 * Math.max(0.5, deviceTier.particleScale)); i++) {
    const z = -9 - starRandom() * 44;
    const star = makeSparkle(faint, 0.1 + starRandom() * 0.16);
    star.position.set((starRandom() - 0.5) * (26 - z * 0.7), hillY(0, z) + 2.4 + starRandom() * (7 - z * 0.22), z);
    extraStars.add(star);
  }
  const starField = makeStarField(Math.round(520 * deviceTier.particleScale));
  scene.add(stars, extraStars, starField);

  // ---- #97 觀星者：第四輪改成立體人物（makeFigure：連續的軀幹、膠囊四肢、關節球，外面一圈墨線），整個人是封面上那個白色剪影 ----
  // 身高與站位照封面（頭頂 1160、腳底 1237，身體中心 x 474）；臉朝 +x（望遠鏡），雙手扶著鏡筒的後端，頭微微前傾湊近目鏡。
  // 墨線在白色的人形上就是封面版畫的那種分隔線（手臂疊在軀幹前、兩腿之間），夜空是黑的，外圈的墨線融進背景。
  const astronomer = new Group();
  const figure = makeFigure(mat, { suit: mat.paper, pants: mat.paper, skin: mat.paper, shirt: null, shoes: mat.paper, hair: "short", hairMaterial: mat.paper, build: 1.18, height: ay(1160) });
  figure.position.set(ax(473.5), 0, 0);
  figure.rotation.y = Math.PI / 2; // 臉朝 +x
  const pose = figure.userData.pose, joints = figure.userData.joints;
  // 站姿：重心在後腳、前腳往望遠鏡跨出半步（封面上兩腿之間那道縫）；上身前傾，雙手往前上方扶著鏡筒
  const STANCE = { hipL: [-0.16, 0, 0.04], hipR: [0.14, 0, -0.04], kneeL: 0.12, kneeR: 0.05, spine: [0.14, 0, 0] };
  pose(STANCE);
  // 外套的下襬：一圈稍微張開的布，蓋過腰（封面的剪影在臀部那裡比腿寬）
  const hem = lathe(mat.paper, [[0.0001, 0.2], [0.15, 0.2], [0.205, 0.05], [0.215, -0.06], [0.228, -0.17], [0.0001, -0.17]], 22);
  hem.scale.z = 0.74; // 骨盆（pelvis）的墨線要整個包在下襬裡面，腰上才不會露出一圈黑
  joints.hips.add(hem);
  // 外套的翻領與口袋的縫：細細的墨線條，白色的面上才有東西讓排線與光影落上去
  const seam = mat.flat(BLACK);
  for (const side of [1, -1]) {
    const lapel = box(seam, 0.012, 0.22, 0.012, side * 0.05, 0.4, 0.117);
    lapel.rotation.z = side * 0.32;
    joints.spine.add(lapel);
    joints.hips.add(box(seam, 0.09, 0.01, 0.012, side * 0.09, -0.02, 0.12));
  }
  joints.spine.add(box(seam, 0.012, 0.3, 0.012, 0, 0.16, 0.118)); // 前襟
  inkOutline(hem, { width: 0.011 });
  // 望遠鏡：車床做的兩段鏡筒（後細前粗），仰角照封面（約 35 度），架在三腳架的雲台上
  const rear = [ax(489), ay(1183)], front = [ax(526), ay(1157)];
  const tubeLength = Math.hypot(front[0] - rear[0], front[1] - rear[1]);
  const telescope = new Group();
  telescope.add(
    lathe(mat.paper, [[0.0001, -0.07], [0.04, -0.07], [0.04, 0], [0.062, 0], [0.062, tubeLength * 0.56], [0.09, tubeLength * 0.56], [0.09, tubeLength], [0.0001, tubeLength]], 20),
    lathe(mat.flat(BLACK), [[0.066, tubeLength * 0.5], [0.066, tubeLength * 0.56]], 20), // 兩段鏡筒之間的接環
    lathe(mat.flat(BLACK), [[0.093, tubeLength - 0.05], [0.093, tubeLength - 0.02]], 20),
    cylinder(mat.flat(BLACK), 0.075, 0.075, 0.006, 0, tubeLength + 0.001, 0, 20), // 物鏡
    lathe(mat.paper, [[0.075, tubeLength * 0.12], [0.075, tubeLength * 0.2]], 20), // 鏡筒束環
    box(mat.paper, 0.05, 0.08, 0.05, 0.075, tubeLength * 0.16, 0), // 束環上的鎖扣
    // 尋星鏡：鏡筒上面平行的一支小鏡，兩個支架
    cylinder(mat.paper, 0.022, 0.022, tubeLength * 0.32, -0.12, tubeLength * 0.3, 0, 12),
    box(mat.paper, 0.05, 0.02, 0.02, -0.085, tubeLength * 0.2, 0),
    box(mat.paper, 0.05, 0.02, 0.02, -0.085, tubeLength * 0.4, 0),
    // 調焦座與兩顆調焦輪
    cylinder(mat.paper, 0.05, 0.05, 0.05, 0, 0.0, 0, 16),
    cylinder(mat.paper, 0.022, 0.022, 0.16, 0, 0.0, 0, 10).rotateX(Math.PI / 2),
  );
  // 目鏡：天頂鏡往上彎，對著觀星者的眼睛
  const eyepiece = cylinder(mat.paper, 0.026, 0.03, 0.12, 0, -0.05, 0, 12);
  eyepiece.rotation.z = 1.25;
  eyepiece.position.set(-0.05, -0.06, 0);
  telescope.add(eyepiece);
  inkOutline(telescope, { width: 0.008 });
  telescope.position.set(rear[0], rear[1], 0);
  telescope.rotation.z = -Math.atan2(front[0] - rear[0], front[1] - rear[1]);
  const apex = [TRIPOD_X, ay(1188), 0];
  const tripod = new Group();
  tripod.add(
    strut(white, apex, [ax(488), 0, 0.2], 0.02),
    strut(white, apex, [ax(521), 0, 0.26], 0.02),
    strut(white, apex, [ax(506), 0, -0.42], 0.02),
    strut(white, apex, [TRIPOD_X, ay(1175), 0], 0.028), // 中柱
    box(white, 0.2, 0.035, 0.12, TRIPOD_X, ay(1188.5), 0), // 雲台
  );
  // 三腳架的細節：腳的伸縮鎖扣、中段的三角撐桿與置物盤、腳尖
  const feet = [[ax(488), 0, 0.2], [ax(521), 0, 0.26], [ax(506), 0, -0.42]];
  const spreaderY = ay(1214);
  const mid = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const hub = [TRIPOD_X, spreaderY, 0];
  for (const foot of feet) {
    const lock = mid(apex, foot, 0.45);
    tripod.add(sphere(white, 0.03, ...lock, 10, 8), sphere(white, 0.026, ...foot, 8, 6));
    const brace = mid(apex, foot, (apex[1] - spreaderY) / apex[1]);
    tripod.add(strut(white, hub, brace, 0.01));
  }
  tripod.add(cylinder(white, 0.09, 0.09, 0.015, ...hub, 18), box(white, 0.06, 0.06, 0.06, TRIPOD_X, ay(1191), 0)); // 置物盤、雲台的軸座
  // 雲台的手把：往後伸到觀星者的手邊
  tripod.add(strut(white, [TRIPOD_X - 0.05, ay(1189), 0.06], [ax(490), ay(1197), 0.18], 0.012));
  inkOutline(tripod, { width: 0.006 });

  // 雙手扶著鏡筒：用一個兩節的手臂解算器把手放到鏡筒的後段與調焦座旁（近的那隻手在鏡筒外側、遠的那隻托著鏡筒下面）
  const tubeDir = new Vector3(front[0] - rear[0], front[1] - rear[1], 0).normalize();
  const along = (d, side) => new Vector3(rear[0] + tubeDir.x * d, rear[1] + tubeDir.y * d, side);
  reachTo(figure, "R", along(0.08, 0.1)); // 近鏡頭的手（臉朝 +x 時右手在 +z）：握著調焦座
  reachTo(figure, "L", along(0.38, -0.08)); // 遠的手：托著鏡筒
  const armPose = ["shoulderL", "shoulderR", "elbowL", "elbowR"].map((name) => [name, joints[name].rotation.clone()]);
  astronomer.add(figure, telescope, tripod);
  register(97, astronomer);
  scene.add(astronomer);
  // 觀星台：一塊黑色的矮圓台，邊上兩圈白線。地面是黑的看不到影子，改用這兩道光圈交代人和三腳架站在哪裡；
  // 台面不鋪白，白色的人形才不會和地面糊在一起
  const deck = new Group();
  deck.add(lathe(mat.flat(BLACK), [[0.0001, 0], [1.75, 0], [1.75, DECK_TOP], [0.0001, DECK_TOP]], 48));
  for (const [radius, width] of [[1.75, 0.045], [1.3, 0.016]]) {
    const ring = new Mesh(new RingGeometry(radius - width, radius, 64), white);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = DECK_TOP + 0.004;
    deck.add(ring);
  }
  deck.position.set(-2.75, 0, 0);
  scene.add(deck);

  // ---- 白色的圓台與球座的柱子：車床做的。黑色的球座和影子落在白色上才看得見 ----
  const terrace = lathe(mat.paper, [[0.0001, 0], [3.3, 0], [3.3, 0.05], [2.9, 0.05], [2.9, TERRACE_TOP], [0.0001, TERRACE_TOP]], 56);
  terrace.position.set(BALL.x, 0, 0);
  const pedestal = lathe(mat.paper, [
    [0.72, 0], [0.72, 0.1], [0.5, 0.16], [0.4, 0.26], [0.36, 0.6], [0.4, 0.72], [0.62, 0.78], [0.78, 0.82], [0.78, PEDESTAL_H], [0.0001, PEDESTAL_H],
  ], 40);
  pedestal.position.set(BALL.x, TERRACE_TOP, 0);
  scene.add(terrace, pedestal);

  // ---- #99 水晶球：真的球，立在車床做的球座上（兩層黑色底盤、紅色的托），四周一圈紅色光芒 ----
  const ball = new Group();
  const baseY = TERRACE_TOP + PEDESTAL_H;
  const base = lathe(mat.ink, [[0.0001, 0], [1.11 * R, 0], [1.11 * R, 0.2 * R], [0.93 * R, 0.2 * R], [0.93 * R, 0.4 * R], [0.0001, 0.4 * R]], 40);
  const cup = lathe(mat.red, [[0.67 * R, 0.4 * R], [0.66 * R, 0.56 * R], [0.54 * R, 0.72 * R], [0.34 * R, 0.84 * R], [0.0001, 0.84 * R]], 40);
  base.position.set(BALL.x, baseY, 0);
  cup.position.set(BALL.x, baseY, 0);
  // 球殼：只畫內側（背面），球心的畫面才不會被前半球擋住；輪廓是一圈白色的邊緣光
  const shell = new Mesh(new SphereGeometry(R, 48, 32), new ShaderMaterial({
    side: BackSide,
    uniforms: { uRim: { value: new Color(WHITE) } },
    vertexShader: "varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform vec3 uRim; varying vec3 vN; varying vec3 vW;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
        gl_FragColor = vec4(uRim * step(facing, 0.2), 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  shell.position.copy(BALL);
  // 永遠正對鏡頭的一層：球裡的紅色星芒（平面版畫好的圖）和四周的光芒
  const halo = new Group();
  halo.position.copy(BALL);
  // 球裡三顆紅色的四芒星：立體的星形，在球裡前後錯開（位置和大小照封面）
  const ballRed = mat.flat(RED, false);
  const sparkles = new Group();
  for (const [x, y, z, r] of [[-0.06, 0.2, 0.3, 6 / 27], [0.38, -0.28, 0.12, 5 / 27], [-0.36, -0.5, 0.42, 3.4 / 27]]) {
    const star = makeSparkle(ballRed, r * R);
    star.position.set(x * R, y * R, z * R);
    sparkles.add(star);
  }
  sparkles.position.set(0.1 * R, 0.06 * R, 0);
  halo.add(sparkles);
  const rayMaterial = ballRed;
  const rays = RAYS.map(([degrees, inner, outer]) => {
    const angle = (degrees * Math.PI) / 180, length = ((outer - inner) / 27) * R;
    const pivot = new Group(); // 原點在光芒的內端，伸縮時往外長
    const bar = box(rayMaterial, length, 0.085 * R, 0.085 * R, length / 2, 0, 0); // 方的短棒
    bar.userData.noShadow = true;
    pivot.add(bar);
    pivot.position.set(Math.cos(angle) * (inner / 27) * R, Math.sin(angle) * (inner / 27) * R, 0);
    pivot.rotation.z = angle;
    halo.add(pivot);
    return pivot;
  });
  ball.add(base, cup, shell, halo);
  register(99, ball);
  scene.add(ball);

  // ---- #117 整體圓形構圖：球裡的畫面，就是下一章（圓頂端的領袖）此刻的樣子 ----
  const portal = chapterContext.portal("stage");
  const disc = makePortalDisc(portal, chapterContext.resolution);
  disc.position.copy(BALL);
  register(117, disc);
  scene.add(disc);

  // 球座與球的影子：引擎的陰影貼圖投在白色的圓台上（第四輪拿掉平面投影）

  // ---- 鏡頭：從觀星者背後繞到側面，沿望遠鏡的方向移到水晶球前；之後推進球裡（update 裡接手） ----
  const track = makeCameraTrack([
    { t: -0.3, pos: [-7.4, 2.2, 3.4], at: [-1.2, 2.5, -2.4], fov: 40 }, // 背後偏左，越過肩膀看星空
    { t: open[0], pos: [-6.4, 1.9, 4.6], at: [-1.6, 2.1, -1.6], fov: 40 },
    { t: open[1], pos: [-2.9, 1.25, 5.6], at: [-2.5, 1.3, 0], fov: 36 }, // 正側面：封面上的那個剪影
    { t: 0.47, pos: [0.4, 1.9, 5.4], at: [1.3, 1.9, 0], fov: 36 }, // 順著鏡筒的方向移向水晶球
    { t: cameraSettle, pos: [BALL.x - 0.25, BALL.y + 0.12, 3.9], at: [BALL.x, BALL.y - 0.05, 0], fov: 34 },
    { t: 1.3, pos: [BALL.x - 0.25, BALL.y + 0.12, 3.9], at: [BALL.x, BALL.y - 0.05, 0], fov: 34 },
  ]);
  const diveEnd = new Vector3(), projected = new Vector3();

  return {
    id: plan.id,
    portals: ["stage"],
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList([], [{ at: 0.14, cue: "chime" }, { at: 0.5, cue: "whisperCue" }, { at: 0.72, cue: "reverseSwell" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const shot = track(Math.min(p, cameraSettle));
      // 俯衝（0.62 起）：對準球心，推到球裡的畫面比螢幕的對角還大一點為止
      // 只有起步是緩的、結尾不減速：圓盤在 1.0 前一刻才蓋滿螢幕（蓋滿之後畫面就不再變了，太早蓋滿會像停住）
      const plunge = Math.pow(linearstep(p, dive[0], dive[1]), 1.7);
      const fov = widenFovForNarrowAspect(shot.fov, frame.aspect);
      const halfDiagonal = Math.tan((fov * Math.PI) / 360) * Math.hypot(1, frame.aspect);
      diveEnd.set(BALL.x, BALL.y, (DISC_R * 0.94) / halfDiagonal);
      // 距離照等比例縮短（每一段進度放大同樣的倍數），推進的速度感才平均
      const startDistance = shot.pos.distanceTo(BALL), endDistance = diveEnd.distanceTo(BALL);
      const distance = startDistance * Math.pow(endDistance / startDistance, plunge);
      shot.pos.lerp(diveEnd, plunge).sub(BALL).setLength(distance).add(BALL);
      shot.at.lerp(BALL, smooth(linearstep(p, dive[0], dive[0] + 0.12)));
      // 待機時的指標視差在俯衝前段淡出（原作 0.62→0.90）
      applyCameraShot(camera, shot, frame.aspect, frame.pointer, 0.04 * (1 - smooth(linearstep(p, dive[0], 0.9))));
      camera.updateMatrixWorld();

      // 星星：近處五顆正對鏡頭、各自閃爍；遠處的星點由 shader 閃
      starField.material.uniforms.uTime.value = frame.time;
      // 五顆大的正對鏡頭、左右微微擺動（看得到厚度），各自閃爍；小的慢慢自轉
      stars.children.forEach((star, i) => {
        star.quaternion.copy(camera.quaternion);
        star.rotateY(Math.sin(frame.time * 0.7 + i * 1.9) * 0.45);
        star.scale.setScalar(0.85 + 0.15 * Math.sin(frame.time * (1.1 + i * 0.37) + i * 2.1));
      });
      extraStars.children.forEach((star, i) => {
        star.rotation.y = frame.time * (0.4 + (i % 4) * 0.15) + i;
        star.scale.setScalar(0.7 + 0.3 * Math.sin(frame.time * (0.9 + (i % 5) * 0.3) + i * 1.3));
      });

      // 觀星者：胸口隨呼吸起伏，扶鏡筒的手跟著微微動；
      // 開書那一段（0.10–0.30）湊在目鏡上看，水晶球亮起時（0.24–0.36）抬起頭、看向右前方的球
      const breathe = Math.sin(frame.time * 1.2);
      joints.spine.rotation.x = STANCE.spine[0] + breathe * 0.012;
      joints.spine.rotation.z = Math.sin(frame.time * 0.5) * 0.008;
      for (const [name, rest] of armPose) joints[name].rotation.set(rest.x - (name.startsWith("elbow") ? breathe * 0.015 : 0), rest.y, rest.z);
      const lift = smooth(linearstep(p, 0.24, 0.36));
      joints.neck.rotation.x = 0.28 * (1 - lift) - 0.04 * lift;
      joints.head.rotation.set(0.12 * (1 - lift) - 0.1 * lift, 0.05 * Math.sin(frame.time * 0.4) * lift, 0);

      // 水晶球亮起（對應開書 0.10–0.30）：光芒伸長，之後輪流伸縮
      const glow = smooth(linearstep(p, open[0], open[1]));
      halo.quaternion.copy(camera.quaternion);
      rays.forEach((ray, i) => ray.scale.set(0.35 + 0.65 * glow * (0.8 + 0.2 * Math.sin(frame.time * 2.2 + i * 0.9)), 1, 1));

      // 球裡的星芒收掉、下一章的畫面從球心張開（對應翻到第三頁，0.47–0.64）
      const reveal = smooth(linearstep(p, 0.47, pages[1]));
      sparkles.scale.setScalar(Math.max(0.0001, 1 - reveal * 1.6));
      sparkles.rotation.z = reveal * 1.2;
      sparkles.children.forEach((star, i) => (star.rotation.y = Math.sin(frame.time * 0.9 + i * 2.2) * 0.6));
      const uniforms = disc.material.uniforms;
      disc.quaternion.copy(camera.quaternion);
      uniforms.uHasPortal.value = portal.value ? 1 : 0;
      uniforms.uReveal.value = reveal;
      uniforms.uBulge.value = 1 - smooth(linearstep(p, dive[0], 0.92));
      projected.copy(BALL).project(camera);
      uniforms.uCenter.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);
      // 直式螢幕上球裡的畫面上下比較高，紅色的球托會擋到畫面的下緣：俯衝後段把球托壓低一點，讓出位置
      cup.scale.y = 1 - 0.32 * smooth(linearstep(p, 0.8, 0.97));

    },
  };
}
