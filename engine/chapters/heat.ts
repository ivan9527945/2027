// 又一次最熱年（#76、77、91、93、104、105、115、116）。
// 元素分散在封面三處：右下（溫度計、風機）→ 左側（森林大火、雄鹿）→ 左下（農民、牛、松樹、草叢）。
//
// 節奏範本：stove。節拍對應：
//   strike   0.05          溫度計的紅柱衝過頂端（音效 boom）
//   flash    [0.05, 0.14]  頂端三道放射線彈出來；之後鏡頭帶到旁邊的兩座風機（第 1 句）
//   appear   [0.28, 0.42]  鏡頭橫越到圓的左側，火舌從黑色森林後面竄起來
//   pullBack [0.30, 0.46]  退後，看到整片火場（第 2 句）
//   act      [0.60, 0.70]  推近火場前的雄鹿，牠驚跳一下（第 3 句）
//   out      0.74          雄鹿往右竄出去（音效 flip），vanish [0.735, 0.765] 期間消失
//   back     [0.76, 0.86]  鏡頭落到左下的農地：牛走進來、0.84 起低下頭，農民雙手插腰站著（第 4 句）
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { PACE, pacedCaptions, pacedCues } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawCowBody, drawCowHead } from "../shared/world/animals";
import { drawTurbineRotor, drawTurbineTower } from "../shared/world/buildings";
import { drawSpikyTuft } from "../shared/world/nature";
import { drawPine, traceBlob } from "../shared/world/props";
import { BLACK, RED, WHITE, coverSprite, shot, toUnits, toWorld } from "../shared/world/space";

// ---- 溫度計（#93） ----
const THERMO_X = 763.5;
const MERCURY = [1155, 1198]; // 紅柱的頂與底
const BURST_ORIGIN: [number, number] = [764, 1156]; // 放射線從這裡彈出去
const RAYS = [[752, 1146.5, 757.5, 1152], [762.8, 1139, 762.8, 1148], [772.6, 1144, 768.8, 1150]];

// ---- 風機（#91）：[輪轂 x, 輪轂 y, 塔底 y, 葉片長, 朝上那片的角度（canvas 弧度）] ----
const TURBINES = [[869.7, 1145, 1190, 24, -1.407], [896.7, 1134, 1176, 27, -1.426]];
const ISLAND = [
  [843, 1197.5], [850, 1193], [858, 1190.5], [866, 1188], [874, 1188.5], [882, 1183], [889, 1177], [896, 1172.5],
  [903, 1170], [906.5, 1170.5], [903, 1176], [897, 1183], [890, 1190], [880, 1196], [868, 1199.5], [852, 1199.5],
];

// ---- 森林大火（#76）：整片火焰一個輪廓，切成四條直幅（標註外框才不會太大）；切點選在火舌之間的凹處 ----
const FIRE_BASE = 926;
const FIRE_SLICES = [[80, 104], [104, 135.5], [135.5, 172], [172, 238]];
// 火場前景的黑松（屬於 #76「黑色森林」，不算在 #115 裡）：[x, 樹腳 y, 高]
const FOREST = [[106, 909, 71], [128, 907, 23], [150.5, 911, 51]];

// ---- 左下的農地 ----
// #115 松樹：[x, 樹腳 y, 高, 樹腳土墩的半寬]
const PINES = [[137.5, 1077, 56, 0], [192.5, 1127.5, 31, 12.5], [255.5, 1121.5, 17, 9.5], [272.5, 1121.5, 32, 13], [293.8, 1121.5, 24, 10.5]];
// #116 草叢：[中心 x, 底 y, 寬, 高]
const TUFTS = [[203.7, 1155, 21, 12], [292.5, 1182.5, 21, 10], [257.5, 1203, 35, 19], [299, 1217, 38, 19], [341, 1221, 29, 24], [308.7, 1247, 37, 19]];
// #105 牛：[身體左緣 x, 背 y, 身長]，都朝右
const COWS = [[259.5, 1135.5, 28.5], [218, 1155, 31]];

