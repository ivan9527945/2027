// 第 3 章：伊朗之後（#25–32、#86–90、#92）。
// 封面右上：紅色夜空下的海灣，白袍人騎駱駝往左走，紅色客機也往左飛。
// 鏡頭往下搖到封面右下：工廠的黑煙飄向戰機，油輪被三條白鏈鎖在紅色海面上；最後硬切到燃燒的油桶。
//
// 節奏範本：matches（安靜的特寫：慢慢靠近、上搖、推近，0.78 硬切到大特寫）。對應：
//   approach [-0.4, 0.3]  慢慢靠近紅色夜空：駱駝往左走到封面上的位置（字幕 1）；
//                         客機從天際線後面升起、機頭朝左飛到封面上的位置（字幕 2）
//   tilt     [0.3, 0.5]   原作是上搖，這裡是往下搖：從右上的海灣搖到右下的海面
//   pushIn   [0.45, 0.78] 黑煙一道一道冒出來、戰機從煙裡飛出、油輪停住、三條白鏈依序鎖上，鏡頭推近油輪（字幕 3）
//   cutToDetail 0.78      硬切到燃燒的油桶
import { Color, Group, PerspectiveCamera, Scene } from "three";
import type { Mesh, PlaneGeometry } from "three";
import { clamp, linearstep, seededRandom, smooth } from "../core";
import { PACE, pacedCaptions } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawWalkingLeg } from "../shared/world/animals";
import { drawChimneys } from "../shared/world/buildings";
import { drawSmokePatch } from "../shared/world/effects";
import { drawPalm, drawWaveBand } from "../shared/world/nature";
import { drawChain, drawSparkle, traceBlob } from "../shared/world/props";
import { boundsOf, fillPoly as fillPolygon, strokePolyline, tracePoly as poly } from "../shared/world/shapes";
import { BLACK, DARK_RED, RED, WHITE, coverSprite, shot, toUnits, toWorld } from "../shared/world/space";
import { drawJet } from "../shared/world/vehicles";

// ---------- 畫圖用的小工具 ----------

// 這一章的呼叫慣例是「顏色在前」，轉接到共用的 shapes.js
const fillPoly = (ctx, color, points) => fillPolygon(ctx, points, color);
const line = (ctx, color, width, points) => strokePolyline(ctx, points, color, width);

// ================= 右上：海灣 =================

const GROUND_Y = 549.5; // 岬角的頂面：棕櫚、高樓、駱駝都站在這條線上

// #26 紅色夜空：雲狀的輪廓，底邊壓在岬角上
const SKY = [
  [741, 553], [738, 538], [733, 528], [722, 520], [717, 507], [703, 498], [701, 488], [708, 474], [722, 463], [740, 453], [762, 449], [790, 451],
  [808, 456], [818, 466], [834, 469], [845, 479], [850, 490], [864, 494], [875, 504], [880, 515], [879, 525], [894, 530], [901, 540], [912, 545], [916, 553],
];

function drawSky(ctx) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(690, 440, 240, GROUND_Y + 1 - 440);
  ctx.clip();
  traceBlob(ctx, SKY);
  ctx.fillStyle = RED;
  ctx.fill();
  // 駱駝腳下的三座白色沙丘
  for (const dune of [[[780, 550], [793, 541], [798, 550]], [[800, 550], [816, 534], [828, 550]], [[840, 550], [847.5, 545], [851, 550]]]) fillPoly(ctx, WHITE, dune);
  ctx.restore();
}

// #32 黑色岬角：頂面平、底邊往右下斜，尾端尖出
const HEADLAND = [[741, 549.5], [915, 549.5], [925, 567], [940, 582], [951, 594], [912, 583.4], [862, 573.4], [802, 563.2], [741, 551.6]];

