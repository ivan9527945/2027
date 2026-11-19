// queue 的 3D 場景：水晶球前（PRD-3D 6.14）。
// 一座山坡上的平台：十個人沿著平台的邊緣排成一列，走向隊伍盡頭舉著雙頭鷹旗的人；隊伍後方的台座上是水晶球。
// 這個平台其實是一個大圓盤的邊緣（下一章 floor 才看得出來），所以整個世界寫成 buildRimWorld()，
// floor 匯入同一個函式重建一模一樣的世界，硬切前後兩格才會相同。
//
// 節奏範本 corner 的對應：
//   pan    -0.20–0.30  鏡頭從隊尾沿著隊伍往前，在隊伍外側、比頭高一點的地方斜著看過去（人和人之間露得出白色的地面）；十個人一個接一個走到定位
//   whip    0.27–0.37  甩到隊伍盡頭，繞到旗手正面
//   settle  0.33–0.58  鏡頭在旗前停穩，原本拿在身側的旗被舉到肩上，在風裡飄
//   pushIn  0.56–0.72  退到平台外看整排人和水晶球（第三輪：0.45–0.65 慢慢退出去），再推近
//   detail  0.76–0.86  隊伍前端的特寫：旗手的腳、草叢小丘（第三輪：0.84 到位）
//   raise   0.84–0.95  鏡頭橫移、降到隊伍腳邊、平台的邊緣（第三輪：1.0 到位、慢下來）；下一章從這一格硬切，繼續往下降
import {
  BackSide, BufferGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry, Matrix4, Mesh, MeshBasicMaterial,
  PerspectiveCamera, PlaneGeometry, RingGeometry, Scene, SphereGeometry, TorusGeometry, Vector3,
} from "three";
import type { Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Snow, clamp, deviceTier, lerp, linearstep, seededRandom, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cone, cylinder, extrude, lathe, makePalette, sphere } from "../shared/set/model";
import { bakeFigure, inkOutline, makeFigure, walkCycle } from "../shared/set/figure";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：風、耳語和低鳴；隊伍走到定位（0.05）；轉向旗手時倒放的鈸（0.3）；旗子舉起（0.42）；看見水晶球時走音的風鈴（0.66）。
const soundScript = soundTrack([[0, { wind: 0.25, whisper: 0.12, dread: 0.15, crowd: 0.04 }], [1, { wind: 0.25, whisper: 0.1, dread: 0.2 }]]);

/** 主光方向（queue 和 floor 共用，兩邊的亮暗面才一致） */
export const LIGHT = [-0.5, 0.8, 0.6];
/** 圓盤底下那片地面的高度（難民營所在） */
export const GROUND_Y = -5;
/** 圓盤的半徑與厚度；圓心在 (0, 0, -DISC_R)，最靠近鏡頭的邊緣在 z = 0 */
export const DISC_R = 60;
export const DISC_THICK = 0.5;
/** 水晶球在平台上的位置；floor 把抱頭的人放在它的正下方 */
export const BALL = [0, -2.4];
/** 這一章的最後一格 = floor 的第一格：鏡頭在平台邊緣外、隊伍腳邊的高度 */
export const END_SHOT = { pos: [0.4, 0.2, 3.6], at: [0, 0.25, -1.0], fov: 36 };

/** 霧（白色，queue 和 floor 用同一組數字，硬切前後才一樣）：平台上的隊伍和底下的營地不受影響，遠處的草叢、土丘、圓盤的底面淡進白色 */
export const FOG: [number, number] = [18, 80];

const S = 3; // 紙偶放大倍率（封面 100 像素 = 3 單位）
const QUEUE_Z = -1.0;
const personX = (i) => -4.5 + i * 0.9; // 第 6 個人（i = 5）站在水晶球正前方
const BEARER_X = 5.0;
const MOUND = [6.4, -0.9];
const BEARER_YAW = -0.34; // 旗手的朝向：轉向隊伍與鏡頭這一側（封面上他面向左邊的旗）

/**
 * 直式螢幕的取景：水平視角不夠寬，把鏡頭沿水平方向往後拉（高度不變）。weight 是套用的程度；
 * 兩章相接的那一格（END_SHOT）兩邊都用 0，硬切才接得上。
 * atCut 是「離相接的那一格多近」（1 = 就是那一格）：直式螢幕上下看得很寬，那一格會從圓盤底下看到營地，
 * 而上一章沒有營地，所以兩邊都把視線抬高一點，讓營地留在畫面外，往下降的時候才進來。
 */
export function fitShot(shot, aspect, weight = 1, atCut = 0) {
  const narrow = clamp((1.25 - aspect) / 0.7);
  const back = 1 + 0.55 * narrow * weight;
  shot.pos.x = shot.at.x + (shot.pos.x - shot.at.x) * back;
  shot.pos.z = shot.at.z + (shot.pos.z - shot.at.z) * back;
  shot.at.y += 0.9 * narrow * atCut;
  return shot;
}

