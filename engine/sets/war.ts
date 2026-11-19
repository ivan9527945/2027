// war 的 3D 場景：前線（PRD-3D 6.12）。
// 一片被炸過的平原，X 是飛彈飛行的方向：西半邊是焦黑的地面（散著白色碎屑與彈坑），東半邊是白色的地面。
// 黑白交界處立著白線廢墟與被炸的城市，飛彈落在城市後面炸開；更往東是兩輛隔著砲擊點對射的戰車，背後一座白色的丘，天上三架無人機。
// 天空是白的（和封面一樣是白底），平原的東、北、南三面圍著一圈黑色的山塊（封面上那片黑色的陸地）：
// 白色的彈體、白線廢墟、白煙都襯在黑色的山塊或焦土前面，黑色的戰車襯在白丘前面，白丘後面才是黑山。遠的山塊淡進白霧裡。
//
// 節奏範本：tree。節拍對應：
//   開場–0.035        鏡頭貼著焦黑的地面往前飛，還沒有飛彈
//   strike 0.035      第一枚飛彈從鏡頭後方越過（音效 flip），之後一枚接一枚超過鏡頭
//   grow 0.08–0.36    鏡頭跟在領頭那枚飛彈後面低空飛；0.30 飛彈鑽過城市的缺口落地，大爆炸在 0.30–0.37 炸開，白光照亮周圍
//   climb 0.12–0.56   鏡頭的前進：跟飛 → 停在廢墟、爆炸、城市前（0.30–0.50 慢慢繞）→ 甩到戰車
//   out 0.55          兩輛戰車開火（音效 boom）：砲塔後座、車身後仰，砲彈在兩根砲管中間炸開；鏡頭降到地面高度
//   dissolve 0.55–0.66、rise 0.55–0.84   白煙一團一團冒出來、往上升
//   streak 0.77–0.97  鏡頭抬頭；三架無人機從左上飛進來後懸停
import {
  CircleGeometry, Color, ExtrudeGeometry, Group, InstancedMesh, BoxGeometry, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Quaternion, RingGeometry, Scene, Shape, Path, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from "three";
import { clamp, deviceTier, envelope, linearstep, seededRandom, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog } from "../shared/set/env";
import { box, cone, cylinder, extrude, lathe, makePalette, sphere } from "../shared/set/model";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";
import { bakeFigure, inkOutline } from "../shared/set/figure";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// 聲音（2026-11-19，陰森版）：遠方的砲火和低鳴；飛彈一枚接一枚呼嘯（0.035–0.18）；城市大爆炸加低頻重擊（0.3）；戰車對射（0.55）；無人機飛來（0.78），低沉的合唱像在送葬。
const soundScript = soundTrack([[0, { wind: 0.3, rumble: 0.35, dread: 0.2 }], [0.3, { rumble: 0.45, fire: 0.25, wind: 0.15, dread: 0.25 }], [0.77, { rumble: 0.3, fire: 0.18, wind: 0.15, dread: 0.2, choir: 0.15 }]]);

// ---- 空間配置 ----
const EDGE_X = -2.2; // 焦黑地面與白色地面的交界
const CITY_X = -0.3;
const BLAST = new Vector3(1.6, 0, 0); // 領頭飛彈的落點
const SCORCH_Z = -2.4, SCORCH_EAST = 7; // 城市旁邊 z < SCORCH_Z、x < SCORCH_EAST 的那一塊也是焦土，白線廢墟才有黑色的背景；再往東是白色的地面
const TX = 13, TZ = 7; // 兩輛戰車的中點。鏡頭從 −Z 那一側看過去，所以 +X 在畫面左邊
const TANK_GAP = 2.08; // 戰車中心到中點的距離（封面上是 80 像素）

// ---- 跟飛的鏡頭：等速前進，D0 之後在 W 的時間內煞停 ----
const V = 120, D0 = 0.235, W = 0.07, CAM_BASE = -11.7, LEAD = 6;
const camLineX = (p) => CAM_BASE + V * (p - D0); // 不煞車的等速線，飛彈照這條線飛
const camX = (p) => {
  const d = p - D0;
  return CAM_BASE + V * (d < 0 ? d : d < W ? d - (d * d) / (2 * W) : W / 2);
};
const IMPACT = D0 + (BLAST.x - CAM_BASE - LEAD) / V; // 領頭飛彈落地的進度（約 0.30）
const HOLD_POS = [camX(1), 1.45, 0.6], HOLD_AT = [1.0, 1.5, -0.5];

// 有彈體的 4 枚：[超過鏡頭後領先的距離, z, 巡航高度, 開始俯衝的 x, 落地的 x, 大小, 越過鏡頭的起始進度]
// 第一枚（最遠的）在 strike 越過鏡頭；最後一枚是鏡頭跟的那枚
const MISSILES = [
  [LEAD + 11, -1.5, 3.4, -4.0, 4.0, 1, 0.0],
  [LEAD + 6.5, 1.3, 2.3, -1.5, 4.5, 1, 0.02],
  [LEAD + 3.5, -0.7, 2.9, -3.0, 3.5, 0.86, 0.04],
  [LEAD, 0, 1.25, -1.0, BLAST.x, 1, 0.06],
];
// 遠處的 5 道：[起點 x, z, 起始高度, 落地的 x, 長度]。比有彈體的細，離飛行路線遠
const STREAKS = [
  [-52, -26, 11, 46, 3.2], [-40, -17, 8, 30, 4.6], [-28, 21, 9.5, 52, 4.0], [-58, 30, 13, 38, 3.4], [-34, -36, 14, 64, 5.2],
];

// ---- 封面量來的輪廓（像素） ----
const BLAST_RED = [
  [262, 1059], [284, 1046], [263, 1018], [288, 1026], [279, 1001], [300, 1018], [320, 1001], [331, 1017], [343, 1000],
  [352, 1022], [372, 1013], [360, 1036], [379, 1041], [358, 1052], [364, 1070], [340, 1080], [300, 1085], [268, 1079], [285, 1066],
];
const BLAST_WHITE = [
  [289, 1049], [300, 1043], [294, 1028], [306, 1035], [306, 1020], [315, 1031], [324, 1021], [331, 1033], [343, 1029],
  [339, 1042], [353, 1046], [341, 1052], [350, 1062], [338, 1066], [335, 1085], [295, 1085], [300, 1062], [286, 1066], [298, 1054],
];
const BURST_TIPS = [[526, 1044], [543, 1032], [569, 1033], [590, 1044], [580, 1066], [574, 1083], [556, 1092], [540, 1083], [527, 1070]];
// 遠處一直在天上的 3 枚（鏡頭停在城市前的那一段看得到）：[z, 起飛的進度, 落地的進度]，從 (-10, 9) 斜飛到 (40, 1.5)
const EAST = [[-9, 0.2, 0.5], [-5, 0.235, 0.51], [-13, 0.27, 0.52]];
// 戰車背後天上的 4 枚（0.5 之後一直都在，標註卡才指得到 #78）：[p = 0.8 時相對戰車中點的 x, 高度, z, 大小, 有沒有彈體]
const LATE: [number, number, number, number, boolean][] = [[8.5, 7.2, 17, 1.2, true], [-7, 5.8, 15, 1, true], [12.5, 9.2, 19, 1, false], [-11.5, 8.2, 18, 1, false]];
const LATE_FROM = 0.5; // 鏡頭甩向戰車的時候它們才出現
// 黑色的山塊（封面上那片黑色的陸地）：[x, z, 半徑 x, 高, 半徑 z]。東邊一排、戰車背後（+Z）一排、廢墟背後（−Z）一排，再外面一圈淡進霧裡的
const MASSIFS = [
  [46, -34, 16, 15, 14], [52, -14, 14, 19, 13], [48, 4, 13, 14, 12], [50, 22, 15, 17, 13], [40, 36, 16, 13, 12],
  [24, 38, 16, 15, 10], [8, 40, 15, 18, 10], [-8, 39, 14, 13, 10], [-22, 36, 13, 10, 10],
  [30, -44, 14, 11, 10], [12, -42, 14, 9, 9], [-6, -40, 13, 10, 9], [-24, -38, 12, 8, 8],
  [78, -12, 25, 27, 20], [72, 44, 22, 22, 18], [20, 74, 30, 24, 18], [8, -78, 30, 20, 18], [-50, 66, 26, 16, 16], [-60, -62, 26, 15, 16],
];
// 白色地面上的松樹（封面上爆炸和戰車之間、戰車前後都有）：[x, z, 高]。都比白丘矮，從戰車的鏡位看過去襯在白丘前面
const PINES = [
  [TX + 5.6, TZ + 3.4, 1.25], [TX + 6.9, TZ + 4.6, 0.95], [TX + 8.3, TZ + 3.0, 1.1], [TX - 5.8, TZ + 3.8, 1.2], [TX - 7.2, TZ + 2.8, 0.9], [TX - 8.6, TZ + 4.4, 1.15],
  [TX + 0.4, TZ + 6.5, 0.8], [TX - 2.6, TZ + 7.6, 0.9], [TX + 3.2, TZ + 7.9, 0.75],
  [5.2, 3.6, 1.1], [6.4, 5.0, 0.85], [4.0, 5.9, 1.0], [7.6, 1.2, 0.9], [3.4, -1.6, 0.8],
];
const DRONES = [[-2.5, 3.6, -0.6, 1], [0.0, 3.1, 0, 0.9], [2.3, 2.7, 0.5, 0.7]]; // [畫面上相對戰車中點的左右, 高度, z, 大小]：由左上往右下越來越小

// 沿 X 軸的圓桿（中心在 x）
function rod(material, radius, length, x, y, z = 0, segments = 12) {
  const mesh = cylinder(material, radius, radius, length, 0, 0, 0, segments);
  mesh.rotation.z = -Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}
// 車床旋轉體，軸轉成沿 +X（profile 的「高度」變成 x）
function latheX(material, profile, segments = 16) {
  const mesh = lathe(material, profile, segments);
  mesh.rotation.z = -Math.PI / 2;
  return mesh;
}
// 有窗洞的牆：outline 與 holes（[x, y, w, h]）都是 XY 平面上的座標，沿 Z 擠出厚度
function wall(material, outline, holes, depth) {
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  for (const [x, y, w, h] of holes) shape.holes.push(new Path([new Vector2(x, y), new Vector2(x, y + h), new Vector2(x + w, y + h), new Vector2(x + w, y)]));
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return new Mesh(geometry, material);
}
// 貼在地上的平面（焦土的邊緣、彈坑、碎屑）：不寫入深度並加 polygonOffset，遠處才不會和地面打架
const decalMaterial = (color) => new MeshBasicMaterial({ color, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
function decal(geometry, material, x, z, sx = 1, sz = 1, order = 1) {
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.004 * order, z);
  mesh.scale.set(sx, sz, 1);
  mesh.renderOrder = order;
  return mesh;
}

// 把頂點沿徑向隨機推拉，做出不規則的塊狀（同一個位置的頂點推一樣多，不會裂開）
function lumpy(geometry, amount, seed = 0) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const n = Math.sin(Math.round(x * 40) * 12.9898 + Math.round(y * 40) * 78.233 + Math.round(z * 40) * 37.719 + seed) * 43758.5453;
    const k = 1 + (n - Math.floor(n) - 0.5) * amount;
    position.setXYZ(i, x * k, y * k, z * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}
// 松樹：樹幹加四層越往上越小的角錐，每層轉一點角度。原點在樹根。
function makePine(material, height) {
  const pine = new Group();
  pine.add(cylinder(material, height * 0.035, height * 0.05, height * 0.2, 0, 0, 0, 6));
  for (let i = 0; i < 4; i++) {
    const tier = cone(material, height * (0.3 - i * 0.055), height * 0.36, 0, height * (0.14 + i * 0.185), 0, 7);
    tier.rotation.y = i * 0.6;
    pine.add(tier);
  }
  return pine;
}

// #78 有彈體的飛彈：彈頭朝 +X、尖端在原點。單位是封面像素，外面再縮放。
function makeMissile(mat, redFlat) {
  const missile = new Group();
  missile.add(
    latheX(mat.paper, [[0, -50], [3.6, -50], [3.6, -14], [0, -14]]), // 白色彈體
    latheX(mat.red, [[0, -14.2], [3.9, -14], [3.7, -9], [2.6, -4], [1.2, -1], [0, 0]]), // 紅色彈頭
    rod(redFlat, 3.78, 1.5, -18.2, 0), rod(redFlat, 3.78, 1.5, -21.2, 0), // 靠彈頭的兩道紅環
    rod(redFlat, 0.75, 12, -55, 0, 0, 8), // 尾端的細桿
    box(redFlat, 9, 1.4, 7.5, -43.5, 0, 0), box(redFlat, 5, 1.4, 7.5, -34.5, 0, 0), // 彈體側面的紅色中線
  );
  // 四片往後掠的尾翼
  for (let i = 0; i < 4; i++) {
    const fin = extrude(redFlat, [[-37, 3], [-46, 4.5], [-53, 9.5], [-56, 8.8], [-54, 4.5], [-51, 0], [-37, 0]], 0.7);
    fin.rotation.x = (i * Math.PI) / 2;
    missile.add(fin);
  }
  return missile;
}

/**
 * 合併一個 Group 底下直接掛的 mesh（同材質的併成一個），userData.keep 的留著（會轉的路輪）。第四輪加了很多細節，用這個把 draw call 壓回來。
 */
function mergeChildren(group) {
  const byMaterial = new Map();
  for (const mesh of group.children.filter((c) => c.isMesh && !c.userData.keep && !c.children.length)) {
    mesh.updateMatrix();
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(mesh.matrix);
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(g);
    group.remove(mesh);
  }
  for (const [material, geometries] of byMaterial) group.add(new Mesh(mergeGeometries(geometries), material));
  return group;
}

// #83 戰車：砲口朝 +X，原點在車底中央。單位是封面像素（以左邊那輛為準：x − 480、1107 − y）。
function makeTank(mat, redFlat) {
  const tank = new Group(), hull = new Group(), turret = new Group(), wheels = [];
  const side = [[-40, 0], [40, 0], [52, 4], [58, 14], [56, 22], [49, 27], [-50, 27], [-57, 22], [-59, 14], [-53, 4]]; // 履帶的側面輪廓
  for (const z of [23, -23]) {
    const track = extrude(mat.ink, side, 12);
    track.position.z = z;
    hull.add(track);
    const face = z > 0 ? 6.3 : -6.3; // 履帶外側面上的紅色細節
    for (const x of [-22, -3, 16, 35]) {
      // 路輪：開口朝上的紅色 C 形，車子前進時會轉
      const wheel = new Mesh(new TorusGeometry(3.3, 1.0, 6, 18, Math.PI * 2 - 1.4), redFlat);
      wheel.position.set(x, 9, z + face);
      wheel.userData.rest = Math.PI / 2 + 0.7;
      wheels.push(wheel);
      hull.add(wheel);
    }
    for (const [x, y, r] of [[-43, 10, 1.8], [47, 13, 2], [-32.5, 5.5, 0.8], [-12.5, 5.5, 0.8], [6.5, 5.5, 0.8], [25.5, 5.5, 0.8]]) {
      const dot = cylinder(redFlat, r, r, 0.6, 0, 0, 0, 10);
      dot.rotation.x = Math.PI / 2;
      dot.position.set(x, y, z + face);
      hull.add(dot);
    }
  }
  hull.add(
    extrude(mat.ink, [[-50, 6], [50, 6], [56, 15], [49, 27], [-50, 27], [-58, 15]], 36), // 車體
    box(mat.ink, 72, 6, 42, -4, 28.5, 0), // 車體上緣
    box(redFlat, 100, 1.5, 59, 0, 19.5, 0), // 車身的紅色橫線（兩側都露出來）
  );
  turret.add(
    extrude(mat.ink, [[-25, 45], [17, 45], [25, 37], [28, 30], [-35, 30], [-32, 37]], 30), // 砲塔
    box(mat.ink, 16, 6, 14, -9, 46.5, 0), // 艙蓋
    box(mat.ink, 13, 6.5, 12, 23.5, 40.8, 0), // 砲盾
    rod(mat.ink, 1.7, 38, 44, 40.8), rod(mat.ink, 2.4, 4, 61, 40.8), // 砲管與砲口
    box(redFlat, 26, 1.8, 30.8, -5, 33.5, 0), // 砲塔的紅色橫線
  );
  const mark = sphere(redFlat, 1, 4, 40.5, 0, 12, 8); // 砲塔側面的紅色橢圓（只是一個斜的橢圓點，不是標誌）
  mark.scale.set(3.2, 1.5, 15.5);
  mark.rotation.z = 0.3;
  turret.add(mark);
  // ---- 第四輪的細節：擋泥板、車尾的兩個油桶與排氣管、砲塔上的機槍與指揮塔、砲管的抽煙器、天線 ----
  for (const z of [23, -23]) {
    hull.add(box(mat.ink, 104, 1.6, 15, 0, 27.6, z)); // 擋泥板
    hull.add(box(redFlat, 104, 0.7, 0.5, 0, 26.5, z + (z > 0 ? 7.6 : -7.6))); // 擋泥板下緣的一道紅
  }
  for (const z of [10, -10]) {
    const drum = cylinder(mat.ink, 5, 5, 14, 0, 0, 0, 14);
    drum.rotation.z = Math.PI / 2;
    drum.position.set(-58, 22, z);
    hull.add(drum, rod(redFlat, 5.2, 0.8, -55, 22, z, 14), rod(redFlat, 5.2, 0.8, -61, 22, z, 14));
  }
  hull.add(rod(mat.ink, 1.6, 8, -55, 30, 14, 10), box(mat.ink, 8, 2, 8, 44, 30, 12), box(mat.ink, 8, 2, 8, 44, 30, -12)); // 排氣管、前方的工具箱
  turret.add(
    cylinder(mat.ink, 6, 6.5, 3, -9, 49, 7, 14), // 指揮塔
    rod(mat.ink, 0.8, 16, -2, 54, 7, 8), box(mat.ink, 3, 4, 2, -9, 52, 7), // 艙口上的機槍
    rod(mat.ink, 2.7, 6, 38, 40.8, 0, 14), // 砲管中段的抽煙器
    box(mat.ink, 10, 2, 32, -30, 37, 0), // 砲塔後方的儲物架
  );
  for (const z of [-11, -5, 1, 7, 13]) turret.add(sphere(redFlat, 0.9, -2 + z * 0.4, 45.6, z, 6, 4)); // 砲塔頂上一排紅色的鉚釘
  const antenna = new Group(); // 天線：一根細桿，開火和前進時會晃
  antenna.position.set(-24, 45, -10);
  antenna.add(cylinder(mat.ink, 0.35, 0.6, 34, 0, 0, 0, 6), sphere(redFlat, 1.1, 0, 34, 0, 8, 6));
  turret.add(antenna);
  for (const wheel of wheels) wheel.userData.keep = true;
  mergeChildren(hull);
  mergeChildren(turret);
  tank.add(hull, turret);
  tank.userData = { hull, turret, wheels, antenna };
  return tank;
}

// #82 無人機：橫臂、兩端的馬達、中間水滴形的機腹、兩片會轉的旋翼。單位是封面像素。
function makeDrone(mat) {
  const drone = new Group(), rotors = [];
  drone.add(
    box(mat.red, 40, 2.6, 2.6, 0, 0.9, 0),
    lathe(mat.red, [[0, -8], [2.5, -6.6], [4, -3], [8, 0], [10, 1.5], [6.5, 3.4], [0, 4.4]], 18),
  );
  for (const x of [20, -20]) {
    drone.add(cylinder(mat.red, 1.6, 1.6, 9, x, -3, 0, 10));
    const rotor = new Group();
    rotor.add(box(mat.red, 22, 0.5, 2.4), box(mat.red, 2.4, 0.5, 22));
    rotor.position.set(x, 7.4, 0);
    rotors.push(rotor);
    drone.add(rotor);
  }
  // 第四輪的細節：機腹下的鏡頭球（黑）、兩支起落架、橫臂兩端的馬達座
  drone.add(sphere(mat.ink, 2.6, 0, -7.4, 0, 12, 8));
  for (const x of [8, -8]) {
    const leg = cylinder(mat.red, 0.6, 0.6, 7, 0, 0, 0, 6);
    leg.position.set(x, -9.5, 0);
    leg.rotation.z = x > 0 ? -0.35 : 0.35;
    drone.add(leg, box(mat.red, 2, 0.8, 10, x * 1.35, -12.8, 0));
  }
  for (const x of [20, -20]) drone.add(cylinder(mat.ink, 2.3, 2.3, 2.4, x, 5.2, 0, 12));
  drone.userData.rotors = rotors;
  return drone;
}

// 一群往外拋的碎片：位置是「炸開後經過的時間」的純函式，落地後留在原地
function makeDebris(count, materials, origin, { speed = 5, size = 0.12, seed = 7 } = {}) {
  const random = seededRandom(seed);
  const group = new Group();
  const per = Math.max(1, Math.round(count / materials.length));
  const sets = materials.map((material) => {
    const mesh = new InstancedMesh(new BoxGeometry(size, size * 0.6, size * 0.8), material, per);
    mesh.frustumCulled = false;
    group.add(mesh);
    const bits = Array.from({ length: per }, () => {
      const a = random() * Math.PI * 2, up = 0.35 + random() * 0.65, v = speed * (0.45 + random() * 0.55);
      return { vx: Math.cos(a) * v * (1 - up * 0.5), vy: up * v, vz: Math.sin(a) * v * (1 - up * 0.5), spin: 3 + random() * 9, scale: 0.6 + random() * 1.1 };
    });
    return { mesh, bits };
  });
  const matrix = new Matrix4(), position = new Vector3(), rotation = new Quaternion(), scale = new Vector3(), axis = new Vector3(0.6, 0.3, 0.7).normalize();
  const G = 9;
  /** tau：炸開後經過的時間；小於等於 0 時全部藏起來 */
  group.userData.update = (tau) => {
    for (const { mesh, bits } of sets) {
      bits.forEach((bit, i) => {
        const land = (2 * bit.vy) / G, t = Math.min(tau, land);
        position.set(origin.x + bit.vx * t, Math.max(0.04, origin.y + bit.vy * t - 0.5 * G * t * t), origin.z + bit.vz * t);
        rotation.setFromAxisAngle(axis, bit.spin * t);
        scale.setScalar(tau > 0 ? bit.scale : 0.0001);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  return group;
}

/**
 * 用「注視點、方位角、仰角、距離」寫的鏡頭軌道（2026-11-19 第三輪）。
 * 方位角 yaw（度）：0 是鏡頭在注視點的 +z 方向往 −z 看，正值是鏡頭在注視點 +x 那一側；仰角 pitch（度）正值是鏡頭比注視點高。
 * 注視點和 fov 交給 makeCameraTrack，方位角、仰角、距離（取對數）另外交給一條 makeCameraTrack 各自單調內插，
 * 所以兩格之間只要距離是單調的，鏡頭就不會因為轉方向（走弦線）而先近後遠。回傳 (time) => { pos, at, fov, roll }。
 */
function orbitTrack(keys) {
  const aim = makeCameraTrack(keys.map((k) => ({ t: k.t, at: k.at, pos: [k.at[0], k.at[1], k.at[2] + 1], fov: k.fov })));
  const polar = makeCameraTrack(keys.map((k) => ({ t: k.t, at: [k.yaw, k.pitch, Math.log(k.dist)], pos: [k.yaw, k.pitch, Math.log(k.dist) + 1], fov: 0 })));
  const shot = { pos: new Vector3(), at: new Vector3(), fov: 36, roll: 0 };
  return (time) => {
    const a = aim(time), [yaw, pitch, logDist] = polar(time).at.toArray();
    const y = (yaw * Math.PI) / 180, x = (pitch * Math.PI) / 180, dist = Math.exp(logDist);
    shot.at.copy(a.at);
    shot.pos.set(a.at.x + dist * Math.cos(x) * Math.sin(y), a.at.y + dist * Math.sin(x), a.at.z + dist * Math.cos(x) * Math.cos(y));
    shot.fov = a.fov;
    return shot;
  };
}

export default function createWarSet(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE); // 白色的天空（封面是白底）；白色的東西靠四周的黑色山塊和焦土襯出來
  const camera = new PerspectiveCamera(40, 1, 0.1, 400);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.45, 0.8, 0.5]);
  addFog(scene, mat, WHITE, 42, 190); // 近處（城市、戰車）不受影響；遠處的山塊、焦土、骨架屋淡進白色的天空
  const redFlat = mat.flat(RED), whiteFlat = mat.flat(WHITE), blackFlat = mat.flat(BLACK);
  const lit = [mat.ink, mat.red]; // 會被爆炸的光照亮的材質（白色的廢墟不加，否則暗面也變白、看不出形狀）
  const { strike, out, dissolve, rise, streak } = PACE.tree.beats;
  const random = seededRandom(1185);
  const scale = deviceTier.particleScale;

  // ---- 環境：西半邊焦黑、東半邊白色的地面；戰車背後一座白色的丘 ----
  const ground = new Group();
  const scorched = new Mesh(new PlaneGeometry(200, 240), new MeshBasicMaterial({ color: BLACK }));
  scorched.rotation.x = -Math.PI / 2;
  scorched.position.set(EDGE_X - 100, 0, 0);
  const plain = new Mesh(new PlaneGeometry(240, 240), new MeshBasicMaterial({ color: WHITE }));
  plain.rotation.x = -Math.PI / 2;
  plain.position.set(EDGE_X + 120, 0, 0);
  const scorchedSide = new Mesh(new PlaneGeometry(SCORCH_EAST - EDGE_X, 120), new MeshBasicMaterial({ color: BLACK })); // 廢墟背後那一塊焦土
  scorchedSide.rotation.x = -Math.PI / 2;
  scorchedSide.position.set((EDGE_X + SCORCH_EAST) / 2, 0, SCORCH_Z - 60);
  plain.scale.y = 0.5; // 只留 z > SCORCH_Z 的那一半
  plain.position.z = SCORCH_Z + 60;
  ground.add(scorched, scorchedSide, plain);
  const disc = new CircleGeometry(1, 20);
  const blackDecal = decalMaterial(BLACK), whiteDecal = decalMaterial(WHITE);
  // 交界不是一條直線：一串大小不一的焦黑圓斑；往東延伸的那一條也一樣
  for (let z = -40; z <= 40; z += 1.3) ground.add(decal(disc, blackDecal, EDGE_X + (random() - 0.6) * 0.9, z, 0.7 + random() * 1.1, 0.6 + random() * 0.7));
  for (let x = EDGE_X; x <= SCORCH_EAST; x += 1.3) ground.add(decal(disc, blackDecal, x, SCORCH_Z + (random() - 0.4) * 0.8, 0.7 + random() * 1.1, 0.5 + random() * 0.6));
  for (let z = SCORCH_Z; z >= -40; z -= 1.3) ground.add(decal(disc, blackDecal, SCORCH_EAST + (random() - 0.4) * 0.9, z, 0.6 + random() * 0.7, 0.7 + random() * 1.1));
  // 白色地面上的彈坑與履帶壓出的痕跡
  for (let i = 0; i < 16; i++) ground.add(decal(disc, blackDecal, 3 + random() * 24, TZ - 7 + random() * 14, 0.3 + random() * 0.9, 0.12 + random() * 0.3));
  for (const sign of [1, -1]) for (const z of [0.6, -0.6]) ground.add(decal(new PlaneGeometry(1, 1), blackDecal, TX + sign * 6.2, TZ + z, 5.5, 0.1));
  // 焦黑地面上的彈坑：白色的圈
  const ring = new RingGeometry(0.82, 1, 28);
  for (let i = 0; i < 22; i++) {
    const far = random();
    ground.add(decal(ring, whiteDecal, -4 - far * far * 95, (random() - 0.5) * (8 + far * 30), 0.5 + random() * 1.6, 0.4 + random() * 1.2));
  }
  // 焦黑地面上的白色碎屑：鏡頭低飛時從底下掠過，是速度感的來源
  const fleckCount = Math.round(520 * scale);
  const flecks = new InstancedMesh(new PlaneGeometry(1, 1), whiteDecal, fleckCount);
  flecks.frustumCulled = false;
  flecks.renderOrder = 1;
  {
    const matrix = new Matrix4(), position = new Vector3(), rotation = new Quaternion(), size = new Vector3(), flatDown = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2), turn = new Quaternion();
    for (let i = 0; i < fleckCount; i++) {
      const spread = random();
      position.set(EDGE_X - 0.8 - random() * 100, 0.004, (random() - 0.5) * (5 + spread * spread * 40));
      turn.setFromAxisAngle(new Vector3(0, 1, 0), (random() - 0.5) * 0.9);
      rotation.copy(turn).multiply(flatDown);
      size.set(0.15 + random() * 0.55, 0.04 + random() * 0.07, 1);
      flecks.setMatrixAt(i, matrix.compose(position, rotation, size));
    }
  }
  ground.add(flecks);
  scene.add(ground);
  const hill = sphere(whiteFlat, 1, TX, 0, TZ + 12, 32, 12);
  hill.scale.set(14, 3.3, 4);
  scene.add(hill);
  // 遠景：焦土上只剩白色骨架的房子（沿著飛行路線兩側），白色地面上黑色的斷牆
  const farRuins = new Group();
  for (let i = 0; i < 16; i++) {
    const frame = new Group(), w = 0.8 + random() * 1.4, h = 0.8 + random() * 1.8, d = 0.7 + random() * 0.8, t = 0.07;
    for (const [x, z, k] of [[-w / 2, -d / 2, 1], [w / 2, -d / 2, 0.55 + random() * 0.45], [-w / 2, d / 2, 0.4 + random() * 0.6], [w / 2, d / 2, 1]]) frame.add(box(mat.paper, t, h * k, t, x, (h * k) / 2, z));
    frame.add(box(mat.paper, w, t, t, 0, h * 0.5, -d / 2), box(mat.paper, t, t, d, -w / 2, h * 0.4, 0), box(mat.paper, w * 0.6, t, t, -w * 0.2, h - t, d / 2));
    const side = i % 2 ? 1 : -1;
    frame.position.set(-8 - i * 5.6 - random() * 3, 0, side * (3.2 + random() * 9));
    frame.rotation.y = random() * 1.2;
    farRuins.add(frame);
  }
  scene.add(farRuins);
  // 黑色的山塊：不受光的純黑剪影，遠的會被霧染淡
  const massifs = new Group();
  MASSIFS.forEach(([x, z, rx, height, rz], i) => {
    const massif = new Mesh(lumpy(new SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0.16, i * 7.3), blackFlat);
    massif.scale.set(rx, height, rz);
    massif.position.set(x, -0.2, z);
    massif.rotation.y = i * 1.9;
    massifs.add(massif);
  });
  scene.add(massifs);
  // 松樹：黑色，立在白色的地面上
  const pines = new Group();
  PINES.forEach(([x, z, height], i) => {
    const pine = makePine(mat.ink, height);
    pine.position.set(x, 0, z);
    pine.rotation.y = i * 1.3;
    pines.add(pine);
  });
  scene.add(pines);

  // ---- #78 飛彈：4 枚有彈體的模型＋遠處 5 道紅色細長的 ----
  const missiles = new Group();
  const bodied = MISSILES.map(([, , , , , size]) => {
    const missile = makeMissile(mat, redFlat);
    missile.scale.setScalar(0.04 * size);
    missiles.add(missile);
    return missile;
  });
  const streaks = STREAKS.map(([, , , , length]) => {
    const body = latheX(redFlat, [[0.012, -length], [0.1, -0.3], [0.1, -0.08], [0, 0.07]], 8);
    const holder = new Group();
    holder.add(body);
    missiles.add(holder);
    return holder;
  });
  // 封面上的 9 枚之外，另外幾枚一直留在遠處的天上（同一個編號的一部分）：城市那一段在東邊的山前，戰車那一段在戰車背後的山前
  const DIP_EAST = Math.atan2(7.5, 50), DIP_LATE = Math.atan2(3.9, 24);
  const east = EAST.map(() => {
    const missile = makeMissile(mat, redFlat);
    missiles.add(missile);
    return missile;
  });
  const late = LATE.map(([, , , , hasBody]) => {
    const holder = new Group(); // 往 −X 飛（從戰車的鏡位看是由左上往右下，和封面一樣）
    holder.rotation.y = Math.PI;
    const body = new Group();
    body.add(hasBody ? makeMissile(mat, redFlat) : latheX(redFlat, [[0.3, -90], [2.4, -8], [2.4, -2], [0, 2]], 8));
    body.rotation.z = -DIP_LATE;
    holder.add(body);
    missiles.add(holder);
    return holder;
  });
  register(78, missiles, { count: 9 });
  scene.add(missiles);
  const anchor = new Vector3();
  // 已經落地或還沒出場的：縮到看不見，收到某一枚還在天上的旁邊（元素的外框才會框在看得到的飛彈上）
  const park = (object) => {
    object.position.copy(anchor);
    object.scale.setScalar(0.0001);
    object.visible = false;
  };

  // ---- #79 白線廢墟：左邊一棟只剩骨架，右邊一棟還有兩扇窗、缺了一角；牆腳是瓦礫 ----
  // 以封面像素建模（x − 195、1080 − y），正面朝本地 +Z，再整組轉向飛彈來的方向
  const ruins = new Group();
  const beam = 2.2;
  for (const z of [6, -6]) {
    ruins.add(
      box(mat.paper, beam, 38.5, beam, -20, 19.25, z), box(mat.paper, beam, 28, beam, -9, 14, z), // 兩根柱子
      box(mat.paper, 11, beam, beam, -14.5, 22, z), box(mat.paper, 11, beam, beam, -14.5, 13, z), // 兩道橫樑
    );
    const roof = box(mat.paper, 11.6, beam, beam, -24.5, 35, z); // 斷掉的屋頂
    roof.rotation.z = Math.atan2(7, 9);
    ruins.add(roof);
    const front = wall(mat.paper, [[6, 0], [24, 0], [24, 36], [12, 36], [6, 29]], [[12, 23, 7.5, 7], [12, 12, 7.5, 7]], 1.4); // 有兩扇窗的牆，左上缺一角
    front.position.z = z * 1.15;
    ruins.add(front);
  }
  ruins.add(
    box(mat.paper, beam, beam, 12, -20, 37.4, 0), box(mat.paper, beam, beam, 12, -9, 26.9, 0), box(mat.paper, beam, beam, 12, -9, 13, 0), // 前後骨架之間的連樑
    box(mat.paper, 18, 5, 1.4, 0, 2.5, 6), box(mat.paper, beam, 12, beam, -1, 11, 6), // 兩棟之間的矮牆
    box(mat.paper, 1.4, 29, 13.8, 6.7, 14.5, 0), box(mat.paper, 1.4, 36, 13.8, 23.3, 18, 0), // 右棟的兩面側牆
  );
  for (const [x, r] of [[-15, 4], [-5, 3], [2, 4], [16, 4.5], [26, 3]]) ruins.add(sphere(mat.paper, r, x, r * 0.35, 10, 10, 6));
  // 第四輪的細節：斷口伸出來的鋼筋（黑色細桿）、牆腳一堆堆不規則的瓦礫塊、右棟正面一道裂縫
  for (const [x, y, z, a] of [[12, 36, 6.9, 0.3], [15, 36.5, 6.9, -0.2], [7, 30, 6.9, 0.9], [-20, 38.5, 6, 0.2], [-9, 28, -6, -0.4]]) {
    const bar = cylinder(mat.ink, 0.35, 0.35, 5, 0, 0, 0, 5);
    bar.position.set(x, y, z);
    bar.rotation.z = a;
    ruins.add(bar);
  }
  for (let i = 0; i < 14; i++) {
    const chunk = new Mesh(lumpy(new BoxGeometry(2.6, 1.8, 2.2, 2, 2, 2), 0.5, i * 4.1), mat.paper);
    chunk.position.set(-26 + i * 4 + random() * 2, 0.8, 9 + random() * 6);
    chunk.rotation.set(random(), random() * 3, random());
    chunk.scale.setScalar(0.7 + random() * 0.9);
    ruins.add(chunk);
  }
  ruins.add(box(mat.ink, 0.5, 9, 0.3, 17, 26, 6 * 1.15 + 0.75), box(mat.ink, 0.5, 6, 0.3, 18.5, 19, 6 * 1.15 + 0.75));
  mergeChildren(ruins);
  ruins.scale.setScalar(0.045);
  ruins.rotation.y = -Math.PI / 2 + 0.25;
  ruins.position.set(-1.3, 0, -3.0);
  register(79, ruins);
  scene.add(ruins);

  // ---- #81 被炸的城市：黑色的樓，正面有白色的窗；站在爆炸前面。本地座標：x 是封面的左右、+Z 是正面 ----
  const city = new Group();
  const c = (px) => (px - 338) * 0.04, h = (py) => (1096 - py) * 0.04;
  const block = (outline, depth, z = 0) => {
    const mesh = extrude(mat.ink, outline.map(([x, y]) => [c(x), h(y)]), depth);
    mesh.position.z = z;
    city.add(mesh);
  };
  block([[296, 1096], [296, 1061], [303, 1058], [303, 1054], [316, 1045], [316, 1096]], 0.8); // 左邊斜頂的高樓
  block([[316, 1096], [316, 1047], [332, 1047], [332, 1096]], 0.7, 0.1);
  block([[321.5, 1047], [321.5, 1041.5], [326, 1041.5], [326, 1047]], 0.16, 0.1); // 樓頂的小塔
  block([[331, 1096], [331, 1083], [347, 1083], [347, 1096]], 0.5, 0.05); // 中間的矮樓（飛彈從它上面的缺口鑽過去）
  block([[345, 1096], [345, 1071], [372, 1066], [372, 1096]], 0.75);
  block([[377, 1096], [377, 1064], [386, 1064], [386, 1096]], 0.4, -0.1);
  city.add(box(mat.ink, 4.3, 0.22, 1.1, c(335), 0.11, 0)); // 地基
  for (const [x, r] of [[282, 0.26], [289, 0.2], [339, 0.2], [391, 0.24]]) city.add(sphere(mat.ink, r, c(x), r * 0.5, 0.5, 8, 6)); // 瓦礫
  for (const [x, y] of [[308, 1069], [308, 1080], [320, 1058], [320, 1069], [320, 1080], [364, 1075], [364, 1086], [353, 1081], [353, 1090]]) {
    const pane = box(whiteFlat, 0.12, 0.24, 0.02, c(x + 1.5), h(y + 3), 0.47);
    pane.userData.noShadow = true;
    city.add(pane);
  }
  city.rotation.y = -Math.PI / 2;
  city.position.set(CITY_X, 0, 0);
  register(81, city);
  scene.add(city);
  // 城市前後幾塊黑色的大石頭：爆炸的光會打亮它們朝向落點的那一面
  const rocks = new Group();
  for (const [x, z, r] of [[-2.5, -1.3, 0.16], [-1.5, 2.7, 0.2], [3.4, 2.4, 0.4]]) rocks.add(sphere(mat.ink, r, x, r * 0.55, z, 7, 5));
  scene.add(rocks);

  // ---- #80 大爆炸：封面的紅、白兩層輪廓各擠出一點厚度、前後錯開，再加一組垂直交叉的，從側面看也有體積 ----
  const blast = new Group();
  const b = (points) => points.map(([x, y]) => [(x - 320) * 0.045, (1088 - y) * 0.045]);
  const blastRed = extrude(redFlat, b(BLAST_RED), 0.08), blastWhite = extrude(whiteFlat, b(BLAST_WHITE), 0.08);
  blastWhite.position.z = 0.28;
  const crossRed = extrude(redFlat, b(BLAST_RED), 0.08), crossWhite = extrude(whiteFlat, b(BLAST_WHITE), 0.1);
  crossRed.rotation.y = crossWhite.rotation.y = Math.PI / 2;
  crossRed.scale.setScalar(0.82);
  crossWhite.scale.setScalar(0.82);
  const layers = [blastRed, blastWhite, crossRed, crossWhite];
  blast.add(...layers);
  blast.rotation.y = -Math.PI / 2;
  blast.position.set(BLAST.x, 0, BLAST.z - 0.5); // 封面上爆炸的中心比城市偏左一點
  // 碎片：白色和紅色的小方塊往外拋，落在地上
  const blastDebris = makeDebris(Math.round(80 * scale), [whiteFlat, redFlat], new Vector3(BLAST.x - 0.4, 0.5, BLAST.z), { speed: 7.5, size: 0.14, seed: 80 });
  // 地面上的白光：爆炸那一下往外掃過焦黑的地面，再縮回落點
  const glow = decal(new CircleGeometry(1, 40), decalMaterial(WHITE), BLAST.x, BLAST.z, 1, 1, 2);
  const blastAll = new Group();
  blastAll.add(blast, blastDebris, glow);
  register(80, blastAll);
  scene.add(blastAll);
  // 城市後面升起的白煙（待機動作）
  const cityPuffs = Array.from({ length: Math.max(4, Math.round(12 * scale)) }, (_, i) => {
    const puff = sphere(whiteFlat, 1, 0, 0, 0, 10, 8);
    puff.userData = { phase: i / 12 + random() * 0.05, x: BLAST.x + 0.6 + random() * 1.6, z: BLAST.z + (random() - 0.5) * 4.4, size: 0.28 + random() * 0.34 };
    scene.add(puff);
    return puff;
  });

  // ---- #83 兩輛對射的戰車：右邊那輛是左邊的掉頭 ----
  const tanks = new Group();
  const leftTank = makeTank(mat, redFlat), rightTank = makeTank(mat, redFlat);
  const TANK_SCALE = 0.026;
  for (const tank of [leftTank, rightTank]) tank.scale.setScalar(TANK_SCALE);
  leftTank.rotation.y = Math.PI; // 畫面左邊那輛在 +X，砲口朝 −X
  tanks.add(leftTank, rightTank);
  register(83, tanks, { count: 2 });
  scene.add(tanks);

  // ---- #84 砲擊點：九個尖角的紅色星爆、中心一小塊黑，在兩根砲管中間；加一片垂直交叉的和往外噴的紅色火花 ----
  const BURST = new Vector3(TX, 1.06, TZ);
  const burst = new Group();
  const tips = BURST_TIPS.map(([x, y]) => [(x - 556) * TANK_SCALE, (1067 - y) * TANK_SCALE]);
  const star = [];
  tips.forEach(([x, y], i) => {
    const [nx, ny] = tips[(i + 1) % tips.length];
    let a0 = Math.atan2(y, x), a1 = Math.atan2(ny, nx);
    if (a1 > a0) a1 -= Math.PI * 2; // 封面的尖角順序在 y 向上的座標裡是順時針
    const mid = (a0 + a1) / 2;
    star.push([x, y], [Math.cos(mid) * 9.5 * TANK_SCALE, Math.sin(mid) * 9.5 * TANK_SCALE]);
  });
  const core = Array.from({ length: 16 }, (_, i) => {
    const r = (i % 2 ? 2.4 : 5.2) * TANK_SCALE, a = (i / 16) * Math.PI * 2 + 0.2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  const burstCross = extrude(redFlat, star, 0.05);
  burstCross.rotation.y = Math.PI / 2;
  burstCross.scale.setScalar(0.7);
  burst.add(extrude(redFlat, star, 0.06), extrude(blackFlat, core, 0.1), burstCross);
  burst.position.copy(BURST);
  burst.rotation.y = Math.PI; // 正面朝鏡頭那一側，尖角的左右才和封面一樣
  const sparks = makeDebris(Math.round(28 * scale), [redFlat], BURST, { speed: 3.2, size: 0.07, seed: 84 });
  const burstAll = new Group();
  burstAll.add(burst, sparks);
  register(84, burstAll);
  scene.add(burstAll);

  // ---- #85 白煙：一朵平底、上面好幾個圓頂的雲（封面上的樣子），由前後錯開的十幾顆不規則的球組成，每顆各自翻滾脹縮；
  // 下面一串小煙團不斷從左邊那輛的砲塔冒上來併進雲裡。升到白丘的稜線以上，襯著黑色的山 ----
  const smoke = new Group();
  const LOBES = [ // [x, y, 半徑]：相對雲的中心
    [-0.44, 0.0, 0.16], [-0.24, 0.1, 0.23], [0.02, 0.19, 0.28], [0.28, 0.1, 0.22], [0.48, 0.0, 0.15],
    [-0.1, -0.03, 0.2], [0.16, -0.04, 0.19], [-0.32, -0.05, 0.14], [0.36, -0.05, 0.13],
    [-0.14, 0.24, 0.15], [0.16, 0.27, 0.14], [0.02, 0.04, 0.24],
  ];
  const lobes = LOBES.map(([x, y, r], i) => {
    const lobe = new Mesh(lumpy(new SphereGeometry(1, 12, 9), 0.22, i * 3.1), whiteFlat);
    lobe.userData = { x, y, z: ((i * 5) % 7 - 3) * 0.06, r, phase: i * 1.7, order: Math.abs(x) * 1.6 + (i > 8 ? 0.5 : 0) };
    smoke.add(lobe);
    return lobe;
  });
  const wisps = Array.from({ length: 6 }, (_, i) => {
    const wisp = new Mesh(lumpy(new SphereGeometry(1, 9, 7), 0.25, 40 + i), whiteFlat);
    wisp.userData.phase = i / 6;
    smoke.add(wisp);
    return wisp;
  });
  register(85, smoke);
  scene.add(smoke);

  // ---- #82 三架無人機 ----
  const drones = new Group();
  DRONES.forEach(([, , , size]) => {
    const drone = makeDrone(mat);
    drone.scale.setScalar(0.0375 * size);
    drones.add(drone);
  });
  register(82, drones, { count: 3 });
  scene.add(drones);

  // ---- 第四輪的細節：白色地面上的彈坑有隆起的坑緣、散落的黑色碎石，給投影和排線一個落點 ----
  const debrisField = new Group();
  for (let i = 0; i < 7; i++) {
    const x = TX - 9 + random() * 18, z = TZ - 5 + random() * 3.5, r = 0.35 + random() * 0.45;
    if (Math.abs(x - TX) < 3.2 && Math.abs(z - TZ) < 1.5) continue; // 戰車腳下不放
    debrisField.add(lathe(mat.paper, [[r * 0.6, 0], [r * 1.25, 0], [r * 1.05, r * 0.16], [r * 0.85, r * 0.12], [r * 0.6, 0.004]], 18).translateX(x).translateZ(z));
    debrisField.add(decal(disc, blackDecal, x, z, r * 0.8, r * 0.8, 1));
  }
  for (let i = 0; i < 40; i++) {
    const x = 2.5 + random() * 22, z = TZ - 3.5 + random() * 9;
    if (Math.abs(x - TX) < 3.4 && Math.abs(z - TZ) < 1.2) continue;
    const rock = new Mesh(lumpy(new SphereGeometry(1, 7, 5), 0.5, i * 1.3), mat.ink);
    const size = 0.04 + random() * 0.09;
    rock.position.set(x, size * 0.4, z);
    rock.scale.set(size * (1 + random()), size, size * (1 + random()));
    debrisField.add(rock);
  }
  scene.add(debrisField);
  // 戰車開過的時候車尾冒出的排氣（小白煙團）
  const exhaust = Array.from({ length: 8 }, (_, i) => {
    const puff = new Mesh(lumpy(new SphereGeometry(1, 8, 6), 0.3, 70 + i), whiteFlat);
    puff.userData = { tank: i % 2, phase: i / 8 };
    scene.add(puff);
    return puff;
  });
  // 影子（第四輪）：引擎的投影陰影接手；白色地面上的戰車、松樹、碎石、坑緣、落地的飛彈都投影。

  // ---- 鏡頭：0.30 之前是跟飛（下面用算的），之後照這條軌道 ----
  // 2026-11-19 第三輪：拿掉「繞到城市右側 → 0.545 甩到戰車」的甩鏡。現在整章的推拉只有三段：
  // 跟飛煞停時收近到城市前（看廢墟、爆炸）→ 0.37 起升高、越過城市上空，注視點一路轉向東邊的戰車（距離放大，像升降鏡頭）
  // → 0.49 之後從高處降下來，從戰車的左前方繞到正面，一路推近到戰車、壓到地面高度，再抬頭看無人機，距離只往近的方向變，結尾停穩。
  // 戰車在 0.55 開火時鏡頭正在下降途中，兩輛戰車已經在畫面中央。
  // 關鍵格用「注視點 + 方位角 + 仰角 + 距離」寫（見 orbitTrack）；方位角 −193 和 167 是同一個方向，寫成連續的數字鏡頭才會往近的那一側繞。
  const holdOffset = HOLD_POS.map((v, i) => v - HOLD_AT[i]);
  const holdYaw = (Math.atan2(holdOffset[0], holdOffset[2]) * 180) / Math.PI;
  const holdDist = Math.hypot(...holdOffset), holdPitch = (Math.asin(holdOffset[1] / holdDist) * 180) / Math.PI;
  const track = orbitTrack([
    { t: 0.2, at: HOLD_AT, yaw: holdYaw, pitch: holdPitch, dist: holdDist, fov: 40 }, // 跟飛煞停的位置（之前用不到，只讓 0.305 那一格速度從零開始）
    { t: D0 + W, at: HOLD_AT, yaw: holdYaw, pitch: holdPitch, dist: holdDist, fov: 40 },
    { t: 0.37, at: [0.95, 1.6, -0.5], yaw: -64, pitch: 2, dist: 8.3, fov: 40 }, // 慢慢繞到側面，看廢墟、爆炸、城市
    { t: 0.49, at: [TX - 1.5, 1.0, TZ - 0.5], yaw: -125, pitch: 16, dist: 15, fov: 39 }, // 升到城市上空，轉向戰車
    { t: 0.61, at: [TX, 0.8, TZ], yaw: -170, pitch: 5, dist: 10.3, fov: 38 }, // 從左前方降到戰車前
    { t: 0.67, at: [TX, 0.85, TZ], yaw: -182, pitch: -2.4, dist: 8.2, fov: 38 }, // 繞到正面、降到地面高度
    { t: 0.72, at: [TX, 0.9, TZ], yaw: -176.2, pitch: -3.6, dist: 7.65, fov: 38 },
    { t: 0.765, at: [TX + 0.1, 2.9, TZ + 0.3], yaw: -175.6, pitch: -17.4, dist: 7.55, fov: 38 }, // 抬頭看無人機
    { t: 0.9, at: [TX + 0.1, 3.1, TZ + 0.3], yaw: -177.6, pitch: -19.6, dist: 7.4, fov: 38 },
    { t: 1.3, at: [TX + 0.1, 3.2, TZ + 0.3], yaw: -179.2, pitch: -21, dist: 7.3, fov: 38 },
  ]);

  const chase = { pos: new Vector3(), at: new Vector3(), fov: 40, roll: 0 }, holdAt = new Vector3(...HOLD_AT);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.24 },
    sound: soundScript.sound,
    cues: cueList(pacedCues("tree", ["missile", "cannon"]), [{ at: 0.1, cue: "missile" }, { at: 0.18, cue: "missile" }, { at: 0.3, cue: "boom" }, { at: 0.32, cue: "lowHit" }, { at: 0.56, cue: "boom" }, { at: 0.78, cue: "drone" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const time = frame.time;

      // 鏡頭：跟飛時位置直接由進度算出來（等速、最後煞停在城市前），之後交給軌道
      if (p < D0 + W) {
        const settle = smooth(linearstep(p, D0, D0 + W));
        const x = camX(p);
        chase.pos.set(x, 1.9 + (HOLD_POS[1] - 1.9) * settle, 1.3 + (HOLD_POS[2] - 1.3) * settle);
        chase.at.set(x + 10.8, 0.34, -0.74).lerp(holdAt, settle); // 和舊版 (x + 9, 0.6, -0.4) 同一條視線，只是放遠 1.2 倍
        chase.roll = Math.sin(time * 0.9) * 0.012 * (1 - settle);
        applyCameraShot(camera, chase, frame.aspect, frame.pointer, 0.03);
      } else {
        // 直式螢幕：水平視角不夠寬，沿著水平方向往後退。城市前退一點（廢墟才進得來），
        // 戰車和無人機那幾個鏡位退更多，兩輛戰車和三架無人機才都在畫面裡
        const shot = track(p);
        const back = 1 + clamp((1.25 - frame.aspect) / 0.7) * (0.6 * smooth(linearstep(p, D0 + W, 0.37)) + 0.25 * smooth(linearstep(p, 0.37, 0.61)));
        shot.pos.x = shot.at.x + (shot.pos.x - shot.at.x) * back;
        shot.pos.z = shot.at.z + (shot.pos.z - shot.at.z) * back;
        applyCameraShot(camera, shot, frame.aspect, frame.pointer, 0.03);
      }

      // 飛彈：一枚接一枚從鏡頭後方超過去，平飛到各自的位置後俯衝落地。
      // 領頭那枚炸掉；另外三枚斜插在地上當殘骸，留到鏡頭離開城市為止
      const line = camLineX(p);
      const parked = [];
      const atCity = p < 0.52;
      MISSILES.forEach(([lead, z, cruise, diveX, landX, size, start], i) => {
        const missile = bodied[i];
        const pass = smooth(linearstep(p, strike - 0.035 + start, strike + 0.085 + start));
        const x = Math.min(landX, line - 3.2 + (lead + 3.2) * pass);
        const dive = linearstep(x, diveX, landX);
        const landed = dive >= 1;
        const y = cruise * (1 - dive) + 0.18 * dive + (landed ? 0 : Math.sin(time * 2.3 + i * 1.7) * 0.03 * (1 - dive));
        const last = i === MISSILES.length - 1;
        missile.position.set(x, y, last ? BLAST.z * smooth(dive) : z);
        missile.rotation.z = dive > 0 ? -Math.atan2(cruise - 0.18, landX - diveX) * Math.min(1, dive * 6) - (landed ? 0.35 : 0) : 0;
        missile.rotation.x = landed ? i * 1.1 : time * 0.6 + i; // 彈體慢慢自轉，落地後不動
        missile.scale.setScalar(0.04 * size);
        missile.visible = true;
        if (landed && (last || !atCity)) parked.push(missile);
      });
      STREAKS.forEach(([x0, z, height, landX], i) => {
        const holder = streaks[i];
        const fall = linearstep(p, -0.3 + i * 0.03, 0.3 + i * 0.012);
        holder.position.set(x0 + (landX - x0) * fall, height * (1 - fall), z);
        holder.rotation.z = -Math.atan2(height, landX - x0);
        holder.scale.setScalar(1);
        holder.visible = true;
        if (fall >= 1) parked.push(holder);
      });
      // 東邊天上的三枚：鏡頭停在城市前的時候還在飛，最後落進山腳
      EAST.forEach(([z, from, to], i) => {
        const missile = east[i];
        const fly = linearstep(p, from, to);
        missile.position.set(-10 + 50 * fly, 9 - 7.5 * fly, z);
        missile.rotation.set(time * 0.5 + i * 2, 0, -DIP_EAST);
        missile.scale.setScalar(0.05);
        missile.visible = true;
        if (fly <= 0 || fly >= 1) parked.push(missile);
      });
      // 戰車背後天上的四枚：由左上往右下慢慢飛過黑色的山前
      LATE.forEach(([dx, height, dz, size, hasBody], i) => {
        const holder = late[i];
        holder.position.set(TX + dx - 24 * (p - 0.8), height - 3.9 * (p - 0.8) + Math.sin(time * 1.3 + i * 2) * 0.05, TZ + dz);
        holder.scale.setScalar((hasBody ? 0.034 : 0.03) * size);
        holder.visible = true;
        if (p < LATE_FROM) parked.push(holder);
      });
      // 收起來的那些放到一枚看得到的旁邊：跟飛時是領頭那枚，城市前是東邊天上的，之後是戰車背後的
      anchor.copy(p < IMPACT ? bodied[3].position : p < LATE_FROM ? east[2].position : late[0].position);
      if (p >= IMPACT && p < EAST[2][1]) anchor.copy(bodied[0].position);
      parked.forEach(park);

      // 大爆炸：飛彈落地那一刻炸開，四層錯開脹大，之後各自脈動；碎片往外拋；白光掃過地面
      const boom = smooth(linearstep(p, IMPACT, 0.365));
      const overshoot = 1 + 0.14 * envelope(p, IMPACT, 0.36, 0.36, 0.43);
      layers.forEach((layer, i) => {
        const grow = smooth(linearstep(p, IMPACT + i * 0.008, 0.365 + i * 0.006));
        layer.scale.setScalar(Math.max(0.0001, grow * overshoot * (i > 1 ? 0.82 : 1) * (1 + (0.025 + i * 0.008) * Math.sin(time * (5 + i * 1.3) + i))));
      });
      blast.visible = boom > 0;
      blastDebris.userData.update((p - IMPACT) * 18);
      const flash = envelope(p, IMPACT, IMPACT + 0.012, IMPACT + 0.022, IMPACT + 0.06);
      glow.scale.setScalar(Math.max(0.0001, flash * 8.5 + boom * (1.5 + 0.12 * Math.sin(time * 6))));
      glow.visible = boom > 0;
      const shake = envelope(p, IMPACT, IMPACT + 0.02, IMPACT + 0.05, 0.42) * Math.sin(time * 40) * 0.03;
      city.position.z = shake;
      cityPuffs.forEach((puff) => {
        const { phase, x, z, size } = puff.userData;
        const life = (time * 0.07 + phase) % 1;
        puff.position.set(x + life * 1.6, 1.2 + life * 6.5, z + Math.sin(life * 5 + phase * 20) * 0.3);
        puff.scale.setScalar(size * (0.5 + life * 1.6) * Math.min(1, (1 - life) * 4) * boom);
        puff.visible = boom > 0.02;
      });

      // 爆炸的光：0.52 之前是大爆炸的白光（炸開那一下最亮，之後是閃爍的火光），之後換成戰車之間砲擊點的紅光
      const fired = linearstep(p, out, out + 0.012);
      const kick = envelope(p, out, out + 0.012, out + 0.03, dissolve[1]);
      const atBlast = p < 0.52;
      const power = atBlast
        ? flash * 70 + boom * (9 + 2 * Math.sin(time * 9))
        : (kick * 7 + fired * 2.6) * (1 + 0.15 * Math.sin(time * 11));
      for (const material of lit) {
        material.uniforms.uFlamePos.value.set(atBlast ? BLAST.x - 0.3 : BURST.x, atBlast ? 1.7 : BURST.y, atBlast ? BLAST.z : BURST.z - 0.6);
        material.uniforms.uFlameColor.value.set(atBlast ? WHITE : RED);
        material.uniforms.uFlame.value = power;
      }

      // 戰車：out（0.55）前互相逼近（路輪跟著轉），開火那一下砲塔後座、車身後仰再回正
      const advance = (1 - smooth(linearstep(p, 0.46, out))) * 0.7;
      const moving = (a) => (a > 0.001 && a < 0.699 ? 1 : 0); // 戰車正在往前開
      [leftTank, rightTank].forEach((tank, i) => {
        const sign = i ? -1 : 1;
        tank.position.set(TX + sign * (TANK_GAP + advance + kick * 0.12), 0, TZ);
        const { hull, turret, wheels } = tank.userData;
        turret.position.x = -kick * 5;
        hull.rotation.z = turret.rotation.z = kick * 0.045;
        for (const wheel of wheels) wheel.rotation.z = wheel.userData.rest + (advance + kick * 0.12) / (3.3 * TANK_SCALE);
        // 開火前砲塔微微來回瞄準，開火後停住；天線跟著前進的顛簸和開火的震動晃
        const aiming = 1 - smooth(linearstep(p, out - 0.06, out));
        turret.rotation.y = Math.sin(time * 0.9 + i * 2) * 0.05 * aiming;
        hull.position.y = moving(advance) * Math.abs(Math.sin(time * 9 + i)) * 0.6;
        tank.userData.antenna.rotation.z = -0.15 * kick + Math.sin(time * 5 + i) * (0.05 * moving(advance) + 0.12 * kick) + 0.03 * Math.sin(time * 1.7 + i);
      });
      // 排氣：戰車前進時車尾一團團冒出來往後上方飄散
      exhaust.forEach((puff, k) => {
        const { tank: which, phase } = puff.userData;
        const tank = which ? rightTank : leftTank, back = which ? -1 : 1; // 左邊那輛車尾在 +X
        const life = (time * 0.8 + phase * 2) % 1;
        const on = moving(advance) > 0.01 ? 1 : 0;
        puff.position.set(tank.position.x + back * (1.45 + life * 0.6), 0.8 + life * 0.7, TZ + (which ? -0.36 : 0.36) + Math.sin(life * 6 + k) * 0.05);
        puff.scale.setScalar(Math.max(0.0001, on * (0.05 + life * 0.12) * Math.min(1, (1 - life) * 3)));
        puff.visible = on > 0;
      });

      // 砲擊點：0.55 從中心炸開，之後不規則地閃；火花往外噴
      burst.scale.setScalar(Math.max(0.0001, fired * (1 + 0.25 * envelope(p, out, out + 0.02, out + 0.03, dissolve[1])) * (1 + 0.05 * Math.sin(time * 9))));
      burst.rotation.z = Math.sin(time * 3.1) * 0.04;
      burst.visible = fired > 0;
      sparks.userData.update((p - out) * 22);

      // 白煙：dissolve 期間由中間往兩邊一顆顆冒出來，rise 期間整朵升到定位，之後原地翻滾；小煙團一直從砲塔往上補
      const leftX = TX + TANK_GAP;
      const lift = smooth(linearstep(p, rise[0], rise[0] + 0.15));
      const cloudX = leftX - 0.25 + 0.25 * lift, cloudY = 1.45 + 0.9 * lift;
      lobes.forEach((lobe) => {
        const { x, y, z, r, phase, order } = lobe.userData;
        const appear = smooth(linearstep(p, dissolve[0] + order * 0.05, dissolve[0] + 0.06 + order * 0.05));
        const spread = 0.45 + 0.55 * lift; // 剛冒出來時擠成一團，升上去才攤開
        lobe.position.set(
          cloudX + x * spread + Math.sin(time * 0.6 + phase) * 0.035,
          cloudY + y * spread + Math.sin(time * 0.9 + phase * 1.3) * 0.03,
          TZ + z + Math.cos(time * 0.5 + phase) * 0.03,
        );
        lobe.rotation.set(time * 0.25 + phase, time * 0.18 + phase * 2, 0); // 不規則的球慢慢翻滾，輪廓跟著變
        lobe.scale.setScalar(Math.max(0.0001, appear * r * (0.75 + 0.25 * lift) * (1 + 0.1 * Math.sin(time * 1.5 + phase * 2))));
        lobe.visible = appear > 0;
      });
      const smoking = smooth(linearstep(p, dissolve[0], dissolve[0] + 0.04));
      wisps.forEach((wisp, i) => {
        const life = (time * 0.16 + wisp.userData.phase) % 1;
        wisp.position.set(
          leftX - 0.3 + (cloudX - leftX + 0.3) * life + Math.sin(life * 7 + i * 2) * 0.07,
          1.25 + (cloudY - 1.3) * life,
          TZ + Math.cos(life * 5 + i) * 0.06,
        );
        wisp.rotation.set(time * 0.7 + i, time * 0.4, 0);
        wisp.scale.setScalar(Math.max(0.0001, smoking * (0.05 + 0.09 * life) * Math.min(1, life * 8)));
        wisp.visible = smoking > 0;
      });

      // 無人機：streak 開始前後從左上飛進來，之後上下懸停；旋翼一直在轉
      drones.children.forEach((drone, i) => {
        const [dx, dy, dz] = DRONES[i];
        const fly = smooth(linearstep(p, streak[0] - 0.07 + i * 0.015, streak[0] + 0.04 + i * 0.015));
        drone.position.set(TX - dx + 13 * (1 - fly), dy + 3 * (1 - fly) + Math.sin(time * 2.3 + i * 2.1) * 0.05, TZ + dz);
        drone.rotation.z = 0.3 * (1 - fly) + Math.sin(time * 1.3 + i) * 0.04; // 飛進來時機頭往前傾
        drone.rotation.x = Math.sin(time * 1.7 + i * 2.4) * 0.06; // 懸停時左右微微側傾
        drone.rotation.y = Math.sin(time * 0.5 + i * 1.9) * 0.18;
        drone.visible = fly > 0;
        drone.userData.rotors.forEach((rotor, k) => (rotor.rotation.y = time * (38 + k * 5) + i));
      });

    },
  };
}