// #27 新月：開口朝右上
function drawMoon(ctx) {
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(771, 474.4, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(775.4, 470.2, 9.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

// #28 星星：封面上數得到 5 顆
const STARS = [[778.9, 466], [729, 499], [769.4, 508.9], [870.3, 512.8], [882, 537]];

// #29 棕櫚樹：[樹幹 x, 樹冠中心 y, 葉長]
const PALMS = [[751.5, 509, 13.5], [770.2, 521.4, 11]];

// #30 遠方的天際線：三棟細長的高樓，中間最高
function drawSkyline(ctx) {
  fillPoly(ctx, BLACK, [[783, 550], [783, 530.6], [785.8, 529], [785.8, 550]]);
  fillPoly(ctx, BLACK, [[787, 550], [787, 518.4], [788.6, 516.6], [790.4, 518.4], [790.4, 550]]);
  fillPoly(ctx, BLACK, [[791.8, 550], [791.8, 525.6], [796, 523.6], [796, 550]]);
  ctx.fillStyle = RED;
  ctx.fillRect(793.6, 528, 0.8, 16);
  ctx.fillRect(784.1, 534, 0.7, 11);
}

// #31 騎駱駝的白袍人（駱駝朝左走）。四條腿在封面上的姿勢：髖、膝、蹄
// 四條腿：髖、膝、蹄（封面像素，2026-11-19 依封面 10 倍放大重新描）。前腳往左前方跨、後腳收在臀下
const CAMEL_LEGS = [
  { hip: [812, 522], knee: [807, 536], hoof: [802, 548], off: 0, upper: 5.4, lower: 2.8 },
  { hip: [820, 524], knee: [825, 537], hoof: [831, 548.4], off: Math.PI, upper: 5.4, lower: 2.8 },
  { hip: [846, 524], knee: [847, 538], hoof: [843, 548.4], off: Math.PI * 0.5, upper: 5.8, lower: 3 },
  { hip: [855, 522], knee: [859, 537], hoof: [861, 548.4], off: Math.PI * 1.5, upper: 5.8, lower: 3 },
];

// 駱駝的輪廓：口鼻在左，粗的脖子往右下接到胸口，背上一個單峰，臀部收圓（依封面重新描）
const CAMEL_BODY = [
  [777, 499.5], [779, 496.5], [783, 494.5], [788, 494], [791, 492.4], [793.4, 494], [795.4, 497.6], [798.4, 502.4], [802.4, 506.8],
  [807, 509.8], [812, 510.8], [817, 509.2], [823, 507], [830, 505], [836, 502.8], [840, 500.4], [845, 499.8], [850, 501.8],
  [854, 505.8], [857, 510.8], [859, 516], [860, 521], [859, 525], [855, 527], [848, 527.4], [838, 527.4], [826, 527.2],
  [818, 526.2], [812, 524.6], [807, 521.6], [802, 517.2], [797, 512.6], [792, 508.6], [787, 505.6], [782, 503.6], [778, 502],
];
// 白袍騎士：頭巾的一角往左後飄，長袍垂在駝峰前，腳跨在駝峰左側
const RIDER = [
  [806, 483], [814, 482.6], [819, 480.2], [823, 476.4], [828, 474], [834, 474.4], [838, 478], [840.4, 484], [842.2, 491],
  [841.6, 494.6], [838.4, 497.2], [834, 499.4], [829.6, 502], [826.4, 505.4], [824.4, 510], [822.6, 515], [822.4, 518.6], [818.4, 519],
  [816.2, 516.4], [813.2, 515.2], [813, 510.4], [815.6, 505.4], [818, 499.4], [820.4, 494.4], [821.6, 490], [817, 489],
  [811, 488.6], [806.6, 488],
];

// 一條駱駝腿：大腿和小腿都是上粗下細的梯形，膝蓋處兩段重疊，蹄是一小塊扁平的楕圓（不是圓球）
function drawCamelLeg(ctx, leg, phase) {
  const turn = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const lift = (ph) => Math.max(0, -Math.cos(ph));
  const da = 0.24 * (Math.sin(phase + leg.off) - Math.sin(leg.off));
  const db = da - 0.6 * (lift(phase + leg.off) - lift(leg.off));
  const t = turn([leg.knee[0] - leg.hip[0], leg.knee[1] - leg.hip[1]], da);
  const knee = [leg.hip[0] + t[0], leg.hip[1] + t[1]];
  const sh = turn([leg.hoof[0] - leg.knee[0], leg.hoof[1] - leg.knee[1]], db);
  const hoof = [knee[0] + sh[0], knee[1] + sh[1]];
  const segment = (a, b, wa, wb) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    fillPoly(ctx, BLACK, [[a[0] + nx * wa, a[1] + ny * wa], [b[0] + nx * wb, b[1] + ny * wb], [b[0] - nx * wb, b[1] - ny * wb], [a[0] - nx * wa, a[1] - ny * wa]]);
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.arc(b[0], b[1], wb, 0, Math.PI * 2);
    ctx.fill();
  };
  segment(leg.hip, knee, leg.upper / 2 + 0.8, leg.lower / 2 + 0.5);
  segment(knee, hoof, leg.lower / 2 + 0.4, leg.lower / 2 - 0.2);
  ctx.beginPath();
  ctx.ellipse(hoof[0] - 1, hoof[1] + 0.2, leg.lower * 0.75, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 只有駱駝（腿、身體、尾巴、韁繩），不含騎士。3D 場景把駱駝和騎士做成前後兩層。 */
function drawCamel(ctx, phase) {
  for (const leg of CAMEL_LEGS) drawCamelLeg(ctx, leg, phase);
  fillPoly(ctx, BLACK, CAMEL_BODY);
  line(ctx, BLACK, 1.6, [[857.6, 514], [861.6, 520], [862, 530]]); // 尾巴
  // 紅色韁繩：從口鼻沿著脖子上方拉到騎士手上
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(787, 503.4);
  ctx.quadraticCurveTo(803, 501, 818.6, 491.2);
  ctx.stroke();
}

/** 只有白袍騎士（頭巾、長袍、紅色的手、黑色頭箍）。 */
function drawRider(ctx) {
  fillPoly(ctx, WHITE, RIDER);
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(815.4, 489.2, 9, 2.2, 1);
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(829.4, 479.2, 2.1, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCamelRider(ctx, phase) {
  drawCamel(ctx, phase);
  drawRider(ctx);
}

const CAMEL_FRAMES = 6;
const CAMEL_STRIDE = 20;
const CAMEL_WALK = 46; // 駱駝開場時在封面位置的右邊多遠

// #25 紅色四引擎客機：機頭朝左，略微往上
function drawAirliner(ctx) {
  // 垂直尾翼（紅）
  fillPoly(ctx, RED, [[707, 542.4], [718, 529], [723.6, 528.4], [726, 531.6], [723.6, 547]]);
  // 機身：整條先塗黑（機腹是黑的），再蓋上前後兩段紅色
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(601.6, 530.6);
  ctx.bezierCurveTo(603, 527, 608, 524.8, 614, 525.2);
  ctx.lineTo(650, 531);
  ctx.lineTo(690, 539.4);
  ctx.lineTo(722, 545.4);
  ctx.lineTo(734.4, 548.6);
  ctx.lineTo(722, 553.6);
  ctx.lineTo(690, 553.8);
  ctx.lineTo(660, 549.6);
  ctx.lineTo(625, 540.6);
  ctx.bezierCurveTo(614, 538, 603, 535, 601.6, 530.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(603.2, 530.4);
  ctx.bezierCurveTo(604, 527.6, 608, 525.6, 614, 526);
  ctx.lineTo(654, 532.4);
  ctx.lineTo(654, 540);
  ctx.lineTo(625, 535.4);
  ctx.bezierCurveTo(614, 533.6, 606, 532.6, 603.2, 530.4);
  ctx.closePath();
  ctx.fill();
  fillPoly(ctx, RED, [[684, 539], [722, 546.2], [731.6, 548.6], [722, 551], [690, 549.8], [684, 546.4]]);
  // 駕駛艙窗與兩排舷窗
  fillPoly(ctx, BLACK, [[606.6, 527.6], [612.6, 526.8], [613, 528.2], [607, 529]]);
  ctx.fillStyle = BLACK;
  for (let i = 0; i < 6; i++) ctx.fillRect(626 + i * 4.3, 529.8 + i * 0.72, 2.2, 1.3);
  for (let i = 0; i < 4; i++) ctx.fillRect(688 + i * 4.2, 541.4 + i * 0.78, 2.2, 1.2);
  // 水平尾翼（黑）
  fillPoly(ctx, BLACK, [[717, 546.6], [733, 537.6], [736.6, 538.6], [734.6, 542], [724, 549.4]]);
  fillPoly(ctx, BLACK, [[716, 550.4], [732, 548], [733, 551.6], [722.6, 555], [719, 554.6]]);
  // 兩片後掠的主翼（黑）：遠的一片往右上、近的一片往右下
  fillPoly(ctx, BLACK, [[659, 535.4], [699, 508.4], [706.6, 510], [704.6, 513.4], [688, 541.6]]);
  fillPoly(ctx, BLACK, [[660.6, 546.8], [688, 550.6], [697.6, 565.2], [694, 567.6], [687, 566.6]]);
  // 四具引擎：每片機翼兩道紅色
  line(ctx, RED, 1.7, [[672, 526.4], [685, 528.8]]);
  line(ctx, RED, 1.5, [[684, 517.6], [693.6, 519.4]]);
  line(ctx, RED, 1.7, [[666, 549.2], [677, 551.2]]);
  line(ctx, RED, 1.5, [[679, 558.8], [688, 560.4]]);
}

const AIRLINER_BOX = [598, 504, 740, 571];
const AIRLINER_ORIGIN: [number, number] = [790, 537]; // 客機從天際線後面出現的位置

// ================= 右下：海面 =================

// #86 工廠煙囪：[中心 x, 頂 y, 底 y, 頂寬, 底寬]，分三叢
const CHIMNEY_CLUSTERS = [
  [[613, 1044, 1055, 1.8, 2.4], [619, 1032, 1055, 4.4, 6.4], [631.6, 1021, 1055, 4.4, 6]],
  [[648.4, 1039, 1052, 2.6, 3.4], [654.4, 1026, 1053, 2.4, 3.2], [659.6, 1031, 1054, 2.2, 3], [673.6, 1015, 1060, 2.6, 4.2], [682.6, 1031, 1060, 2.6, 3.6], [692, 1036, 1061, 2, 2.8]],
  [[708, 1013, 1063, 2.8, 5.6], [719, 1035, 1064, 1.8, 2.4], [725, 1035, 1064, 1.8, 2.4]],
];
// 煙囪之間的橫管與底座
const PIPES = [
  [[664, 1047.2, 28, 1.8]],
  [[644, 1049, 12, 1.8]],
  [[698, 1052.4, 32, 1.8]],
];

// 工廠的地基：一條往右下斜的黑帶
const FACTORY_BASE = [[609, 1054], [640, 1050.6], [662, 1052], [735, 1062.6], [735, 1066.4], [662, 1062], [640, 1058], [609, 1057.4]];

// #87 黑煙：六道。第一道是連著煙囪口的大片煙幕，往右一道一道飄向戰機
const SMOKES = [
  // 大片煙幕：上緣平、下緣有四個往下滴到煙囪口的尖
  { smooth: false, points: [[604, 990], [640, 992], [700, 985.4], [760, 976.4], [779, 974.6], [780, 977], [762, 981], [742, 990], [726, 995], [714, 1000], [709.4, 1011], [708, 1013], [706.4, 1010], [701, 998.6], [690, 1002], [678, 1010], [673.6, 1015], [671, 1009], [662, 1006], [650, 1012], [637, 1016], [631.6, 1021], [628, 1015], [624, 1017], [620, 1028], [619, 1032], [617, 1026], [612, 1018], [604, 1016]] },
  { smooth: true, points: [[721, 1036], [722, 1026], [730, 1014], [738, 1003], [748, 997.6], [764, 995], [770, 996.6], [760, 1003], [751, 1010], [745, 1020], [738, 1027], [728, 1033], [726, 1037]] },
  { smooth: true, points: [[780, 997], [788, 984], [800, 976], [816, 971.4], [836, 971.6], [828, 978.6], [814, 983], [803, 990], [793, 997.6], [783, 1000]] },
  { smooth: true, points: [[877, 981], [884, 970.6], [900, 963], [930, 957.4], [962, 948], [998, 934], [1001, 938], [968, 956.6], [936, 966.4], [906, 972], [892, 978.4], [882, 983]] },
  { smooth: true, points: [[981, 967], [990, 960], [1006, 957], [1018, 956.4], [1014, 963], [1017, 970], [1006, 972], [996, 975], [984, 973]] },
  { smooth: true, points: [[959, 1026], [970, 1019.4], [982, 1018.6], [999, 1016.4], [996, 1022], [988, 1027], [990, 1033], [978, 1036], [967, 1031.6]] },
];

// #90 戰機：[中心 x, 中心 y, 機身長]。機頭朝右、略微往上。封面上只數得到 4 架（3 小 1 大）
const JETS = [[965, 991, 78], [879.4, 1005, 54], [852, 983.4, 35], [813, 1004.4, 30]];
const JET_PITCH = -0.128; // 弧度；機頭往上約 7 度

// #88 油輪
function drawTanker(ctx) {
  ctx.fillStyle = BLACK;
  // 船身：船尾在左，船頭在右往前斜
  poly(ctx, [[741, 1038], [799, 1038], [801, 1044], [981, 1044], [963.4, 1079], [972, 1080], [970, 1084.4], [750, 1084.4], [741, 1076], [737, 1060], [738, 1047]]);
  ctx.fill();
  // 船尾的艦橋：黑色屋頂、紅色艙房、三扇窗、桅杆
  ctx.beginPath();
  ctx.roundRect(746, 1021.4, 53.4, 7.4, 2);
  ctx.roundRect(756.6, 1017.4, 9, 6, 2);
  ctx.roundRect(781, 1017.4, 9, 6, 2);
  ctx.fill();
  ctx.fillRect(748, 1026, 10, 14);
  ctx.fillRect(772.2, 996, 1.9, 23);
  ctx.beginPath();
  ctx.roundRect(766.4, 1003, 14, 1.9, 0.9);
  ctx.roundRect(771, 1010.2, 15.4, 1.9, 0.9);
  ctx.fill();
  fillPoly(ctx, RED, [[757, 1028.6], [795.4, 1028.6], [795.4, 1044.4], [771, 1044.4], [771, 1050.4], [762, 1050.4], [757, 1044]]);
  ctx.fillStyle = BLACK;
  for (const x of [768, 777, 786]) {
    ctx.beginPath();
    ctx.arc(x, 1034, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  // 甲板上的四段管線：兩端有支架，中間看得到一道白縫
  for (const [x0, x1] of [[800, 818.4], [831, 850], [863, 882], [906.6, 926]]) {
    ctx.beginPath();
    ctx.roundRect(x0, 1036.8, x1 - x0, 3.4, 1.7);
    ctx.fill();
    ctx.fillRect(x0 + 1, 1039, 5.4, 6);
    ctx.fillRect(x1 - 6.4, 1039, 5.4, 6);
  }
  // 船頭的高塔與小桅杆
  ctx.fillRect(920, 1017, 15.4, 28);
  ctx.fillRect(948.6, 1023, 1.7, 22);
  ctx.fillRect(944.6, 1029.4, 9.6, 1.6);
  fillPoly(ctx, BLACK, [[949.4, 1033], [955.4, 1044.6], [943.6, 1044.6]]);
  // 紅色舷窗
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(954, 1056.6, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // 吃水線上三片紅色的倒影
  for (const [x0, x1] of [[745, 826], [876, 908], [936, 965]]) {
    ctx.beginPath();
    ctx.moveTo(x0, 1073.4);
    ctx.lineTo(x1, 1073.4);
    ctx.quadraticCurveTo((x0 + x1) / 2, 1085.4, x0, 1073.4);
    ctx.fill();
  }
}

// 三條白鏈：[上端（甲板）, 下端（水面）]
const CHAINS = [[[824, 1045.4], [849.6, 1080]], [[879, 1046.4], [857.4, 1077.4]], [[899.4, 1045.4], [925.6, 1080]]];

// #89 紅色海面：倒三角形的一大片紅，上面一列一列黑色水紋
const SEA = [
  [703, 1080], [706, 1088], [713, 1095], [733, 1105], [753, 1114], [773, 1119], [800, 1125], [820, 1135], [840, 1144], [862, 1150], [882, 1158], [902, 1158],
  [916, 1152], [930, 1135], [943, 1120], [955, 1105], [963, 1090], [970, 1080],
];
const SEA_BOX = [698, 1076, 975, 1162];

// 海面輪廓在高度 y 的左右邊界
function seaSpan(y) {
  const xs = [];
  for (let i = 0; i < SEA.length; i++) {
    const [x0, y0] = SEA[i], [x1, y1] = SEA[(i + 1) % SEA.length];
    if (y0 === y1 || y < Math.min(y0, y1) || y > Math.max(y0, y1)) continue;
    xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
  }
  return xs.length < 2 ? null : [Math.min(...xs), Math.max(...xs)];
}

// 水紋：越上面越長越密（接近全黑），越下面越短越疏。奇偶列分成兩層，各自左右晃
function drawSeaWaves(ctx, layer) {
  const random = seededRandom(89 + layer);
  ctx.fillStyle = BLACK;
  for (let row = layer; row < 14; row += 2) {
    const y = 1086.4 + row * 5.1;
    const span = seaSpan(y);
    if (!span) continue;
    const depth = row / 13;
    let x = span[0] + 4 + random() * 6;
    while (x < span[1] - 12) {
      const length = Math.min(span[1] - 5 - x, 12 + random() * 26 + (1 - depth) * 34);
      drawWaveBand(ctx, x, x + length, y, 4.7 - depth * 1.9, row * 3.1 + x);
      x += length + 2 + random() * 5 + depth * 9;
    }
  }
}

// #92 燃燒的油桶
function drawBarrel(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(789.4, 1180, 43.6, 54, [3, 3, 7, 7]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(811.2, 1181, 22.6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // 桶身兩道凸箍
  for (const y of [1197, 1214.4]) {
    ctx.beginPath();
    ctx.roundRect(787.6, y - 1.8, 47.2, 3.6, 1.8);
    ctx.fill();
  }
  // 左側三道紅色的反光
  ctx.fillStyle = RED;
  for (const [y, h] of [[1185.4, 8], [1201, 10.6], [1220, 8]]) {
    ctx.beginPath();
    ctx.roundRect(793.6, y, 1.7, h, 0.8);
    ctx.fill();
  }
  ctx.fillStyle = DARK_RED;
  ctx.fillRect(819.6, 1199, 3.2, 1);
  ctx.fillRect(819.6, 1218.6, 3.2, 1);
}

const FLAME_BASE_Y = 1182;

function drawFlames(ctx) {
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(791, FLAME_BASE_Y);
  ctx.bezierCurveTo(788.6, 1172, 793, 1166, 795, 1158.6); // 左邊的小火舌
  ctx.bezierCurveTo(797, 1165, 798, 1170, 800, 1172);
  ctx.bezierCurveTo(799.6, 1160, 809, 1150, 805.4, 1131.4); // 最高的火舌
  ctx.bezierCurveTo(812.6, 1140, 816.4, 1150, 814.6, 1160);
  ctx.bezierCurveTo(817.6, 1157, 820, 1153, 820.6, 1148.6); // 第二道
  ctx.bezierCurveTo(825.6, 1154, 826, 1161, 823.4, 1168);
  ctx.bezierCurveTo(827, 1166, 829, 1163.4, 830, 1160); // 右邊的小火舌
  ctx.bezierCurveTo(834.4, 1168, 834.4, 1175, 832, FLAME_BASE_Y);
  ctx.closePath();
  ctx.fill();
  // 飛出去的兩點火星
  for (const [x, y, rx, ry, tilt] of [[824.2, 1143.2, 1.5, 3.9, -0.15], [834.4, 1156, 1.5, 4.4, 0.1]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, tilt, 0, Math.PI * 2);
    ctx.fill();
  }
  // 火舌之間的白色空隙
  ctx.fillStyle = WHITE;
  for (const [x, y, rx, ry, tilt] of [[813.2, 1164, 1.4, 4, 0.1]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, tilt, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 在封面座標系裡建立這一章的所有元素。章節本身和終章都呼叫它。
 * @param {(id: number, object: import("three").Object3D, opts?: {count?: number}) => unknown} register
 */
export function build(register) {
  const group = new Group();
  const keepRest = (sprite) => {
    sprite.userData.rest = sprite.position.clone();
    return sprite;
  };

  // ---- 右上：海灣 ----

  // #26 紅色夜空
  const sky = coverSprite([696, 444, 920, 552], drawSky, { z: 0, scale: 6 });
  register(26, sky);
  group.add(sky);

  // #27 新月
  const moon = coverSprite([759, 462, 783, 487], drawMoon, { z: 0.01, scale: 16 });
  register(27, moon);
  group.add(moon);

  // #28 星星
  const stars = new Group();
  for (const [x, y] of STARS) stars.add(coverSprite([x - 3, y - 3, x + 3, y + 3], (ctx) => drawSparkle(ctx, x, y, 2.4), { z: 0.01, scale: 20, pad: 0 }));
  register(28, stars, { count: 5 });
  group.add(stars);

  // #32 黑色岬角
  const headland = coverSprite(boundsOf(HEADLAND, 0), (ctx) => fillPoly(ctx, BLACK, HEADLAND), { z: 0.02, scale: 6 });
  register(32, headland);
  group.add(headland);

  // #29 棕櫚樹
  const palms = new Group();
  for (const [x, crownY, reach] of PALMS) {
    palms.add(coverSprite([x - reach - 2, crownY - reach, x + reach + 2, GROUND_Y + 1], (ctx) => drawPalm(ctx, x, crownY, reach, GROUND_Y), { z: 0.03, scale: 14 }));
  }
  register(29, palms, { count: 2 });
  group.add(palms);

  // #30 天際線
  const skyline = coverSprite([781, 515, 798, 551], drawSkyline, { z: 0.03, scale: 16 });
  register(30, skyline);
  group.add(skyline);

  // #31 騎駱駝的白袍人：走路的六格，一次只顯示一格；第 0 格就是封面上的姿勢
  const camel = new Group();
  for (let i = 0; i < CAMEL_FRAMES; i++) {
    const frame = coverSprite([774, 473, 866, 552], (ctx) => drawCamelRider(ctx, (i / CAMEL_FRAMES) * Math.PI * 2), { z: 0.04, scale: 10 });
    frame.visible = i === 0;
    camel.add(frame);
  }
  register(31, camel);
  group.add(camel);

  // #25 紅色四引擎客機：深度排在棕櫚和高樓後面，起飛時從它們背後飛出來
  const airliner = keepRest(coverSprite(AIRLINER_BOX, drawAirliner, { z: 0.024, scale: 9 }));
  register(25, airliner);
  group.add(airliner);

  // ---- 右下：海面 ----

  // #89 紅色海面
  const sea = new Group();
  sea.add(coverSprite(SEA_BOX, (ctx) => {
    ctx.fillStyle = RED;
    ctx.strokeStyle = RED;
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    poly(ctx, SEA);
    ctx.fill();
    ctx.stroke();
  }, { z: 0, scale: 6, pad: 3 }));
  const seaWaves = [0, 1].map((layer) => keepRest(coverSprite(SEA_BOX, (ctx) => drawSeaWaves(ctx, layer), { z: 0.01, scale: 6, pad: 3 })));
  sea.add(...seaWaves);
  register(89, sea);
  group.add(sea);

  // #86 工廠煙囪
  const chimneys = new Group();
  chimneys.add(coverSprite(boundsOf(FACTORY_BASE, 0), (ctx) => fillPoly(ctx, BLACK, FACTORY_BASE), { z: 0.02, scale: 10 }));
  CHIMNEY_CLUSTERS.forEach((cluster, i) => {
    const xs = cluster.flatMap(([x, , , , w]) => [x - w, x + w]).concat(PIPES[i].flatMap(([x, , w]) => [x, x + w]));
    const box = [Math.min(...xs), Math.min(...cluster.map((c) => c[1])) - 1, Math.max(...xs), Math.max(...cluster.map((c) => c[2]))];
    chimneys.add(coverSprite(box, (ctx) => drawChimneys(ctx, cluster, PIPES[i]), { z: 0.03, scale: 12 }));
  });
  register(86, chimneys, { count: 12 });
  group.add(chimneys);

  // #87 黑煙
  const smokes = new Group();
  for (const smoke of SMOKES) smokes.add(keepRest(coverSprite(boundsOf(smoke.points, 2), (ctx) => drawSmokePatch(ctx, smoke), { z: 0.04, scale: 8 })));
  register(87, smokes, { count: 6 });
  group.add(smokes);

  // #88 油輪與三條白鏈
  const tanker = new Group();
  tanker.add(coverSprite([735, 994, 983, 1086], drawTanker, { z: 0.05, scale: 8 }));
  const chains = CHAINS.map((chain) => keepRest(coverSprite(boundsOf(chain, 5), (ctx) => drawChain(ctx, chain), { z: 0.06, scale: 16 })));
  tanker.add(...chains);
  register(88, tanker);
  group.add(tanker);

  // #90 戰機：封面上是 4 架
  const jets = new Group();
  for (const [x, y, length] of JETS) {
    jets.add(keepRest(coverSprite([x - length * 0.58, y - length * 0.36, x + length * 0.56, y + length * 0.44], (ctx) => drawJet(ctx, x, y, length, JET_PITCH), { z: 0.07, scale: 12 })));
  }
  register(90, jets, { count: 4 });
  group.add(jets);

  // #92 燃燒的油桶：桶和火各一張圖
  const barrel = new Group();
  barrel.add(coverSprite([786, 1176, 836, 1236], drawBarrel, { z: 0.03, scale: 12 }));
  const flames = coverSprite([786, 1128, 838, FLAME_BASE_Y], drawFlames, { z: 0.04, scale: 12, pad: 0 });
  flames.userData.rest = flames.position.clone();
  flames.userData.height = toUnits(FLAME_BASE_Y - 1128);
  barrel.add(flames);
  register(92, barrel);
  group.add(barrel);

  return { group, parts: { moon, stars, camel, airliner, seaWaves, smokes, tanker, chains, jets, flames } };
}

/** 這一章最後一格的鏡位（燃燒的油桶，偏在畫面右側）。 */
export const END_VIEW = { px: 752, py: 1184, heightPx: 150 };

const CUT = PACE.matches.beats.cutToDetail;

export default function createGulfChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { stars, camel, airliner, seaWaves, smokes, tanker, chains, jets, flames } = parts;

  // 硬切之前：海灣 → 往下搖 → 推近油輪
  const track = makeCameraTrack([
    shot(-0.4, 800, 496, 250),
    shot(0.04, 800, 512, 160), // 字幕 1：紅色夜空與駱駝
    shot(0.2, 792, 514, 154),
    shot(0.25, 732, 530, 164), // 字幕 2：客機與駱駝同向
    shot(0.37, 724, 532, 160),
    shot(0.5, 810, 1044, 250), // 往下搖到海面：工廠、黑煙、戰機、油輪都在畫面裡
    shot(0.6, 822, 1052, 222),
    shot(0.72, 846, 1058, 192), // 字幕 3：推近被鎖住的油輪
    shot(CUT, 848, 1058, 188),
  ]);
  // 硬切之後：油桶的大特寫。油桶偏右，下一章的光圈從中心張開時不會馬上蓋住
  const detail = makeCameraTrack([
    shot(CUT, 754, 1176, 168),
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx - 4),
  ]);

  const [originX, originY] = toWorld(...AIRLINER_ORIGIN);
  const jetHeading = [Math.cos(JET_PITCH), -Math.sin(JET_PITCH)]; // 世界座標（y 向上）

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { wind: 0.25, drone: 0.2, fire: 0.15 },
    captions: pacedCaptions("matches", [
      "紅色夜空、新月、棕櫚與遠方的高樓：海灣。白袍人騎的駱駝朝左，走向美國那一側。",
      "四引擎的紅色客機也是機頭朝左，和駱駝同向：海灣的東西正往美國走。",
      "三條白鏈鎖住油輪：是被制裁與封鎖鎖住，不是被炸。底下的紅色海面是全圖最大的一片紅。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.4, 1.3);
      applyCameraShot(camera, p < CUT ? track(p) : detail(p), frame.aspect, frame.pointer, 0.03);

      // 星星輪流閃，新月不動
      stars.children.forEach((star, i) => star.scale.setScalar(1 + 0.25 * Math.sin(frame.time * 2.2 + i * 1.9)));

      // 駱駝：開場從右邊走過來，第一句字幕出現後不久走到封面上的位置；步伐由走過的距離決定
      const walk = linearstep(p, -0.3, 0.16);
      const remaining = CAMEL_WALK * (1 - walk);
      const step = remaining / CAMEL_STRIDE;
      const frameIndex = (CAMEL_FRAMES - (Math.round(step * CAMEL_FRAMES) % CAMEL_FRAMES)) % CAMEL_FRAMES;
      camel.children.forEach((sprite, i) => (sprite.visible = i === frameIndex));
      camel.position.x = toUnits(remaining);
      camel.position.y = toUnits(0.7) * Math.abs(Math.sin(step * Math.PI * 2));

      // 客機：從天際線後面小小地出現，一路變大飛到封面上的位置（機頭朝左）
      const flight = smooth(linearstep(p, 0.1, 0.34));
      const rest = airliner.userData.rest;
      airliner.visible = flight > 0;
      airliner.scale.setScalar(0.08 + 0.92 * flight);
      airliner.position.x = originX + (rest.x - originX) * flight;
      airliner.position.y = originY + (rest.y - originY) * flight + Math.sin(flight * Math.PI) * toUnits(10);

      // 海面的兩層水紋反向左右晃
      seaWaves.forEach((layer, i) => {
        layer.position.x = layer.userData.rest.x + Math.sin(frame.time * 0.8 + i * 2) * toUnits(1.2) * (i ? 1 : -1);
      });

      // 黑煙：大片煙幕從左往右伸出去，其餘五道依序從小變大、往右上飄到封面上的位置；之後緩慢起伏。
      // 只用位移和縮放，不用半透明（半透明的黑會變成灰）
      smokes.children.forEach((smoke, i) => {
        const rise = smooth(linearstep(p, 0.4 + i * 0.03, 0.5 + i * 0.03));
        const rest = smoke.userData.rest;
        smoke.visible = rise > 0;
        if (i === 0) {
          smoke.scale.x = rise;
          smoke.position.x = rest.x - ((smoke as Mesh<PlaneGeometry>).geometry.parameters.width * (1 - rise)) / 2;
          return;
        }
        smoke.scale.setScalar(0.25 + 0.75 * rise);
        smoke.position.x = rest.x - toUnits(16) * (1 - rise) + Math.sin(frame.time * 0.7 + i) * toUnits(0.8);
        smoke.position.y = rest.y - toUnits(9) * (1 - rise);
      });

      // 戰機：從黑煙那一側沿機頭方向飛進來，往圓外飛到封面上的位置，大的那架最先
      jets.children.forEach((jet, i) => {
        const arrive = smooth(linearstep(p, 0.5 + i * 0.025, 0.68 + i * 0.025));
        const back = toUnits(170) * (1 - arrive);
        jet.visible = arrive > 0;
        jet.scale.setScalar(0.55 + 0.45 * arrive);
        jet.position.x = jet.userData.rest.x - jetHeading[0] * back;
        jet.position.y = jet.userData.rest.y - jetHeading[1] * back + Math.sin(frame.time * 1.6 + i * 1.3) * toUnits(0.5);
      });

      // 油輪：往左開，開到封面上的位置停住；三條白鏈由左到右依序從上面落下鎖上
      const halt = smooth(linearstep(p, 0.42, 0.6));
      tanker.position.x = toUnits(22) * (1 - halt);
      tanker.position.y = Math.sin(frame.time * 0.9) * toUnits(0.35) * (1 - halt);
      chains.forEach((chain, i) => {
        const lock = linearstep(p, 0.58 + i * 0.035, 0.62 + i * 0.035);
        chain.visible = lock > 0;
        chain.position.y = chain.userData.rest.y + toUnits(34) * (1 - lock) * (1 - lock);
      });

      // 火：以桶口為基準上下伸縮、左右微晃
      const flicker = 1 + 0.07 * Math.sin(frame.time * 9) + 0.04 * Math.sin(frame.time * 15.3);
      flames.scale.set(1 + 0.03 * Math.sin(frame.time * 11), flicker, 1);
      flames.position.y = flames.userData.rest.y + (flames.userData.height * (flicker - 1)) / 2;
    },
  };
}
export { drawCamel, drawRider };