/** 黑衣人物的外框色：封面上隊伍裡的人靠一道細白線一個個隔開；在白色的平台上看不見，疊在別人身上時才出現 */
export const PAPER_LINE = "#f2efe6";

/**
 * 把一個立體人物烘成少數幾個 mesh，但保留 keep 列出的關節（連同它底下的部分）可以繼續動。
 * 保留的關節掛在一個「錨點」上，錨點的位置、轉向、大小等於它原本父關節在人物裡的位置，所以看起來一模一樣。
 * 回傳的 Group 的 userData.joints 只有保留下來的關節。queue 的旗手和 floor 的母親用它（只有手臂要動）。
 */
export function bakeKeeping(person, keep = []) {
  const joints = person.userData.joints;
  person.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(person.matrixWorld).invert();
  const kept = keep.map((name) => {
    const joint = joints[name];
    const matrix = new Matrix4().multiplyMatrices(inverse, joint.parent.matrixWorld);
    joint.parent.remove(joint);
    return { name, joint, matrix };
  });
  const baked = bakeFigure(person);
  for (const { joint, matrix } of kept) {
    const anchor = new Group();
    matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
    anchor.add(joint);
    baked.add(anchor);
  }
  baked.userData.joints = Object.fromEntries(kept.map(({ name, joint }) => [name, joint]));
  return baked;
}

/** 把一堆不會動的東西（草叢、石子、裂縫）同材質的合併成一個 mesh，省 draw call。 */
export function mergeStatic(group) {
  return bakeFigure(group);
}

/**
 * 地面的裂縫：沿著一條折線鋪一條平貼在地上、兩端收尖的細黑帶（XZ 平面，y = 0）。
 * points 是 [x, z]；回傳 BufferGeometry，之後合併成一個 mesh。
 */
export function crackGeometry(points, width) {
  const positions = [];
  const n = points.length;
  const side = points.map(([x, z], i) => {
    const [ax, az] = points[Math.max(0, i - 1)], [bx, bz] = points[Math.min(n - 1, i + 1)];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const w = width * Math.sin((Math.PI * (i + 0.5)) / n) * (0.6 + 0.4 * ((i * 7) % 3) / 2); // 中間寬、兩端尖
    return [x - (dz / len) * w, z + (dx / len) * w, x + (dz / len) * w, z - (dx / len) * w];
  });
  for (let i = 0; i < n - 1; i++) {
    const [l0x, l0z, r0x, r0z] = side[i], [l1x, l1z, r1x, r1z] = side[i + 1];
    positions.push(l0x, 0, l0z, r0x, 0, r0z, l1x, 0, l1z, r0x, 0, r0z, r1x, 0, r1z, l1x, 0, l1z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  return geometry;
}

/** 一條隨機折線（裂縫的走向）：從 (x, z) 出發，朝 angle 走 steps 段，每段長 step，方向每段偏一點，偶爾分岔 */
export function crackPath(random, x, z, angle, steps, step) {
  const points = [[x, z]];
  for (let i = 0; i < steps; i++) {
    angle += (random() - 0.5) * 0.9;
    x += Math.cos(angle) * step * (0.6 + random() * 0.8);
    z += Math.sin(angle) * step * (0.6 + random() * 0.8);
    points.push([x, z]);
  }
  return points;
}

/** 把幾何體的頂點沿徑向隨機推拉，做出不規則的塊狀（同一個位置的頂點推一樣多，不會裂開）。 */
export function lumpy(geometry, amount) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const n = Math.sin(Math.round(x * 40) * 12.9898 + Math.round(y * 40) * 78.233 + Math.round(z * 40) * 37.719) * 43758.5453;
    const k = 1 + (n - Math.floor(n) - 0.5) * amount;
    position.setXYZ(i, x * k, y * k, z * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** 草叢：一個壓扁的半球當土丘，上面一圈往外張開的尖葉（封面上草叢的立體版）。原點在底部中央。 */
export function tuft3d(material, width, height) {
  const group = new Group();
  const body = new Mesh(lumpy(new SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.12), material);
  body.scale.set(width * 0.42, height * 0.4, width * 0.3);
  group.add(body);
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const a = Math.PI * (0.1 + (0.8 * i) / (blades - 1)); // 扇形張開，和封面上的畫法一樣
    const reach = i % 2 ? 0.8 : 1;
    const blade = cone(material, width * 0.085, height * 0.85 * reach, 0, 0, 0, 5);
    blade.geometry.translate(0, height * 0.425 * reach, 0); // 軸心移到葉子根部
    blade.position.set(Math.cos(a) * width * 0.16, height * 0.12, ((i % 3) - 1) * width * 0.08);
    blade.rotation.set(((i % 3) - 1) * 0.35, 0, a - Math.PI / 2);
    group.add(blade);
  }
  return group;
}

// 四角星的輪廓（水晶球裡的紅色星芒）
const sparkle = (r) => Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4, radius = i % 2 ? r * 0.28 : r;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
});

