// pharma 的 3D 場景：實驗室到專櫃（PRD-3D 6.10）。
// 兩張實驗桌由左往右排成一條線：左實驗桌（針筒、藥丸、顯微鏡）→ 科學家站的缺口 → 右實驗桌（培養皿、試劑瓶、試管架，
// 一路延伸到右端的口紅、圓罐、展示櫃）。印度門立在藥丸後方的遠處。鏡頭在桌面高度沿著這條線走到底。
// 封面上沒有的佈景都拿掉了：針筒照封面立在自己的推桿上（不用鐵架），化妝品直接放在實驗桌的右端（不另外做專櫃）。
//
// 節奏範本 corner，節拍對應：
//   pan    [-0.2, 0.3]   鏡頭從針尖沿著直立的針筒降到桌面高度；針筒往下壓在推桿上（0.04–0.24），針尖噴出三滴
//   whip   [0.27, 0.37]  沿桌面快速橫移到藥丸；膠囊和藥錠在這段時間掉到桌上
//   settle [0.33, 0.58]  停在藥丸前，後方是印度門；紅色顆粒從倒下的膠囊口滾出來
//   pushIn [0.56, 0.72]  移到實驗室（顯微鏡、科學家），推近他手上的紅球
//   detail [0.76, 0.86]  貼著桌面滑過一排試劑瓶（前景的瓶子從鏡頭前掠過），到專櫃的口紅、圓罐、展示櫃
//   raise  [0.84, 0.95]  口紅膏體從管子裡旋出來
// 範本沒有音效時點，所以沒有 cues。
import {
  Color, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Path, PerspectiveCamera, Scene, Shape, TorusGeometry, Vector3,
} from "three";
import { Snow, clamp, deviceTier, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cylinder, extrude, lathe, makePalette, place, sphere } from "../shared/set/model";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";
import { bakeFigure, inkOutline, makeFigure } from "../shared/set/figure";

// 聲音（2026-11-19，陰森版）：空無一人的實驗室：電器聲、走音的音樂盒、低鳴；針筒推注（0.05）；藥丸撒落（0.3）；試劑瓶輕碰（0.64、0.8）；口紅旋出時走音的風鈴（0.88）。
const soundScript = soundTrack([[0, { hum: 0.12, musicbox: 0.15, dread: 0.15, tick: 0.06 }], [1, { hum: 0.12, musicbox: 0.12, dread: 0.18, tick: 0.06 }]]);

const TOP = 1.0; // 桌面高度
const FRONT = 0.65; // 桌身正面的 z
const SYRINGE_X = -9;
const PILLS_X = -6.3;
const GATE = [-6.3, -9.5];
const SCIENTIST_X = -2.05;

// ---- 這一章自己用的建模小工具 ----

/** 兩點之間的一根圓桿（在物件自己的 XY 平面上）。 */
function rod(material, [x0, y0], [x1, y1], radius, z = 0) {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 14), material);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  mesh.rotation.z = Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2;
  return mesh;
}

/** 一段貼在圓柱表面上的弧形帶子（刻度、反光條）。theta 從 +z 往 +x 量。 */
function band(material, radius, height, thetaStart, thetaLength, y) {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, height, 16, 1, true, thetaStart, thetaLength), material);
  mesh.position.y = y;
  return mesh;
}

/** 頂面斜切的圓柱（口紅膏體）。原點在底面中心。 */
function slantCylinder(material, radius, height, slant) {
  const geometry = new CylinderGeometry(radius, radius, height, 28);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) position.setY(i, position.getY(i) + (position.getX(i) / radius) * slant);
  }
  geometry.translate(0, height / 2, 0);
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}

// 車床輪廓：試劑瓶（瓶身、瓶肩、細頸、瓶口）與錐形瓶
const bottleProfile = (w, h) => {
  const r = w / 2;
  return [[0, 0], [r, 0], [r, h * 0.46], [r * 0.86, h * 0.58], [r * 0.42, h * 0.7], [r * 0.42, h * 0.92], [r * 0.58, h * 0.93], [r * 0.58, h], [0, h]];
};
const flaskProfile = (w, h) => {
  const r = w / 2;
  return [[0, 0], [r * 0.9, 0], [r, h * 0.07], [r * 0.28, h * 0.62], [r * 0.28, h * 0.95], [r * 0.38, h], [0, h]];
};
// 半顆膠囊：一段圓柱加一個半球，開口在 y = 0
const capsuleHalfProfile = (r, straight) => {
  const points = [[r, 0], [r, straight]];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    points.push([r * Math.cos(a), straight + r * Math.sin(a)]);
  }
  return points;
};

/**
 * 用「注視點、方位角、仰角、距離」寫的鏡頭軌道（2026-11-19 第三輪）。
 * 方位角 yaw（度）：0 是鏡頭在注視點的 +z 方向往 −z 看，正值是鏡頭在注視點右邊（+x）往左看；仰角 pitch（度）正值是鏡頭比注視點高。
 * 注視點和 fov 交給 makeCameraTrack，方位角、仰角、距離另外交給一條 makeCameraTrack 各自單調內插，
 * 所以兩格之間只要距離是單調的，鏡頭就不會因為轉方向（走弦線）而先近後遠。回傳 (time) => { pos, at, fov, roll }。
 */
