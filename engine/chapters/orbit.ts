// 第 4 章：太空與極地（#12–20）。
// 黑色太空裡的衛星與繫繩太空人 → 甩鏡到紅白雪山與三塊浮冰 → 火箭升空、紅色煙雲 → 高舉手臂的西裝男。
//
// 節奏範本：corner（橫移 → 甩鏡換場景 → 逐步靠近 → 結尾舉起東西）。節拍對應：
//   pan    [-0.2, 0.30]  鏡頭在黑色太空裡由左往右橫移：衛星 → 太空人（第 1 句）
//   whip   [0.27, 0.37]  甩到右邊的雪山
//   settle [0.33, 0.58]  停在雪山與浮冰上（第 2 句）
//   pushIn [0.56, 0.72]  往下帶到發射台：火箭點火、升空到封面上的位置，煙雲鼓起來（第 3 句）
//   detail [0.76, 0.86]  靠近煙雲前的西裝男（第 4 句）
//   raise  [0.84, 0.95]  他把手臂舉起來（原作這一拍是「舉起下一章要用的東西」）
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { PACE, pacedCaptions } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawSparkle, traceBlob } from "../shared/world/props";
import { tracePoly as poly } from "../shared/world/shapes";
import { BLACK, RED, WHITE, coverSprite, shot, toUnits } from "../shared/world/space";

// #12 黑色太空的輪廓（traceBlob 的控制點，順時針，從頂端開始）。右緣接上第 1 章的黑色山丘。
const SPACE = [
  [348, 432], [372, 424], [392, 436], [405, 452], [440, 456], [474, 462], [476, 500], [476, 546], [455, 550], [430, 558],
  [405, 572], [380, 580], [358, 586], [344, 596], [322, 600], [302, 598], [296, 616], [280, 630], [258, 636], [240, 652],
  [218, 664], [192, 666], [168, 656], [150, 640], [142, 622], [152, 606], [168, 596], [174, 578], [184, 564], [200, 552],
  [212, 538], [226, 522], [240, 512], [254, 500], [264, 486], [282, 474], [300, 466], [310, 452], [326, 442],
];

// #13 星星：[x, y, 尖端到中心的距離]。放大後數到 11 顆（清單寫「約 10」）
const STARS = [
  [366, 452, 5.5], [332, 455, 1.6], [318, 479, 3], [351, 481, 1.6], [265, 492, 1.6], [445, 474, 3.2],
  [458, 496, 2.6], [205, 548, 1.6], [287, 562, 4], [266, 610, 6], [167, 612, 4],
];

// #17 三塊浮冰：[紅色冰體的四個角（沒有就是 null）, 白色頂緣的折線]
const FLOES = [
  { box: [359, 552, 388, 567], body: [[362, 560], [371, 555.5], [385, 559.5], [376, 565]], top: [[361, 561], [371, 554.5], [386, 559]] },
  { box: [387, 542, 407, 553], body: null, top: [[389, 550], [397, 545], [405, 550]] },
  { box: [422, 539, 453, 552], body: [[425, 546], [437, 542.5], [450, 546], [437, 550]], top: [[424, 546.5], [437, 541.5], [451, 546.5]] },
];

const SHOULDER = [290, 699]; // 西裝男舉起的那隻手臂的肩膀，手臂繞這一點轉
const ARM_DOWN = -2.5; // 手臂垂下時的轉角（弧度）；0 是封面上舉起的姿勢
const PAD_DROP = 96; // 發射前火箭比封面上的位置低多少（像素）