// 水晶球（佈景，不登記；#99 屬於序章）：車床做的球座、紅色的頸圈、黑色的球，四周一圈紅色的光芒
function crystalBall(mat) {
  const group = new Group();
  const R = 0.78, top = 1.71; // 球座頂端（紅色頸圈上緣）的高度
  group.add(
    lathe(mat.ink, [[0.5, 0], [0.5, 0.08], [0.2, 0.22], [0.15, 1.0], [0.3, 1.2], [0.78, 1.2], [0.78, 1.35], [0.66, 1.35], [0.66, 1.47], [0.3, 1.47]], 36),
    cylinder(mat.red, 0.54, 0.54, top - 1.47, 0, 1.47, 0, 36),
    sphere(mat.ink, R, 0, top + R * 0.92, 0, 36, 24),
  );
  // 細節：底盤上兩道車出來的細溝（紙白）、紅色頸圈上下各一道暗紅的邊、頸圈上一圈小鉚釘
  for (const [r, y] of [[0.505, 0.05], [0.785, 1.28]]) {
    const groove = new Mesh(new TorusGeometry(r, 0.008, 4, 48), mat.paper);
    groove.rotation.x = Math.PI / 2;
    groove.position.y = y;
    group.add(groove);
  }
  for (const y of [1.48, top - 0.01]) {
    const edge = new Mesh(new TorusGeometry(0.545, 0.016, 6, 40), mat.darkRed);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = y;
    group.add(edge);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    group.add(sphere(mat.ink, 0.022, Math.cos(a) * 0.548, (1.47 + top) / 2, Math.sin(a) * 0.548, 8, 6));
  }
  // 球面上的紅色月牙和三顆星芒、球外的九道光芒：一起轉向鏡頭
  const face = new Group();
  face.position.set(0, top + R * 0.92, 0);
  const red = mat.flat(RED);
  const crescent = new Mesh(new TorusGeometry(R * 0.72, 0.035, 6, 20, 1.5), red);
  crescent.rotation.z = Math.PI - 0.75;
  crescent.position.z = R * 0.72;
  face.add(crescent);
  for (const [x, y, r] of [[0.08, 0.14, 0.17], [0.3, -0.12, 0.13], [-0.12, -0.26, 0.08]]) {
    const star = extrude(red, sparkle(r), 0.01);
    star.position.set(x, y, R + 0.02);
    face.add(star);
  }
  const rays = new Group();
  for (const degrees of [0, 33, 63, 95, 122, 150, 180, 214, -34]) {
    const a = (degrees * Math.PI) / 180;
    const ray = box(red, 0.42, 0.075, 0.02, Math.cos(a) * 1.32, Math.sin(a) * 1.32, 0);
    ray.rotation.z = a;
    rays.add(ray);
  }
  face.add(rays);
  face.traverse((object) => (object.userData.noShadow = true));
  group.add(face);
  group.userData.face = face;
  group.userData.rays = rays;
  return group;
}

// ---- 人物（第四輪：立體人物取代紙偶） ----
// 隊伍的十個人：封面上是一個個圓頭、寬肩的實心黑剪影，身高 U 形（中間矮、靠旗手的右半段越來越高）。
// 做法：同一種人先擺好 8 個走路的姿勢和 1 個站姿，各烘成一個 mesh（約 2 個 draw call），每個人掛 9 份、每一幀只顯示其中一份；
// 不同的人只換髮型與高矮胖瘦。走路的姿勢跟著走過的距離換（不是跟著時間），停下來就換成站姿。
const WALK_FRAMES = 8;
const QUEUE_HAIR = ["bald", "bob", "bald", "long", "bald", "bob", "bald", "bald", "long", "bald"];
const QUEUE_BUILD = [1.3, 1.22, 1.26, 1.18, 1.24, 1.2, 1.28, 1.22, 1.3, 1.34];

/**
 * 剪影化：封面上的人是實心黑影，頭是一個大圓。拿掉鼻子（白色外框會在臉上畫出一個小圈），頭放大一點。
 * 外框是紙白的，所以頭髮的分界線也會變成一道白線；只有長髮、鮑伯頭這種會改變輪廓的髮型才保留。
 */
export function silhouette(person, headScale = 1.2) {
  const { head } = person.userData.joints;
  const nose = head.children.find((o) => o.isMesh && o.position.z > 0.08 && o.position.y < 0.12);
  if (nose) head.remove(nose);
  head.scale.setScalar(headScale);
  return person;
}