function traceFire(ctx) {
  ctx.beginPath();
  ctx.moveTo(81.5, FIRE_BASE);
  ctx.lineTo(82, 866);
  ctx.quadraticCurveTo(83, 829, 99.5, 813); // 第 1 道火舌
  ctx.quadraticCurveTo(94.5, 832, 98, 846);
  ctx.lineTo(104, 846);
  ctx.quadraticCurveTo(116, 838, 119, 818); // 第 2 道
  ctx.quadraticCurveTo(122, 806, 132.5, 799.5);
  ctx.quadraticCurveTo(131.5, 808, 135.5, 815.5);
  ctx.quadraticCurveTo(147, 803, 156, 789); // 第 3 道，最高
  ctx.quadraticCurveTo(160, 781.5, 166.5, 778);
  ctx.quadraticCurveTo(164.5, 796, 170, 811);
  ctx.quadraticCurveTo(171, 817, 172, 820.5);
  ctx.quadraticCurveTo(183, 810, 193, 802); // 第 4 道
  ctx.quadraticCurveTo(196.5, 798.5, 201, 796.5);
  ctx.quadraticCurveTo(195.5, 808, 199.5, 820);
  ctx.quadraticCurveTo(197.5, 829, 201.5, 837);
  ctx.quadraticCurveTo(205.5, 832, 210, 830.5); // 第 5 道
  ctx.quadraticCurveTo(203.5, 845, 205.5, 857);
  ctx.quadraticCurveTo(206, 863, 208.5, 866);
  ctx.quadraticCurveTo(219, 855, 229.5, 847.5); // 第 6 道
  ctx.quadraticCurveTo(229.5, 862, 226.5, 877);
  ctx.quadraticCurveTo(224.5, 886, 221, 890.5);
  ctx.quadraticCurveTo(226.5, 892.5, 232, 888.5); // 最右下的小火舌
  ctx.quadraticCurveTo(229, 903, 237, 922);
  ctx.lineTo(237, FIRE_BASE);
  ctx.closePath();
}

