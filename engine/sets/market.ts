// market 的 3D 場景：神殿前的廣場，結尾換到日本的庭園（PRD-3D 6.6）。
// 廣場：一座有台階的六柱神殿，四個提公事包的人從柱子之間走下來；右邊立著一塊行情看板，
// 看板前的圓桌上是鈔票和三疊籌碼，桌邊立著 π Σ ν 三個立體字。
// 庭園（夜）：紅色的五重塔、池塘、遠處白線勾出來的富士山，空中掛著白色的 ¥。
//
// 第二輪：四個人改成分層的厚紙偶（全身、軀幹、頭各一層），公事包是提在身前的小方塊；走下台階之後往兩旁分開，
// 不再貼著鏡頭經過。廣場後面是封面上那一排黑色的松樹，白色的霧讓遠的樹淡進背景；桌面上有鈔票和籌碼的影子。
// 庭園的霧是黑的（遠處的地面沉進夜色），¥ 和踏石都有影子，富士山旁邊是封面上那顆四芒星。
// 直式螢幕另外把鏡頭往後拉（fitPortrait），神殿、看板和箭頭、¥ 和富士山才會完整入鏡。
//
// 節奏範本 stove 的對應：
//   strike   0.05          第一個音效：四個人起步，從柱子之間走下台階，迎面從鏡頭兩旁經過
//   appear   [0.28, 0.42]  π Σ ν 一個一個落到地上
//   pullBack [0.30, 0.46]  鏡頭離開神殿，退成看得到看板、圓桌、字母的大景
//   （0.46–0.57 往右滑過桌面：鈔票與籌碼在前景，距離不變，不另外推近）
//   act      [0.60, 0.70]  紅箭頭在看板上畫出來：先漲、後重挫，從格線的右下角穿出去，箭頭落在板子下緣之外
//   out      0.74          第二個音效；整個場景換成日本的庭園（原作這一拍是幻象消失）。鏡頭在 0.71–0.80 從看板往左後方
//                          連續移動到隔著池塘看塔的大景，換場發生在移動途中，不是停住的硬切
//   back     [0.76, 0.86]  鏡頭在庭園裡往塔推近、繞行並升高；0.84–0.95 ¥ 往下沉
import {
  BackSide, BufferGeometry, CircleGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, FrontSide, Group, Mesh, MeshBasicMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3,
} from "three";
import type { Fog } from "three";
import { Snow, canvasTexture, clamp, deviceTier, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack, widenFovForNarrowAspect } from "../shared/camera";
import { addFog, ground, water } from "../shared/set/env";
import { box, cone, cylinder, extrude, faceCamera, lathe, makePalette } from "../shared/set/model";
import { bakeFigure, inkOutline, makeFigure, walkCycle } from "../shared/set/figure";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BLACK, DARK_RED, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：空曠廣場上遠遠的人聲、滴答和低鳴；四個人走下台階（0.05）；π Σ ν 一個個落地（0.3–0.4）；籌碼叮噹（0.5）；行情重挫前驚悚的一記（0.6）；換到夜裡的庭園時寺廟的鐘（0.74），低沉的合唱與耳語。
const soundScript = soundTrack([[0, { crowd: 0.08, tick: 0.1, dread: 0.15 }], [0.3, { tick: 0.15, musicbox: 0.1, dread: 0.18 }], [0.7, { tick: 0.15, dread: 0.25 }], [0.76, { night: 0.12, choir: 0.2, whisper: 0.1, dread: 0.15 }]]);

const place = (mesh, x, y, z) => (mesh.position.set(x, y, z), mesh);

const PANEL = { at: [9.6, 0, 1.4] as [number, number, number], turn: -0.62, size: 4.4, base: 1.5 }; // 板子架高：箭頭從右下角穿出去之後，尖端還在地面之上
const TABLE: [number, number, number] = [7.1, 0, 5.2];
const LETTERS: [number, number, number] = [12.6, 0, 6.4]; // 在看板的右前方：從正面看箭頭時，字母在箭頭尖端的右邊，不會擋到它
const STEP = { rise: 0.16, run: 0.4, count: 4, front: 1.4 }; // 四級台階加上平台邊緣共五階
const PLATFORM_Y = STEP.rise * (STEP.count + 1);
const WALK_GAPS = [-1.4, 0, 1.4, 2.8]; // 封面上四個人站在右邊四個門洞前：對應右邊四個柱間
const WALK_SIDE = [-2.3, -2.3, 1.8, 1.8]; // 走下台階之後往兩旁分開多少：左邊兩個往左、右邊兩個往右，從鏡頭兩側遠遠地經過
const WALKER_HEIGHT = 1.62; // 以前紙偶的高度（取景不變）
const LOWER_H = 2.05; // 神殿下層（有門洞的那一層）的高度：封面上下兩層一樣高
const DOORS = [-2.8, -1.4, 0, 1.4, 2.8]; // 下層的五個門洞；右邊四個門前各站一個人（WALK_GAPS）
const DOOR = { w: 0.74, h: 1.85, front: -0.9, back: -2.1 };
const FOG_PLAZA = { color: WHITE, near: 22, far: 72 };
const FOG_GARDEN = { color: BLACK, near: 15, far: 42 }; // 第四輪：收近一點，鏡頭很低時遠處的地面才看得出沉進夜色（後製二值化，霧要過半才會變黑）

/** 白色外框線：同一個幾何體沿法線往外推、只畫背對鏡頭的那一面。黑色的富士山靠它在黑色夜空前現出輪廓。 */
function hull(geometry, thickness, color = WHITE) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal, index = geometry.index;
  geometry.computeBoundingBox();
  const centre = geometry.boundingBox.getCenter(new Vector3());
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
  let out = 0, wind = 0;
  for (let i = 0; i < pos.count; i++) out += a.fromBufferAttribute(pos, i).sub(centre).dot(n.fromBufferAttribute(nor, i));
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib).sub(a);
    c.fromBufferAttribute(pos, ic).sub(a);
    wind += b.cross(c).dot(n.fromBufferAttribute(nor, ia));
  }
  const outward = out >= 0 ? 1 : -1;
  const frontIsOutside = (wind >= 0 ? 1 : -1) * outward > 0;
  const mesh = new Mesh(geometry, new ShaderMaterial({
    side: frontIsOutside ? BackSide : FrontSide,
    uniforms: { uT: { value: thickness * outward }, uColor: { value: new Color(color) } },
    vertexShader: "uniform float uT; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normalize(normal) * uT, 1.0); }",
    fragmentShader: "uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0);\n#include <colorspace_fragment>\n}",
  }));
  mesh.userData.noShadow = true;
  return mesh;
}