// 走路動畫每一格烘好的幾何只跟髮型有關：快取起來，queue 和 floor（同一個世界）共用，
// 手機上整章卸載後重建也不必再烘（原本這裡佔兩章建構時間的三分之二）。
// 快取的是幾何和材質的「角色」：palette 裡的名字（重建時換成新 palette 的同名材質，霧等設定才會跟著新場景），
// 或描邊材質本身（figure.ts 在模組層級共用）。出現認不得的材質就不快取，照舊每次烘。
const PALETTE_KEYS = ["ink", "paper", "red", "darkRed"];
const walkerCache = new Map(); // hair → 每一格的 [{ geometry, role }]
function assembleBaked(parts, mat) {
  const group = new Group();
  const meshParts = [];
  for (const { geometry, role } of parts) {
    const material = typeof role === "string" ? mat[role] : role;
    const mesh = new Mesh(geometry, material);
    if (material.side === BackSide && material.uniforms?.uWidth) mesh.userData.isOutline = mesh.userData.noShadow = true;
    group.add(mesh);
    meshParts.push({ geometry, material });
  }
  Object.defineProperty(group.userData, "parts", { value: meshParts, enumerable: false, writable: true, configurable: true }); // 同 bakeFigure
  return group;
}
async function walkerFrames(mat, hair, pause: () => Promise<void> | void) {
  const cached = walkerCache.get(hair);
  if (cached) return cached.map((parts) => assembleBaked(parts, mat));
  const frames = await bakeWalkerFrames(mat, hair, pause);
  const described = frames.map((frame) =>
    frame.userData.parts.map(({ geometry, material }) => ({
      geometry,
      role: PALETTE_KEYS.find((key) => mat[key] === material) ?? (material.side === BackSide && material.uniforms?.uWidth ? material : null),
    })),
  );
  if (described.every((parts) => parts.every((part) => part.role))) walkerCache.set(hair, described);
  return frames;
}
async function bakeWalkerFrames(mat, hair, pause: () => Promise<void> | void) {
  const frames = [];
  for (let k = 0; k <= WALK_FRAMES; k++) {
    const person = silhouette(makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: null, hair, coat: true, outline: PAPER_LINE, outlineWidth: 0.02 }), 1.3);
    if (k < WALK_FRAMES) walkCycle(person, (k / WALK_FRAMES) * Math.PI * 2, 0.75);
    else person.userData.pose({ armL: [0.04, 0, 0.12], armR: [0.04, 0, -0.12], elbowL: -0.18, elbowR: -0.18 });
    frames.push(bakeFigure(person));
    if (k % 3 === 2) await pause(); // 一格約 10 ms（手機更久）：每三格讓出一次
  }
  return frames;
}

/** 隊伍裡的一個人：高 height、寬 build，腳底在原點，臉朝 +z。userData.show(走過的距離, 走路中?) 換姿勢 */
function queuePerson(frames, height, build, seed) {
  const person = new Group();
  const body = new Group();
  person.add(body);
  for (const frame of frames) {
    const copy = frame.clone();
    copy.visible = false;
    body.add(copy);
  }
  const k = height / 1.75;
  body.scale.set(k * build, k, k * build);
  let shown = body.children[WALK_FRAMES];
  shown.visible = true;
  const stride = 0.55 * height; // 一步的長度
  person.userData.show = (distance, walking, time) => {
    const next = walking ? body.children[Math.floor(((distance / stride) * WALK_FRAMES) % WALK_FRAMES + WALK_FRAMES) % WALK_FRAMES] : body.children[WALK_FRAMES];
    if (next !== shown) {
      shown.visible = false;
      next.visible = true;
      shown = next;
    }
    // 呼吸：站著的時候肩膀很慢地起伏
    body.scale.y = k * (1 + (walking ? 0 : Math.sin(time * 1.6 + seed) * 0.008));
  };
  return person;
}

/**
 * 旗手：封面上比隊伍高一倍的黑色人影，後腦有一個髮髻，右手在腰的高度握著旗。
 * 身體烘成一塊，只留右手臂和脖子（頭）會動；手上掛一個 grip 點，旗跟著它走。
 */
function makeBearer(mat, height) {
  const person = silhouette(makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: null, hair: "bald", build: 1.3, height, outline: PAPER_LINE, outlineWidth: 0.018 }), 1.15);
  const { head, elbowR, hipL, hipR } = person.userData.joints;
  const k = height / 1.75;
  const bun = sphere(mat.ink, 0.058, 0, 0.13, -0.115, 14, 10);
  bun.scale.set(1, 0.9, 0.85);
  head.add(bun);
  inkOutline(bun, { width: 0.018 / k, color: PAPER_LINE });
  const grip = new Group(); // 握旗的那一點（手心）
  grip.position.set(0, -0.31, 0.02);
  elbowR.add(grip);
  // 站姿：兩腳微微分開（封面上兩腿之間有一道白縫），左手垂在身側
  hipL.rotation.z = 0.06;
  hipR.rotation.z = -0.06;
  person.userData.pose({ armL: [0.03, 0, 0.1], elbowL: -0.15 });
  const baked = bakeKeeping(person, ["shoulderR", "neck"]);
  baked.userData.grip = grip;
  return baked;
}

