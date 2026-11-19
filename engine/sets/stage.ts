// stage 的 3D 場景：閱兵台（PRD-3D 6.2）。
// 一座黑色的山丘：頂上是高台，六位領袖站在台上、背後是空的白色天空，九支旗插在兩側較低的台階上；
// 山坡往鏡頭這一側降下去，半山腰的平台上是握手的兩人和通訊塔。
// 節奏範本 city：整章一個連續的長鏡頭（move 0–1）。第三輪起路徑參數改用比 cityEase 溫和的緩動（見鏡頭那一段）。
//   0 正面平視六人（序章的水晶球裡看到的就是這一格）→ 升高，看到九支旗和落在白色台面上的影子
//   → 繞到高台右後方，越過台緣和旗子往下看：山坡一路降到握手的兩人和通訊塔（0.4 前後，高度感在這裡）
//   → 沿右側山坡降下去，從通訊塔旁邊掠過 → 停在握手的兩人和塔前。握手在 0.38–0.50 靠攏，電波 0.60 起往外送。
// 第二輪：領袖拆成頭、軀幹、兩臂四片有厚度的紙板；旗布是車床做的布捲與有褶的布；台面是白的，人和旗的影子落在上面；
// 黑色的平台上用白色光圈交代握手的人和塔的落點；白色的霧讓山腳的松樹淡進背景。
import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, Group, Mesh, PerspectiveCamera, PlaneGeometry,
  RingGeometry, Scene, ShaderMaterial, SphereGeometry, TorusGeometry, Vector3,
} from "three";
import { Snow, clamp, deviceTier, envelope, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cone, cylinder, extrude, lathe, makePalette, sphere } from "../shared/set/model";
import { bakeFigure, inkOutline, makeFigure, walkCycle } from "../shared/set/figure";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：高台上的風和低鳴，旗子在風裡啪啪地響；兩人握手成交時驚悚的一記（0.47）；通訊塔送出電波時收訊不良的靜電與無線電（0.6），電波裡夾著一句耳語（0.8）。
const soundScript = soundTrack([[0, { wind: 0.25, dread: 0.18, choir: 0.08 }], [0.45, { wind: 0.2, dread: 0.22 }], [0.6, { wind: 0.15, dread: 0.22, static: 0.22 }]]);

const S = 0.02; // 封面 1 像素 = 0.02 單位（人物是封面的 2 倍大）
const TOP = 7.5; // 高台頂面（領袖的腳底）
const LEDGE = TOP - 0.34; // 兩側插旗的那一階
const CREST = TOP - 0.6; // 山丘頂的高度
const SHELF = 1.0; // 半山腰平台的高度
const BASE = -5; // 山腳下白色的地面
const FOG: [number, number] = [12, 52]; // 白色的霧：近處不受影響，山腳和遠處的松樹淡進天空
const px = (x) => (x - 559) * S; // 封面的 x → 世界的 x（封面的垂直軸 x = 559 是世界的 x = 0）

// 捲旗 7 支、紅旗 2 面：[旗桿在封面上的 x, 旗桿頂的 y]（和平面版同一組數字），旗桿底在 y = 461
const FURLED = [[378, 418], [396, 408], [414, 402], [453, 392], [668, 392], [699, 402], [717, 408]];
const UNFURLED = [[433, 397], [683, 397]];
const POLE_BASE_PY = 461;
// 六位領袖在封面上的量法（和平面版同一組數字）：中心 x、肩的 y、半肩寬、臀的 y、軀幹那一片的半寬
const LEADERS = [
  { cx: 482.5, shoulderY: 398, halfWidth: 12.5, hipY: 430 },
  { cx: 511.5, shoulderY: 396, halfWidth: 12.5, hipY: 428 },
  { cx: 544, shoulderY: 392, halfWidth: 14.5, hipY: 428 },
  { cx: 575, shoulderY: 394, halfWidth: 14, hipY: 428 },
  { cx: 605, shoulderY: 396.5, halfWidth: 12.5, hipY: 423, torsoHalf: 10 }, // 白色長衫的下襬比軀幹寬
  { cx: 636, shoulderY: 401, halfWidth: 12, hipY: 439 },
];

const TOWER = { x: 0.75, z: 8.5, height: 2.9, halfBase: 0.56 };
const PAIR = { x: -1.0, z: 9.7 }; // 和塔靠近一點，直式螢幕的最後一格才兩樣都看得到

const smooth01 = (t) => smooth(clamp(t, 0, 1));

/**
 * 繞注視點內插的鏡頭軌道（第三輪：鏡頭要順）。關鍵格的寫法和 makeCameraTrack 一樣（pos / at / fov / roll），
 * 但鏡頭位置不是直接內插 xyz，而是內插「注視點」加上「從注視點看鏡頭的方位角、仰角、距離（取對數）」。
 * 這樣兩格之間鏡頭是繞著主體轉、距離單調地變，不會因為 pos 和 at 各走各的直線，在半路忽然靠近又退開。
 */