// #14 衛星：在轉了 25 度的座標裡畫。白色本體上有紅圓；封面上是三片紅色格狀太陽能板，第四邊是碟形天線。
function drawSatellite(ctx) {
  ctx.save();
  ctx.translate(233, 570);
  ctx.rotate((25 * Math.PI) / 180);
  const panel = (x, y, w, h, cols, rows) => {
    ctx.fillStyle = RED;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 1; i < cols; i++) {
      ctx.moveTo(x + (w * i) / cols, y);
      ctx.lineTo(x + (w * i) / cols, y + h);
    }
    for (let j = 1; j < rows; j++) {
      ctx.moveTo(x, y + (h * j) / rows);
      ctx.lineTo(x + w, y + (h * j) / rows);
    }
    ctx.stroke();
  };
  // 連接桿
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(2, -20);
  ctx.lineTo(2, 20);
  ctx.moveTo(-14, 12);
  ctx.lineTo(-8, 10);
  ctx.moveTo(10, 0);
  ctx.lineTo(22, -3);
  ctx.stroke();
  panel(-8.5, -54, 21, 34, 4, 6); // 上
  panel(-7, 19, 21, 34, 4, 6); // 下
  panel(-43, 4, 30, 18, 6, 4); // 左
  // 本體
  ctx.fillStyle = WHITE;
  ctx.fillRect(-10, -13, 20, 26);
  ctx.fillStyle = RED;
  ctx.fillRect(9, -11, 4.5, 25);
  ctx.fillRect(-4, -10.5, 9, 1.6);
  ctx.beginPath();
  ctx.arc(-1, 3, 6.6, 0, Math.PI * 2);
  ctx.fill();
  // 碟形天線
  ctx.beginPath();
  ctx.ellipse(25, -3, 4.6, 8.6, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(27, -2);
  ctx.lineTo(35, 0);
  ctx.stroke();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(26, -8);
  ctx.lineTo(24, 2);
  ctx.stroke();
  ctx.restore();
}

// #15 太空人：橫躺著飄，頭在左、腳在右；白色面罩。
function drawAstronaut(ctx) {
  ctx.save();
  ctx.translate(300, 497);
  ctx.rotate(0.14);
  const limb = (points, width) => {
    ctx.strokeStyle = RED;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    poly(ctx, points, false);
    ctx.stroke();
  };
  limb([[4, -3.5], [14, -3], [24, -1.5]], 5.4); // 上面那條腿
  limb([[4, 3], [13, 6], [22, 9]], 5.4); // 下面那條腿
  limb([[-6, -6], [0, -11], [5, -13]], 4.6); // 往上伸的手
  limb([[-8, 4], [-10, 9], [-11, 13]], 4.6); // 往下垂的手
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(-13, -8.5, 19, 15.5, 4.5); // 軀幹
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-17.5, -2.5, 5.8, 0, Math.PI * 2); // 頭盔
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.ellipse(-19.3, -2.6, 2, 2.7, 0, 0, Math.PI * 2); // 面罩
  ctx.fill();
  // 太空衣上的淺色環紋
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 0.6;
  ctx.lineCap = "butt";
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of [[10, -5.6, 10, -0.6], [16, -5.2, 16, -0.4], [21, -4.4, 21, 0.6], [10, 2.6, 8.6, 7.4], [15.6, 4.6, 14.2, 9.4], [-2, -7.5, -2, 5.5]]) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  ctx.restore();
}

// #15 的繫繩：從太空人腰間彎彎曲曲連到衛星上方的太陽能板
function drawTether(ctx) {
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(297, 504);
  ctx.bezierCurveTo(300, 514, 290, 517, 285, 522);
  ctx.bezierCurveTo(280, 527, 284, 533, 277, 537);
  ctx.bezierCurveTo(270, 541, 271, 546, 267, 550);
  ctx.bezierCurveTo(263, 554, 260, 556, 256, 556);
  ctx.stroke();
}

// #16 紅色的山：左側山脊一道白色輪廓，右側只剩一小片白雪，山腳一條白色冰層。黑色是背光面。
function drawMountain(ctx) {
  ctx.fillStyle = RED;
  poly(ctx, [[352, 534], [357, 522], [362, 521], [364, 534]]); // 最左邊的小紅面
  ctx.fill();
  poly(ctx, [[376, 503], [383, 512], [387, 521], [391, 531], [378, 532], [372, 517], [370, 508]]); // 左邊的紅色山稜
  ctx.fill();
  poly(ctx, [[397, 469], [392, 480], [390, 488], [384, 494], [383, 503], [388, 510], [392, 520], [397, 532], [418, 533], [419, 513], [424, 507], [420, 499], [408, 484]]); // 主峰
  ctx.fill();
  poly(ctx, [[419, 510], [440, 505], [447, 522], [451, 534], [418, 534]]); // 右邊的紅色岩塊
  ctx.fill();
  // 主峰上的黑色裂隙
  ctx.fillStyle = BLACK;
  for (const crack of [
    [[400, 478], [404, 486], [404, 497], [400, 490]],
    [[393, 489], [398, 499], [398, 509], [392, 498]],
    [[411, 512], [416, 518], [414, 529], [410, 522]],
    [[420, 509], [431, 507], [423, 517]],
  ]) {
    poly(ctx, crack);
    ctx.fill();
  }
  // 白色：右肩的雪、右緣、山腳的冰層
  ctx.fillStyle = WHITE;
  poly(ctx, [[419, 497], [430, 501], [442, 503], [441, 506.5], [421, 510]]);
  ctx.fill();
  poly(ctx, [[368, 532.4], [408, 530], [416, 534], [416, 536], [368, 536]]);
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 2.2;
  poly(ctx, [[346, 534], [352, 519], [361, 511], [366, 500], [374, 489], [381, 485], [386, 477], [392, 474], [397, 466]], false); // 左側山脊
  ctx.stroke();
  ctx.lineWidth = 1.4;
  poly(ctx, [[397, 466], [403, 476], [410, 486], [419, 497]], false); // 峰頂往右的稜線
  ctx.stroke();
  ctx.lineWidth = 2;
  poly(ctx, [[441, 504], [449, 523], [452, 533.5], [462, 534]], false); // 右緣
  ctx.stroke();
}