/**
 * 建立「圓盤邊緣」的世界：大圓盤、底下的白色地面、遠處的草叢與矮土丘、水晶球、隊伍、旗手與旗、草叢小丘、空中的塵。
 * queue 和 floor 都呼叫它，所以兩章看到的是同一個世界。
 * @param {ReturnType<typeof makePalette>} mat
 * @param {{ people: Group, bearer: Mesh, flag: Group }} parts 平面版 queue 的 parts（人物的高度和旗面的圖）
 * @param {(id: number, object: import("three").Object3D, opts?: {count?: number}) => unknown} [register] floor 不傳，就不登記
 * @param pause 段落之間呼叫（傳 chapterContext.yield）：建構拆成幾個短任務，不會一次卡住畫面
 */
export async function buildRimWorld(
  mat,
  parts,
  register: (id: number, object: Object3D, opts?: { count?: number }) => unknown = () => {},
  pause: () => Promise<void> | void = () => {},
) {
  const group = new Group();
  const random = seededRandom(1002);

  // ---- 環境：圓盤（頂面白、側面和底面黑）、底下的白色地面 ----
  // 頂面、側面、底面分成三個 mesh：引擎把純色的地面換成能接收陰影的材質時只看第一個材質，用多材質的一個 mesh 會讓頂面也變黑。
  const flat = (color) => new MeshBasicMaterial({ color });
  const disc = new Group();
  disc.position.set(0, 0, -DISC_R);
  const top = new Mesh(new CircleGeometry(DISC_R, 240), flat(WHITE));
  top.rotation.x = -Math.PI / 2;
  const rim = new Mesh(new CylinderGeometry(DISC_R, DISC_R, DISC_THICK, 240, 1, true), flat(BLACK));
  rim.position.y = -DISC_THICK / 2;
  const underside = new Mesh(new CircleGeometry(DISC_R, 240), flat(BLACK));
  underside.rotation.x = Math.PI / 2;
  underside.position.y = -DISC_THICK;
  // 邊緣一圈墨線（封面上的圓周線），比頂面高一點點，從平台上看得到一道黑邊
  const lip = new Mesh(new RingGeometry(DISC_R - 0.07, DISC_R + 0.002, 240, 1), mat.ink);
  lip.rotation.x = -Math.PI / 2;
  lip.position.y = 0.004;
  lip.userData.noShadow = true;
  disc.add(top, rim, underside, lip);
  group.add(disc, ground(WHITE, 500, GROUND_Y));

  await pause();
  // ---- 地景（全部不會動，合併成少數幾個 mesh） ----
  const scenery = new Group();
  // 遠景（封面上這一帶只有白底和黑色的草叢）：很遠的地方幾座低矮的黑色土丘，被霧染淡；比人矮，不會和隊伍疊在一起
  for (const [x, z, rx, h] of [[-26, -36, 7, 1.5], [-4, -50, 10, 2.1], [17, -40, 7, 1.4], [35, -32, 6, 1.2], [49, -46, 9, 1.9], [-45, -44, 8, 1.7], [-62, -30, 7, 1.3], [66, -34, 8, 1.5]]) {
    const hill = new Mesh(lumpy(new SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.14), mat.ink);
    hill.scale.set(rx, h, rx * 0.6);
    hill.position.set(x, 0, z);
    hill.rotation.y = x;
    scenery.add(hill);
  }
  // 平台上的草叢：近的大、遠的小而密，一路排到霧裡，地面才有遠近
  const tufts = [[-8.2, -4.5, 0.7], [-2.6, -7.5, 0.9], [3.2, -6, 0.6], [9.2, -3.6, 0.8], [12.5, -9, 1.1], [-12, -11, 1.2], [6, -14, 1.0], [-5.5, -3.9, 0.45], [7.4, -7.2, 0.5]];
  for (let i = 0; i < 26; i++) {
    const k = (i * 0.618034) % 1, far = 16 + ((i * 7) % 26) * 1.5;
    tufts.push([(k - 0.5) * (30 + far * 1.6), -far, 0.8 + ((i * 3) % 5) * 0.22]);
  }
  for (const [x, z, w] of tufts) {
    const tuft = tuft3d(mat.ink, w, w * 0.65);
    tuft.position.set(x, 0, z);
    tuft.rotation.y = x;
    scenery.add(tuft);
    // 草叢腳下幾顆碎石
    for (let j = 0; j < 3; j++) {
      const r = w * (0.05 + random() * 0.05), a = random() * Math.PI * 2;
      const stone = new Mesh(lumpy(new IcosahedronGeometry(1, 0), 0.4), mat.ink);
      stone.scale.set(r * 1.4, r * 0.7, r);
      stone.position.set(x + Math.cos(a) * w * 0.55, r * 0.25, z + Math.sin(a) * w * 0.35);
      scenery.add(stone);
    }
  }
  // 地上的小石子：隊伍腳邊多一些，往遠處越來越稀
  const pebble = lumpy(new SphereGeometry(1, 6, 4), 0.4);
  for (let i = 0; i < 90; i++) {
    const k = (i * 0.618034) % 1, depth = 0.3 + ((i * 11) % 23) * 0.62 * (i < 46 ? 1 : 0.45), r = 0.018 + ((i * 5) % 4) * 0.01;
    const stone = new Mesh(pebble, mat.ink);
    stone.scale.set(r * 1.5, r * 0.7, r);
    stone.position.set((k - 0.5) * (16 + depth) + (i < 46 ? 0 : 0.3), r * 0.3, -depth - (depth > 0.6 && depth < 1.6 ? 1.2 : 0));
    stone.rotation.y = i;
    scenery.add(stone);
  }
  const mergedScenery = mergeStatic(scenery);
  group.add(mergedScenery);

  // 平台上的裂縫：從邊緣往裡裂進來的幾道、隊伍後面幾道細的，讓白色的地面不是一塊平板（不投影）
  const cracks = [];
  for (const [x, z, angle, steps, step, width] of [
    [-6.6, -0.02, -1.9, 7, 0.32, 0.03], [-1.6, -0.01, -1.3, 5, 0.26, 0.022], [2.6, -0.02, -1.75, 8, 0.3, 0.028], [7.9, -0.01, -1.4, 6, 0.34, 0.03],
    [-3.6, -2.2, 0.3, 9, 0.38, 0.018], [3.4, -3.4, 2.8, 8, 0.4, 0.02], [-9, -6, 0.1, 10, 0.5, 0.03], [10, -5.4, 2.6, 9, 0.5, 0.03], [0.8, -9, 0.5, 10, 0.6, 0.035],
  ]) {
    const path = crackPath(random, x, z, angle, steps, step);
    cracks.push(crackGeometry(path, width));
    const [bx, bz] = path[Math.floor(steps / 2)];
    cracks.push(crackGeometry(crackPath(random, bx, bz, angle + (random() > 0.5 ? 0.9 : -0.9), Math.ceil(steps / 2), step * 0.7), width * 0.6)); // 分岔
  }
  const crackMesh = new Mesh(mergeGeometries(cracks), new MeshBasicMaterial({ color: BLACK, side: DoubleSide }));
  crackMesh.position.y = 0.003;
  crackMesh.userData.noShadow = true;
  group.add(crackMesh);

  await pause();
  // ---- 水晶球：隊伍後方的台座上 ----
  const ball = crystalBall(mat);
  ball.position.set(BALL[0], 0, BALL[1]);
  group.add(ball);

  await pause();
  // ---- #100 排隊的十個人：立體人物，沿著平台邊緣由左往右排；高度照平面版每個人的圖 ----
  const variants = new Map();
  const people = new Group();
  for (const [i, sprite] of parts.people.children.entries()) {
    const hair = QUEUE_HAIR[i];
    if (!variants.has(hair)) variants.set(hair, await walkerFrames(mat, hair, pause)); // 沒快取時這是整章最重的部分，裡面會分段讓出
    const height = (sprite as Mesh<PlaneGeometry>).geometry.parameters.height * S * 0.97;
    const person = queuePerson(variants.get(hair), height, QUEUE_BUILD[i], i * 1.7);
    person.position.set(personX(i), 0, QUEUE_Z);
    people.add(person);
  }
  register(100, people, { count: 10 });
  group.add(people);

  await pause();
  // ---- #101 旗手（立體人物）；#102 旗：一根黑色旗桿加一塊會飄的布（正反兩面貼平面版畫好的雙頭鷹旗，中間夾一層暗紅當布的厚度） ----
  const bearer = new Group();
  const bearerBody = makeBearer(mat, parts.bearer.geometry.parameters.height * S * 0.98);
  register(101, bearerBody);
  const { shoulderR, elbowR, neck } = (() => {
    const j = bearerBody.userData.joints;
    return { shoulderR: j.shoulderR, elbowR: j.shoulderR.children.find((c) => c.isGroup), neck: j.neck };
  })();
  const flag = new Group(); // 原點 = 握旗的手
  const clothSprite = parts.flag.children[0];
  const clothW = clothSprite.geometry.parameters.width * S, clothH = clothSprite.geometry.parameters.height * S;
  const HOIST = clothW * 0.114; // 旗面靠旗桿的那一邊，原本在握點右邊這麼遠
  const clothGeometry = new PlaneGeometry(clothW, clothH, 18, 8);
  clothGeometry.translate(-clothW * 0.386 - HOIST, clothH * 0.34, 0); // 握住的那一點（旗面右下角附近）移到原點，靠旗桿的那一邊貼著旗桿
  const clothMaterial = new MeshBasicMaterial({ map: clothSprite.material.map, alphaTest: 0.5, side: DoubleSide, toneMapped: false });
  const liningMaterial = clothMaterial.clone();
  liningMaterial.color.set("#8f1f1c");
  const clothRest = clothGeometry.attributes.position.clone();
  [clothMaterial, liningMaterial, liningMaterial, clothMaterial].forEach((material, i) => {
    const layer = new Mesh(clothGeometry, material); // 四層共用同一份頂點，一起飄
    layer.position.z = -i * 0.012;
    flag.add(layer);
  });
  // 旗桿：從手下面一點一直到旗面頂端，頂上一顆小球；旗面靠桿的那一邊有三個綁帶
  const poleTop = clothH * 0.86;
  flag.add(cylinder(mat.ink, 0.022, 0.026, poleTop + 0.32, 0, -0.32, -0.018, 10), sphere(mat.ink, 0.045, 0, poleTop + 0.02, -0.018, 12, 8));
  for (const y of [0.1, 0.42, 0.74]) {
    const tie = new Mesh(new TorusGeometry(0.03, 0.009, 6, 12), mat.ink);
    tie.rotation.x = Math.PI / 2;
    tie.position.set(0, clothH * y, -0.018);
    flag.add(tie);
  }
  inkOutline(flag, { width: 0.012, color: PAPER_LINE });
  register(102, flag);
  bearer.add(bearerBody, flag);
  bearer.position.set(BEARER_X, 0, QUEUE_Z);
  bearer.rotation.y = BEARER_YAW;
  group.add(bearer);

  await pause();
  // ---- #103 草叢小丘：隊伍前端、平台邊上；腳下一圈碎土 ----
  const mound = new Group();
  const moundTuft = tuft3d(mat.ink, 0.95, 0.66);
  mound.add(moundTuft);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4, r = 0.03 + (i % 3) * 0.015;
    const clod = new Mesh(lumpy(new IcosahedronGeometry(1, 0), 0.5), mat.ink);
    clod.scale.set(r * 1.4, r * 0.8, r);
    clod.position.set(Math.cos(a) * 0.55, r * 0.3, Math.sin(a) * 0.32);
    mound.add(clod);
  }
  mound.position.set(MOUND[0], 0, MOUND[1]);
  register(103, mound);
  group.add(mound);

  await pause();
  // ---- 空氣：風裡橫著飄的黑色塵粒 ----
  const motes = new Snow({ count: Math.round(260 * deviceTier.particleScale), box: new Vector3(26, 6, 12), center: new Vector3(0, 2.6, 0), size: 20, speed: 0.12, wind: 1.1, color: BLACK });
  group.add(motes);

  const grip = new Vector3();
  /**
   * 每一幀呼叫。arrive(i) 是第 i 個人走到定位的程度、lifted 是旗舉起的程度（0–1）；floor 用預設值（都已到位）。
   */
  function update(time, camera, { arrive = () => 1, lifted = 1 }: { arrive?: (i: number) => number; lifted?: number } = {}) {
    people.children.forEach((person, i) => {
      const there = arrive(i);
      const walking = there > 0 && there < 1;
      const behind = 2.4 * (1 - there);
      person.position.x = personX(i) - behind;
      person.position.y = 0;
      person.userData.show(-behind, walking, time);
      // 走路時朝前進的方向（+x），走到定位前慢慢轉回來面向平台外（略朝旗手）；站著的時候頭和肩膀有一點點晃
      const turn = smooth(linearstep(there, 0.75, 1));
      person.rotation.y = lerp(Math.PI / 2, 0.22 - i * 0.012, turn) + Math.sin(time * 0.7 + i * 2.3) * 0.03 * turn;
    });
    // 旗手：舉旗前右手垂在身側、旗斜斜地垂著；舉起來時手肘往前彎，旗立直，之後隨風輕擺。頭微微轉向隊伍
    shoulderR.rotation.set(lerp(0.06, -0.3, lifted), 0, lerp(-0.08, -0.2, lifted));
    elbowR.rotation.x = lerp(-0.08, -0.62, lifted);
    neck.rotation.y = -0.25 + Math.sin(time * 0.45) * 0.06;
    neck.rotation.x = 0.06;
    bearer.updateMatrixWorld(true);
    bearerBody.userData.grip.getWorldPosition(grip);
    flag.position.copy(bearer.worldToLocal(grip));
    flag.rotation.z = 0.95 * (1 - lifted) + Math.sin(time * 1.5) * 0.04 * lifted;
    flag.rotation.x = 0.12 * (1 - lifted);
    const position = clothGeometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x0 = clothRest.getX(i) + HOIST;
      const d = Math.max(0, -x0) + Math.max(0, clothRest.getY(i)) * 0.25;
      position.setZ(i, Math.sin(d * 6.5 - time * 4.2 + clothRest.getY(i) * 1.5) * 0.1 * d);
      position.setX(i, clothRest.getX(i) + Math.cos(d * 6.5 - time * 4.2) * 0.02 * d);
    }
    position.needsUpdate = true;
    clothGeometry.computeVertexNormals();
    // 水晶球的月牙、星芒和光芒永遠朝向鏡頭；光芒一明一暗地伸縮
    ball.userData.face.lookAt(camera.position);
    ball.userData.rays.scale.setScalar(1 + Math.sin(time * 2.2) * 0.05);
    moundTuft.scale.x = 1 + Math.sin(time * 1.1) * 0.03;
    moundTuft.rotation.z = Math.sin(time * 1.3) * 0.02;
    motes.update(time);
  }

  return { group, update };
}