function drawFire(ctx) {
  traceFire(ctx);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.save();
  traceFire(ctx);
  ctx.clip();
  ctx.fillStyle = WHITE;
  // 火焰中間斜斜的一道空隙
  ctx.beginPath();
  ctx.moveTo(156, 817.5);
  ctx.quadraticCurveTo(149, 838, 137, 847.5);
  ctx.quadraticCurveTo(125, 853, 119.5, 868);
  ctx.lineTo(116, 888);
  ctx.lineTo(148, 900);
  ctx.lineTo(153.5, 866);
  ctx.quadraticCurveTo(157, 845, 156, 817.5);
  ctx.fill();
  // 右側的一絲白
  ctx.beginPath();
  ctx.moveTo(193.6, 851.5);
  ctx.quadraticCurveTo(189.5, 859, 187, 867);
  ctx.lineTo(191.4, 864.2);
  ctx.quadraticCurveTo(191, 858, 193.6, 851.5);
  ctx.fill();
  // 松樹與鹿之間的空隙
  ctx.beginPath();
  ctx.moveTo(157, 880);
  ctx.lineTo(168, 884);
  ctx.lineTo(171, 889);
  ctx.lineTo(163.5, 892);
  ctx.lineTo(160.5, 900);
  ctx.lineTo(155, 897);
  ctx.closePath();
  ctx.fill();
  // 空隙裡再竄出一道小火
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(119, 904);
  ctx.quadraticCurveTo(120, 882, 128, 873);
  ctx.quadraticCurveTo(133.5, 868, 136.6, 859.5);
  ctx.quadraticCurveTo(137, 870, 141, 876);
  ctx.quadraticCurveTo(145.5, 886, 144, 904);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 火場腳下的黑色山丘（不屬於任何編號）：森林的地面，往右隆起成雄鹿站的坡
function drawFireHill(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(80, 903);
  ctx.lineTo(120, 904);
  ctx.quadraticCurveTo(160, 903.5, 204, 906);
  ctx.quadraticCurveTo(224, 910, 240, 928);
  ctx.lineTo(240, 942);
  ctx.lineTo(86, 942);
  ctx.lineTo(80, 926);
  ctx.closePath();
  ctx.fill();
}

// 雄鹿：身體朝左、頭轉過來正對畫面，兩支鹿角往左右張開
function drawStag(ctx) {
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath(); // 軀幹
  ctx.moveTo(168.5, 874);
  ctx.quadraticCurveTo(172, 865, 184, 866.5);
  ctx.lineTo(204, 868);
  ctx.quadraticCurveTo(214.5, 869, 216.5, 877);
  ctx.quadraticCurveTo(219, 885, 214, 890);
  ctx.quadraticCurveTo(202, 893, 186, 890.5);
  ctx.quadraticCurveTo(170, 889, 168.5, 874);
  ctx.fill();
  ctx.lineWidth = 8.5; // 頸
  ctx.beginPath();
  ctx.moveTo(171, 859);
  ctx.lineTo(175, 871);
  ctx.stroke();
  ctx.lineWidth = 3.1; // 前腿
  for (const x of [172.6, 182.6]) {
    ctx.beginPath();
    ctx.moveTo(x + 0.6, 884);
    ctx.lineTo(x, 906.5);
    ctx.stroke();
  }
  ctx.beginPath(); // 後腿：飛節往後折
  ctx.moveTo(206, 886);
  ctx.lineTo(203.6, 897);
  ctx.lineTo(204.4, 907.5);
  ctx.moveTo(213.5, 884);
  ctx.lineTo(216.4, 897);
  ctx.lineTo(214.4, 904);
  ctx.lineTo(215.6, 914);
  ctx.stroke();
  ctx.beginPath(); // 尾巴
  ctx.moveTo(215.5, 873);
  ctx.lineTo(219.6, 877.5);
  ctx.lineTo(216.5, 880);
  ctx.fill();
  ctx.beginPath(); // 頭
  ctx.ellipse(169.4, 855.6, 4, 5.6, 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // 耳朵
  ctx.moveTo(166.5, 853.5);
  ctx.lineTo(159.6, 855.8);
  ctx.lineTo(165.6, 857);
  ctx.moveTo(172.5, 853);
  ctx.lineTo(179, 852.6);
  ctx.lineTo(173.6, 856.6);
  ctx.fill();
  // 鹿角：主幹加三個分叉
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(167.4, 851.5);
  ctx.quadraticCurveTo(161, 846, 156.8, 835);
  ctx.moveTo(163.2, 846.4);
  ctx.lineTo(161, 836.6);
  ctx.moveTo(160.4, 843);
  ctx.lineTo(154.2, 841.6);
  ctx.moveTo(165.4, 849.4);
  ctx.lineTo(166.4, 841.4);
  ctx.moveTo(172, 851.2);
  ctx.quadraticCurveTo(182, 846.6, 192.4, 834);
  ctx.moveTo(180.2, 845.6);
  ctx.lineTo(180, 837.4);
  ctx.moveTo(185.4, 841.6);
  ctx.lineTo(186.8, 834.6);
  ctx.moveTo(176, 848.8);
  ctx.lineTo(174.2, 842);
  ctx.stroke();
}

function drawThermometerBody(ctx) {
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.3; // 玻璃管左緣
  ctx.beginPath();
  ctx.moveTo(759.2, 1161);
  ctx.lineTo(759.2, 1196.5);
  ctx.stroke();
  ctx.lineWidth = 1.4; // 球泡：外圈一道線，裡面實心
  ctx.beginPath();
  ctx.arc(THERMO_X, 1204, 8.8, -Math.PI * 0.36, Math.PI * 1.36);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(THERMO_X + 0.6, 1204, 6.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawMercury(ctx) {
  ctx.fillStyle = RED;
  ctx.beginPath(); // 頂端斜斜衝出管口
  ctx.moveTo(761.4, MERCURY[0] + 6);
  ctx.lineTo(768.3, MERCURY[0]);
  ctx.lineTo(768.3, MERCURY[1]);
  ctx.lineTo(761.4, MERCURY[1]);
  ctx.closePath();
  ctx.fill();
}

function drawThermometerTicks(ctx) {
  ctx.fillStyle = BLACK;
  for (const y of [1167, 1171.7, 1176.4, 1181.2, 1186, 1190.8]) {
    ctx.beginPath();
    ctx.roundRect(761.8, y - 0.9, 4.4, 1.8, 0.9);
    ctx.fill();
  }
}

// 農民：正面站著，寬邊帽，雙手插腰
function drawFarmer(ctx) {
  const x = 224.3;
  ctx.fillStyle = BLACK;
  ctx.beginPath(); // 帽簷與帽冠
  ctx.roundRect(x - 5.6, 1101.5, 11.2, 1.7, 0.8);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - 3.3, 1098.8, 6.6, 3.6, [1.8, 1.8, 0, 0]);
  ctx.fill();
  ctx.beginPath(); // 頭
  ctx.ellipse(x, 1105, 2.9, 3.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // 身體與兩腿
  ctx.moveTo(x - 4.6, 1108.4);
  ctx.lineTo(x + 4.6, 1108.4);
  ctx.quadraticCurveTo(x + 6.8, 1108.8, 6.9 + x, 1110.6);
  ctx.lineTo(x + 4.5, 1117.5);
  ctx.lineTo(x + 5.2, 1125);
  ctx.lineTo(x + 4.9, 1143.4);
  ctx.lineTo(x + 6.6, 1144.6);
  ctx.lineTo(x + 6.6, 1145.6);
  ctx.lineTo(x + 0.6, 1145.6);
  ctx.lineTo(x + 0.4, 1128.5);
  ctx.lineTo(x - 0.4, 1128.5);
  ctx.lineTo(x - 0.8, 1145.6);
  ctx.lineTo(x - 5.6, 1145.6);
  ctx.lineTo(x - 5.2, 1125);
  ctx.lineTo(x - 4.5, 1117.5);
  ctx.lineTo(x - 6.9, 1110.6);
  ctx.quadraticCurveTo(x - 6.8, 1108.8, x - 4.6, 1108.4);
  ctx.fill();
  ctx.strokeStyle = BLACK; // 插腰的兩臂：手肘往外頂
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * 6, 1110.4);
    ctx.lineTo(x + side * 9.4, 1118.6);
    ctx.lineTo(x + side * 5, 1123);
    ctx.stroke();
  }
}

export function build(register) {
  const group = new Group();

  // ---- 右下：#93 爆表溫度計 ----
  const thermometer = new Group();
  const thermoBody = coverSprite([752, 1158, 775, 1214], drawThermometerBody, { z: 0.05, scale: 14 });
  const mercury = coverSprite([761, MERCURY[0], 769, MERCURY[1]], drawMercury, { z: 0.06, pad: 0, scale: 16 });
  const ticks = coverSprite([761, 1165, 767, 1192], drawThermometerTicks, { z: 0.07, pad: 0, scale: 16 });
  const rays = RAYS.map(([x0, y0, x1, y1]) => {
    const ray = coverSprite([Math.min(x0, x1) - 1, Math.min(y0, y1) - 1, Math.max(x0, x1) + 1, Math.max(y0, y1) + 1], (ctx) => {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 1.9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }, { z: 0.07, pad: 1, scale: 16 });
    ray.userData.rest = ray.position.clone();
    return ray;
  });
  mercury.userData.restY = mercury.position.y;
  thermometer.add(thermoBody, mercury, ticks, ...rays);
  register(93, thermometer);
  group.add(thermometer);

  // ---- 右下：#91 兩座風機，立在一座小黑島上（島是地景，不登記） ----
  const island = coverSprite([841, 1168, 909, 1201], (ctx) => {
    traceBlob(ctx, ISLAND);
    ctx.fillStyle = BLACK;
    ctx.fill();
  }, { z: 0.02, scale: 10 });
  group.add(island);
  const turbines = new Group();
  const rotors = [];
  for (const turbine of TURBINES) {
    const [hx, hy, baseY, length] = turbine;
    const one = new Group();
    const rotor = coverSprite([hx - length - 1, hy - length - 1, hx + length + 1, hy + length + 1], (ctx) => drawTurbineRotor(ctx, turbine), { z: 0.05, pad: 0, scale: 12 });
    one.add(coverSprite([hx - 3, hy - 1, hx + 3, baseY], (ctx) => drawTurbineTower(ctx, turbine), { z: 0.04, pad: 1, scale: 12 }), rotor);
    rotors.push(rotor);
    turbines.add(one);
  }
  register(91, turbines, { count: 2 });
  group.add(turbines);

  // ---- 左側：#76 森林大火 ----
  const fire = new Group();
  const flames = FIRE_SLICES.map(([x0, x1]) => {
    const slice = coverSprite([x0, 776, x1, FIRE_BASE], drawFire, { z: 0.02, pad: 0, scale: 6 });
    slice.userData.restY = slice.position.y;
    slice.userData.height = toUnits(FIRE_BASE - 776);
    return slice;
  });
  fire.add(...flames);
  // 火前面的黑色森林和山丘
  const forest = new Group();
  forest.add(coverSprite([78, 900, 242, 942], drawFireHill, { z: 0.04, scale: 6 }));
  for (const [x, baseY, height] of FOREST) {
    forest.add(coverSprite([x - height * 0.3, baseY - height, x + height * 0.3, baseY], (ctx) => drawPine(ctx, x, baseY, height), { z: 0.05, scale: 8 }));
  }
  fire.add(forest);
  register(76, fire);
  group.add(fire);

  // #77 雄鹿
  const stag = coverSprite([152, 832, 222, 916], drawStag, { z: 0.08, scale: 12 });
  stag.userData.rest = stag.position.clone();
  register(77, stag);
  group.add(stag);

  // ---- 左下：#104 農民 ----
  const farmer = coverSprite([213, 1097, 236, 1147], drawFarmer, { z: 0.08, scale: 16 });
  register(104, farmer);
  group.add(farmer);

  // #105 兩頭牛：身體和頭分開，頭才能低下去
  const cows = new Group();
  const cowHeads = [];
  for (const cow of COWS) {
    const [x0, top, length] = cow;
    const one = new Group();
    const neckX = x0 + length - 1.5, neckY = top + 3.2;
    const cowHead = coverSprite([neckX - 12, neckY - 12, neckX + 12, neckY + 12], (ctx) => drawCowHead(ctx, neckX, neckY), { z: 0.09, pad: 0, scale: 14 });
    one.add(coverSprite([x0 - 4, top - 2, x0 + length + 2, top + 25], (ctx) => drawCowBody(ctx, cow), { z: 0.08, scale: 14 }), cowHead);
    cowHeads.push(cowHead);
    cows.add(one);
  }
  register(105, cows, { count: 2 });
  group.add(cows);

  // #115 松樹：全封面約 30 棵，這裡畫農民四周的 5 棵，一棵一張圖
  const pines = new Group();
  for (const [x, baseY, height, mound] of PINES) {
    const half = Math.max(height * 0.3, mound);
    pines.add(coverSprite([x - half, baseY - height, x + half, baseY + 3], (ctx) => {
      drawPine(ctx, x, baseY, height);
      if (mound) {
        // 樹腳的土墩
        ctx.beginPath();
        ctx.roundRect(x - mound, baseY - 2.4, mound * 2, 4.6, 2);
        ctx.fill();
      }
    }, { z: 0.06, scale: 10 }));
  }
  register(115, pines, { count: 5 });
  group.add(pines);

  // #116 草叢：全封面約 25 叢，這裡畫農地上的 6 叢
  const tufts = new Group();
  for (const [cx, baseY, width, height] of TUFTS) {
    tufts.add(coverSprite([cx - width / 2 - 2, baseY - height - 2, cx + width / 2 + 2, baseY], (ctx) => drawSpikyTuft(ctx, cx, baseY, width, height), { z: 0.06, scale: 10 }));
  }
  register(116, tufts, { count: 6 });
  group.add(tufts);

  return { group, parts: { mercury, rays, rotors, flames, stag, cows, cowHeads, pines, tufts } };
}

/** 這一章最後一格的鏡位（左下的農民、牛、松樹與草叢）。 */
export const END_VIEW = { px: 258, py: 1160, heightPx: 156 };

export default function createHeatChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { mercury, rays, rotors, flames, stag, cows, cowHeads, pines, tufts } = parts;
  const { strike, flash, appear, act, vanish, back } = PACE.stove.beats;

  const mercuryHeight = toUnits(MERCURY[1] - MERCURY[0]);
  const [burstX, burstY] = toWorld(...BURST_ORIGIN);
  const cowRest = cows.children.map((cow) => cow.position.x);

  const track = makeCameraTrack([
    shot(-0.3, 764, 1182, 124), // 溫度計
    shot(strike, 764, 1178, 104),
    shot(flash[1], 766, 1176, 112),
    shot(0.2, 835, 1186, 180), // 溫度計和兩座風機
    shot(0.31, 837, 1186, 184),
    shot(0.37, 166, 858, 150), // 橫越到左側的火場
    shot(0.46, 160, 852, 188), // 退後看整片火
    shot(0.57, 160, 853, 182),
    shot(0.61, 177, 869, 106), // 推近雄鹿
    shot(vanish[0], 178, 869, 100),
    shot(vanish[1], 186, 870, 104),
    shot(0.8, END_VIEW.px, 1158, 150), // 落到左下的農地
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { fire: 0.4, wind: 0.2 },
    cues: pacedCues("stove", ["boom", "flip"]),
    captions: pacedCaptions("stove", [
      "溫度計爆表：史上最熱年，又一次。旁邊兩座風機又小又黑，再生能源在，但可能不是焦點。",
      "圓的左側，黑色森林後面燒著一整片紅色的火：野火，和爆表的溫度計是同一條趨勢。",
      "火場前的山丘上站著一頭雄鹿。牠是被驚動的自然。",
      "農民雙手插腰，牛低著頭：農業是承受端，可能接到化肥短缺與糧食安全，不只是關稅。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 溫度計：紅柱先慢慢爬，0.05 一口氣衝過頂；之後微微顫動
      const creep = 0.42 + 0.2 * linearstep(p, -0.3, strike);
      const surge = linearstep(p, strike, strike + 0.025);
      const settle = Math.sin(linearstep(p, strike + 0.025, flash[1]) * Math.PI) * 0.06;
      const level = creep + (1 - creep) * (1 - (1 - surge) * (1 - surge)) + settle + (surge >= 1 ? 0.012 * Math.sin(frame.time * 9) : 0);
      mercury.scale.y = level;
      mercury.position.y = mercury.userData.restY - ((1 - level) * mercuryHeight) / 2;
      // 放射線：衝頂的同時從管口彈出去，之後輪流閃
      const burst = linearstep(p, strike + 0.01, flash[1]);
      const pop = burst <= 0 ? 0 : 1 + 0.5 * Math.sin(Math.min(1, burst * 1.6) * Math.PI) * (1 - burst);
      rays.forEach((ray, i) => {
        const rest = ray.userData.rest;
        const out = Math.min(1, burst * 2.2);
        ray.visible = burst > 0;
        ray.position.x = burstX + (rest.x - burstX) * out * (0.9 + 0.1 * pop);
        ray.position.y = burstY + (rest.y - burstY) * out * (0.9 + 0.1 * pop);
        ray.scale.setScalar(pop * (1 + 0.1 * Math.sin(frame.time * 6 + i * 2.1)));
      });

      // 風機慢慢轉（兩座轉速不同）
      rotors.forEach((rotor, i) => {
        rotor.rotation.z = -frame.time * (0.9 - i * 0.25);
      });

      // 野火：火舌從森林後面竄起來（appear），之後整片一起跳動
      const flicker = 1 + 0.014 * Math.sin(frame.time * 7) + 0.008 * Math.sin(frame.time * 13.3);
      // （四條一起長：各長各的話，切縫會露出來）
      const rise = linearstep(p, appear[0] + 0.035, appear[1]);
      flames.forEach((flame) => {
        const grown = (1 - (1 - rise) * (1 - rise)) * (1 + 0.07 * Math.sin(rise * Math.PI));
        const s = Math.max(0.001, grown * (rise >= 1 ? flicker : 1));
        flame.scale.y = s;
        flame.position.y = flame.userData.restY - ((1 - s) * flame.userData.height) / 2;
      });

      // 雄鹿：act 時驚跳一下；0.74（範本的「消失」）再驚跳一次並轉身，但留在原地（封面上牠一直都在）
      const rest = stag.userData.rest;
      const startle = Math.sin(linearstep(p, act[0], act[0] + 0.045) * Math.PI);
      const flinch = Math.sin(linearstep(p, vanish[0] - 0.005, vanish[1] + 0.02) * Math.PI);
      stag.position.x = rest.x;
      stag.position.y = rest.y + toUnits(3.2) * startle + toUnits(5) * flinch;
      stag.rotation.z = -0.05 * startle - 0.08 * flinch;

      // 牛：鏡頭落下來時從左邊走進來（back），站定後低下頭
      cows.children.forEach((cow, i) => {
        const walk = smooth(linearstep(p, back[0] + i * 0.012, back[0] + 0.07 + i * 0.012));
        const stepping = walk > 0 && walk < 1 ? 1 : 0;
        cow.position.x = cowRest[i] - toUnits(15) * (1 - walk);
        cow.position.y = stepping * Math.abs(Math.sin(walk * Math.PI * 5)) * toUnits(0.9);
        const lower = smooth(linearstep(p, back[0] + 0.075 + i * 0.015, back[0] + 0.12 + i * 0.015));
        cowHeads[i].rotation.z = 0.32 * (1 - lower);
      });

      // 松樹和草叢被風吹得微微晃
      pines.children.forEach((pine, i) => {
        pine.rotation.z = 0.012 * Math.sin(frame.time * 1.1 + i * 1.7);
      });
      tufts.children.forEach((tuft, i) => {
        tuft.scale.x = 1 + 0.03 * Math.sin(frame.time * 1.6 + i * 2.3);
      });
    },
  };
}