function makeOrbitTrack(keys) {
  let lastAz = null;
  const orbit = makeCameraTrack(keys.map((key) => {
    const dx = key.pos[0] - key.at[0], dy = key.pos[1] - key.at[1], dz = key.pos[2] - key.at[2];
    const d = Math.hypot(dx, dy, dz);
    let az = Math.atan2(dx, dz);
    if (lastAz !== null) az += 2 * Math.PI * Math.round((lastAz - az) / (2 * Math.PI)); // 方位角取最近的那一圈，不繞遠路
    lastAz = az;
    const angles = [az, Math.asin(dy / d), Math.log(d)];
    return { t: key.t, pos: angles, at: [angles[0], angles[1], angles[2] - 1], fov: 0 }; // at 只是讓共用層量到的距離固定為 1
  }));
  const target = makeCameraTrack(keys.map((key) => ({ t: key.t, pos: key.at, at: [key.at[0], key.at[1], key.at[2] - 1], fov: key.fov, roll: key.roll })));
  const pos = new Vector3(), at = new Vector3();
  return (time) => {
    const [az, el, logDistance] = orbit(time).pos.toArray();
    const aim = target(time);
    const d = Math.exp(logDistance);
    at.copy(aim.pos);
    pos.set(at.x + d * Math.sin(az) * Math.cos(el), at.y + d * Math.sin(el), at.z + d * Math.cos(az) * Math.cos(el));
    return { pos, at, fov: aim.fov, roll: aim.roll };
  };
}
/** 山丘的高度：頂上一小塊平地，背面很快降下去（領袖背後才是天空），正面是鼓起來的斜坡，半山腰一塊平台 */
function hillHeight(x, z) {
  let y;
  if (z < -1.3) y = CREST + (BASE - CREST) * smooth01((-z - 1.3) / 5);
  else if (z <= 1.3) y = CREST;
  else if (z <= 8) y = SHELF + (CREST - SHELF) * (1 - Math.pow((z - 1.3) / 6.7, 1.3)); // 斜坡只微微鼓起：從高台後面越過台緣看得到半山腰的平台
  else if (z <= 11.5) y = SHELF - (0.25 * (z - 8)) / 3.5;
  else y = SHELF - 0.25 + (BASE - SHELF + 0.25) * smooth01((z - 11.5) / 4.5);
  return BASE + (y - BASE) * (1 - smooth01((Math.abs(x) - 6.5) / 9));
}