export default async function createQueueSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(40, 1, 0.05, 600);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette(LIGHT);
  addFog(scene, mat, WHITE, ...FOG);
  const world = await buildRimWorld(mat, flat.parts, register, () => chapterContext.yield?.());
  scene.add(world.group);
  const { pan, whip, settle } = PACE.corner.beats;

  // ---- 鏡頭：在隊伍外側斜著往前（比頭高，人和人之間看得到地面）→ 繞到旗手正面 → 退到平台外 → 降到腳邊 ----
  // 第三輪：整章只有兩次推拉換向：一路推近到旗前 → 一次退到平台外看整排人和水晶球 → 之後一路推近、橫移到隊伍腳邊。
  // 原本「退到平台外」只花 0.07、「甩到旗手腳邊」和「降到隊伍腳邊」各 0.1 左右，等於章節內的硬切；
  // 現在每一段都拉長到 0.16–0.2，旗手腳邊那一格取景比最後一格略寬，從那裡橫移過去不會再推拉一次。
  const track = makeCameraTrack([
    { t: -0.3, pos: [-9.8, 2.3, 2.8], at: [-4.2, 0.8, QUEUE_Z], fov: 40 }, // 隊尾後方
    { t: 0.0, pos: [-7.2, 1.95, 2.0], at: [-3.2, 0.85, -1.2], fov: 40 }, // 隊尾外側
    { t: 0.14, pos: [-3.0, 1.9, 1.85], at: [0.9, 0.95, -1.3], fov: 40 }, // 一個個經過，水晶球在隊伍後面升起
    { t: whip[0], pos: [1.2, 1.8, 1.8], at: [4.6, 1.6, QUEUE_Z], fov: 40 }, // 隊伍前端，旗手入鏡
    { t: (whip[0] + whip[1]) / 2, pos: [2.25, 1.76, 2.63], at: [4.55, 1.78, QUEUE_Z], fov: 39 }, // 繞行的中間點：距離保持在前後兩格之間，弧線不會先貼近再退開
    { t: whip[1], pos: [3.5, 1.75, 3.0], at: [4.5, 1.95, QUEUE_Z], fov: 37 }, // 繞到旗手正面
    { t: 0.45, pos: [3.8, 1.85, 2.7], at: [4.45, 2.05, QUEUE_Z], fov: 36 }, // 停在旗前
    { t: 0.65, pos: [2.2, 2.2, 8.0], at: [1.2, 1.45, -1.5], fov: 40 }, // 退到平台外：整排人和水晶球
    { t: 0.84, pos: [4.6, 0.8, 3.6], at: [5.6, 0.6, QUEUE_Z], fov: 38 }, // 旗手的腳和草叢小丘
    { t: 1.0, ...END_SHOT }, // 橫移到隊伍腳邊；下一章從這一格硬切
    { t: 1.3, ...END_SHOT },
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList([], [{ at: 0.05, cue: "steps" }, { at: 0.3, cue: "reverseSwell" }, { at: 0.42, cue: "flag" }, { at: 0.66, cue: "chime" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      // 直式螢幕把鏡頭往後拉；降到腳邊的最後一段收回來，和下一章的第一格一樣
      const nearCut = smooth(linearstep(p, 0.82, 1)); // 和最後一段橫移同步，直式螢幕上才不會另外再推一次
      applyCameraShot(camera, fitShot(track(p), frame.aspect, 1 - nearCut, nearCut), frame.aspect, frame.pointer, 0.05);
      const last = 9;
      world.update(frame.time, camera, {
        // 隊伍：鏡頭前進期間由前往後一個個走到定位（離旗手近的先到）
        arrive: (i) => {
          const start = pan[0] + 0.05 + (last - i) * 0.028;
          return smooth(linearstep(p, start, start + 0.2));
        },
        // 旗：鏡頭停穩時從垂著舉到封面上的位置
        lifted: smooth(linearstep(p, settle[0] - 0.04, settle[0] + 0.07)),
      });
    },
  };
}