/** 低多邊形的山體：rings 是由下往上的幾圈頂點（每圈點數相同），相鄰兩圈之間拉成三角面，最上面一圈封頂。 */
function ringsGeometry(rings) {
  const n = rings[0].length, points = rings.flat(), faces = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = k * n, q = (k + 1) * n;
      faces.push(p + i, q + i, p + j, p + j, q + i, q + j);
    }
  }
  const top = rings.at(-1), centre = [0, 1, 2].map((axis) => top.reduce((sum, point) => sum + point[axis], 0) / n);
  points.push(centre);
  const last = (rings.length - 1) * n;
  for (let i = 0; i < n; i++) faces.push(last + i, points.length - 1, last + ((i + 1) % n));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

/** 把共用頂點的幾何體改成每個面各自一個法線（看得到稜角）。 */
function faceted(mesh) {
  mesh.geometry = mesh.geometry.toNonIndexed();
  mesh.geometry.computeVertexNormals();
  return mesh;
}

/**
 * 一筆畫的輪廓：把折線 points 往兩側各推 width / 2（轉角是尖角、兩端平切），回傳左右兩排點。
 * 立體字、¥、紅箭頭都先用筆畫描出來，再沿輪廓擠出厚度。
 */
function strokeSides(points, width) {
  const left = [], right = [], half = width / 2;
  const normalOf = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
    return [-dy / length, dx / length];
  };
  points.forEach((point, i) => {
    const before = i > 0 ? normalOf(points[i - 1], point) : null;
    const after = i < points.length - 1 ? normalOf(point, points[i + 1]) : null;
    let nx, ny, reach = half;
    if (before && after) {
      const mx = before[0] + after[0], my = before[1] + after[1], length = Math.hypot(mx, my);
      nx = mx / length;
      ny = my / length;
      reach = half / Math.max(0.3, nx * before[0] + ny * before[1]);
    } else {
      [nx, ny] = before ?? after;
    }
    left.push([point[0] + nx * reach, point[1] + ny * reach]);
    right.push([point[0] - nx * reach, point[1] - ny * reach]);
  });
  return { left, right };
}
const strokeOutline = (points, width) => {
  const { left, right } = strokeSides(points, width);
  return [...left, ...right.reverse()];
};

/** 用幾筆筆畫拼成一個立體字。strokes 的座標是封面像素（y 向下），baseline 是字腳的 y；k 是每像素幾個世界單位。 */
function glyph(material, strokes, { width, depth, k, originX, baseline }) {
  const group = new Group();
  for (const stroke of strokes) group.add(extrude(material, strokeOutline(stroke.map(([x, y]) => [(x - originX) * k, (baseline - y) * k]), width * k), depth));
  return group;
}

/** 四芒星的輪廓；立體的四芒星是兩片互相垂直的星形薄板。 */
const sparkleOutline = (r) => Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4, radius = i % 2 ? r * 0.16 : r;
  return [Math.sin(angle) * radius, Math.cos(angle) * radius];
});
function sparkle(material, r) {
  const group = new Group();
  const blade = extrude(material, sparkleOutline(r), r * 0.1);
  const cross = new Mesh(blade.geometry, material);
  cross.rotation.y = Math.PI / 2;
  group.add(blade, cross);
  return group;
}

/**
 * 直式螢幕的取景：共用的鏡頭只把 fov 加大，左右看得到的範圍還是比橫式窄很多。
 * 這裡把鏡頭沿水平方向往後拉，讓注視點那個深度左右看得到的寬度，和 refAspect 的橫式畫面一樣；視線也抬高一點。
 */
function fitPortrait(shot, aspect, refAspect = 1.5, tilt = 0.1) {
  if (aspect >= 1.25) return shot;
  const half = Math.tan((shot.fov * Math.PI) / 360), widened = Math.tan((widenFovForNarrowAspect(shot.fov, aspect) * Math.PI) / 360);
  const blend = smooth(linearstep(aspect, 1.25, 0.95));
  const k = 1 + Math.max(0, (half * refAspect) / (widened * aspect) - 1) * blend;
  shot.pos.x = shot.at.x + (shot.pos.x - shot.at.x) * k;
  shot.pos.z = shot.at.z + (shot.pos.z - shot.at.z) * k;
  shot.at.y += Math.hypot(shot.pos.x - shot.at.x, shot.pos.z - shot.at.z) * tilt * blend;
  return shot;
}

/** 不會動的群組（建築、雕像、樹林）烘成每個材質一個 mesh，省 draw call（第四輪：人物變成模型之後 draw call 變多） */
function bakeStatic(group) {
  const baked = bakeFigure(group);
  baked.position.copy(group.position);
  baked.quaternion.copy(group.quaternion);
  baked.scale.copy(group.scale);
  return baked;
}