function makeHill() {
  const geometry = new PlaneGeometry(44, 30, 110, 90);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, 5);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) position.setY(i, hillHeight(position.getX(i), position.getZ(i)));
  // 黑色的山體上一圈圈白色的短線（等高線）：看得出坡面的起伏，也讓鏡頭下降時有東西掠過
  const material = new ShaderMaterial({
    uniforms: { uInk: { value: new Color(BLACK) }, uLine: { value: new Color(WHITE) }, uFog: { value: new Vector3(FOG[0], FOG[1], 0) } },
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform vec3 uInk, uLine, uFog; varying vec3 vW;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main() {
        float row = vW.y / 0.62;
        float id = floor(row), f = fract(row);
        float x = vW.x * 0.55 + hash(id) * 9.0;
        float len = 0.12 + hash(floor(x) + id * 7.0) * 0.3;
        float dash = step(fract(x), len) * step(0.45, hash(floor(x) * 1.7 + id));
        float d = distance(vW, cameraPosition);
        // 只畫在正面的斜坡上；頂上的平地、平台和背面保持全黑
        float slope = step(1.6, vW.z) * step(vW.z, 7.6);
        float line = step(abs(f - 0.5), 0.012 + d * 0.0012) * dash * slope;
        // 半山腰的平台：一排排往遠處退的短線，看得出人和塔站在一塊平地上
        float shelfRow = vW.z / 0.55;
        float sx = vW.x * 0.8 + hash(floor(shelfRow) + 31.0) * 9.0;
        float shelfDash = step(fract(sx), 0.18 + hash(floor(sx) + floor(shelfRow) * 5.0) * 0.3) * step(0.4, hash(floor(sx) * 2.3 + floor(shelfRow)));
        line += step(abs(fract(shelfRow) - 0.5), 0.02 + d * 0.002) * shelfDash * step(8.3, vW.z) * step(vW.z, 11.3);
        vec3 col = mix(uInk, uLine, line);
        col = mix(col, uLine, smoothstep(uFog.x, uFog.y, d)); // 霧：遠處的山腳淡進白色的天
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new Mesh(geometry, material);
}

/** 三次貝茲曲線上的一點 */
const bezier = (a, b, c, d, t) => a * (1 - t) ** 3 + 3 * b * t * (1 - t) ** 2 + 3 * c * t * t * (1 - t) + d * t ** 3;
/**
 * 旗布的半寬（封面像素）隨高度的變化，和平面版 drawFurledFlag / drawHangingFlag 同一組曲線：
 * 從桿頂往下越來越寬，最寬處在 80% 高，底下收成一個尖。回傳 [半寬, 從布頂往下的距離] 的一串點。
 */
function clothProfile(height, [c1, c2, widest], tail) {
  const points = [];
  for (let i = 0; i <= 8; i++) points.push([bezier(0, c1, c2, widest, i / 8), bezier(0, height * 0.3, height * 0.6, height * 0.8, i / 8)]);
  for (let i = 1; i <= 6; i++) points.push([bezier(widest, widest - 0.5, 2, 0, i / 6), bezier(height * 0.8, height * 0.95, height, height + tail, i / 6)]);
  return points;
}

/** 四芒星的輪廓（封面上星星的畫法：四個尖角之間往中心凹進去） */
function sparkleOutline(r, waist = 0.14) {
  const points = [];
  for (let quarter = 0; quarter < 4; quarter++) {
    const a = (quarter * Math.PI) / 2, b = a + Math.PI / 2, c = a + Math.PI / 4;
    for (let i = 0; i < 6; i++) {
      const t = i / 6, k0 = (1 - t) * (1 - t), k1 = 2 * t * (1 - t), k2 = t * t;
      points.push([
        r * (k0 * Math.cos(a) + k1 * waist * Math.cos(c) + k2 * Math.cos(b)),
        r * (k0 * Math.sin(a) + k1 * waist * Math.sin(c) + k2 * Math.sin(b)),
      ]);
    }
  }
  return points;
}

/** 兩點之間的一根細桿 */
function strut(material, from, to, radius, segments = 6) {
  const a = new Vector3(...from), b = new Vector3(...to);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, a.distanceTo(b), segments), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

/** 通訊塔的格架：四根斜柱、每一層四根橫樑和四面的交叉斜撐，頂端兩層平台和天線。尺寸照封面（塔高 82 像素、天線 9 像素）。 */
function makeLattice(material, height, halfBase) {
  const tower = new Group();
  const k = height / 82; // 封面像素 → 單位
  const half = (y) => 2.2 * k + ((height - y) / height) * (halfBase - 2.2 * k);
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const at = (corner, y) => [corner[0] * half(y), y, corner[1] * half(y)];
  const top = height - 3 * k;
  for (const corner of corners) tower.add(strut(material, at(corner, 0), at(corner, top), 0.024));
  const levels = [7, 17, 29, 44, 62, 82].map((offset) => height - offset * k);
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = levels[i], y1 = levels[i + 1];
    corners.forEach((corner, j) => {
      const next = corners[(j + 1) % 4];
      if (i < levels.length - 2) tower.add(strut(material, at(corner, y1), at(next, y1), 0.016));
      tower.add(strut(material, at(corner, y0), at(next, y1), 0.014), strut(material, at(next, y0), at(corner, y1), 0.014));
    });
  }
  // 頂端的兩層平台與天線
  tower.add(
    box(material, 10 * k, 0.03, 10 * k, 0, top, 0),
    box(material, 8 * k, 0.03, 8 * k, 0, height - 7 * k, 0),
    strut(material, [0, height - 6 * k, 0], [0, height + 9 * k, 0], 0.02),
    sphere(material, 0.035, 0, height + 9 * k, 0, 8, 6),
  );
  return tower;
}

/**
 * 領袖身上 makeFigure 沒有的部分：往前梳的大片頭髮（#3）、鬍子（#4、#5）、背心（#5）。
 * 這些是加在關節上的 mesh，自己補一圈墨線（makeFigure 的墨線只包它自己建的部分）。
 */
function dressLeader(person, look, mat, build) {
  const joints = person.userData.joints;
  const added = [];
  if (look.swoop) {
    const swoop = new Mesh(new SphereGeometry(0.11, 18, 10), look.hairMaterial);
    swoop.scale.set(1.12, 0.42, 1.05);
    swoop.position.set(0.012, 0.215, 0.03);
    swoop.rotation.z = -0.12;
    joints.head.add(swoop);
    added.push(swoop);
  }
  if (look.beard) {
    const beard = new Mesh(new SphereGeometry(0.075, 16, 10), look.beard);
    beard.scale.set(1, 0.85, 0.72);
    beard.position.set(0, 0.035, 0.06);
    joints.head.add(beard);
    added.push(beard);
  }
  if (look.vest) {
    const torso = joints.spine.children.find((child) => child.isMesh && child.geometry.type === "LatheGeometry");
    const vest = new Mesh(torso.geometry, look.vest);
    vest.scale.set(1.05, 0.94, torso.scale.z * 1.08);
    vest.position.y = 0.012;
    joints.spine.add(vest);
    added.push(vest);
  }
  const s = person.children[0].scale.x;
  for (const mesh of added) inkOutline(mesh, { width: 0.011 / s });
}

/**
 * 兩節手臂的解算：調整肩膀（x、y、z）與手肘（x）的角度，讓 makeFigure 的手掌落在世界座標 target 上。
 * 座標下降法慢慢逼近（只在建場景時算一次）。
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

export default function createStageSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.05, 500);
  const { entries, register } = createRegistry(plan.id);
  // 光從後上方來：人和旗的影子往前落在台面上，鏡頭升高時看得到
  const mat = makePalette([-0.2, 1, -0.4]);
  const front = makePalette([-0.55, 0.5, 0.65]); // 紅旗的布另外用正面來的光，褶子的亮暗面才分得開
  const ink = mat.custom("#101010", BLACK, 0); // 沒有邊緣光的黑：平的面在斜看時才不會整片翻白
  const white = mat.flat(WHITE);
  addFog(scene, mat, WHITE, ...FOG);
  front.setFog({ color: WHITE, near: FOG[0], far: FOG[1] });

  // ---- 環境：山腳下白色的地面、黑色的山丘、山腳和遠處的松樹（封面上塔腳邊就有三棵） ----
  scene.add(ground(WHITE, 600, BASE + 0.02), makeHill());
  const pines = new Group();
  const pineSpots = [
    [-5.6, 11.8, 2.2], [-4.6, 12.3, 1.5], [4.9, 11.9, 2.4], [6.0, 12.2, 1.6], [3.9, 12.4, 1.2],
    [-9, 17.5, 2.6], [-6.5, 19, 1.8], [-2.2, 18.2, 2.2], [2.6, 19.5, 2.8], [7.5, 17.8, 2.0], [11, 20, 2.6], [-12.5, 22, 3.0],
    [-4, 26, 2.4], [5, 27, 3.0], [13, 29, 2.6], [-15, 31, 3.2], [0.5, 33, 2.8], [-9, 36, 3.4], [9, 38, 3.0], [19, 34, 3.0], [-21, 40, 3.4],
  ];
  for (const [x, z, h] of pineSpots) {
    const y = hillHeight(x, z) - 0.1;
    const pine = new Group();
    pine.add(cylinder(ink, 0.05, 0.05, h * 0.25, 0, 0, 0, 6));
    for (let i = 0; i < 4; i++) pine.add(cone(ink, h * (0.3 - i * 0.055), h * 0.38, 0, h * (0.16 + i * 0.17), 0, 7));
    pine.position.set(x, y, z);
    pines.add(pine);
  }
  scene.add(pines);

  // ---- #7 高台：中央一塊高的，兩側各一階低的（插旗），正面三級台階。側面全黑；每一階的頂面鋪白，留一圈黑邊 ----
  // 白色的頂面讓黑西裝和黑色的布捲從高處看也分得出來，影子也有地方落
  const podium = new Group();
  const slab = (w, h, d, x, topY, z) => {
    podium.add(box(ink, w, h, d, x, topY - h / 2, z));
    podium.add(box(white, w - 0.07, 0.01, d - 0.07, x, topY + 0.005, z));
  };
  slab(4.3, TOP - CREST + 0.4, 1.3, 0, TOP, 0); // 領袖站的台面
  slab(8.3, LEDGE - CREST + 0.4, 1.7, 0, LEDGE, 0.1);
  [0.17, 0.34, 0.51].forEach((drop, i) => slab(4.3 + i * 0.5, TOP - drop - CREST + 0.6, 0.28 + 0.035, 0, TOP - drop, 0.65 + 0.14 + i * 0.28));
  register(7, podium);
  scene.add(podium);

  // ---- #1–6 領袖：第四輪改成立體人物（makeFigure），照封面上每個人的剪影與配色重做 ----
  // 身高從封面量（頭頂到腳底 455，1 像素 = S），肩寬照封面的半肩寬換成 build。每人的身體烘成少數幾個 mesh（六個人不烘會有五百個 draw call），
  // 頭另外烘一份，才能轉頭：鏡頭升高、繞到台後時，六個人的頭會極慢地跟著鏡頭轉（陰森版的「被注視」）。
  const LOOKS = [
    { headTop: 383, hair: "long", hairMaterial: mat.darkRed, tie: null }, // #1 紅髮女性：紅色長髮（暗紅，和紅臉分得開）、黑色套裝
    { headTop: 384, hair: "bald", tie: ink }, // #2 光頭：白襯衫、黑領帶
    { headTop: 378, hair: "short", hairMaterial: mat.red, tie: mat.red, build: 1.3, swoop: true }, // #3 橘黃頭髮：往前梳的大片頭髮、紅領帶，最寬
    { headTop: 381, hair: "short", tie: mat.red, beard: ink }, // #4 黑髮、黑鬍子、紅領帶
    { headTop: 382, hair: "short", hairMaterial: front.paper, beard: front.paper, suit: mat.red, pants: mat.red, shirt: null, vest: ink, coat: front.paper }, // #5 白髮白鬍、紅袖、黑背心、白長衫、紅褲
    { headTop: 386, hair: "curly", shirt: null, coat: true }, // #6 黑捲髮女性：黑色長外衣
  ];
  const leaders = LOOKS.map((look, i) => {
    const { cx, halfWidth } = LEADERS[i];
    const height = (455 - look.headTop) * S;
    const scale = height / 1.75;
    const build = look.build ?? clamp((halfWidth * S) / (0.262 * scale), 1, 1.3);
    // 白色的部分（襯衫領口、#5 的白髮白鬍與長衫）用正面來的光：這一章的主光從背後來，白色的面朝鏡頭時會整片落在暗面
    // 方肩（精修）：封面上六個人都是西裝墊肩的平肩線，包括 #1、#6 的套裝、#5 背心下的紅袖
    const person = makeFigure(mat, { suit: ink, shirt: front.paper, skin: mat.red, shoulders: "square", ...look, build, height });
    const joints = person.userData.joints;
    dressLeader(person, look, mat, build);
    person.userData.pose({ armL: [0, 0, 0.05 + i * 0.006], armR: [0, 0, -0.05 - i * 0.006], elbowL: -0.08, elbowR: -0.08 });
    // 頭和身體分開烘：頭留一個可以轉的關節
    person.updateMatrixWorld(true);
    const headAt = joints.head.getWorldPosition(new Vector3());
    joints.neck.remove(joints.head);
    const headHolder = new Group();
    headHolder.add(joints.head);
    joints.head.position.set(0, 0, 0);
    const head = bakeFigure(headHolder);
    head.scale.setScalar(scale);
    head.position.copy(headAt);
    const body = bakeFigure(person);
    // 正面受光的白色部分不接收陰影貼圖：主光從背後來，朝鏡頭的面在陰影貼圖裡永遠是「被自己擋住」的，會整片變黑
    for (const part of [...body.children, ...head.children]) {
      if (front.all.includes((part as Mesh).material)) {
        part.userData.shadowSet = true; // 引擎看到這個旗標就不再改它的投影設定
        part.castShadow = true;
        part.receiveShadow = false;
      }
    }
    const leader = new Group();
    leader.add(body, head);
    leader.userData.head = head;
    leader.position.set(px(cx), TOP, -0.15 + (i % 2) * 0.06);
    scene.add(leader);
    return leader;
  });
  register(1, leaders[0]);
  register(2, leaders[1]);
  register(3, leaders[2]);
  register(4, leaders[3]);
  register(5, leaders[4]);
  register(6, leaders[5]);

  // ---- #8 捲旗 ×7、#9 紅旗 ×2：旗桿是圓柱加桿頂的球；布是真的體積 ----
  // 捲旗：車床做的布捲（上窄下寬、底下收尖），外面繞一道細白線當布邊；紅旗：垂著的布，橫切面是有褶的，亮暗面就是封面上那兩道布褶
  const makeFlag = ([x, topPy]: number[], index, red) => {
    const flag = new Group();
    const height = (POLE_BASE_PY - topPy) * S;
    flag.add(cylinder(ink, 0.02, 0.02, height, 0, 0, 0, 8), sphere(ink, 0.045, 0, height, 0, 10, 8));
    const clothHeight = POLE_BASE_PY - (red ? 8 : 9) - topPy; // 封面像素
    const profile = red ? clothProfile(clothHeight, [4, 10.5, 9.5], 3) : clothProfile(clothHeight, [2.5, 8.5, 8], 1.5);
    const cloth = new Group(); // 原點在布頂（桿頂下面 2 像素）
    if (red) {
      // 有褶的布：一圈圈由上往下，半徑隨角度起伏（三道褶），前後壓扁成垂著的布；下襬的尖角偏一邊
      const rings = profile.length, around = 36, positions = [], indices = [];
      profile.forEach(([radius, down], ring) => {
        const v = ring / (rings - 1);
        for (let j = 0; j <= around; j++) {
          const angle = (j / around) * Math.PI * 2;
          const fold = 1 + 0.3 * Math.cos(3 * angle + 0.9 + v * 1.6) + 0.08 * Math.cos(7 * angle + v * 5);
          const r = radius * fold * S;
          positions.push(Math.cos(angle) * r + v * v * 1.5 * S, -down * S - Math.max(0, v - 0.6) * Math.cos(2 * angle + 1) * 3 * S, Math.sin(angle) * r * 0.62);
        }
      });
      for (let ring = 0; ring < rings - 1; ring++) {
        for (let j = 0; j < around; j++) {
          const a = ring * (around + 1) + j, b = a + around + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1); // 逆時針朝外，法線才指向布的外側
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      cloth.add(new Mesh(geometry, front.red));
    } else {
      const roll = lathe(ink, profile.map(([radius, down]) => [radius * S, -down * S]).reverse(), 14);
      roll.scale.z = 0.8;
      cloth.add(roll);
      // 布邊：沿著布捲繞一圈半的細白線
      const turns = 1.5, steps = 40;
      const at = (t) => {
        const f = (0.12 + t * 0.8) * (profile.length - 1), n = Math.min(profile.length - 2, Math.floor(f)), mix = f - n;
        const radius = (profile[n][0] + (profile[n + 1][0] - profile[n][0]) * mix) * S + 0.004;
        const down = profile[n][1] + (profile[n + 1][1] - profile[n][1]) * mix;
        const angle = t * turns * Math.PI * 2 + index;
        return [Math.cos(angle) * radius, -down * S, Math.sin(angle) * radius * 0.8];
      };
      for (let k = 0; k < steps; k++) {
        const seam = strut(white, at(k / steps), at((k + 1) / steps), 0.006, 4);
        seam.userData.noShadow = true;
        cloth.add(seam);
      }
    }
    cloth.position.y = height - 2 * S;
    flag.add(cloth);
    flag.userData.cloth = cloth;
    flag.position.set(px(x), LEDGE, 0.25 - (index % 2) * 0.5);
    flag.rotation.y = (x < 559 ? 1 : -1) * 0.22; // 稍微朝向中央
    return flag;
  };
  const furled = new Group(), redFlags = new Group();
  FURLED.forEach((spot, i) => furled.add(makeFlag(spot, i, false)));
  UNFURLED.forEach((spot, i) => redFlags.add(makeFlag(spot, i + 1, true)));
  register(8, furled, { count: 7 });
  register(9, redFlags, { count: 2 });
  scene.add(furled, redFlags);

  // 影子：第四輪拿掉平面投影，改用引擎的陰影貼圖（領袖落在白色台面上，旗子落在兩側那一階上）

  // ---- #10 握手的兩人：第四輪改成立體人物。紅色西裝、紅臉，黑色的翻領線；從兩側走過來（走路的關節動畫），伸出右手握上 ----
  const handshake = new Group();
  const MAN_H = 77 * S; // 封面上頭頂 476 到腳底 553
  const makeMan = () => {
    const man = makeFigure(mat, { suit: mat.red, pants: mat.red, skin: mat.red, shirt: null, tie: ink, hair: "short", hairMaterial: mat.darkRed, build: 1.08, height: MAN_H });
    const j = man.userData.joints;
    // 西裝的翻領、口袋、褲管的摺線：細細的黑線，紅色的面上才有東西讓排線落上去（封面上紅色人形就是這幾道黑線）
    const line = ink;
    for (const side of [1, -1]) {
      const lapel = box(line, 0.014, 0.26, 0.014, side * 0.06, 0.38, 0.112 * 1.08);
      lapel.rotation.z = side * 0.36;
      j.spine.add(lapel, box(line, 0.08, 0.012, 0.014, side * 0.1, 0.12, 0.105));
    }
    j.spine.add(box(line, 0.012, 0.3, 0.014, 0.02, 0.12, 0.112)); // 前襟
    for (const knee of [j.kneeL, j.kneeR]) knee.add(box(line, 0.01, 0.36, 0.01, 0, -0.22, 0.062)); // 褲管的摺線
    return man;
  };
  const leftMan = makeMan(), rightMan = makeMan();
  const TURN = 0.4; // 兩人都朝鏡頭側一點（封面上是斜側面）
  leftMan.rotation.y = Math.PI / 2 - TURN;
  rightMan.rotation.y = -Math.PI / 2 + TURN;
  handshake.add(leftMan, rightMan);
  handshake.position.set(PAIR.x, hillHeight(PAIR.x, PAIR.z) - 0.02, PAIR.z);
  handshake.rotation.y = 0.09; // 正對最後一格的鏡頭
  // 握手的姿勢：兩人站到握手的位置，用手臂解算把右手放到兩人中間；之後每一幀在垂手和握手之間內插
  const MEET_GAP = 0.27, FAR_GAP = 0.27 + 0.42;
  const restArms = { shoulderL: [0, 0, 0.08], shoulderR: [0, 0, -0.08], elbowL: [-0.12, 0, 0], elbowR: [-0.12, 0, 0] };
  const shakePose = [leftMan, rightMan].map((man, i) => {
    man.position.set(i ? MEET_GAP : -MEET_GAP, 0, i ? -0.04 : 0.04);
    return man;
  });
  scene.add(handshake);
  scene.updateMatrixWorld(true);
  const grip = handshake.localToWorld(new Vector3(0, MAN_H * 0.5, 0.02));
  const reachPoses = shakePose.map((man) => {
    reachTo(man, "R", grip);
    const j = man.userData.joints;
    const pose = { shoulderR: j.shoulderR.rotation.toArray().slice(0, 3), elbowR: j.elbowR.rotation.toArray().slice(0, 3) };
    j.shoulderR.rotation.set(...restArms.shoulderR);
    j.elbowR.rotation.set(...restArms.elbowR);
    return pose;
  });
  register(10, handshake);

  // ---- #11 通訊塔：真的格架；電波是塔頂兩側一道道發亮的圓弧 ----
  const tower = new Group();
  tower.add(makeLattice(white, TOWER.height, TOWER.halfBase));
  const k = TOWER.height / 82;
  const waves = [0, 1, 2].map((i) => {
    const radius = (10 + i * 8) * k, spread = 0.62 - i * 0.04;
    const ring = new Group();
    for (const start of [-spread, Math.PI - spread]) {
      const arc = new Mesh(new TorusGeometry(radius, 0.026, 6, 20, spread * 2), white);
      arc.rotation.z = start;
      ring.add(arc);
    }
    ring.position.y = TOWER.height - 9 * k;
    tower.add(ring);
    return ring;
  });
  tower.position.set(TOWER.x, hillHeight(TOWER.x, TOWER.z + TOWER.halfBase) - 0.04, TOWER.z);
  tower.rotation.y = 0.3; // 轉一點，看得到四面的格架前後交錯
  register(11, tower);
  scene.add(tower);

  // 黑色的平台上看不到影子：改用地上的白色光圈交代握手的人和塔站在哪裡
  const pools = new Group();
  for (const [x, z, r] of [[TOWER.x, TOWER.z, 1.05], [PAIR.x, PAIR.z, 0.78]]) {
    for (const [radius, width] of [[r, 0.035], [r * 0.72, 0.014]]) {
      const ring = new Mesh(new RingGeometry(radius - width, radius, 56), white);
      ring.rotation.x = -Math.PI / 2 + 0.25 / 3.5; // 平台往外微微傾斜
      ring.position.set(x, hillHeight(x, z) + 0.02, z);
      pools.add(ring);
    }
  }
  scene.add(pools);

  // ---- 封面上黑色山丘裡的幾顆四芒星：立體的小星星，浮在坡面前，慢慢轉、各自閃爍 ----
  const sparkles = new Group();
  for (const [x, z, r, lift] of [[-3.4, 3.2, 0.2, 0.7], [-2.2, 5.4, 0.13, 0.6], [-4.3, 6.6, 0.1, 0.8], [3.3, 4.3, 0.16, 0.8], [2.4, 6.6, 0.1, 0.5], [4.4, 7.4, 0.13, 0.9], [-0.6, 4.6, 0.09, 0.6], [-3.0, 9.4, 0.11, 1.5], [3.2, 10.2, 0.09, 1.9]]) {
    const star = new Group();
    const blade = extrude(white, sparkleOutline(r), r * 0.16);
    const cross = blade.clone();
    cross.rotation.y = Math.PI / 2;
    star.add(blade, cross);
    star.position.set(x, hillHeight(x, z) + lift, z);
    sparkles.add(star);
  }
  scene.add(sparkles);

  // ---- 空氣：山坡前緩緩飄過的白色光點，只有在黑色的山前看得見 ----
  const motes = new Snow({ count: Math.round(120 * deviceTier.particleScale), box: new Vector3(20, 9, 7), center: new Vector3(0, 4.2, 8.5), size: 46, speed: 0.1, wind: 0.22, color: WHITE });
  scene.add(motes);

  // ---- 鏡頭：一個連續的長鏡頭 ----
  // 第三輪（鏡頭要順）：整章只有「先拉遠、再推近」一次方向改變。
  //   0 → 0.40 一路升高、往右繞、往後退：六人 → 越過右側的旗 → 到高台右後方俯看整面山坡（最遠）；
  //   0.40 → 1 一路沿右側山坡降下、推近：通訊塔 → 握手的兩人。
  // 繞過旗子那一格不再貼近旗布（舊版先推近再退遠），改成保持距離橫移，旗子在前景掠過。
  // 路徑參數改用比 cityEase 溫和的緩動（中段速度 1.3 倍、首尾 0.4 倍），舊的 cityEase 中段 2.7 倍，
  // 三個關鍵格擠在 0.33–0.42 之間，鏡頭在那裡一瞬間甩過去。
  const eye = TOP + 0.8;
  const pathEase = (t) => 0.6 * smooth(t) + 0.4 * t;
  const track = makeOrbitTrack([
    { t: 0, pos: [0, eye, 7.0], at: [0, eye - 0.04, 0], fov: 30 }, // 正面平視六人（和序章最後一格相同，不能改）
    { t: 0.11, pos: [1.1, TOP + 2.3, 8.3], at: [0.3, TOP + 0.5, 0], fov: 30 }, // 升高：九支旗、六人和台面上的影子
    { t: 0.24, pos: [9.0, TOP + 3.5, 3.2], at: [1.0, TOP + 0.1, 0.8], fov: 32 }, // 往右繞，越過右邊那排旗：布的體積和落在台階上的影子
    { t: 0.4, pos: [5.4, TOP + 5.0, -3.4], at: [2.1, 2.9, 8.6], fov: 36 }, // 到高台右後方，越過台緣和旗子往下看整面山坡（最遠的一格）
    { t: 0.62, pos: [6.6, 7.9, 10.6], at: [0.6, 2.8, 8.8], fov: 34 }, // 沿右側的山坡降下去（從塔的右前方看，握手的兩人不會被塔擋住）
    { t: 0.82, pos: [3.6, 4.0, 14.4], at: [0.1, 2.5, 8.8], fov: 32 }, // 從塔旁掠過
    { t: 1, pos: [-0.5, 3.3, 15.4], at: [-0.12, 2.25, 9], fov: 30 }, // 握手的兩人與通訊塔
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList([], [{ at: 0.04, cue: "flag" }, { at: 0.2, cue: "flag" }, { at: 0.47, cue: "stinger" }, { at: 0.6, cue: "radio" }, { at: 0.8, cue: "whisperCue" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, 0, 1);
      // 整章一個鏡頭；超過 1 的轉場期間繼續慢慢往前
      const shot = track(pathEase(p));
      const over = clamp(progress - 1, 0, 0.3);
      shot.pos.z -= over * 1.2;
      shot.pos.y -= over * 0.3;
      // 直式螢幕：前半段沿著視線往後退一點，六個人（和越過台緣那一格的塔）才不會被左右切掉
      const back = (Math.pow(clamp(1.25 / frame.aspect, 1, 2.6), 0.4) - 1) * (1 - 0.65 * smooth(linearstep(p, 0.3, 0.42))) * (1 - smooth(linearstep(p, 0.5, 0.62)));
      shot.pos.sub(shot.at).multiplyScalar(1 + back).add(shot.at);
      applyCameraShot(camera, shot, frame.aspect, frame.pointer, 0.03 * (1 - p * 0.8));
      camera.updateMatrixWorld();

      // 領袖：立體的人不用轉身。頭極慢地跟著鏡頭轉（最多轉三成、限制在 ±0.35 弧度），身體隨呼吸微微起伏
      leaders.forEach((leader, i) => {
        const toCamera = Math.atan2(camera.position.x - leader.position.x, camera.position.z - leader.position.z);
        leader.userData.head.rotation.y = clamp(toCamera * 0.3, -0.35, 0.35);
        leader.scale.y = 1 + Math.sin(frame.time * 1.1 + i * 1.7) * 0.004;
      });

      // 紅旗的布輕輕擺動：整塊布繞著旗桿來回轉，褶子的亮暗跟著移動（捲旗不動）
      redFlags.children.forEach((flag, i) => {
        const sway = Math.sin(frame.time * 1.3 + i * 2);
        flag.userData.cloth.scale.x = 1 + sway * 0.05;
        flag.userData.cloth.rotation.y = sway * 0.3;
        flag.userData.cloth.rotation.z = Math.sin(frame.time * 0.9 + i) * 0.03;
      });

      // 握手：0.38–0.50 兩人從兩側走近（走路的關節動畫，步伐由走過的距離決定，倒著捲也對），
      // 最後幾步伸出右手（0.44–0.50），握住後上下晃幾下（0.50–0.64）
      const meet = smooth(linearstep(p, 0.38, 0.5));
      const gap = MEET_GAP + (FAR_GAP - MEET_GAP) * (1 - meet);
      const walked = (FAR_GAP - gap) / 0.16; // 走了幾步
      const stride = clamp(Math.sin(meet * Math.PI) * 1.8, 0, 1) * 0.7;
      const extend = smooth(linearstep(p, 0.44, 0.5));
      const shake = envelope(p, 0.5, 0.52, 0.6, 0.64) * Math.sin(frame.time * 9);
      [leftMan, rightMan].forEach((man, i) => {
        const j = man.userData.joints;
        walkCycle(man, walked * Math.PI + i * Math.PI, stride);
        // 站定時的呼吸與重心
        j.spine.rotation.x = 0.03 + Math.sin(frame.time * 1.2 + i) * 0.01;
        j.head.rotation.set(0.06, 0, 0);
        // 右手從垂著（或走路的擺動）內插到握手的姿勢
        const reach = reachPoses[i];
        const swingX = j.shoulderR.rotation.x;
        j.shoulderR.rotation.set(swingX * (1 - extend) + reach.shoulderR[0] * extend, reach.shoulderR[1] * extend, -0.08 * (1 - extend) + reach.shoulderR[2] * extend);
        j.elbowR.rotation.set(-0.12 * (1 - extend) + reach.elbowR[0] * extend + shake * 0.12, reach.elbowR[1] * extend, reach.elbowR[2] * extend);
        j.shoulderL.rotation.z = 0.08;
        man.position.set(i ? gap : -gap, 0, i ? -0.04 : 0.04);
      });

      // 電波：三道弧由內往外輪流脹大，鏡頭到塔前時（0.6 之後）最明顯
      const broadcasting = smooth(linearstep(p, 0.6, 0.72));
      waves.forEach((ring, i) => {
        const phase = (((frame.time * 0.9 - i * 0.22) % 1) + 1) % 1;
        const pulse = Math.max(0, 1 - Math.abs(phase - 0.3) * 3);
        ring.scale.setScalar(1 + pulse * (0.05 + 0.1 * broadcasting));
        ring.rotation.y = -tower.rotation.y + Math.atan2(camera.position.x - tower.position.x, camera.position.z - tower.position.z); // 圓弧正對鏡頭
      });
      sparkles.children.forEach((star, i) => {
        star.rotation.y = frame.time * (0.5 + (i % 3) * 0.2) + i;
        star.scale.setScalar(0.8 + 0.2 * Math.sin(frame.time * (1.3 + i * 0.31) + i * 1.7));
      });
      motes.update(frame.time);
    },
  };
}
