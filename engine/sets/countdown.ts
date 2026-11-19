// countdown 的 3D 場景：海濱大道（PRD-3D 6.3）。
// 一條沿海的路由左往右：TRUMP 大樓 → 海上的遊艇與落日 → 路中央台座上的沙漏 → 牛仔騎馬 → 路盡頭的克里姆林宮塔。
// 節奏範本 street：0–0.27 沿路前進、0.27–0.40 推近沙漏、0.40 沙漏翻轉、0.60–0.77 牛仔騎過去、之後仰看鐘面。
//
// 第二輪：每樣東西都是幾何體（大樓的退縮與立面浮雕、放樣的遊艇船身、逐層的塔、松樹、會拍翅的鳥）；
// 牛仔和馬拆成前後兩疊厚紙板（馬一疊、騎士一疊）並投出真的影子；近岸有封面上那種黑色波浪帶；遠景淡進白霧。
import {
  BackSide, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, Shape, ShapeGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { canvasTexture, clamp, linearstep, seededRandom, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground, water } from "../shared/set/env";
import { box, cone, cylinder, extrude, lathe, makePalette, sphere, starOutline } from "../shared/set/model";
import { inkOutline, makeFigure } from "../shared/set/figure";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：陰沉的海和低鳴；靠近沙漏時鐘錶滴答，加上走音的音樂盒；沙漏翻轉（0.4）；牛仔騎馬經過（0.62）；仰看克里姆林宮鐘面時一記喪鐘（0.86）。
const soundScript = soundTrack([[0, { sea: 0.2, wind: 0.12, dread: 0.15 }], [0.27, { sea: 0.1, tick: 0.3, musicbox: 0.15, dread: 0.15 }], [0.6, { tick: 0.2, wind: 0.15, dread: 0.2 }], [0.85, { tick: 0.4, dread: 0.25 }]]);

const SHORE_Z = -2; // 路和海的交界
const HOURGLASS_X = 1.5;
const KREMLIN = [7.6, -1.2];

/** 把一組靜態的 mesh 依材質合併成少數幾個 mesh（省繪製次數，影子也跟著變少）。群組本身要還在原點。 */
function bake(group) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(geometry);
  });
  const baked = new Group();
  for (const [material, list] of byMaterial) baked.add(new Mesh(mergeGeometries(list), material));
  return baked;
}

/** a 到 b 之間的一根方桿。 */
const X_AXIS = new Vector3(1, 0, 0);
function beam(material, a, b, thickness = 0.02) {
  const from = new Vector3(...a), to = new Vector3(...b);
  const mesh = box(material, from.distanceTo(to), thickness, thickness);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(X_AXIS, to.sub(from).normalize());
  return mesh;
}

/** 面向 +z 的圓盤（軸沿 Z）。 */
function discZ(material, radius, thickness, x, y, z, segments = 32) {
  const mesh = cylinder(material, radius, radius, thickness, 0, 0, 0, segments);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

/** 拱形的輪廓（底邊中點在原點）：pointed 是尖拱，否則是圓拱。 */
function archOutline(width, height, pointed = false) {
  const half = width / 2;
  if (pointed) return [[-half, 0], [half, 0], [half, height - width * 0.75], [0, height], [-half, height - width * 0.75]];
  const points = [[-half, 0], [half, 0]];
  for (let i = 0; i <= 10; i++) points.push([Math.cos((i / 10) * Math.PI) * half, height - half + Math.sin((i / 10) * Math.PI) * half]);
  return points;
}

/**
 * 放樣的船身：stations 是沿著船長的一串剖面 [x, 半寬, 底的高度, 甲板的高度]。
 * 船頭可以同時收窄又往上翹（封面上遊艇的船頭是往前伸出去的）。
 */
function loftHull(material, stations) {
  const positions = [];
  const quad = (a, b, c, d) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const ring = ([x, halfBeam, bottom, top]) => [[x, top, halfBeam], [x, bottom, halfBeam * 0.72], [x, bottom, -halfBeam * 0.72], [x, top, -halfBeam]];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = ring(stations[i]), b = ring(stations[i + 1]);
    for (let k = 0; k < 4; k++) quad(a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]);
  }
  const first = ring(stations[0]), last = ring(stations.at(-1));
  quad(first[3], first[2], first[1], first[0]);
  quad(last[0], last[1], last[2], last[3]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}

/** 一棵松樹：樹幹加上四層往上變小的七角錐（封面上的松樹是一層層鋸齒狀的黑影）。 */
function pine(material, height, turn = 0) {
  const tree = new Group();
  tree.add(cylinder(material, height * 0.035, height * 0.045, height * 0.2, 0, 0, 0, 6));
  for (let i = 0; i < 4; i++) {
    const tier = cone(material, height * (0.3 - i * 0.055), height * 0.36, 0, height * (0.1 + i * 0.185), 0, 7);
    tier.rotation.y = turn + i * 0.45;
    tree.add(tier);
  }
  return tree;
}