function orbitTrack(keys) {
  const aim = makeCameraTrack(keys.map((k) => ({ t: k.t, at: k.at, pos: [k.at[0], k.at[1], k.at[2] + 1], fov: k.fov })));
  const polar = makeCameraTrack(keys.map((k) => ({ t: k.t, at: [k.yaw, k.pitch, k.dist], pos: [k.yaw, k.pitch, k.dist + 1], fov: 0 })));
  const shot = { pos: new Vector3(), at: new Vector3(), fov: 36, roll: 0 };
  return (time) => {
    const a = aim(time), [yaw, pitch, dist] = polar(time).at.toArray();
    const y = (yaw * Math.PI) / 180, x = (pitch * Math.PI) / 180;
    shot.at.copy(a.at);
    shot.pos.set(a.at.x + dist * Math.cos(x) * Math.sin(y), a.at.y + dist * Math.sin(x), a.at.z + dist * Math.cos(x) * Math.cos(y));
    shot.fov = a.fov;
    return shot;
  };
}

export default function createPharmaSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(36, 1, 0.05, 400);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.4, 0.9, 0.3]);
  const { whip, raise } = PACE.corner.beats;
  const white = mat.flat(WHITE), black = mat.flat(BLACK);

  // ---- 環境：白色的地板、遠處一道黑色的地平線、空中慢慢往上飄的紅色微粒 ----
  // 霧：桌上的東西和印度門（離鏡頭 15 以內）不受影響，遠處的地平線淡進白色
  addFog(scene, mat, WHITE, 17, 95);
  scene.add(ground(WHITE));
  scene.add(box(black, 400, 0.6, 0.5, 0, 0.3, -26));
  const motes = new Snow({
    count: Math.round(220 * deviceTier.particleScale), box: new Vector3(30, 6, 9), center: new Vector3(0.5, 3.4, -3),
    size: 46, speed: -0.22, wind: 0.12, color: RED,
  });
  scene.add(motes);

  // ---- #60 實驗桌 ×2：黑色桌身、白色桌面，正面是白線畫的抽屜與櫃門；加上右邊紅色的專櫃（不屬於 #60） ----
  const makeBench = (x0, x1, bodyMaterial) => {
    const bench = new Group(), w = x1 - x0, cx = (x0 + x1) / 2;
    bench.add(
      box(mat.ink, w - 0.3, 0.08, 2.0, cx, 0.04, -0.4),
      box(bodyMaterial, w - 0.1, 0.84, 2.1, cx, 0.5, -0.4),
      box(mat.paper, w, 0.08, 2.3, cx, 0.96, -0.4),
    );
    return bench;
  };
  // 貼在桌身正面的一片（門框的白線）；depth 大一點就是凸出來的把手
  const front = (material, x0, x1, y0, y1, depth = 0.02) => box(material, x1 - x0, y1 - y0, depth, (x0 + x1) / 2, (y0 + y1) / 2, FRONT + depth / 2 + 0.001);
  const benches = new Group();
  const leftBench = makeBench(-10.6, -3.2, mat.ink);
  leftBench.add(
    front(white, -10.35, -6.0, 0.8, 0.83), front(white, -10.35, -10.32, 0.3, 0.83), // 抽屜的上緣與左緣
    front(white, -9.3, -8.2, 0.62, 0.66, 0.09), front(white, -9.3, -8.2, 0.4, 0.44, 0.09), // 兩個把手
    front(white, -7.3, -6.2, 0.62, 0.66, 0.09), front(white, -7.3, -6.2, 0.4, 0.44, 0.09),
    front(white, -5.6, -3.5, 0.16, 0.84, 0.04), front(black, -5.0, -4.1, 0.68, 0.73, 0.1), // 白色的櫃門與黑把手
  );
  // 右實驗桌一路延伸到右端：封面上口紅、圓罐、展示櫃就排在試管架的右邊
  const rightBench = makeBench(-0.9, 12.6, mat.ink);
  rightBench.add(
    front(white, -0.6, 12.3, 0.8, 0.83), front(white, 12.27, 12.3, 0.16, 0.83), // 桌面下的白線框
    front(white, 0.9, 0.93, 0.12, 0.66), front(white, 3.57, 3.6, 0.12, 0.66), front(white, 0.9, 3.6, 0.63, 0.66), // 櫃門的外框
    front(white, 1.7, 2.8, 0.48, 0.52, 0.09),
    // 右半段：同一種櫃門和抽屜再排兩組
    front(white, 6.4, 6.43, 0.12, 0.66), front(white, 9.07, 9.1, 0.12, 0.66), front(white, 6.4, 9.1, 0.63, 0.66), front(white, 7.2, 8.3, 0.48, 0.52, 0.09),
    front(white, 9.9, 11.0, 0.62, 0.66, 0.09), front(white, 9.9, 11.0, 0.4, 0.44, 0.09),
  );
  benches.add(leftBench, rightBench);
  register(60, benches, { count: 2 });
  scene.add(benches);

  // ---- #54 針筒：車床做的紅色針筒，針尖朝上，照封面立在自己的黑色推桿上；針筒往下壓，活塞頭就往針尖走 ----
  const syringe = new Group();
  const R = 0.19, ROD = 0.62, BARREL = 1.72, TRAVEL = 0.45;
  const barrelGroup = new Group(); // 針筒本體（會往下壓）；原點在凸緣的底面
  barrelGroup.add(lathe(mat.red, [
    [0, 0], [0.36, 0], [0.37, 0.035], [0.36, 0.07], [R, 0.07], [R, BARREL], [0.085, BARREL + 0.03], [0.075, BARREL + 0.1], [0.045, BARREL + 0.27], [0.03, BARREL + 0.29], [0.016, BARREL + 0.3], [0.016, BARREL + 0.86], [0, BARREL + 0.88],
  ], 32));
  // 刻度：22 道，長短交錯，偏向右前方（封面上靠右）
  for (let i = 0; i < 22; i++) {
    const long = i % 2 === 0;
    barrelGroup.add(band(black, R + 0.004, 0.034, long ? -0.25 : 0.2, long ? 1.25 : 0.8, BARREL + 0.07 - (12 + i * 3.3) * 0.02));
  }
  // 推桿（不動）：桌上的拇指壓板、桿子，和針筒裡的黑色活塞頭
  const plunger = new Group();
  plunger.add(
    cylinder(mat.ink, 0.25, 0.25, 0.07, 0, 0, 0, 28),
    cylinder(mat.ink, 0.19, 0.19, 0.03, 0, 0.07, 0, 28),
    cylinder(mat.ink, 0.052, 0.052, ROD + 0.5, 0, 0.07, 0, 12),
    box(mat.ink, 0.2, ROD - 0.1, 0.03, 0, ROD / 2 + 0.05, 0), box(mat.ink, 0.03, ROD - 0.1, 0.2, 0, ROD / 2 + 0.05, 0), // 桿子是十字形的肋
    band(black, R + 0.007, 0.09, 0, Math.PI * 2, ROD + BARREL - 0.08),
  );
  syringe.add(barrelGroup, plunger);
  syringe.position.set(SYRINGE_X, TOP, 0.15);
  register(54, syringe);
  scene.add(syringe);
  const needleTip = new Vector3(SYRINGE_X, 0, 0.15); // y 每一幀跟著針筒更新
  // 針尖噴出的三滴藥水（封面上沒有，只在動畫裡出現，不登記）
  const drops = [0, 1, 2].map(() => sphere(mat.red, 0.05, 0, 0, 0, 12, 8));
  scene.add(...drops);

  // ---- #55 膠囊 2、藥錠 2 與灑出來的紅色顆粒：甩鏡時掉到桌上 ----
  const pills = new Group();
  const CAP_R = 0.2, CAP_STRAIGHT = 0.22;
  const makeCapsule = (firstMaterial, secondMaterial) => {
    const capsule = new Group(), lying = new Group();
    const first = lathe(firstMaterial, capsuleHalfProfile(CAP_R, CAP_STRAIGHT), 24);
    const second = lathe(secondMaterial, capsuleHalfProfile(CAP_R, CAP_STRAIGHT), 24);
    first.rotation.z = Math.PI;
    lying.add(first, second);
    lying.rotation.z = -Math.PI / 2; // 躺平：first 朝 -x，second 朝 +x
    capsule.add(lying);
    return capsule;
  };
  const makeTablet = () => {
    const tablet = new Group();
    const score = box(mat.darkRed, 0.3, 0.012, 0.035, 0, 0.126, 0); // 中間的刻痕
    tablet.add(cylinder(mat.ink, 0.25, 0.25, 0.03, 0, 0, 0, 28), cylinder(mat.red, 0.25, 0.25, 0.09, 0, 0.03, 0, 28), score);
    return tablet;
  };
  // [物件, 落定的位置, 落定的旋轉 (x, y, z)]
  const solids = ([
    [makeCapsule(mat.red, mat.ink), [PILLS_X - 0.55, TOP + CAP_R, -0.3], [0, -0.3, 0]],
    [makeTablet(), [PILLS_X - 0.5, TOP + 0.2, 0.32], [1.05, 0.3, 0]],
    [makeTablet(), [PILLS_X - 0.05, TOP, 0.42], [0, 0.5, 0]],
    [makeCapsule(mat.ink, mat.red), [PILLS_X + 0.9, TOP + CAP_R, 0.12], [0, 0.64, 0]],
  ] as [Group, [number, number, number], number[]][]).map(([object, rest, turn]) => {
    object.userData.rest = new Vector3(...rest);
    object.userData.turn = turn;
    pills.add(object);
    return object;
  });
  // 顆粒從第二顆膠囊的黑色端滾出來
  const mouth = new Vector3(PILLS_X + 0.9 - Math.cos(0.64) * 0.42, TOP + 0.06, 0.12 + Math.sin(0.64) * 0.42);
  const grains = [[-0.62, 0.3], [-0.42, 0.38], [-0.2, 0.34], [-0.52, 0.5], [-0.3, 0.55], [-0.06, 0.52], [-0.18, 0.2], [0.12, 0.42], [-0.7, 0.14]].map(([dx, dz]) => {
    const grain = sphere(mat.red, 0.05, 0, 0, 0, 10, 8);
    grain.userData.rest = new Vector3(mouth.x + dx * 0.9 + 0.1, TOP + 0.05, mouth.z + dz * 0.42 - 0.02);
    pills.add(grain);
    return grain;
  });
  register(55, pills);
  scene.add(pills);

  // ---- #56 印度門：擠出的門身（中間挖出拱門）、兩個柱腳、出挑的簷口、一層層往上收的頂，紅色橫帶 ----
  const gate = new Group();
  const G = 0.075; // 每個封面像素的世界單位
  const gx = (px) => (px - 351.75) * G, gy = (py) => (961 - py) * G;
  const bodyShape = new Shape();
  bodyShape.moveTo(gx(322), gy(954));
  bodyShape.lineTo(gx(381.5), gy(954));
  bodyShape.lineTo(gx(381.5), gy(896));
  bodyShape.lineTo(gx(322), gy(896));
  bodyShape.closePath();
  const arch = new Path();
  arch.moveTo(gx(340), gy(954));
  arch.lineTo(gx(340), gy(917));
  arch.absarc(gx(352.2), gy(917), 12.2 * G, Math.PI, 0, true);
  arch.lineTo(gx(364.4), gy(954));
  arch.closePath();
  bodyShape.holes.push(arch);
  const GATE_DEPTH = 1.7;
  const bodyGeometry = new ExtrudeGeometry(bodyShape, { depth: GATE_DEPTH, bevelEnabled: false, curveSegments: 20 });
  bodyGeometry.translate(0, 0, -GATE_DEPTH / 2);
  gate.add(new Mesh(bodyGeometry, mat.ink));
  // [左, 右, 上, 下, 深度]（封面像素；深度是世界單位）
  const tier = (material, x0, x1, y0, y1, depth) => box(material, (x1 - x0) * G, (y1 - y0) * G, depth, gx((x0 + x1) / 2), gy((y0 + y1) / 2), 0);
  gate.add(
    tier(mat.ink, 316, 344.5, 952.5, 961, GATE_DEPTH + 0.3), tier(mat.ink, 360.5, 386.5, 952.5, 961, GATE_DEPTH + 0.3), // 柱腳
    tier(mat.ink, 318, 386.5, 891, 897, GATE_DEPTH + 0.5), // 簷口
    tier(mat.ink, 329, 376, 873.5, 891, GATE_DEPTH - 0.2), // 門楣
    tier(mat.ink, 335, 371, 868, 873.5, GATE_DEPTH - 0.55),
    tier(mat.ink, 347, 360, 863.5, 868, GATE_DEPTH - 1.0), // 頂上的小亭
  );
  for (const [x0, x1, y, depth] of [
    [349, 358, 866, GATE_DEPTH - 0.94], [340, 366, 870.5, GATE_DEPTH - 0.49], [333, 371, 877.5, GATE_DEPTH - 0.14], [331, 373.5, 885.5, GATE_DEPTH - 0.14],
    [327, 379, 894.5, GATE_DEPTH + 0.56], [325, 336, 916, GATE_DEPTH + 0.06], [368, 379, 916, GATE_DEPTH + 0.06], [325, 336, 928.5, GATE_DEPTH + 0.06],
    [368, 379, 928.5, GATE_DEPTH + 0.06], [322, 339, 955.5, GATE_DEPTH + 0.36], [365, 381, 955.5, GATE_DEPTH + 0.36],
  ]) gate.add(tier(mat.flat(RED), x0, x1, y - 0.8, y + 0.8, depth));
  gate.position.set(GATE[0], 0, GATE[1]);
  gate.rotation.y = 0.3;
  register(56, gate);
  scene.add(gate);

  // ---- #59 顯微鏡：馬蹄形底座、立柱、弓形支臂（擠出）、斜的鏡筒和目鏡、物鏡轉盤和三支物鏡、載物台（上面一片玻片）、
  // 聚光鏡、底座上的燈、兩側的粗細調焦旋鈕。輪廓照封面，黑色為主，用白色的小零件交代層次 ----
  const microscope = new Group();
  const M = 0.052;
  const mp = (px, py): [number, number] => [(px - 446) * M, (962 - py) * M];
  const armSpine = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
    armSpine.push([a * 435.5 + b * 430.5 + c * 438, a * 957 + b * 946 + c * 939.5]);
  }
  const armOutline = [
    ...armSpine.map(([x, y], i) => mp(x - 2.6 + i * 0.05, y - 0.7)),
    ...armSpine.reverse().map(([x, y]) => mp(x + 2.4, y + 0.7)),
  ];
  // 沿 z 軸橫放的圓柱（旋鈕、轉軸）
  const across = (material, radius, length, px, py, z = 0) => {
    const mesh = cylinder(material, radius, radius, length, 0, 0, 0, 20);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(...mp(px, py), z);
    return mesh;
  };
  const turret = new Group(); // 物鏡轉盤：繞鏡筒的軸轉
  turret.add(
    rod(mat.ink, [0, 0.02], [0, -0.05], 3.4 * M),
    rod(mat.ink, [0, -0.04], [0, -0.3], 1.25 * M), rod(mat.paper, [0, -0.3], [0, -0.325], 1.0 * M),
  );
  for (const side of [1, -1]) {
    const lens = new Group();
    lens.add(rod(mat.ink, [0, -0.04], [0, -0.21], 1.0 * M));
    lens.position.z = side * 0.09;
    lens.rotation.x = -side * 0.5;
    turret.add(lens);
  }
  turret.position.set(...mp(446.1, 946.3), 0);
  turret.rotation.z = -0.12;
  const stage = new Group();
  stage.add(
    box(mat.ink, 13.5 * M, 1.5 * M, 0.5, 0, 0, 0),
    box(mat.paper, 0.34, 0.012, 0.13, 0.02, 0.75 * M + 0.006, 0), // 玻片
    cylinder(mat.flat(RED), 0.035, 0.035, 0.004, 0.03, 0.75 * M + 0.012, 0, 12), // 玻片上的檢體
    box(mat.ink, 0.2, 0.012, 0.03, -0.1, 0.75 * M + 0.02, 0.085), box(mat.ink, 0.2, 0.012, 0.03, -0.1, 0.75 * M + 0.02, -0.085), // 壓片夾
  );
  stage.position.set(...mp(445.8, 953.2), 0);
  const lampTop = cylinder(mat.paper, 1.3 * M, 1.3 * M, 0.012, 0, 0, 0, 16);
  lampTop.position.set(mp(446.2, 0)[0], mp(0, 956.3)[1], 0);
  microscope.add(
    // 底座：一塊橫的底板，前後各伸出一隻腳（馬蹄形），上面一層台階
    box(mat.ink, 23 * M, 2.2 * M, 0.34, ...mp(446, 960.9), 0),
    box(mat.ink, 15 * M, 2.2 * M, 0.16, ...mp(450, 960.9), 0.25), box(mat.ink, 15 * M, 2.2 * M, 0.16, ...mp(450, 960.9), -0.25),
    box(mat.ink, 11 * M, 1.8 * M, 0.3, ...mp(440.5, 958.9), 0),
    cylinder(mat.ink, 1.7 * M, 1.9 * M, 1.6 * M, mp(446.2, 0)[0], mp(0, 958)[1], 0, 16), lampTop, // 底座上的燈
    extrude(mat.ink, armOutline, 0.2),
    stage,
    cylinder(mat.ink, 1.5 * M, 1.1 * M, 1.6 * M, mp(446.2, 0)[0], mp(0, 954.2)[1] - 1.6 * M, 0, 14), // 載物台下的聚光鏡
    rod(mat.ink, mp(437.4, 937.4), mp(445.9, 945.9), 2.7 * M), // 鏡筒
    rod(mat.paper, mp(438.6, 938.6), mp(439.2, 939.2), 2.85 * M), // 鏡筒上一圈白環
    rod(mat.ink, mp(435.2, 935.2), mp(437.6, 937.6), 1.8 * M), // 目鏡
    rod(mat.ink, mp(434.5, 934.5), mp(435.3, 935.3), 2.3 * M), rod(mat.paper, mp(434.3, 934.3), mp(434.5, 934.5), 1.6 * M), // 目鏡的接目環和鏡片
    turret,
    across(mat.ink, 1.9 * M, 0.44, 433.6, 948.2), across(mat.paper, 1.2 * M, 0.46, 433.6, 948.2), // 粗調焦旋鈕（兩側各一）
    across(mat.ink, 1.1 * M, 0.56, 434.2, 952.3), // 細調焦旋鈕
  );
  microscope.position.set(-3.95, TOP, 0.0);
  microscope.rotation.y = -0.4;
  register(59, microscope);
  scene.add(microscope);

  // ---- #57 科學家（第四輪：立體人物）、#58 紅色球體（真的球，托在他手上） ----
  // 封面上是一個全黑的側影：穿長袍、駝背前傾、低頭，右手把紅球舉到臉前端詳。臉朝 +x（朝右邊的實驗桌），鏡頭從前方看到的就是封面那個側面。
  const SCI_H = 2.45;
  const scientist = new Group();
  const scientistBody = makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: mat.paper, coat: true, hair: "short", height: SCI_H, build: 1.08 });
  const sj = scientistBody.userData.joints;
  // 長袍的翻領：兩片白色的窄條從領口斜到胸口（只用來在全黑的身體上交代前襟的方向）
  for (const s of [1, -1]) {
    const lapel = box(mat.paper, 0.022, 0.24, 0.02, s * 0.05, 0.36, 0.1);
    lapel.rotation.z = s * 0.28;
    sj.spine.add(lapel);
  }
  // 口袋裡的兩支筆（紅）
  sj.spine.add(box(mat.red, 0.016, 0.1, 0.016, -0.1, 0.36, 0.1), box(mat.red, 0.016, 0.08, 0.016, -0.075, 0.35, 0.1));
  // 托著紅球的右手（身體的右手在 -x 那一側）：上臂往前抬、手肘彎起來，手掌在臉前
  const SCI_POSE = { spine: [0.22, 0, 0], neck: [0.32, 0, 0], head: [0.12, 0, 0], armR: [-0.95, 0.1, -0.12], elbowR: [-1.55, 0, 0], armL: [0.12, 0, 0.1], elbowL: -0.25, legL: [0.06, 0, 0], legR: [-0.1, 0, 0], kneeR: 0.08 };
  scientistBody.userData.pose(SCI_POSE);
  scientist.add(scientistBody);
  const orbHolder = new Group(); // 抵銷身體的縮放，球維持原本的大小
  orbHolder.scale.setScalar((0.85 * 1.75) / SCI_H); // 封面上紅球和頭差不多大
  orbHolder.position.set(0, -0.31 - 0.12, 0.02);
  sj.elbowR.add(orbHolder);
  const orb = new Group();
  orb.add(sphere(mat.red, 0.185, 0, 0, 0, 28, 20));
  for (const [dx, dy] of [[-0.06, 0.07], [0.05, 0.09], [0.08, -0.03], [-0.03, -0.07]]) {
    orb.add(sphere(white, 0.016, dx, dy, Math.sqrt(0.185 * 0.185 - dx * dx - dy * dy), 6, 4)); // 球面上的小亮點
  }
  orbHolder.add(orb);
  scientist.position.set(SCIENTIST_X, 0, -0.1);
  scientist.rotation.y = Math.PI / 2 - 0.15;
  register(57, scientist);
  register(58, orb);
  scene.add(scientist);

  // ---- #63 培養皿：車床做的淺盤和蓋子 ----
  const dish = new Group();
  dish.add(
    lathe(mat.red, [[0, 0], [0.25, 0], [0.28, 0.03], [0.28, 0.09], [0, 0.09]], 28),
    place(lathe(mat.red, [[0, 0], [0.33, 0], [0.33, 0.055], [0, 0.055]], 28), 0, 0.075, 0),
  );
  dish.position.set(-0.15, TOP, 0.2);
  register(63, dish);
  scene.add(dish);

  // ---- #61 試劑瓶 7 個：架上 3 個（1 高 2 矮）、架子前的桌面上 4 個（鏡頭貼著它們滑過去）；架子本身是佈景 ----
  const shelf = new Group();
  shelf.add(box(mat.ink, 2.5, 0.1, 0.5, 2.2, TOP + 0.69, -0.6));
  for (const x of [1.42, 1.6, 3.33]) shelf.add(box(mat.ink, x > 3 ? 0.11 : 0.07, 0.64, 0.4, x, TOP + 0.32, -0.6));
  scene.add(shelf);
  const bottles = new Group();
  for (const [x, y, z, w, h] of [
    [1.52, TOP + 0.74, -0.58, 0.2, 0.68], [2.25, TOP + 0.74, -0.58, 0.23, 0.34], [2.62, TOP + 0.74, -0.58, 0.23, 0.34],
    [0.95, TOP, 0.34, 0.23, 0.68], [1.38, TOP, 0.4, 0.23, 0.68], [2.3, TOP, 0.36, 0.23, 0.68], [2.72, TOP, 0.42, 0.23, 0.68],
  ]) bottles.add(place(lathe(mat.red, bottleProfile(w, h), 20), x, y, z));
  register(61, bottles, { count: 7 });
  scene.add(bottles);

  // ---- #62 試管架：黑框兩格，各放一個紅色錐形瓶；頂上一個黑瓶、一個紅瓶 ----
  const rack = new Group();
  const RW = 0.56, RD = 0.42;
  for (const y of [0, 0.5, 1.02]) rack.add(box(mat.ink, RW, 0.08, RD, 0, y + 0.04, 0));
  for (const s of [1, -1]) rack.add(box(mat.ink, 0.08, 1.1, RD, (s * (RW - 0.08)) / 2, 0.55, 0));
  rack.add(
    place(lathe(mat.red, flaskProfile(0.3, 0.38), 20), 0, 0.08, 0),
    place(lathe(mat.red, flaskProfile(0.32, 0.4), 20), 0, 0.58, 0),
    place(lathe(mat.ink, bottleProfile(0.17, 0.46), 16), -0.1, 1.1, 0),
    place(lathe(mat.red, bottleProfile(0.18, 0.28), 16), 0.12, 1.1, 0),
  );
  rack.position.set(4.7, TOP, -0.1);
  rack.rotation.y = -0.2;
  register(62, rack);
  scene.add(rack);

  // ---- #64 口紅：黑色底座、紅色中管（兩道暗紅反光）、斜切的膏體在 raise 節拍旋出來 ----
  const lipstick = new Group();
  const TUBE_R = 0.225, BASE_H = 0.75, TUBE_H = 0.63, BULLET_UP = 0.62, BULLET_TRAVEL = 0.8;
  lipstick.add(
    lathe(mat.ink, [[0, 0], [0.29, 0], [0.31, 0.03], [0.31, BASE_H - 0.03], [0.29, BASE_H], [0, BASE_H]], 32),
    cylinder(mat.ink, 0.27, 0.27, 0.1, 0, BASE_H - 0.02, 0, 32),
    cylinder(mat.red, TUBE_R, TUBE_R, TUBE_H, 0, BASE_H + 0.06, 0, 32),
    band(mat.flat("#8f1f1c"), TUBE_R + 0.004, TUBE_H * 0.72, -0.75, 0.2, BASE_H + 0.06 + TUBE_H / 2),
    band(mat.flat("#8f1f1c"), TUBE_R + 0.004, TUBE_H * 0.72, 0.55, 0.2, BASE_H + 0.06 + TUBE_H / 2),
  );
  const bullet = slantCylinder(mat.darkRed, 0.165, BULLET_UP + 0.2, 0.17);
  const bulletTop = BASE_H + 0.06 + TUBE_H - 0.2; // 旋出來之後膏體底面的高度
  lipstick.add(bullet);
  lipstick.position.set(7.7, TOP, 0.1);
  register(64, lipstick);
  scene.add(lipstick);

  // ---- #65 圓罐：車床做的黑色圓柱罐，一道暗紅的反光 ----
  const jar = new Group();
  jar.add(
    lathe(mat.ink, [[0, 0], [0.24, 0], [0.27, 0.04], [0.27, 0.98], [0.23, 1.04], [0, 1.04]], 32),
    band(mat.flat("#8f1f1c"), 0.274, 0.78, -0.75, 0.16, 0.52),
  );
  jar.position.set(9.3, TOP, 0);
  register(65, jar);
  scene.add(jar);

  // ---- #66 展示櫃：黑框、白色背板、兩層各三個紅色小瓶 ----
  const cabinet = new Group();
  const CW = 1.0, CH = 1.12, CD = 0.5, CT = 0.09;
  cabinet.add(
    box(mat.ink, CW, CT, CD, 0, CT / 2, 0), box(mat.ink, CW, CT, CD, 0, CH - CT / 2, 0), box(mat.ink, CW - 0.1, 0.06, CD, 0, CH * 0.5, 0),
    box(mat.ink, CT, CH, CD, -(CW - CT) / 2, CH / 2, 0), box(mat.ink, CT, CH, CD, (CW - CT) / 2, CH / 2, 0),
    box(white, CW - 0.1, CH - 0.1, 0.03, 0, CH / 2, -CD / 2 + 0.03),
  );
  for (const [x, y, h] of [[-0.24, CT, 0.24], [-0.04, CT, 0.22], [0.24, CT, 0.3], [-0.2, CH * 0.5 + 0.03, 0.26], [0.1, CH * 0.5 + 0.03, 0.22], [0.27, CH * 0.5 + 0.03, 0.28]]) {
    cabinet.add(place(lathe(mat.red, bottleProfile(0.13, h), 14), x, y, 0.05));
  }
  cabinet.position.set(10.9, TOP, -0.1);
  cabinet.rotation.y = -0.3;
  register(66, cabinet);
  scene.add(cabinet);

  // ---- 細節（第四輪）：桌面的黑色收邊與白色抽屜鈕、地板的磁磚縫、試劑瓶的瓶蓋與反光、印度門的台階。靜止的部分合併成少數幾個 mesh ----
  const details = new Group();
  for (const [x0, x1] of [[-10.6, -3.2], [-0.9, 12.6]]) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    details.add(box(mat.ink, w + 0.02, 0.025, 0.03, cx, TOP - 0.035, FRONT + 0.11)); // 桌面正面下緣的一道黑線
    details.add(box(mat.ink, w - 0.3, 0.09, 0.05, cx, 0.045, FRONT - 0.12)); // 踢腳板
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 2.2) details.add(sphere(mat.paper, 0.03, x, 0.74, FRONT + 0.03, 8, 6)); // 抽屜鈕
  }
  // 地板的磁磚縫：桌子前後一片淡淡的方格，給影子和透視一個落點（細黑線，二值化之後仍是乾淨的線）
  for (let x = -12; x <= 14; x += 1.6) details.add(box(mat.ink, 0.018, 0.004, 7, x, 0.002, -0.2));
  for (let z = -3.4; z <= 3.2; z += 1.6) details.add(box(mat.ink, 26, 0.004, 0.018, 1, 0.002, z));
  scene.add(bakeFigure(details));
  // 試劑瓶：每個瓶口一圈暗紅的瓶蓋、瓶身一道暗紅的反光（和口紅同一種畫法）
  const bottleTrim = new Group();
  bottles.children.forEach((bottle) => {
    (bottle as Mesh).geometry.computeBoundingBox();
    const top = (bottle as Mesh).geometry.boundingBox.max.y, r = (bottle as Mesh).geometry.boundingBox.max.x;
    bottleTrim.add(place(cylinder(mat.darkRed, r * 0.6, r * 0.6, 0.05, 0, 0, 0, 14), bottle.position.x, bottle.position.y + top - 0.02, bottle.position.z));
    const shine = band(mat.flat("#8f1f1c"), r + 0.004, top * 0.3, -0.75, 0.22, 0);
    shine.position.set(bottle.position.x, bottle.position.y + top * 0.25, bottle.position.z);
    bottleTrim.add(shine);
  });
  bottles.add(bakeFigure(bottleTrim));
  // 印度門：門身墊高，底下兩層台階（上層前緣一道白線）
  gate.children.forEach((child) => (child.position.y += 0.22));
  gate.add(box(mat.ink, 6.6, 0.22, 2.9, 0, 0.11, 0), box(mat.paper, 6.6, 0.03, 0.04, 0, 0.215, 1.45), box(mat.ink, 7.4, 0.14, 3.5, 0, 0.07, 0));

  // ---- 鏡頭：從針尖降到桌面高度，之後沿著這一排桌子一路往右走到專櫃 ----
  // 2026-11-19 第三輪：整章是「一次拉開、一次沿桌橫移」。針尖 → 退到看見整支針筒（唯一一次拉遠），
  // 橫移到藥丸時收近一點，之後鏡頭距離幾乎不變（4.4 → 4.2，只往一個方向變），沿著桌子往右走；
  // 藥丸 → 科學家 → 試劑瓶 → 口紅之間，注視點先轉過去、鏡頭跟著橫移（從右前方看紅球、從左前方看口紅），
  // 結尾才慢慢退開看整排專櫃。關鍵格用「注視點 + 方位角 + 仰角 + 距離」寫，距離和方向分開內插（見 orbitTrack），
  // 轉方向時鏡頭不會因為走弦線而忽近忽遠。
  const track = orbitTrack([
    { t: -0.3, at: [SYRINGE_X, 5.0, 0.15], yaw: 21, pitch: -2, dist: 2.75, fov: 34 }, // 針尖（從右前方看，印度門落在畫面右邊）
    { t: 0.03, at: [SYRINGE_X, 4.2, 0.15], yaw: 18, pitch: 1.5, dist: 3.1, fov: 34 },
    { t: 0.25, at: [SYRINGE_X + 0.25, 2.65, 0.15], yaw: 3, pitch: -3, dist: 6.4, fov: 34 }, // 降到桌面並退後：整支針筒立在自己的推桿上
    { t: whip[0], at: [SYRINGE_X + 0.35, 2.6, 0.15], yaw: 4, pitch: -3, dist: 6.35, fov: 34 },
    { t: whip[1], at: [PILLS_X + 0.4, 1.3, 0], yaw: 5, pitch: 8, dist: 4.45, fov: 36 }, // 沿桌面橫移到藥丸（同時收近）
    { t: 0.45, at: [PILLS_X + 0.35, 1.6, -0.6], yaw: 9, pitch: 0, dist: 4.4, fov: 36 },
    { t: 0.52, at: [PILLS_X + 0.25, 1.85, -1.2], yaw: 13, pitch: -6, dist: 4.37, fov: 36 }, // 壓低，藥丸後面是印度門
    { t: 0.6, at: [-3.4, 1.75, -0.15], yaw: 10, pitch: 0, dist: 4.33, fov: 36 }, // 實驗室：顯微鏡與科學家
    { t: 0.68, at: [-1.4, 1.9, 0], yaw: 15, pitch: 1, dist: 4.3, fov: 36 }, // 科學家手上的紅球
    { t: 0.705, at: [-0.9, 1.85, 0], yaw: 12, pitch: 0.5, dist: 4.28, fov: 36 },
    { t: 0.78, at: [4.0, 1.55, 0.1], yaw: -20, pitch: 0.5, dist: 4.25, fov: 36 }, // 滑過試劑瓶與試管架
    { t: 0.865, at: [7.7, 1.95, 0.1], yaw: -34, pitch: -1, dist: 4.2, fov: 36 }, // 口紅
    { t: 0.925, at: [7.85, 2.0, 0.1], yaw: -30, pitch: -0.5, dist: 4.2, fov: 36 },
    { t: 1.0, at: [8.75, 1.95, 0.05], yaw: -13, pitch: 1.5, dist: 4.8, fov: 36 }, // 慢慢退開：口紅、圓罐、展示櫃
    { t: 1.3, at: [9.15, 1.95, 0], yaw: -7, pitch: 1.7, dist: 5.2, fov: 36 },
  ]);



  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList([], [{ at: 0.05, cue: "syringe" }, { at: 0.3, cue: "pills" }, { at: 0.64, cue: "glass" }, { at: 0.8, cue: "glass" }, { at: 0.88, cue: "chime" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.05);
      motes.update(frame.time);

      // 針筒：推桿在 pan 節拍裡推進去，活塞頭走到針筒頂端（封面上的位置）
      const push = smooth(linearstep(p, 0.04, 0.24));
      barrelGroup.position.y = ROD + TRAVEL * (1 - push);
      needleTip.y = TOP + barrelGroup.position.y + BARREL + 0.88;
      // 針尖噴出三滴，各自沿拋物線落下
      drops.forEach((drop, i) => {
        const t = linearstep(p, 0.1 + i * 0.045, 0.2 + i * 0.045);
        const side = [-1, 1, -0.35][i];
        drop.visible = t > 0 && t < 1;
        drop.position.set(needleTip.x + side * 0.5 * t, needleTip.y + 0.5 * Math.sin(t * Math.PI * 0.75) - 1.3 * t * t, needleTip.z + 0.25 * t);
        drop.scale.setScalar(0.7 + 0.7 * Math.sin(t * Math.PI));
      });

      // 膠囊與藥錠：甩鏡時一顆接一顆掉到桌上，落地時轉正、彈一下
      solids.forEach((object, i) => {
        const start = whip[0] + 0.025 + i * 0.02;
        const fall = linearstep(p, start, start + 0.07);
        const eased = fall * fall;
        const bounce = Math.sin(linearstep(p, start + 0.07, start + 0.12) * Math.PI) * 0.12;
        const { rest, turn } = object.userData;
        object.visible = fall > 0;
        object.position.set(rest.x + (i % 2 ? 0.5 : -0.4) * (1 - eased), rest.y + 3.2 * (1 - eased) + bounce, rest.z);
        object.rotation.set(turn[0] + (1 - eased) * 2.6, turn[1], turn[2] + (i % 2 ? 1 : -1) * (1 - eased) * 1.8);
      });
      // 顆粒：從倒下的膠囊口滾出來，離得近的先到
      grains.forEach((grain, i) => {
        const start = 0.41 + i * 0.013;
        const roll = smooth(linearstep(p, start, start + 0.07));
        grain.visible = roll > 0;
        grain.position.lerpVectors(mouth, grain.userData.rest, roll);
        grain.position.y += Math.sin(roll * Math.PI) * 0.12;
      });

      // 科學家：呼吸（身體微微起伏）、低頭端詳，手腕慢慢轉著紅球；鏡頭來到實驗室時（0.6–0.7）把球舉高一點湊近看
      const time = frame.time;
      const lift = smooth(linearstep(p, 0.58, 0.7));
      const breath = Math.sin(time * 1.5);
      sj.spine.rotation.x = SCI_POSE.spine[0] + breath * 0.012 - lift * 0.04;
      sj.neck.rotation.x = SCI_POSE.neck[0] + Math.sin(time * 0.7) * 0.04 - lift * 0.08;
      sj.head.rotation.y = Math.sin(time * 0.45) * 0.08;
      sj.shoulderR.rotation.x = SCI_POSE.armR[0] - lift * 0.15 + Math.sin(time * 0.9) * 0.02;
      sj.elbowR.rotation.y = Math.sin(time * 0.6) * 0.25; // 轉手腕：球跟著在掌心轉
      sj.elbowL.rotation.x = SCI_POSE.elbowL + breath * 0.03;
      orb.scale.setScalar(1 + 0.05 * Math.sin(time * 2.2));
      orb.rotation.y = time * 0.4;
      // 顯微鏡：鏡頭移過來時物鏡轉盤轉一格
      turret.rotation.y = smooth(linearstep(p, 0.58, 0.66)) * ((Math.PI * 2) / 3);

      // 口紅：膏體藏在管子裡，raise 節拍時一邊轉一邊升上來
      const twist = smooth(linearstep(p, raise[0], raise[1]));
      bullet.position.y = bulletTop - BULLET_TRAVEL * (1 - twist);
      bullet.rotation.y = -0.5 + (1 - twist) * Math.PI * 1.5;

    },
  };
}