// #18 火箭：黑色箭身（在黑色太空前只看得到左緣的白線）、紅色環帶、黑色尾裙。
function drawRocket(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(313, 599);
  ctx.lineTo(313, 548);
  ctx.quadraticCurveTo(313, 532, 321, 519.5);
  ctx.quadraticCurveTo(336, 532, 336, 548);
  ctx.lineTo(336, 599);
  ctx.closePath();
  ctx.fill();
  poly(ctx, [[312, 598], [338, 598], [341, 610], [346, 628.5], [338, 629], [335, 622], [331, 629], [318, 629], [314, 622], [310, 629], [296.5, 628.5], [303, 610]]); // 尾裙
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(314.4, 568, 21.6, 30.4, [2, 2, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(315, 542);
  ctx.quadraticCurveTo(325, 539.5, 335.5, 542.5);
  ctx.stroke();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(320.5, 520.5);
  ctx.quadraticCurveTo(313.4, 532, 313.4, 548);
  ctx.lineTo(313.4, 597);
  ctx.stroke();
}

// #18 的噴焰：黑色的尖形
function drawFlame(ctx) {
  ctx.fillStyle = BLACK;
  poly(ctx, [[322, 632], [329, 648], [326, 655], [326, 682], [324, 690], [322, 714], [320, 690], [318, 682], [318, 655], [315, 648]]);
  ctx.fill();
}

// #19 紅色煙雲：火箭兩側各一團，靠火箭的那一邊是直的，往外是一朵一朵的雲。
function drawSmoke(ctx, side) {
  ctx.fillStyle = RED;
  const lumps = side < 0
    ? [[291, 684, 15], [304, 668, 8], [271, 712, 17], [264, 729, 10]]
    : [[358, 681, 15], [347, 668, 8], [381, 706, 17.5], [403, 727, 13.5]];
  const mass = side < 0
    ? [[312, 638], [313.5, 704], [307, 714], [293, 721], [279, 730], [271, 740], [256, 740], [256, 716], [277, 690], [301, 662]]
    : [[340, 638], [338.5, 705], [346, 715], [361, 721], [376, 731], [385, 740], [421, 740], [416, 726], [396, 708], [374, 688], [351, 662]];
  poly(ctx, mass);
  ctx.fill();
  for (const [x, y, r] of lumps) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// #20 西裝男的身體（不含舉起的那隻手臂）：黑色剪影、白色領帶
function drawSuitMan(ctx) {
  ctx.strokeStyle = BLACK;
  ctx.fillStyle = BLACK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 6.4; // 腿
  for (const leg of [[[277, 720], [275.5, 744]], [[288.5, 720], [289.5, 744]]]) {
    poly(ctx, leg, false);
    ctx.stroke();
  }
  ctx.beginPath(); // 鞋
  ctx.roundRect(269.5, 743.5, 10, 3.6, 1.6);
  ctx.roundRect(285.5, 743.5, 11, 3.6, 1.6);
  ctx.fill();
  ctx.lineWidth = 4.8; // 垂下的手
  poly(ctx, [[275, 699.5], [270, 711], [270.5, 722]], false);
  ctx.stroke();
  ctx.beginPath(); // 軀幹
  ctx.roundRect(273, 695.5, 19.5, 28, [5, 5, 1, 1]);
  ctx.fill();
  ctx.beginPath(); // 頭
  ctx.ellipse(282, 689, 4.9, 5.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillRect(282.2, 699, 1.9, 15.5);
}

// #20 舉起的手臂：畫成封面上的姿勢（指向右上）
function drawRaisedArm(ctx) {
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 5;
  poly(ctx, [SHOULDER, [296, 690], [301.5, 678]], false);
  ctx.stroke();
  ctx.lineWidth = 3.4;
  poly(ctx, [[301.5, 678], [302.5, 675.5]], false);
  ctx.stroke();
}

export function build(register) {
  const group = new Group();

  // #12 黑色太空
  const space = coverSprite([138, 420, 480, 670], (ctx) => {
    traceBlob(ctx, SPACE);
    ctx.fillStyle = BLACK;
    ctx.fill();
  }, { z: 0, scale: 5 });
  register(12, space);
  group.add(space);

  // #13 星星
  const stars = new Group();
  for (const [x, y, r] of STARS) {
    stars.add(coverSprite([x - r, y - r, x + r, y + r], (ctx) => drawSparkle(ctx, x, y, r), { z: 0.02, pad: 1, scale: 16 }));
  }
  register(13, stars, { count: 11 });
  group.add(stars);

  // #16 雪山、#17 浮冰
  const mountain = coverSprite([343, 463, 465, 538], drawMountain, { z: 0.04, scale: 10 });
  register(16, mountain);
  group.add(mountain);
  const floes = new Group();
  for (const floe of FLOES) {
    const sprite = coverSprite(floe.box, (ctx) => {
      if (floe.body) {
        ctx.fillStyle = RED;
        poly(ctx, floe.body);
        ctx.fill();
      }
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      poly(ctx, floe.top, false);
      ctx.stroke();
    }, { z: 0.05, scale: 14 });
    sprite.userData.restY = sprite.position.y;
    floes.add(sprite);
  }
  register(17, floes, { count: 3 });
  group.add(floes);

  // #14 衛星
  const satellite = coverSprite([180, 510, 274, 630], drawSatellite, { z: 0.06, scale: 10 });
  register(14, satellite);
  group.add(satellite);

  // #15 太空人與繫繩
  const tether = coverSprite([252, 500, 304, 560], drawTether, { z: 0.05, scale: 12 });
  const astronaut = coverSprite([274, 476, 332, 518], drawAstronaut, { z: 0.07, scale: 14 });
  astronaut.userData.restY = astronaut.position.y;
  const spacewalk = new Group();
  spacewalk.add(tether, astronaut);
  register(15, spacewalk);
  group.add(spacewalk);

  // #19 紅色煙雲：左右各一團，會從火箭底下鼓起來
  const smokeLeft = coverSprite([252, 636, 316, 742], (ctx) => drawSmoke(ctx, -1), { z: 0.1, scale: 8 });
  const smokeRight = coverSprite([336, 636, 424, 742], (ctx) => drawSmoke(ctx, 1), { z: 0.1, scale: 8 });
  smokeLeft.userData = { restX: smokeLeft.position.x, restY: smokeLeft.position.y, width: toUnits(68), height: toUnits(110), inner: 1 };
  smokeRight.userData = { restX: smokeRight.position.x, restY: smokeRight.position.y, width: toUnits(92), height: toUnits(110), inner: -1 };
  const smoke = new Group();
  smoke.add(smokeLeft, smokeRight);
  register(19, smoke);
  group.add(smoke);

  // #18 火箭：箭身和噴焰分開，噴焰要能伸縮
  const body = coverSprite([294, 517, 348, 631], drawRocket, { z: 0.08, scale: 10 });
  const flame = coverSprite([313, 631, 331, 715], drawFlame, { z: 0.09, scale: 12, pad: 1 });
  body.userData.restY = body.position.y;
  flame.userData = { restY: flame.position.y, height: toUnits(86) };
  const rocket = new Group();
  rocket.add(body, flame);
  register(18, rocket);
  group.add(rocket);

  // #20 西裝男：身體一張圖，舉起的手臂另一張（以肩膀為中心，才能繞肩膀轉）
  const manBody = coverSprite([264, 682, 300, 749], drawSuitMan, { z: 0.12, scale: 14 });
  const arm = coverSprite([SHOULDER[0] - 27, SHOULDER[1] - 27, SHOULDER[0] + 27, SHOULDER[1] + 27], drawRaisedArm, { z: 0.13, scale: 14, pad: 0 });
  const man = new Group();
  man.add(manBody, arm);
  register(20, man);
  group.add(man);

  return { group, parts: { stars, floes, satellite, astronaut, smokeLeft, smokeRight, body, flame, arm } };
}

/** 這一章最後一格的鏡位（煙雲前舉手的西裝男）；下一章若用硬切進場，要從這裡接。 */
export const END_VIEW = { px: 266, py: 690, heightPx: 150 };

export default function createOrbitChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { stars, floes, satellite, astronaut, smokeLeft, smokeRight, body, flame, arm } = parts;
  const { pushIn, raise } = PACE.corner.beats;

  // 鏡頭在每句字幕的時間窗裡停在那句話講的東西上
  const track = makeCameraTrack([
    shot(-0.3, 205, 588, 190),
    shot(0.03, 240, 562, 178), // 衛星
    shot(0.25, 268, 545, 170), // 橫移到太空人
    shot(0.37, 404, 512, 132), // 甩到雪山
    shot(0.56, 406, 516, 120),
    shot(0.62, 292, 612, 270), // 發射台到火箭的終點
    shot(0.75, 292, 604, 262),
    shot(0.8, 268, 692, 160), // 西裝男
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { wind: 0.2, drone: 0.35 },
    captions: pacedCaptions("corner", [
      "圓裡唯一真正的黑夜。衛星講的是軌道經濟；太空人出了艙，卻被一條繩子繫著，離不開母體。",
      "紅色的山只剩一小片白雪頂，山腳漂著三塊碎冰：暖化中的北極。",
      "火箭是整張封面唯一純粹向上的東西：發射正在變成常態。",
      "舉手的人穿西裝、不穿太空衣，像是宣布發射的企業家：太空是商業與政治。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);
      const time = frame.time;

      // 待機的小動作：星星閃爍、衛星緩慢晃動、太空人在繩子那一頭飄、浮冰起伏
      stars.children.forEach((star, i) => star.scale.setScalar(0.82 + 0.18 * Math.sin(time * 1.7 + i * 1.9)));
      satellite.rotation.z = Math.sin(time * 0.5) * 0.035;
      astronaut.position.y = astronaut.userData.restY + Math.sin(time * 0.9) * toUnits(0.8);
      astronaut.rotation.z = Math.sin(time * 0.6) * 0.05;
      floes.children.forEach((floe, i) => {
        floe.position.y = floe.userData.restY + Math.sin(time * 1.1 + i * 2.2) * toUnits(0.6);
      });

      // 火箭：pushIn 之前停在發射台（比封面上的位置低），pushIn 開始前一點點點火，升到封面上的位置
      const ignite = smooth(linearstep(p, pushIn[0] - 0.05, pushIn[0] + 0.02));
      const climb = smooth(linearstep(p, pushIn[0] - 0.02, pushIn[1] + 0.02));
      const drop = toUnits(PAD_DROP) * (1 - climb);
      body.position.y = body.userData.restY - drop;
      const flameLength = ignite * (climbing(climb) ? 1 + 0.07 * Math.sin(time * 23) : 1);
      flame.scale.y = Math.max(0.001, flameLength);
      flame.scale.x = 0.6 + 0.4 * ignite;
      flame.position.y = flame.userData.restY - drop + (flame.userData.height * (1 - flameLength)) / 2; // 上緣貼著尾裙
      flame.visible = ignite > 0;

      // 煙雲：點火後從發射台往上、往外鼓起來；靠火箭的那一邊和底邊不動
      const billow = smooth(linearstep(p, pushIn[0] - 0.04, pushIn[1] - 0.02));
      for (const cloud of [smokeLeft, smokeRight]) {
        const size = 0.12 + 0.88 * billow;
        const { restX, restY, width, height, inner } = cloud.userData;
        cloud.scale.setScalar(size);
        cloud.position.x = restX + (inner * width * (1 - size)) / 2;
        cloud.position.y = restY - (height * (1 - size)) / 2;
        cloud.visible = billow > 0;
      }

      // 西裝男：手臂原本垂著，raise 這一拍舉起來
      arm.rotation.z = ARM_DOWN * (1 - smooth(linearstep(p, raise[0], raise[1])));
    },
  };
}

// 火箭還在爬升（沒到定位）時噴焰才抖動；到了封面上的位置就照封面的樣子靜止
const climbing = (climb) => climb > 0 && climb < 1;