/** 封面上的黑色波浪帶：一條中間粗、兩頭尖、邊緣起伏的墨帶，平貼在水面上。 */
function waveBand(material, length, thickness, seed) {
  const top = [], bottom = [];
  for (let i = 0; i <= 28; i++) {
    const s = i / 28, x = (s - 0.5) * length;
    const swell = Math.pow(Math.sin(s * Math.PI), 0.6) * (0.72 + 0.28 * Math.sin(s * 17 + seed * 5));
    const centre = Math.sin(s * (5 + length) + seed * 3) * thickness * 0.75;
    top.push(new Vector2(x, centre + (thickness / 2) * swell));
    bottom.push(new Vector2(x, centre - (thickness / 2) * swell));
  }
  const mesh = new Mesh(new ShapeGeometry(new Shape([...top, ...bottom.reverse()])), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
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

/**
 * #39 黑馬與紅衣牛仔（第四輪：取代平面版八格步伐拆成的厚紙板）。
 * 馬：橢球的身體、胸與臀兩團肌肉、往上斜的脖子與一排鬃毛、長臉與口鼻、兩隻耳朵、垂下的尾巴、四條兩節的腿（關節是 Group）、蹄；
 * 黑色的馬靠白色的邊緣光與墨線分出前後的腿；白色的韁繩與籠頭（封面上馬頭那一道白線）。
 * 牛仔：makeFigure（紅衣紅褲、紅臉、黑色牛仔帽），跨坐在黑色的馬鞍上，雙手往前拉著韁繩。
 * 原點在四隻腳中間的地面，馬頭朝 +x。整組大小和舊的紙板一樣（帽頂離地約 1.37）。
 */
function buildHorseRider(mat) {
  const group = new Group();
  const horse = new Group();
  const black = mat.ink;
  const ell = (material, rx, ry, rz, x, y, z = 0) => {
    const m = sphere(material, 1, x, y, z, 22, 14);
    m.scale.set(rx, ry, rz);
    return m;
  };
  const tube = (material, points, radius, closed = false) => new Mesh(new TubeGeometry(new CatmullRomCurve3(points.map(([x, y, z = 0]) => new Vector3(x, y, z))), 20, radius, 8, closed), material);
  // 身體：桶狀的軀幹、胸、臀
  horse.add(ell(black, 0.44, 0.22, 0.18, 0, 0.8), ell(black, 0.21, 0.24, 0.175, 0.3, 0.8), ell(black, 0.23, 0.25, 0.19, -0.3, 0.81));
  // 脖子：從胸口往前上方斜，上細下粗；鬃毛是脖子上緣一排扁的小橢球
  const neck = new Group();
  neck.position.set(0.38, 0.9, 0);
  neck.rotation.z = -0.85;
  neck.add(cylinder(black, 0.075, 0.13, 0.42, 0, 0, 0, 14));
  for (let i = 0; i < 6; i++) {
    const tuft = ell(black, 0.05, 0.03, 0.035, -0.07 - i * 0.004, 0.06 + i * 0.065);
    tuft.rotation.z = 0.5;
    neck.add(tuft);
  }
  horse.add(neck);
  // 頭：額頭、長臉、口鼻（沿頭的 +x），整顆頭往前下垂；兩隻耳朵往上豎；白色的籠頭
  const head = new Group();
  head.position.set(0.71, 1.18, 0);
  head.rotation.z = -1.0;
  head.add(ell(black, 0.085, 0.075, 0.07, 0, 0), ell(black, 0.13, 0.062, 0.058, 0.13, -0.005), ell(black, 0.05, 0.056, 0.055, 0.25, -0.012));
  for (const z of [0.035, -0.035]) {
    const ear = cone(black, 0.022, 0.07, 0, 0, 0, 6);
    ear.position.set(-0.035, 0.05, z);
    ear.rotation.z = 0.9;
    head.add(ear);
  }
  const strap = mat.paper;
  const noseband = new Mesh(new TorusGeometry(0.062, 0.008, 6, 20), strap);
  noseband.rotation.y = Math.PI / 2;
  noseband.position.set(0.2, -0.01, 0);
  for (const z of [0.066, -0.066]) head.add(tube(strap, [[0.0, -0.045, z], [0.1, -0.03, z * 0.95], [0.2, -0.015, z * 0.92]], 0.007));
  head.add(noseband);
  horse.add(head);
  // 尾巴：根部翹一點、往下垂，末端散開
  const tail = new Group();
  tail.position.set(-0.5, 0.9, 0);
  tail.add(tube(black, [[0, 0], [-0.09, -0.06], [-0.12, -0.2], [-0.1, -0.38]], 0.035), ell(black, 0.05, 0.12, 0.04, -0.11, -0.4));
  horse.add(tail);
  // 四條腿：肩（髖）→ 膝（飛節）→ 蹄。前腿膝蓋往後彎，後腿的飛節往前彎
  const legs = [];
  for (const [x, z, front, phase] of [[0.3, 0.09, true, 0.25], [0.3, -0.09, true, 0.75], [-0.3, 0.09, false, 0], [-0.3, -0.09, false, 0.5]] as [number, number, boolean, number][]) {
    const hip = new Group();
    hip.position.set(x, 0.74, z);
    hip.add(cylinder(black, 0.07, 0.045, 0.34, 0, -0.34, 0, 10), ell(black, 0.08, 0.1, 0.07, 0, -0.04));
    const knee = new Group();
    knee.position.y = -0.34;
    knee.add(sphere(black, 0.042, 0, 0, 0, 10, 8), cylinder(black, 0.035, 0.03, 0.32, 0, -0.32, 0, 8));
    const hoof = cylinder(black, 0.04, 0.05, 0.05, 0.01, -0.37, 0, 10);
    knee.add(hoof);
    hip.add(knee);
    hip.userData = { knee, front, phase };
    horse.add(hip);
    legs.push(hip);
  }
  // 馬鞍：黑色的鞍座、前後翹起的鞍橋、垂在兩側的鞍墊與馬鐙
  const saddle = new Group();
  saddle.add(ell(black, 0.16, 0.05, 0.2, 0.02, 1.01), ell(black, 0.04, 0.06, 0.1, 0.15, 1.04), ell(black, 0.05, 0.05, 0.13, -0.13, 1.03));
  for (const z of [0.18, -0.18]) {
    saddle.add(box(black, 0.24, 0.16, 0.012, 0.02, 0.9, z));
    saddle.add(tube(strap, [[0.04, 0.92, z * 1.02], [0.05, 0.75, z * 1.05], [0.06, 0.6, z * 1.1]], 0.006)); // 馬鐙的皮帶
  }
  horse.add(saddle);
  group.add(horse);

  // 牛仔
  const RIDER_H = 1.33;
  const rider = makeFigure(mat, { suit: mat.red, pants: mat.red, skin: mat.red, shirt: null, hair: "cowboy", hairMaterial: mat.ink, build: 1.05, height: RIDER_H });
  const k = RIDER_H / 1.75;
  rider.rotation.y = Math.PI / 2; // 臉朝 +x
  rider.position.set(0.02, 1.05 - 0.95 * k, 0);
  rider.userData.pose({ hipL: [-1.32, 0, 0.42], hipR: [-1.32, 0, -0.42], kneeL: 1.25, kneeR: 1.25, spine: [0.08, 0, 0], neck: [-0.05, 0, 0] });
  // 襯衫前襟與帽帶：紅色的面上幾道黑線
  const j = rider.userData.joints;
  j.spine.add(box(mat.ink, 0.012, 0.36, 0.012, 0, 0.26, 0.112), box(mat.ink, 0.36, 0.012, 0.012, 0, 0.47, 0.06));
  group.add(rider);
  // 雙手往前拉著韁繩（手在鞍橋前上方）
  group.updateMatrixWorld(true);
  reachTo(rider, "L", new Vector3(0.3, 1.15, -0.07));
  reachTo(rider, "R", new Vector3(0.3, 1.15, 0.07));
  // 韁繩：從兩手拉到馬嘴的兩側（白）
  for (const z of [0.06, -0.06]) group.add(tube(strap, [[0.3, 1.15, z], [0.5, 1.1, z * 1.1], [0.68, 1.04, z * 1.2], [0.86, 1.0, z]], 0.007));
  inkOutline(horse, { width: 0.01 });
  group.scale.setScalar(0.8);
  group.userData = { horse, legs, neck, head, tail, rider, armPose: ["shoulderL", "shoulderR", "elbowL", "elbowR"].map((name) => [name, j[name].rotation.clone()]) };
  return group;
}

export default async function createCountdownSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(38, 1, 0.05, 400);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.55, 0.75, 0.6]);
  const { rush, impact, aftermath } = PACE.street.beats;
  const random = seededRandom(33);
  const black = mat.flat(BLACK), white = mat.flat(WHITE), red = mat.flat(RED);

  // 霧：路上的東西（離鏡頭 12 以內）不受影響；遠處的遊艇、松林、路另一頭的塔淡進白色的天空
  addFog(scene, mat, WHITE, 12, 46);

  // ---- 環境：白色的路面、#36 海 ----
  scene.add(ground(WHITE));
  const sea = new Group();
  const swell = water({ width: 160, depth: 70, rows: 44 });
  swell.position.set(0, 0.01, SHORE_Z - 35);
  sea.add(swell);
  // 近岸的黑色波浪帶（封面上船下那幾排起伏的粗墨帶）：越靠岸越粗，各自左右慢慢漂
  const bands = [];
  for (let row = 0; row < 5; row++) {
    const z = SHORE_Z - 0.9 - row * 1.15 - row * row * 0.16;
    const thickness = 0.5 - row * 0.03;
    for (let x = -15 + random() * 2; x < 16;) {
      const length = 2.6 + random() * 4.2;
      const band = waveBand(black, length, thickness * (0.8 + random() * 0.4), random() * 10);
      band.position.set(x + length / 2, 0.02, z + (random() - 0.5) * 0.3);
      band.userData.home = band.position.x;
      band.userData.phase = random() * 6.28;
      band.userData.drift = (row % 2 ? 1 : -1) * (0.12 + random() * 0.1);
      bands.push(band);
      sea.add(band);
      x += length + 0.35 + random() * 1.3;
    }
  }
  register(36, sea);
  scene.add(sea);
  // 岸邊一道黑色的堤，上面一排繫船的短樁
  const quay = new Group();
  quay.add(box(black, 160, 0.1, 0.3, 0, 0.05, SHORE_Z));
  for (let x = -14; x < 6; x += 1.4) quay.add(cylinder(mat.ink, 0.05, 0.065, 0.2, x, 0.1, SHORE_Z, 8));
  scene.add(bake(quay));

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #33 TRUMP 大樓：黑色主樓往上退縮三層，左邊較矮的一翼，腳下幾棟矮樓；立面是五道凸出來的紅色直條，樓頂一塊招牌 ----
  const towerParts = new Group();
  const SHAFT: [number, number, number] = [1.3, 2.7, 1.1]; // 主樓的寬、高、深
  towerParts.add(
    box(mat.ink, ...SHAFT, 0, SHAFT[1] / 2, 0),
    box(mat.ink, SHAFT[0] + 0.06, 0.05, SHAFT[2] + 0.06, 0, SHAFT[1], 0), // 每一層退縮的女兒牆
    box(mat.ink, 1.06, 0.3, 0.9, 0, 2.85, 0),
    box(mat.ink, 1.12, 0.045, 0.96, 0, 3.0, 0),
    box(mat.ink, 0.78, 0.24, 0.66, 0, 3.12, 0),
    box(mat.ink, 0.84, 0.04, 0.72, 0, 3.24, 0),
    box(mat.ink, 0.46, 0.14, 0.4, 0, 3.31, 0),
    // 左邊較矮的一翼（封面上主樓左側那一條），頂上也退一層
    box(mat.ink, 0.42, 2.3, 0.86, -0.84, 1.15, -0.05),
    box(mat.ink, 0.47, 0.045, 0.91, -0.84, 2.3, -0.05),
    box(mat.ink, 0.28, 0.2, 0.6, -0.8, 2.4, -0.05),
    // 腳下的矮樓：右邊兩棟一高一低，左邊一棟
    box(mat.ink, 0.5, 0.95, 0.8, 0.92, 0.475, 0.1),
    box(mat.ink, 0.55, 0.04, 0.85, 0.92, 0.95, 0.1),
    box(mat.ink, 0.4, 0.68, 0.62, 1.36, 0.34, 0.16),
    box(mat.ink, 0.36, 1.2, 0.6, -1.3, 0.6, 0.05),
    box(mat.ink, 0.41, 0.04, 0.65, -1.3, 1.2, 0.05),
    // 入口的雨遮
    box(mat.ink, 0.7, 0.05, 0.24, 0, 0.3, SHAFT[2] / 2 + 0.12),
  );
  // 立面：正面五道、右側面四道紅色直條，凸出牆面，直條之間是凹進去的黑色窗帶
  const STRIPE_TOP = 2.16, STRIPE_BOTTOM = 0.36;
  for (let i = 0; i < 5; i++) towerParts.add(box(mat.red, 0.085, STRIPE_TOP - STRIPE_BOTTOM, 0.07, -0.36 + i * 0.18, (STRIPE_TOP + STRIPE_BOTTOM) / 2, SHAFT[2] / 2 + 0.035));
  for (let i = 0; i < 4; i++) towerParts.add(box(mat.red, 0.07, STRIPE_TOP - STRIPE_BOTTOM, 0.085, SHAFT[0] / 2 + 0.035, (STRIPE_TOP + STRIPE_BOTTOM) / 2, -0.3 + i * 0.2));
  // 直條上下各一道凸出的黑色橫楣，把五道直條框成一組
  for (const y of [STRIPE_BOTTOM - 0.03, STRIPE_TOP + 0.03]) towerParts.add(box(mat.ink, 0.9, 0.05, 0.1, 0, y, SHAFT[2] / 2 + 0.05), box(mat.ink, 0.1, 0.05, 0.78, SHAFT[0] / 2 + 0.05, y, 0));
  // 矮樓的窗：幾道白色的短橫線
  for (let i = 0; i < 4; i++) towerParts.add(box(white, 0.3, 0.03, 0.02, 0.92, 0.2 + i * 0.18, 0.51), box(white, 0.2, 0.03, 0.02, -1.3, 0.25 + i * 0.22, 0.36));
  const tower = bake(towerParts);
  // 招牌：樓頂一塊凸出的黑牌，字是封面上本來就有的 TRUMP
  const signTexture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = RED;
    ctx.font = "800 104px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const measured = ctx.measureText("TRUMP").width;
    ctx.translate(w / 2, h / 2 + 6);
    ctx.scale((w * 0.92) / measured, 1);
    ctx.fillText("TRUMP", 0, 0);
  });
  const sign = new Mesh(new PlaneGeometry(1.0, 0.25), new MeshBasicMaterial({ map: signTexture, toneMapped: false }));
  sign.position.set(0, 2.42, SHAFT[2] / 2 + 0.071);
  tower.add(box(mat.ink, 1.08, 0.32, 0.07, 0, 2.42, SHAFT[2] / 2 + 0.035), sign);
  tower.position.set(-6.2, 0, -0.5);
  tower.rotation.y = 0.42;
  register(33, tower);
  scene.add(tower);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #34 落日：海平線上一個紅色圓盤，前面橫著三道白色雲帶（兩頭露出圓盤的部分是紅的） ----
  const sun = new Group();
  const sunRed = mat.flat(RED, false), sunWhite = mat.flat(WHITE, false); // 太陽不受霧影響
  sun.add(discZ(sunRed, 4.2, 0.5, 0, 0, 0, 56));
  for (const [x, y, w] of [[1.9, 0.75, 6.4], [3.3, -0.25, 3.8], [-2.6, -1.3, 4.6]]) {
    sun.add(box(sunRed, w, 0.4, 0.3, x, y, 0), box(sunWhite, w, 0.4, 0.3, x, y, 0.4));
  }
  sun.position.set(-4.5, 2.6, -46);
  register(34, sun);
  scene.add(sun);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #35 遊艇：放樣的船身（船頭收尖並往前翹），三層斜切的艙房各鑲一道紅線，舷窗、欄杆、雷達桅 ----
  const yacht = new Group();
  const yachtParts = new Group();
  const cabin = (outline, depth, y) => {
    const mesh = extrude(mat.ink, outline, depth);
    mesh.position.y = y;
    return mesh;
  };
  yachtParts.add(
    loftHull(mat.ink, [[-2.35, 0.3, 0.16, 0.42], [-2.1, 0.42, 0, 0.42], [1.1, 0.42, 0, 0.44], [1.9, 0.3, 0.04, 0.5], [2.45, 0.14, 0.2, 0.55], [2.85, 0.015, 0.44, 0.6]]),
    cabin([[-1.75, 0], [1.3, 0], [0.85, 0.25], [-1.6, 0.25]], 0.66, 0.43),
    box(mat.red, 2.75, 0.055, 0.7, -0.33, 0.6, 0),
    cabin([[-1.3, 0], [0.7, 0], [0.32, 0.21], [-1.15, 0.21]], 0.5, 0.68),
    box(mat.red, 1.8, 0.05, 0.54, -0.33, 0.83, 0),
    cabin([[-0.85, 0], [0.12, 0], [-0.1, 0.17], [-0.75, 0.17]], 0.36, 0.89),
    box(mat.ink, 1.0, 0.03, 0.44, -0.4, 1.065, 0), // 駕駛台的頂
    // 雷達桅：主桅、兩道橫桿、頂上的十字和一顆雷達罩
    cylinder(mat.ink, 0.022, 0.03, 0.78, -0.45, 1.07, 0, 6),
    box(mat.ink, 0.56, 0.035, 0.035, -0.45, 1.32, 0),
    box(mat.ink, 0.035, 0.035, 0.44, -0.45, 1.32, 0),
    box(mat.ink, 0.3, 0.03, 0.03, -0.45, 1.56, 0),
    box(mat.ink, 0.16, 0.025, 0.025, -0.45, 1.76, 0),
    sphere(mat.ink, 0.075, -0.78, 1.16, 0, 12, 8),
    cylinder(mat.ink, 0.02, 0.02, 0.1, -0.1, 1.07, 0, 6), // 雷達的轉軸
    // 船尾的小艇架、船頭的錨機
    box(mat.ink, 0.36, 0.1, 0.4, -1.95, 0.47, 0),
    cylinder(mat.ink, 0.05, 0.06, 0.09, 2.0, 0.5, 0, 8),
  );
  for (const side of [1, -1]) {
    for (let i = 0; i < 11; i++) yachtParts.add(box(white, 0.12, 0.06, 0.02, -1.45 + i * 0.24, 0.51, side * 0.335)); // 舷窗
    for (let i = 0; i < 7; i++) yachtParts.add(box(white, 0.13, 0.055, 0.02, -1.05 + i * 0.22, 0.75, side * 0.255));
    yachtParts.add(box(white, 0.5, 0.06, 0.02, -0.42, 0.98, side * 0.185));
    // 欄杆：船頭和船尾甲板邊一根根立柱，上面一道扶手
    const posts = [[1.2, 0.4, 0.45], [1.5, 0.36, 0.47], [1.8, 0.3, 0.49], [2.1, 0.23, 0.52], [2.4, 0.14, 0.55], [2.75, 0.03, 0.59]];
    posts.forEach(([x, z, y], i) => {
      yachtParts.add(cylinder(mat.ink, 0.011, 0.011, 0.15, x, y, side * z, 5));
      if (i) yachtParts.add(beam(mat.ink, [posts[i - 1][0], posts[i - 1][2] + 0.15, side * posts[i - 1][1]], [x, y + 0.15, side * z], 0.018));
    });
    for (let i = 0; i < 3; i++) yachtParts.add(cylinder(mat.ink, 0.011, 0.011, 0.14, -2.25 + i * 0.22, 0.42, side * 0.36, 5));
    yachtParts.add(beam(mat.ink, [-2.3, 0.56, side * 0.36], [-1.76, 0.56, side * 0.36], 0.018));
  }
  yacht.add(bake(yachtParts));
  const radar = box(mat.ink, 0.34, 0.035, 0.07, -0.1, 1.185, 0);
  yacht.add(radar);
  const YACHT = [-2.2, -6.2];
  yacht.rotation.y = -0.3;
  yacht.scale.setScalar(1.15);
  register(35, yacht);
  scene.add(yacht);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #37 沙漏：車床做的玻璃體，立在路中央的台座上；0.40 在空中翻一圈 ----
  // 和封面一樣：黑色的玻璃形狀，上半球頂端一小段白色空隙，下半球全黑；紅色背板；黑色的上下框板與四根柱子
  const pedestal = bake(new Group().add(
    cylinder(mat.paper, 0.44, 0.5, 0.24, 0, 0, 0, 32),
    cylinder(mat.paper, 0.38, 0.4, 0.06, 0, 0.24, 0, 32),
    cylinder(mat.ink, 0.52, 0.54, 0.04, 0, 0, 0, 32),
  ));
  pedestal.position.x = HOURGLASS_X;
  scene.add(pedestal);
  const hourglass = new Group(); // 原點在沙漏中心，翻轉時繞著它轉
  const half = 0.52, bulb = 0.3, GAP = [half - 0.125, half - 0.012];
  const curve = [[0.035, 0], [0.06, 0.04], [0.13, 0.1], [0.2, 0.17], [0.255, 0.25], [0.29, 0.34], [bulb, 0.42], [0.285, 0.48], [0.25, half]]; // 半個玻璃球的剖面
  const lower = curve.map(([r, y]) => [r, -y]).reverse();
  const upperSand = curve.filter(([, y]) => y < GAP[0]).concat([[0.293, GAP[0]], [0.0001, GAP[0] - 0.03]]); // 沙面中間微微凹下去
  hourglass.add(
    lathe(mat.ink, [...lower, ...upperSand.slice(1)], 36),
    lathe(white, [[0.292, GAP[0]], [bulb, 0.42], [0.286, GAP[1] - 0.03], [0.262, GAP[1]], [0.0001, GAP[1]]].filter(([, y]) => y >= GAP[0]), 36), // 白色空隙：這一段玻璃是空的
    box(mat.red, bulb * 2 + 0.2, half * 2, 0.03, 0, 0, -bulb - 0.05), // 紅色背板
  );
  // 白色空隙外面包一圈反面的黑殼當輪廓線：鏡頭繞到沒有紅色背板襯著的角度時，玻璃的外形也還在
  const outline = lathe(new MeshBasicMaterial({ color: BLACK, side: BackSide }), [[0.3, GAP[0] - 0.02], [bulb + 0.014, 0.42], [0.3, GAP[1] - 0.03], [0.276, GAP[1] + 0.012], [0.0001, GAP[1] + 0.012]], 36);
  hourglass.add(outline);
  for (const y of [half + 0.035, -half - 0.035]) hourglass.add(box(mat.ink, bulb * 2 + 0.3, 0.07, bulb * 2 + 0.24, 0, y, 0), box(mat.ink, bulb * 2 + 0.38, 0.03, bulb * 2 + 0.32, 0, y + Math.sign(y) * 0.045, 0));
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) hourglass.add(cylinder(mat.ink, 0.022, 0.022, half * 2, x * (bulb + 0.09), -half, z * (bulb + 0.07), 8));
  const hgY = 0.3 + half + 0.115;
  hourglass.position.set(HOURGLASS_X, hgY, 0);
  register(37, hourglass);
  scene.add(hourglass);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #38 小黑鳥：小小的立體模型（身體、頭、喙、尾羽、兩片會拍的翅膀）。翻轉前停在沙漏頂上，被驚飛後落到旁邊 ----
  const bird = new Group();
  const birdBody = sphere(mat.ink, 0.07, 0, 0, 0, 14, 10);
  birdBody.scale.set(1.55, 0.85, 0.85);
  const beak = cone(mat.ink, 0.02, 0.07, 0, 0, 0, 6);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.165, 0.035, 0);
  const tail = extrude(mat.ink, [[0, -0.035], [-0.14, -0.06], [-0.11, 0], [-0.14, 0.06], [0, 0.035]], 0.014);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(-0.08, 0.01, 0);
  bird.add(birdBody, sphere(mat.ink, 0.048, 0.1, 0.04, 0, 12, 8), beak, tail);
  const wings = [1, -1].map((side) => {
    const pivot = new Group();
    const wing = extrude(mat.ink, [[-0.07, 0], [0.06, 0], [0.05, 0.1], [-0.01, 0.23], [-0.06, 0.19], [-0.05, 0.12], [-0.09, 0.1]], 0.014);
    wing.rotation.x = (side * Math.PI) / 2;
    pivot.add(wing);
    pivot.position.set(0, 0.03, side * 0.03);
    pivot.userData.side = side;
    bird.add(pivot);
    return pivot;
  });
  bird.scale.setScalar(1.25);
  const birdPerch = [HOURGLASS_X + 0.05, hgY + half + 0.16, 0];
  const birdRest = [HOURGLASS_X + 1.15, 1.95, -0.3];
  register(38, bird);
  scene.add(bird);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #39 牛仔與馬：第四輪改成立體模型（buildHorseRider：黑馬四條會走的腿、鬃毛、尾巴、白色籠頭與韁繩；牛仔是立體人物，跨坐在馬鞍上） ----
  const cowboy = buildHorseRider(mat);
  const horseLegs = cowboy.userData.legs;
  const rideFrom = -1.4, rideTo = 5.5, rideZ = 0.9;
  register(39, cowboy);
  scene.add(cowboy);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #40 克里姆林宮的塔、#41 紅星 ----
  // 由下往上：門樓（尖拱門框裡一道黑色的門）、寬的一層（一排窗，四角各一座黑色尖頂的小角樓）、鐘樓（四面有鐘）、
  // 鐘亭（成對的細長窗、四角的小尖塔、每面一個小山牆）、黑色的尖頂、紅星。兩側是有燕尾城垛的紅牆。
  const kremlinParts = new Group();
  const TIERS = [[1.6, 0, 1.18], [1.76, 1.18, 2.02], [1.0, 2.02, 3.26], [0.9, 3.26, 3.74]]; // [邊長, 底, 頂]
  for (const [side, bottom, top] of TIERS) kremlinParts.add(box(mat.red, side, top - bottom, side, 0, (top + bottom) / 2, 0));
  for (const [side, y, height] of [[1.72, 0.04, 0.08], [1.86, 1.18, 0.07], [1.88, 2.02, 0.08], [1.08, 2.9, 0.04], [1.12, 3.26, 0.07], [1.0, 3.74, 0.07]]) kremlinParts.add(box(mat.ink, side, height, side, 0, y, 0)); // 每一層的黑色飾帶
  // 浮雕：嵌進牆面一點、凸出 out
  const relief = (material, outline, x, y, faceZ, out) => {
    const mesh = extrude(material, outline, out + 0.03);
    mesh.position.set(x, y, faceZ + out / 2 - 0.015);
    return mesh;
  };
  const CLOCK_Y = 2.6, CLOCK_Z = 0.5;
  const minuteHands = [];
  const clockHands = new Group();
  for (let k = 0; k < 4; k++) {
    const face = new Group(), hands = new Group();
    face.rotation.y = hands.rotation.y = (k * Math.PI) / 2;
    // 門樓：黑色的尖拱門框、紅色的門洞襯底、黑色的圓拱門，門上一扇小窗，兩側各一道箭縫
    face.add(
      relief(black, archOutline(0.66, 0.86, true), 0, 0.08, 0.8, 0.03),
      relief(mat.red, archOutline(0.54, 0.76, true), 0, 0.08, 0.8, 0.045),
      relief(black, archOutline(0.3, 0.6), 0, 0.08, 0.8, 0.06),
      relief(black, archOutline(0.1, 0.2), 0, 0.93, 0.8, 0.03),
      box(black, 0.04, 0.55, 0.04, -0.7, 0.45, 0.8), box(black, 0.04, 0.55, 0.04, 0.7, 0.45, 0.8),
    );
    // 寬的一層：五扇窗，中間那扇比較高
    for (const [x, height] of [[-0.62, 0.34], [-0.33, 0.34], [0, 0.46], [0.33, 0.34], [0.62, 0.34]]) face.add(relief(black, archOutline(0.1, height), x, 1.38, 0.88, 0.03));
    // 鐘樓：底下四個小尖拱，中間是鐘，鐘上面兩扇小窗
    for (const x of [-0.345, -0.115, 0.115, 0.345]) face.add(relief(black, archOutline(0.11, 0.2, true), x, 2.1, CLOCK_Z, 0.03));
    for (const x of [-0.17, 0.17]) face.add(relief(black, archOutline(0.07, 0.15, true), x, 3.04, CLOCK_Z, 0.03));
    // 鐘面：黑色外圈、紅色的環、黑色的面、十二個白色刻度、紅色的軸心
    face.add(discZ(black, 0.42, 0.04, 0, CLOCK_Y, CLOCK_Z + 0.01), discZ(red, 0.385, 0.04, 0, CLOCK_Y, CLOCK_Z + 0.025), discZ(black, 0.31, 0.04, 0, CLOCK_Y, CLOCK_Z + 0.04));
    for (let i = 0; i < 12; i++) {
      const tick = box(white, 0.016, i % 3 ? 0.035 : 0.06, 0.01, Math.sin((i / 6) * Math.PI) * 0.265, CLOCK_Y + Math.cos((i / 6) * Math.PI) * 0.265, CLOCK_Z + 0.062);
      tick.rotation.z = -(i / 6) * Math.PI;
      face.add(tick);
    }
    // 鐘亭：兩對細長窗；頂上每面一個紅色小山牆
    for (const x of [-0.29, -0.17, 0.17, 0.29]) face.add(relief(black, archOutline(0.055, 0.28), x, 3.36, 0.45, 0.03));
    face.add(relief(mat.red, [[-0.17, 0], [0.17, 0], [0, 0.26]], 0, 3.77, 0.4, 0.08), relief(black, archOutline(0.06, 0.13, true), 0, 3.79, 0.44, 0.05));
    kremlinParts.add(face);
    // 指針：時針朝上，分針在 0.80 走到 12
    const minute = new Group();
    minute.add(box(white, 0.022, 0.25, 0.012, 0, 0.115, 0));
    minute.position.set(0, CLOCK_Y, CLOCK_Z + 0.075);
    hands.add(box(white, 0.034, 0.16, 0.012, 0, CLOCK_Y + 0.07, CLOCK_Z + 0.068), minute, discZ(red, 0.04, 0.03, 0, CLOCK_Y, CLOCK_Z + 0.075, 12));
    minuteHands.push(minute);
    clockHands.add(hands);
  }
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    // 四角的小角樓：紅色的方身、黑色的窗與飾帶、黑色的圓錐頂
    kremlinParts.add(
      box(mat.red, 0.3, 0.36, 0.3, x * 0.76, 2.2, z * 0.76),
      box(mat.ink, 0.36, 0.045, 0.36, x * 0.76, 2.38, z * 0.76),
      box(black, 0.07, 0.14, 0.31, x * 0.76, 2.2, z * 0.76), box(black, 0.31, 0.14, 0.07, x * 0.76, 2.2, z * 0.76),
      cone(mat.ink, 0.21, 0.62, x * 0.76, 2.4, z * 0.76, 10),
      // 鐘樓頂和鐘亭頂四角的小尖塔
      cone(mat.ink, 0.07, 0.24, x * 0.5, 3.29, z * 0.5, 6),
      cone(mat.ink, 0.06, 0.34, x * 0.42, 3.77, z * 0.42, 6),
      cone(mat.ink, 0.045, 0.24, x * 0.42, 3.77, z * 0.2, 6), cone(mat.ink, 0.045, 0.24, x * 0.2, 3.77, z * 0.42, 6),
    );
  }
  // 黑色尖頂（四角錐），頂上一根細桿托著紅星
  const spire = cone(mat.ink, 0.4, 1.12, 0, 3.77, 0, 4);
  spire.rotation.y = Math.PI / 4;
  kremlinParts.add(spire, cylinder(mat.ink, 0.02, 0.03, 0.14, 0, 4.86, 0, 6));
  // 兩側的紅色城牆：燕尾形的城垛、牆頂一道飾帶、牆面的箭縫；塔腳下一片紅土（封面上城牆底下那塊紅色的坡）
  const WALL_Z = -0.2, WALL_H = 0.8, WALL_T = 0.36;
  const merlon = [[-0.09, 0], [0.09, 0], [0.09, 0.22], [0.035, 0.22], [0, 0.14], [-0.035, 0.22], [-0.09, 0.22]];
  for (const s of [1, -1]) {
    kremlinParts.add(box(mat.red, 3.9, WALL_H, WALL_T, s * 2.7, WALL_H / 2, WALL_Z), box(mat.red, 3.9, 0.05, WALL_T + 0.08, s * 2.7, WALL_H - 0.12, WALL_Z));
    for (let i = 0; i < 11; i++) {
      const tooth = extrude(mat.red, merlon, WALL_T);
      tooth.position.set(s * (0.98 + i * 0.35), WALL_H, WALL_Z);
      kremlinParts.add(tooth);
      if (i % 2) kremlinParts.add(box(black, 0.035, 0.26, WALL_T + 0.02, s * (0.98 + i * 0.35), 0.38, WALL_Z));
    }
    // 牆的盡頭一階一階降下去
    kremlinParts.add(box(mat.red, 0.5, WALL_H * 0.62, WALL_T, s * 4.9, WALL_H * 0.31, WALL_Z), box(mat.red, 0.5, WALL_H * 0.3, WALL_T, s * 5.4, WALL_H * 0.15, WALL_Z));
  }
  const mound = cylinder(red, 1, 1, 0.004, 0, 0, 0, 48);
  mound.scale.set(5.2, 1, 1.5);
  mound.position.z = 0.1;
  mound.userData.noShadow = true;
  const kremlin = bake(kremlinParts);
  kremlin.add(clockHands, mound);
  kremlin.position.set(KREMLIN[0], 0, KREMLIN[1]);
  register(40, kremlin);
  scene.add(kremlin);
  // 紅星：兩片互相垂直的星形厚板，從哪個方向看都是一顆星
  const star = new Group();
  const STAR_Y = 5.2;
  for (const turn of [0, Math.PI / 2]) {
    const blade = extrude(mat.red, starOutline(0.27), 0.08);
    blade.rotation.y = turn;
    star.add(blade);
  }
  star.position.set(KREMLIN[0], STAR_Y, KREMLIN[1]);
  register(41, star);
  scene.add(star);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- 松樹（封面上塔的右邊、沙漏的左邊都有一叢黑松）：塔的兩側、大樓和沙漏之間，還有遠處海岬上的一排 ----
  const pineParts = new Group();
  const PINES = [
    [10.6, -0.4, 2.3], [11.5, 0.5, 1.7], [12.3, -0.9, 2.6], [13.4, 0.1, 2.0], [11.0, -1.5, 1.5], [14.6, -1.1, 2.4], [9.9, 0.9, 1.2],
    [-4.5, -1.3, 1.5], [-3.9, -1.5, 1.05], [-4.0, 1.2, 0.9],
    [-8.9, -1.2, 1.9], [-9.8, -0.4, 2.4], [-10.9, -1.3, 1.6], [-8.3, 1.3, 1.3],
  ];
  for (const [x, z, height] of PINES) {
    const tree = pine(mat.ink, height, random() * 3);
    tree.position.set(x, 0, z);
    pineParts.add(tree);
  }
  const pines = bake(pineParts);
  scene.add(pines);
  // 遠處的海岬：一條伸進海裡的黑色低地，上面一排松樹，在霧裡淡掉
  const capeParts = new Group();
  capeParts.add(extrude(mat.ink, [[-13, 0], [15, 0], [13, 0.5], [6, 0.8], [-4, 0.7], [-11, 0.35]], 5));
  for (let i = 0; i < 22; i++) {
    const tree = pine(mat.ink, 1.6 + random() * 1.8, random() * 3);
    tree.position.set(-10.5 + i * 1.05 + random() * 0.5, 0.45, (random() - 0.5) * 3);
    capeParts.add(tree);
  }
  const cape = bake(capeParts);
  cape.position.set(27, 0, -30);
  cape.rotation.y = -0.12;
  scene.add(cape);

  // 影子：第四輪拿掉平面投影，路面上的東西由引擎的陰影貼圖投在白色的地上

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- 鏡頭：沿路往前推，在空間裡升降與繞行 ----
  const track = makeCameraTrack([
    { t: -0.3, pos: [-9.2, 0.45, 5.6], at: [-6.1, 1.9, -0.5], fov: 38 }, // 低角度仰看大樓
    { t: 0.1, pos: [-7.6, 0.6, 4.8], at: [-5.7, 2.0, -0.7], fov: 38 },
    // 掃過海面：遊艇與落日。注視點放在同一條視線上近一點的地方（畫面一樣），鏡頭距離才會從頭到沙漏一路縮短，
    // 不會先因為看向遠方的落日而「拉遠」、再一下子推到沙漏前（第三輪：舊版在 0.29 取景一步跳 0.158）
    { t: 0.22, pos: [-3.4, 1.5, 4.4], at: [-3.15, 1.3, -1.09], fov: 40 },
    { t: 0.32, pos: [0.2, 1.1, 3.6], at: [HOURGLASS_X, hgY, 0], fov: 36 },
    { t: rush, pos: [1.1, hgY, 2.3], at: [HOURGLASS_X, hgY, 0], fov: 34 }, // 停在沙漏前
    { t: 0.5, pos: [2.25, hgY + 0.25, 2.5], at: [HOURGLASS_X, hgY, 0], fov: 34 }, // 翻轉時繞到另一側
    { t: aftermath[0], pos: [1.4, 1.2, 4.2], at: [1.2, 0.8, 0.6], fov: 38 }, // 退後，牛仔進場
    { t: 0.76, pos: [5.2, 1.1, 4.6], at: [4.9, 1.0, 0.6], fov: 38 }, // 跟著牛仔
    { t: 0.9, pos: [6.0, 0.6, 5.0], at: [KREMLIN[0], 2.8, KREMLIN[1]], fov: 42 }, // 仰看鐘面
    { t: 1.0, pos: [6.5, 0.5, 4.2], at: [KREMLIN[0], 3.3, KREMLIN[1]], fov: 42 }, // 一路仰到尖頂上的紅星
    { t: 1.3, pos: [6.7, 0.45, 3.9], at: [KREMLIN[0], 3.6, KREMLIN[1]], fov: 42 },
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList(pacedCues("street", ["hourglass"]), [{ at: 0.62, cue: "gallop" }, { at: 0.86, cue: "bellToll" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const time = frame.time;
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.05);

      // 海：遠處的波紋流動，近岸的波浪帶左右漂、微微伸縮；遊艇跟著浪起伏，雷達一直轉
      swell.userData.update(time);
      for (const band of bands) {
        band.position.x = band.userData.home + Math.sin(time * band.userData.drift + band.userData.phase) * 0.5;
        band.scale.x = 1 + 0.08 * Math.sin(time * 0.7 + band.userData.phase);
      }
      yacht.position.set(YACHT[0] + 1.2 * linearstep(p, -0.3, 1), Math.sin(time * 0.9) * 0.025 - 0.02, YACHT[1]);
      yacht.rotation.z = Math.sin(time * 0.7) * 0.012;
      radar.rotation.y = time * 2.4;

      // 沙漏：0.40 被翻過來，在 impact 結束（0.474）轉到定位。翻之前上下顛倒，所以白色空隙在底下
      const flip = smooth(linearstep(p, rush, impact[1]));
      hourglass.rotation.z = Math.PI * (1 - flip);
      hourglass.position.y = hgY + Math.sin(flip * Math.PI) * 0.35;

      // 鳥：被翻轉驚飛，沿弧線飛到旁邊；飛的時候翅膀跟著進度拍，之後原地上下拍動
      const fly = smooth(linearstep(p, rush, rush + 0.1));
      const hover = fly >= 1 ? 1 : 0;
      bird.position.set(
        birdPerch[0] + (birdRest[0] - birdPerch[0]) * fly,
        birdPerch[1] + (birdRest[1] - birdPerch[1]) * fly + Math.sin(fly * Math.PI) * 0.5 + hover * Math.sin(time * 3) * 0.04,
        birdPerch[2] + (birdRest[2] - birdPerch[2]) * fly,
      );
      const flap = fly <= 0 ? 0.25 + 0.04 * Math.sin(time * 2) : 0.55 + 0.6 * Math.sin(hover ? time * 13 : fly * 60);
      for (const wing of wings) wing.rotation.x = -wing.userData.side * flap;
      bird.rotation.set(0, -0.5, fly > 0 && !hover ? 0.3 : 0.12);

      // 牛仔：aftermath（0.60–0.79）從沙漏左邊騎到塔前；步伐由走過的距離決定，倒著捲也對
      const ride = linearstep(p, aftermath[0], 0.79);
      const x = rideFrom + (rideTo - rideFrom) * smooth(ride);
      const stepPhase = ((x - rideFrom) / 0.75) % 1; // 一個完整的步伐走 0.75（蹄在地上時不會打滑）
      cowboy.visible = p > aftermath[0] - 0.02;
      // 四拍的慢步：每條腿依自己的相位擺動，抬腿時膝蓋彎（前腿往後彎、後腿的飛節往前彎），蹄落地時身體壓低一點
      const { neck, head, tail, rider, armPose } = cowboy.userData;
      for (const leg of horseLegs) {
        const a = (stepPhase + leg.userData.phase) * Math.PI * 2;
        leg.rotation.z = Math.sin(a) * 0.32;
        const lift = Math.max(0, Math.cos(a));
        leg.userData.knee.rotation.z = (leg.userData.front ? -1 : 1) * lift * 0.75;
      }
      const bob = Math.abs(Math.sin(stepPhase * Math.PI * 4));
      cowboy.position.set(x, 0.015 * bob, rideZ);
      neck.rotation.z = -0.85 + Math.sin(stepPhase * Math.PI * 4) * 0.05; // 走路時點頭
      head.rotation.z = -1.0 + Math.sin(stepPhase * Math.PI * 4 + 0.6) * 0.04;
      tail.rotation.z = Math.sin(time * 1.7) * 0.08;
      tail.rotation.x = Math.sin(time * 1.1) * 0.15;
      // 牛仔跟著馬的步伐上下顛、上身微微前後晃；手跟著韁繩動
      const rj = rider.userData.joints;
      rj.hips.position.y = 0.95 + bob * 0.02;
      rj.spine.rotation.x = 0.08 + Math.sin(stepPhase * Math.PI * 4 - 0.5) * 0.04;
      rj.neck.rotation.x = -0.05 - Math.sin(stepPhase * Math.PI * 4 - 0.5) * 0.03;
      for (const [name, rest] of armPose) rj[name].rotation.set(rest.x + (name.startsWith("elbow") ? Math.sin(stepPhase * Math.PI * 4) * 0.04 : 0), rest.y, rest.z);

      // 分針：0.80 走到 12（時針一直朝上）；紅星緩慢自轉；太陽往海平線下沉
      for (const hand of minuteHands) hand.rotation.z = (1 - smooth(linearstep(p, 0.7, 0.8))) * 0.9;
      star.rotation.y = time * 0.6;
      sun.position.y = 2.6 - 1.2 * smooth(linearstep(p, 0, 0.3));
    },
  };
}