export default function createMarketSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(42, 1, 0.05, 400);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([0.5, 0.8, 0.6]); // 光從右前方來：影子落在左後方，不會蓋住廣場上的東西
  const vermilion = mat.custom(RED, DARK_RED, 0); // 沒有邊緣光的紅（塔的屋簷斜面很多，邊緣光會變成一片白）
  const { strike, appear, act, out } = PACE.stove.beats;
  const black = mat.flat(BLACK), white = mat.flat(WHITE), red = mat.flat(RED);
  const glowWhite = mat.flat(WHITE, false); // 遠方發亮的東西（富士山的雪、星星）不被霧吃掉
  addFog(scene, mat, FOG_PLAZA.color, FOG_PLAZA.near, FOG_PLAZA.far); // 廣場是白霧、庭園是黑霧，在 update 裡切換

  const floor = ground(WHITE, 600);
  scene.add(floor);
  const plaza = new Group(), garden = new Group();
  scene.add(plaza, garden);

  // ================= 廣場 =================

  // ---- #21 神殿（第四輪：照封面改成兩層）：台階 → 下層是白牆、五個黑色門洞（四個人從右邊四個門走出來）
  //      → 一道白色的腰簷 → 上層是黑牆前的六根白柱 → 楣樑 → 三角山牆 ----
  const temple = new Group();
  // 平台與四級台階：白色踏面、黑色踢面（封面上是黑底白線）；每一階的踏面前緣多一條凸出的白色壓條
  temple.add(box(mat.paper, 9.2, PLATFORM_Y, 5.6, 0, PLATFORM_Y / 2, -3.0), box(black, 9.22, PLATFORM_Y * 0.62, 0.02, 0, PLATFORM_Y - STEP.rise * 0.5, -0.19));
  for (let k = 0; k < STEP.count; k++) {
    const height = STEP.rise * (k + 1), z = STEP.front - STEP.run / 2 - k * STEP.run;
    temple.add(box(mat.paper, 9.2, height, STEP.run, 0, height / 2, z), box(black, 9.22, STEP.rise * 0.62, 0.02, 0, height - STEP.rise * 0.5, z + STEP.run / 2 + 0.011));
    temple.add(box(mat.paper, 9.26, 0.035, 0.06, 0, height - 0.0175, z + STEP.run / 2 + 0.02));
  }
  // 台階兩側的矮牆（擋住台階的斷面，石塊有接縫）
  for (const x of [-4.75, 4.75]) {
    temple.add(box(mat.paper, 0.3, PLATFORM_Y + 0.25, 2.2, x, (PLATFORM_Y + 0.25) / 2, 0.3));
    temple.add(box(black, 0.31, 0.02, 2.21, x, PLATFORM_Y * 0.5, 0.3));
  }
  // 下層：白色的牆，五個門洞。牆用門與門之間的牆墩拼起來，門洞後面是一個黑色的深盒子（人從裡面走出來）
  const lowerY = PLATFORM_Y, lowerTop = PLATFORM_Y + LOWER_H, wallD = 0.35;
  const wallZ = DOOR.front - wallD / 2;
  const edges = [-4.3, ...DOORS.flatMap((x) => [x - DOOR.w / 2, x + DOOR.w / 2]), 4.3];
  for (let k = 0; k < edges.length; k += 2) {
    const w = edges[k + 1] - edges[k];
    temple.add(box(mat.paper, w, LOWER_H, wallD, (edges[k] + edges[k + 1]) / 2, lowerY + LOWER_H / 2, wallZ));
  }
  for (const x of DOORS) {
    temple.add(box(mat.paper, DOOR.w, LOWER_H - DOOR.h, wallD, x, lowerY + DOOR.h + (LOWER_H - DOOR.h) / 2, wallZ)); // 門楣上方的牆
    temple.add(box(black, DOOR.w + 0.02, DOOR.h, 0.04, x, lowerY + DOOR.h / 2, DOOR.back)); // 門洞的底
    for (const side of [-1, 1]) temple.add(box(black, 0.03, DOOR.h, DOOR.front - DOOR.back, x + side * (DOOR.w / 2 + 0.005), lowerY + DOOR.h / 2, (DOOR.front + DOOR.back) / 2)); // 門洞的側壁
    temple.add(box(black, DOOR.w + 0.02, 0.03, DOOR.front - DOOR.back, x, lowerY + DOOR.h, (DOOR.front + DOOR.back) / 2));
    temple.add(box(mat.ink, DOOR.w + 0.2, 0.09, 0.08, x, lowerY + DOOR.h + 0.12, DOOR.front + 0.03)); // 門楣上的一道黑色線腳
  }
  // 下層的牆面：兩道細的黑色石縫（白牆上的版畫線）
  for (const y of [0.55, 1.2]) temple.add(box(black, 8.62, 0.018, 0.01, 0, lowerY + y, DOOR.front + 0.006));
  // 腰簷：上下兩層之間的一道白色凸緣，底下一條黑線（封面上兩條白線夾一條黑）
  temple.add(box(mat.paper, 9.0, 0.2, wallD + 0.5, 0, lowerTop + 0.1, wallZ + 0.1), box(black, 9.02, 0.035, 0.02, 0, lowerTop + 0.04, wallZ + 0.36));
  // 上層：黑牆前的六根白柱（圓柱加方形柱頭、柱礎），柱身有凹槽（黑色細線）
  const COLUMN_H = 2.05, COLUMN_Z = -1.1, upperY = lowerTop + 0.2;
  for (let i = 0; i < 6; i++) {
    const x = -3.5 + i * 1.4;
    temple.add(
      cylinder(mat.paper, 0.22, 0.25, COLUMN_H - 0.24, x, upperY + 0.12, COLUMN_Z, 20),
      box(mat.paper, 0.62, 0.12, 0.62, x, upperY + 0.06, COLUMN_Z),
      box(mat.paper, 0.66, 0.12, 0.66, x, upperY + COLUMN_H - 0.06, COLUMN_Z),
    );
    for (let f = -2; f <= 2; f++) {
      const flute = box(black, 0.014, COLUMN_H - 0.4, 0.012, x + Math.sin(f * 0.45) * 0.235, upperY + COLUMN_H / 2, COLUMN_Z + Math.cos(f * 0.45) * 0.235);
      flute.rotation.y = f * 0.45;
      flute.userData.noShadow = true;
      temple.add(flute);
    }
  }
  // 柱廊後面的黑色殿身（白柱襯在黑底上，和封面一樣）
  temple.add(box(black, 8.2, COLUMN_H + LOWER_H, 3.6, 0, PLATFORM_Y + (COLUMN_H + LOWER_H) / 2 + 0.2, -3.85));
  // 楣樑：黑色橫樑，正面一道長白線和一排短白線
  const beamY = upperY + COLUMN_H, BEAM_H = 0.56, FRONT_Z = -0.6;
  temple.add(box(mat.ink, 9.0, BEAM_H, 5.3, 0, beamY + BEAM_H / 2, FRONT_Z - 2.65));
  temple.add(box(white, 8.2, 0.07, 0.02, 0, beamY + 0.13, FRONT_Z + 0.011));
  for (let i = 0; i < 14; i++) temple.add(box(white, 0.3, 0.05, 0.02, -3.9 + i * 0.6, beamY + 0.38, FRONT_Z + 0.011));
  // 山牆：擠出的黑色三角形屋頂；正面貼上平面版畫好的那一段（兩道白線和中間的花飾）
  const PX = 9.4 / 174; // 封面上山牆寬 174 像素
  const roofY = beamY + BEAM_H;
  const pediment = extrude(mat.ink, [[-4.7, 0], [4.7, 0], [0, 34.5 * PX]], 5.5);
  pediment.position.set(0, roofY, FRONT_Z - 2.7);
  temple.add(pediment);
  const facadeSprite = flat.object(21); // 貼圖涵蓋封面的 [368, 561]–[548, 726]
  const ornament = new Mesh(new PlaneGeometry(176 * PX, 37 * PX), new MeshBasicMaterial({ map: facadeSprite.material.map, alphaTest: 0.5 }));
  const uv = ornament.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (2 + uv.getX(i) * 176) / 180, 1 - (2 + (1 - uv.getY(i)) * 37) / 165); // 只取山牆那一段：x 370–546、y 563–600
  ornament.position.set(0, roofY - PX + (37 * PX) / 2, FRONT_Z + 0.06);
  ornament.userData.noShadow = true;
  temple.add(ornament);
  const bakedTemple = bakeStatic(temple); // 神殿整座不動：烘成每個材質一個 mesh
  register(21, bakedTemple);
  plaza.add(bakedTemple);

  // 廣場的鋪面（第四輪）：白色石板，石板之間是黑色的細縫，越遠越被白霧淡掉；靠近台階的幾塊有裂縫
  const seams = [];
  const seam = (x0, z0, x1, z1, w = 0.022) => {
    const g = new PlaneGeometry(Math.hypot(x1 - x0, z1 - z0), w);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    g.translate((x0 + x1) / 2, 0.003, (z0 + z1) / 2);
    seams.push(g);
  };
  for (let z = 1.6; z <= 22; z += 1.5) seam(-16, z, 26, z);
  for (let row = 0; row < 14; row++) {
    const z = 1.6 + row * 1.5;
    for (let x = -16 + (row % 2) * 1.1; x <= 26; x += 2.2) seam(x, z, x, z + 1.5);
  }
  for (const [x, z] of [[-1.8, 2.2], [2.3, 3.4], [6.1, 2.0], [-3.5, 4.7]]) {
    let px = x, pz = z, a = 0.6 + x;
    for (let k = 0; k < 4; k++) {
      const nx = px + Math.cos(a) * 0.35, nz = pz + Math.sin(a) * 0.35;
      seam(px, pz, nx, nz, 0.014);
      px = nx; pz = nz; a += Math.sin(k * 2.3 + x) * 0.9;
    }
  }
  const paving = new Mesh(mergeGeometries(seams), black);
  Object.assign(paving.material = black.clone(), { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  paving.userData.noShadow = true;
  plaza.add(paving);

  // ---- #22 四個提公事包的人（第四輪：立體人物）：黑西裝、黑色的頭（封面上是黑色剪影），白色細領帶，
  //      外面一圈白色描邊（封面上黑衣人走在黑色門洞前，靠白線分出輪廓）；右手（畫面左邊）提著黑色公事包。
  //      從門洞裡走出來、走下台階，再往兩旁分開；走路是關節動畫（腿、手臂擺動，公事包跟著晃） ----
  const walkers = new Group();
  const lineWidth = 0.02;
  WALK_GAPS.forEach((x, i) => {
    const walker = makeFigure(mat, { suit: mat.ink, skin: mat.ink, hair: i === 2 ? "bald" : "short", shirt: mat.paper, tie: mat.paper, height: WALKER_HEIGHT, build: 1 + (i % 2) * 0.06, outline: "#f2efe6", outlineWidth: lineWidth });
    const joints = walker.userData.joints;
    // 剪影的臉不要五官：拿掉鼻子（黑色鼻子的邊緣光和白色描邊，在黑色的臉上會變成一個圈）
    for (const o of [...joints.head.children]) if (o.geometry?.parameters?.radius === 0.022) joints.head.remove(o);
    // 公事包：提把在手裡，箱子垂在下面；白色描邊和一條白色的提把、扣環
    const briefcase = new Group();
    const caseBody = box(mat.ink, 0.36, 0.27, 0.1, 0, -0.2, 0);
    const handle = new Mesh(new CylinderGeometry(0.012, 0.012, 0.12, 6), mat.paper);
    handle.rotation.z = Math.PI / 2;
    handle.position.y = -0.055;
    const clasp = box(mat.paper, 0.05, 0.03, 0.012, 0, -0.1, 0.055);
    briefcase.add(caseBody, handle, clasp);
    inkOutline(caseBody, { width: lineWidth, color: "#f2efe6" });
    briefcase.position.y = -0.31;
    joints.elbowR.add(briefcase);
    walker.userData.briefcase = briefcase;
    walker.position.x = x;
    walkers.add(walker);
  });
  register(22, walkers, { count: 4 });
  plaza.add(walkers);
  const WALK_FROM = -1.55, WALK_TO = 12.5;
  const floorAt = (z) => (z < STEP.front - STEP.run * STEP.count ? PLATFORM_Y : z > STEP.front ? 0 : STEP.rise * (Math.floor((STEP.front - z) / STEP.run) + 1));

  // ---- #23 行情看板：立在兩根柱子上的黑色格線板（6×6 格）；紅箭頭是一條有厚度的折線，從板面凸出來 ----
  const chart = new Group();
  const S = PANEL.size, CELLS = 6;
  const board = new Group();
  board.add(box(black, S, S, 0.14));
  for (let i = 1; i < CELLS; i++) {
    const offset = -S / 2 + (S * i) / CELLS;
    board.add(box(white, 0.05, S, 0.16, offset, 0, 0), box(white, S, 0.05, 0.16, 0, offset, 0));
  }
  board.position.y = PANEL.base + S / 2;
  chart.add(board);
  for (const x of [-S * 0.3, S * 0.3]) chart.add(box(mat.ink, 0.16, PANEL.base, 0.16, x, PANEL.base / 2, 0), box(mat.ink, 0.5, 0.08, 0.9, x, 0.04, 0));
  // 箭頭的折線，用格線座標（a 往右、b 往下，0–1 是板面）。照封面：先跌一小段、漲到最高、重挫、反彈、再跌出板子右緣。
  // 照封面：最後一段一路往下，箭頭從格線的右下角穿出去，尖端在下緣之外（b > 1）。
  const ARROW = [[-0.153, 0.027], [-0.005, 0.43], [0.389, 0.106], [0.589, 0.797], [0.855, 0.495], [1.1, 1.04]].map(([a, b]) => [(a - 0.5) * S, (0.5 - b) * S]);
  const ARROW_W = 0.27, ARROW_D = 0.3, ARROW_Z = 0.3;
  const sides = strokeSides(ARROW, ARROW_W);
  const arrow = new Group();
  const segments = [];
  let arrowLength = 0;
  for (let i = 0; i < ARROW.length - 1; i++) {
    const [x0, y0] = ARROW[i], [x1, y1] = ARROW[i + 1];
    const angle = Math.atan2(y1 - y0, x1 - x0), cos = Math.cos(-angle), sin = Math.sin(-angle), length = Math.hypot(x1 - x0, y1 - y0);
    // 每一段各自一塊，原點在這一段的起點、x 軸沿著前進方向：畫出來的時候沿 x 拉長
    const local = [sides.left[i], sides.left[i + 1], sides.right[i + 1], sides.right[i]].map(([x, y]) => [(x - x0) * cos - (y - y0) * sin, (x - x0) * sin + (y - y0) * cos]);
    const piece = extrude(mat.red, local, ARROW_D);
    piece.position.set(x0, y0, ARROW_Z);
    piece.rotation.z = angle;
    arrow.add(piece);
    segments.push({ piece, start: arrowLength, length });
    arrowLength += length;
  }
  const [tipX, tipY] = ARROW.at(-1), [prevX, prevY] = ARROW.at(-2);
  const head = extrude(mat.red, [[0.62, 0], [-0.1, 0.46], [-0.1, -0.46]], ARROW_D);
  head.position.set(tipX, tipY, ARROW_Z);
  head.rotation.z = Math.atan2(tipY - prevY, tipX - prevX);
  arrow.add(head);
  arrow.position.y = board.position.y;
  chart.add(arrow);
  chart.position.set(...PANEL.at);
  chart.rotation.y = PANEL.turn;
  register(23, chart);
  plaza.add(chart);

  // ---- 圓桌：白色桌面、黑色桌緣與桌腳 ----
  const table = new Group();
  const TABLE_Y = 0.92;
  const top = new Mesh(new CylinderGeometry(1.55, 1.55, 0.1, 40), [mat.ink, white, mat.ink]);
  top.position.y = TABLE_Y - 0.05;
  table.add(top, cylinder(mat.ink, 0.1, 0.14, TABLE_Y - 0.1, 0, 0, 0, 12), cylinder(mat.ink, 0.6, 0.66, 0.06, 0, 0, 0, 24));
  table.position.set(...TABLE);
  plaza.add(table);

  // ---- #24 一疊鈔票：五張紅色的薄板，中間夾著黑縫；最上面一張是黑底紅框、中間一個紅色橢圓 ----
  const banknotes = new Group();
  const NOTE = { w: 1.35, d: 0.64, h: 0.05, gap: 0.03 };
  for (let i = 0; i < 5; i++) {
    const y = i * (NOTE.h + NOTE.gap);
    banknotes.add(box(mat.red, NOTE.w, NOTE.h, NOTE.d, 0, y + NOTE.h / 2, 0));
    if (i < 4) banknotes.add(box(black, NOTE.w - 0.05, NOTE.gap, NOTE.d - 0.05, 0, y + NOTE.h + NOTE.gap / 2, 0));
  }
  const noteTop = 5 * NOTE.h + 4 * NOTE.gap;
  const oval = cylinder(red, 0.17, 0.17, 0.012, 0, noteTop + 0.011, 0, 28);
  oval.scale.x = 1.7;
  banknotes.add(box(black, NOTE.w * 0.8, 0.012, NOTE.d * 0.7, 0, noteTop + 0.006, 0), oval);
  banknotes.position.set(-0.55, TABLE_Y, 0.25);
  banknotes.rotation.y = 0.45;
  register(24, banknotes);
  table.add(banknotes);

  // ---- #50 三疊籌碼（10、5、6 枚）：排成三角形，後面那疊最高。黑色圓柱，側面一圈圈紅色的方塊記號，頂面是紅的 ----
  const chips = new Group();
  const CHIP_R = 0.21, CHIP_H = 0.068;
  [[0.62, -0.42, 10], [0.3, 0.2, 5], [0.98, 0.24, 6]].forEach(([x, z, count]) => {
    const side = new MeshBasicMaterial({
      map: canvasTexture(384, 40 * count, (ctx, w, h) => {
        ctx.fillStyle = BLACK;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = RED;
        for (let row = 0; row < count; row++) for (let i = 0; i < 8; i++) ctx.fillRect(i * 48 + 10, row * 40 + 11, 26, 19);
      }),
    });
    const stack = new Group();
    stack.add(new Mesh(new CylinderGeometry(CHIP_R, CHIP_R, CHIP_H * count, 28), [side, black, black]));
    // 頂面：紅色圓盤、黑色圓心、六道黑色刻痕
    const y = (CHIP_H * count) / 2;
    stack.add(cylinder(red, CHIP_R * 0.86, CHIP_R * 0.86, 0.006, 0, y, 0, 28), cylinder(black, CHIP_R * 0.42, CHIP_R * 0.42, 0.006, 0, y + 0.006, 0, 20));
    for (let i = 0; i < 6; i++) {
      const notch = box(black, CHIP_R * 0.36, 0.006, 0.022, Math.cos(i * 1.047) * CHIP_R * 0.68, y + 0.009, Math.sin(i * 1.047) * CHIP_R * 0.68);
      notch.rotation.y = -i * 1.047;
      stack.add(notch);
    }
    stack.position.set(x, TABLE_Y + y, z);
    chips.add(stack);
  });
  register(50, chips, { count: 3 });
  table.add(chips);

  // ---- #49 π Σ ν：三個擠出的立體字，輪廓用筆畫自己描（第二個字是有稜角的 Σ） ----
  const greek = new Group();
  const letter = { width: 4.4, depth: 0.3, k: 0.062, baseline: 12.6 };
  const GLYPHS = [
    { originX: -22.5, strokes: [[[-33, -8.5], [-12, -8.5]], [[-27.5, -8.5], [-27.5, 11.4]], [[-18, -8.5], [-18, 6], [-16.8, 8.8], [-13, 9.4]]] }, // π：一橫兩豎，右腳往外勾
    { originX: 0.5, strokes: [[[8, -5.5], [8, -9.6], [-7.6, -9.6], [1.6, 0.4], [-7.6, 10.4], [8.6, 10.4], [8.6, 6.2]]] }, // Σ：全部是直線
    { originX: 24, strokes: [[[11.2, -4.5], [14.8, 10.4], [33.9, -5.9], [42.8, -7.2]]] }, // ν：左短右長，右上帶一個小勾
  ];
  GLYPHS.forEach(({ originX, strokes }, i) => {
    const mesh = glyph(mat.ink, strokes, { ...letter, originX });
    mesh.position.x = [-1.5, 0, 1.45][i];
    greek.add(mesh);
  });
  greek.position.set(...LETTERS);
  greek.rotation.y = -0.6;
  register(49, greek);
  plaza.add(greek);

  // 封面上神殿和看板後面那一排黑色的松樹：一層一層的圓錐疊起來，遠的被白霧淡掉
  const pines = new Group();
  for (const [x, z, h] of [[7.4, -7.5, 5.6], [10.5, -17, 8], [14.5, -21, 9.5], [18, -15, 7], [22, -24, 10.5], [26.5, -18, 8.5], [31, -28, 11.5], [36, -20, 9], [17, -33, 12], [42, -34, 12.5],
    [-8, -9, 6], [-12, -17, 8.5], [-18, -26, 11], [-27, -34, 12.5], [3, -36, 13], [28, -40, 14]]) {
    const pine = new Group();
    pine.add(cylinder(mat.ink, 0.045 * h, 0.06 * h, 0.2 * h, 0, 0, 0, 7));
    for (let k = 0; k < 4; k++) {
      const tier = cone(mat.ink, (0.3 - k * 0.058) * h, (0.36 - k * 0.03) * h, 0, (0.14 + k * 0.2) * h, 0, 7);
      tier.rotation.y = k * 0.7 + x;
      pine.add(tier);
    }
    pine.position.set(x, 0, z);
    pines.add(pine);
  }
  plaza.add(bakeStatic(pines));

  // 空氣：廣場上被風吹著跑的黑色紙屑
  const scraps = new Snow({ count: Math.round(420 * deviceTier.particleScale), box: new Vector3(34, 9, 26), center: new Vector3(4, 4.5, 2), size: 34, speed: 0.35, wind: 2.2, color: BLACK });
  plaza.add(scraps);

  // ================= 日本的庭園（夜） =================

  // ---- #95 紅色五重塔：封面上是塔刹、四層翹角的屋簷、底層兩個門洞 ----
  const pagoda = new Group();
  const underside = mat.flat(DARK_RED); // 屋簷底面：從低處仰看時是一片暗紅，不會變成黑洞
  const roof = (eave, topHalf, y, height) => {
    const r = Math.SQRT2; // 四邊形車床的半徑量到角上
    const mesh = faceted(lathe(vermilion, [[eave * r, y + 0.1], [eave * r * 0.93, y + 0.02], [eave * r * 0.8, y], [(topHalf + (eave - topHalf) * 0.3) * r, y + height * 0.5], [topHalf * r, y + height]], 4));
    mesh.rotation.y = Math.PI / 4;
    pagoda.add(mesh, box(underside, eave * 1.9, 0.05, eave * 1.9, 0, y + 0.045, 0));
    // 四個翹起來的簷角（封面上每層屋簷兩端往上勾）
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const tip = cone(vermilion, 0.1 + eave * 0.03, 0.34 + eave * 0.08, 0, 0, 0, 4);
      tip.position.set(sx * eave * 0.99, y + 0.16, sz * eave * 0.99);
      tip.rotation.set(sz * 0.75, 0, -sx * 0.75);
      pagoda.add(tip);
    }
  };
  pagoda.add(box(vermilion, 4.1, 0.85, 4.1, 0, 0.425, 0));
  for (const x of [-0.95, 0.95]) pagoda.add(box(black, 0.74, 0.42, 0.04, x, 0.47, 2.06));
  roof(2.4, 1.1, 0.85, 0.95);
  pagoda.add(box(vermilion, 2.0, 0.34, 2.0, 0, 1.95, 0));
  roof(2.0, 0.85, 2.1, 0.95);
  pagoda.add(box(vermilion, 1.5, 0.34, 1.5, 0, 3.2, 0));
  roof(1.65, 0.6, 3.35, 0.9);
  pagoda.add(box(vermilion, 1.0, 0.34, 1.0, 0, 4.4, 0));
  roof(1.0, 0.06, 4.55, 0.95);
  pagoda.add(cylinder(vermilion, 0.035, 0.05, 1.15, 0, 5.4, 0, 8));
  for (const y of [5.7, 5.92, 6.14]) pagoda.add(cylinder(vermilion, 0.11, 0.11, 0.05, 0, y, 0, 10));
  pagoda.scale.setScalar(1.15);
  register(95, pagoda);
  garden.add(pagoda);

  // ---- #96 富士山：低多邊形的黑色山體，外面一圈白線；山頂平、積雪往下滴成鋸齒 ----
  const fuji = new Group();
  const circle = (radius, y, sides = 14) => Array.from({ length: sides }, (_, i) => [Math.cos((i / sides) * Math.PI * 2) * radius, y, Math.sin((i / sides) * Math.PI * 2) * radius]);
  const fujiCone = ringsGeometry([circle(27, 0), circle(15.5, 4), circle(8.6, 9), circle(5, 13), circle(3.6, 15.2)]);
  const mountain = new Mesh(fujiCone, mat.flat(BLACK, false)); // 不受霧：黑山在黑霧裡本來就是黑的（受霧的話會被換成廣場的白霧）
  mountain.add(hull(fujiCone, 0.32));
  const drip = circle(1, 0).map(([x, , z], i) => (i % 2 ? [x * 5.5, 12.6, z * 5.5] : [x * 7.2, 10.7, z * 7.2]));
  const snowCap = new Mesh(ringsGeometry([drip, circle(5.15, 13), circle(3.75, 15.25)]), glowWhite);
  fuji.add(mountain, snowCap);
  fuji.position.set(24, 0, -62); // 緊貼在塔的右後方（和封面一樣），直式螢幕也看得到山頂
  register(96, fuji);
  garden.add(fuji);

  // ---- #94 白色的 ¥：擠出的立體符號，掛在塔的左上方 ----
  const yen = glyph(white, [[[392.4, 1118], [397.5, 1124.6], [402.6, 1118]], [[397.5, 1124.2], [397.5, 1133.6]], [[392.6, 1125.4], [402.4, 1125.4]], [[392.6, 1128.8], [402.4, 1128.8]]], { width: 1.9, depth: 0.4, k: 0.17, originX: 397.5, baseline: 1133.6 });
  const YEN = [-3.5, 3.7, 1.0]; // 緊貼在塔的左上方（和封面一樣），直式螢幕也在畫面裡
  register(94, yen);
  garden.add(yen);

  // 池塘（黑色的水、白色的波紋）、幾塊踏石
  const pond = water({ base: BLACK, wave: WHITE, rows: 9 });
  (pond as Mesh).geometry = new CircleGeometry(1, 48);
  pond.scale.set(7.5, 3.4, 1);
  pond.position.set(-1.5, 0.012, 7.4);
  garden.add(pond);
  const stones = new Group();
  for (const [x, z, r] of [[3.6, 3.6, 0.42], [4.5, 4.7, 0.36], [5.1, 6.0, 0.44], [5.4, 7.4, 0.38]]) stones.add(cylinder(mat.ink, r, r * 1.1, 0.12, x, 0, z, 9));
  garden.add(stones);
  // 封面上富士山右邊那顆四芒星：立體的星形，慢慢轉動
  const star = sparkle(glowWhite, 1.7);
  star.position.set(38, 13.5, -60);
  garden.add(star);
  const snow = new Snow({ count: Math.round(900 * deviceTier.particleScale), box: new Vector3(34, 12, 30), center: new Vector3(0, 6, 0), size: 34, speed: 0.6, wind: 0.5 });
  garden.add(snow);


  // ---- 鏡頭 ----
  // 2026-11-19 第三輪（鏡頭要順）：整章只有兩次推拉反轉，廣場和庭園共用一條連續的軌道。
  // 台階底下仰看、一路推近 → 0.3 起一路往後退、往右橫移：大景 → 貼著圓桌滑過去（桌子在前景，不另外推近）→ 正對看板看箭頭
  // → 0.71–0.80 往左後方甩回原點（神殿原本的位置），0.74 換場時鏡頭正在移動，換成庭園後落在隔著池塘看塔的大景
  // → 之後一路推近並升高，富士山留在塔的右後方。
  const track = makeCameraTrack([
    { t: -0.3, pos: [0.9, 0.45, 8.4], at: [0.3, 3.0, -1], fov: 46 },
    { t: strike, pos: [0.7, 0.45, 5.8], at: [0.4, 2.7, -1], fov: 46 },
    { t: 0.3, pos: [0.7, 0.75, 5.2], at: [0.4, 2.5, -1], fov: 46 },
    { t: 0.38, pos: [2.2, 1.9, 10.0], at: [8.4, 2.5, 3.0], fov: 44 }, // 退後並轉向看板：字母開始落地
    { t: 0.46, pos: [2.0, 2.4, 11.6], at: [9.2, 2.2, 4.4], fov: 42 }, // 大景：看板、圓桌、字母
    { t: 0.56, pos: [5.0, 2.1, 11.0], at: [9.9, 1.7, 1.6], fov: 42 }, // 往右滑過圓桌：鈔票和籌碼在前景，看板在後面
    { t: 0.62, pos: [3.8, 3.0, 10.6], at: [9.6, 3.4, 1.5], fov: 42 }, // 正對看板：箭頭從左上角畫進來
    { t: 0.71, pos: [4.3, 3.2, 10.8], at: [10.0, 3.1, 1.4], fov: 42 }, // 跟著箭頭往右下：尖端和箭頭落在格線下緣之外
    { t: 0.8, pos: [-2.2, 0.9, 14.5], at: [0.8, 3.3, 0], fov: 42 }, // 庭園：隔著池塘看塔
    { t: 0.88, pos: [-1.0, 1.3, 12.6], at: [0.8, 3.5, 0], fov: 42 },
    { t: 1.0, pos: [0.8, 2.4, 10.8], at: [0.8, 3.6, 0], fov: 42 },
    { t: 1.3, pos: [1.6, 3.0, 10.2], at: [0.8, 3.7, 0], fov: 42 },
  ]);

  let foggedGarden = false, floorMaterial = null;
  /** 引擎把純色的地面、牆換成接收陰影的卡通材質時，霧是照載入當下（廣場的白霧）設定的；換場時要一起改 */
  const syncSwappedFog = (fog) => {
    scene.traverse((o) => {
      const u = ((o as Mesh).material as ShaderMaterial)?.uniforms;
      if (!u?.uFogColor || mat.all.includes((o as Mesh).material)) return;
      u.uFogColor.value.set(fog.color);
      u.uFogNear.value = fog.near;
      u.uFogFar.value = fog.far;
    });
  };
  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList(pacedCues("stove", ["steps", "templeBell"]), [{ at: 0.3, cue: "thud" }, { at: 0.35, cue: "thud" }, { at: 0.4, cue: "thud" }, { at: 0.5, cue: "coins" }, { at: 0.6, cue: "stinger" }, { at: 0.61, cue: "plunge" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const time = frame.time;
      const inGarden = p >= out;
      plaza.visible = !inGarden;
      garden.visible = inGarden;
      (scene.background as Color).set(inGarden ? BLACK : WHITE);
      if (inGarden !== foggedGarden || floor.material !== floorMaterial) { // 換場時換霧：廣場是白霧，庭園是黑霧
        foggedGarden = inGarden;
        const fog = inGarden ? FOG_GARDEN : FOG_PLAZA;
        scene.fog.color.set(fog.color);
        (scene.fog as Fog).near = fog.near;
        (scene.fog as Fog).far = fog.far;
        mat.setFog(fog);
        syncSwappedFog(fog);
        floorMaterial = floor.material;
      }
      // 直式的取景參數也跟著換場的移動漸變（廣場 1.75／0.08 → 庭園 1.5／0.12），不在 0.74 跳一下
      const toGarden = smooth(linearstep(p, 0.71, 0.8));
      const shot = fitPortrait(track(p), frame.aspect, 1.75 - 0.25 * toGarden, 0.08 + 0.04 * toGarden);
      applyCameraShot(camera, shot, frame.aspect, frame.pointer, 0.05);

      if (!inGarden) {
        scraps.update(time);
        // 四個人：strike 之後一個接一個起步；腳踩在台階的每一階上，步伐由走過的距離決定
        walkers.children.forEach((walker, i) => {
          const start = strike + i * 0.02;
          const walk = linearstep(p, start, start + 0.2);
          const z = WALK_FROM + (WALK_TO - WALK_FROM) * walk;
          const stride = (z - WALK_FROM) * 4.2;
          // 下了台階就往兩旁分開：從鏡頭兩側遠遠地走出畫面，不會貼著鏡頭把畫面塞滿
          const part = smooth(linearstep(z, STEP.front - 0.4, 6.4));
          walker.position.set(WALK_GAPS[i] + WALK_SIDE[i] * part + Math.sin(stride * 0.5) * 0.02, floorAt(z), z);
          // 關節動畫：步伐由走過的距離決定（一步約 0.37）；還沒起步時站著，身體隨呼吸微微起伏
          const amount = walk > 0 && walk < 1 ? 1 : 0;
          walkCycle(walker, stride * 0.85, amount);
          const j = walker.userData.joints;
          j.shoulderR.rotation.x *= 0.35; // 提公事包的手擺得小
          j.shoulderR.rotation.z = -0.12;
          j.elbowR.rotation.x = -0.05;
          j.spine.rotation.x = 0.06 * amount + Math.sin(time * 1.6 + i) * 0.015; // 走路時上身微微前傾
          j.head.rotation.x = 0.12 * amount; // 低著頭走
          j.head.rotation.y = amount ? 0 : Math.sin(time * 0.4 + i * 1.7) * 0.15;
          walker.userData.briefcase.rotation.x = -(j.shoulderR.rotation.x + j.elbowR.rotation.x) + Math.sin(stride * 0.85 + 0.6) * 0.18 * amount; // 箱子垂直往下，跟著步伐晃
          walker.visible = walk < 1;
          faceCamera(walker, camera, 0.55);
        });

        // π Σ ν：appear 的時間窗裡一個一個從上面落到地上，落地時壓扁一下
        greek.children.forEach((mesh, i) => {
          const start = appear[0] + i * 0.035;
          const drop = linearstep(p, start, start + 0.07);
          const squash = Math.sin(linearstep(p, start + 0.07, start + 0.1) * Math.PI) * 0.14;
          mesh.position.y = 7 * (1 - drop) * (1 - drop);
          mesh.scale.set(1 + squash * 0.5, 1 - squash, 1);
          mesh.visible = drop > 0;
        });

        // 籌碼輪流微微起伏（待機）
        chips.children.forEach((stack, i) => (stack.rotation.y = Math.sin(time * 0.7 + i * 2.1) * 0.2));

        // 紅箭頭：act 的時間窗裡沿著折線一段一段畫出來，最後冒出箭頭
        const drawn = smooth(linearstep(p, act[0] - 0.02, act[1])) * arrowLength;
        for (const { piece, start, length } of segments) {
          const amount = clamp((drawn - start) / length, 0, 1);
          piece.scale.x = Math.max(amount, 0.0001);
          piece.visible = amount > 0;
        }
        const pop = smooth(linearstep(p, act[1] - 0.012, act[1] + 0.012));
        head.scale.setScalar(Math.max(pop, 0.0001));
        head.visible = pop > 0;
      } else {
        snow.update(time);
        pond.userData.update(time);
        // ¥：到了庭園之後慢慢往下沉（日圓貶值），一邊左右轉，看得到厚度
        yen.position.set(YEN[0], YEN[1] + 1.0 * (1 - smooth(linearstep(p, 0.84, 0.95))) + Math.sin(time * 0.9) * 0.05, YEN[2]);
        yen.rotation.y = Math.sin(time * 0.6) * 0.55;
        star.quaternion.copy(camera.quaternion);
        star.rotateY(time * 0.3);
        star.scale.setScalar(0.85 + 0.15 * Math.sin(time * 1.7));
      }
    },
  };
}
