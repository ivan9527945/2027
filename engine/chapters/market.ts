// 第 5 章：機構與賭注（#21–24、#49–50、#94–96）。
// 六柱神殿、四個提公事包走下台階的人 → π Σ ν 與三疊籌碼 → 格線圖的紅箭頭與鈔票 → 鏡頭往下走到圓底的日本區（¥、五重塔、富士山）。
//
// 節奏範本：stove（幻象型：觸發 → 幻象浮現 → 消失 → 回到現實）。節拍對應：
//   strike   0.05          第一個音效：四個人從門口起步，走下台階（第 1 句停在神殿）
//   appear   [0.28, 0.42]  幻象浮現：π Σ ν 底下一個一個冒出紅色的 P、E、N 和問號（這是「可能的讀法」，封面上沒有，所以只在這一章出現）
//   pullBack [0.30, 0.46]  鏡頭離開神殿，退到字母與籌碼（第 2 句）
//   act      [0.60, 0.70]  退成大景，紅箭頭在格線圖上畫出來：先漲、後重挫（第 3 句）
//   out      0.74          第二個音效；vanish [0.735, 0.765] 紅色的 PEN? 消失，只剩封面上真的有的 π Σ ν
//   back     [0.76, 0.86]  鏡頭往下走到圓底的日本區（第 4 句），¥ 往下沉一點
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { PACE, pacedCaptions, pacedCues } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawChipStack, traceBlob } from "../shared/world/props";
import { tracePoly as poly } from "../shared/world/shapes";
import { BLACK, RED, WHITE, coverSprite, shot, toUnits } from "../shared/world/space";

// #22 四個人的身體中線 x
const WALKERS = [427, 455, 483, 511];
const DOOR_RISE = 11; // 起步前站在門口，比封面上的位置高多少（像素）

// #23 格線圖：一個歪斜的平行四邊形。左上角、沿上緣的向量、沿右緣的向量；6×6 格。
const GRID = { origin: [566, 617], u: [89, -24], v: [22, 88], cells: 6 };
// 紅箭頭的折線：先跌、漲到最高、重挫、反彈、再跌出格線。最低點 (636, 673) 離格線下緣還有十幾個像素。
const ARROW = [[553, 623], [575, 655], [603, 617], [636, 673], [653, 640], [684, 690]];
const ARROW_BOX = [548, 610, 698, 708];

// #50 三疊籌碼：[中線 x, 頂面中心 y, 幾枚]。後面那疊最高。
const CHIP_STACKS = [[677, 727, 10], [657, 764, 5], [703, 765, 6]];
const CHIP_RX = 14, CHIP_RY = 5, CHIP_H = 5.4;

// 日本區的黑色夜空在序章（prologue.js 的 NIGHT）已經畫了，這裡不重畫進 build。
// 但這一章自己的場景裡沒有序章的東西，白色的 ¥ 和富士山需要黑底才看得到，所以在本章場景另外鋪一張（不進終章）。
const NIGHT = [
  [398, 1108], [430, 1100], [470, 1112], [505, 1108], [530, 1100], [556, 1108], [578, 1118], [590, 1132], [586, 1150],
  [570, 1166], [558, 1184], [546, 1200], [536, 1216], [528, 1236], [470, 1238], [448, 1226], [428, 1210], [410, 1186], [398, 1150],
];
// 序章的夜空左緣在 x≈398，封面上 ¥ 的位置（x 392–403）有一半落在外面；補一小塊黑色讓 ¥ 整個站在黑底上。
const NIGHT_EDGE = [[390, 1104], [410, 1098], [430, 1100], [428, 1130], [414, 1166], [401, 1172], [391, 1158], [386, 1138], [386, 1118]];

// #21 神殿：三角山牆、六根白柱、下層五個門洞、台階
function drawTemple(ctx) {
  ctx.fillStyle = BLACK;
  poly(ctx, [[371, 599], [458, 564.5], [545, 599]]);
  ctx.fill();
  ctx.fillRect(374, 597, 168, 5); // 簷口
  ctx.fillRect(378, 601, 160, 60); // 楣樑與柱廊
  ctx.fillRect(376, 652, 164, 49); // 下層外框
  ctx.fillRect(391, 699, 150, 24.5); // 台階
  ctx.fillStyle = WHITE;
  // 山牆裡的兩道白線和三角楣飾
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1;
  ctx.lineJoin = "miter";
  poly(ctx, [[386, 596.2], [458, 569.4], [530, 596.2]], false);
  ctx.stroke();
  poly(ctx, [[400, 595], [458, 573.6], [516, 595]], false);
  ctx.stroke();
  poly(ctx, [[415, 594.6], [458, 578.5], [501, 594.6]]);
  ctx.fill();
  ctx.fillStyle = BLACK; // 楣飾：一排弧形花邊，中間留一個白色尖頂
  for (const x of [428, 440, 476, 488]) {
    ctx.beginPath();
    ctx.arc(x, 592.6, 6.4, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillRect(421.6, 584, 72.8, 2.6);
  poly(ctx, [[434, 592.6], [446.4, 592.6], [452, 584], [446, 580]]);
  ctx.fill();
  poly(ctx, [[482, 592.6], [469.6, 592.6], [464, 584], [470, 580]]);
  ctx.fill();
  ctx.fillStyle = WHITE;
  poly(ctx, [[451.5, 592.6], [458, 581], [464.5, 592.6]]);
  ctx.fill();
  ctx.fillRect(384, 598.8, 148, 1.2);
  // 楣樑：一排短白線、一道長白線
  for (let x = 385; x < 530; x += 10.4) ctx.fillRect(x, 603.8, 5, 1.5);
  ctx.fillRect(384, 608.4, 148, 2.4);
  // 六根柱子，上下各有一條柱頭／柱礎
  for (const x of [389, 416.6, 444.2, 471.8, 499.4, 527]) {
    ctx.fillRect(x - 4.4, 619.5, 8.8, 28);
    ctx.fillRect(x - 6, 614.6, 12, 1.5);
    ctx.fillRect(x - 6, 650.4, 12, 1.5);
  }
  ctx.fillRect(382, 655.6, 152, 1.5);
  // 下層：白牆上五個黑門洞
  ctx.fillRect(383, 662, 150, 38.5);
  ctx.fillStyle = BLACK;
  for (const x of [394, 422.3, 450.6, 478.9, 507.2]) ctx.fillRect(x, 664, 16, 30.5);
  // 台階的白線
  ctx.fillStyle = WHITE;
  for (const y of [703.2, 708, 712.8]) ctx.fillRect(393, y, 147, 1.5);
  ctx.fillRect(391, 719.4, 150, 1.2);
}

// #22 提公事包的人：黑色剪影，低著頭；外圈一道白邊，站在黑色門洞和台階前才分得出來。
function drawWalker(ctx, cx) {
  const parts = (outline) => {
    const grow = outline ? 2.2 : 0;
    ctx.strokeStyle = outline ? WHITE : BLACK;
    ctx.fillStyle = outline ? WHITE : BLACK;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const line = (points, width) => {
      ctx.lineWidth = width + grow;
      poly(ctx, points, false);
      ctx.stroke();
    };
    line([[cx - 3, 696], [cx - 3.2, 706], [cx - 3, 714.5]], 4.6); // 左腿（落後一階）
    line([[cx + 3, 696], [cx + 3, 707], [cx + 2.6, 717]], 4.6); // 右腿（踩在下一階）
    line([[cx - 6, 680.5], [cx - 9, 689], [cx - 9.4, 696]], 3.6); // 提公事包的手
    line([[cx + 6.4, 680.5], [cx + 8.6, 688], [cx + 9.4, 693.5]], 3.2); // 另一隻手
    ctx.beginPath();
    ctx.roundRect(cx - 6.4 - grow / 2, 677 - grow / 2, 13 + grow, 20 + grow, [4.5, 4.5, 1.5, 1.5]); // 軀幹
    ctx.roundRect(cx - 15.6 - grow / 2, 696 - grow / 2, 8 + grow, 6.4 + grow, 1); // 公事包
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 0.4, 672.6, 3 + grow / 2, 3.7 + grow / 2, 0.25, 0, Math.PI * 2); // 低著的頭
    ctx.fill();
  };
  parts(true);
  parts(false);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 0.3, 678.5, 1.2, 5); // 領帶
}

const gridPoint = (a, b) => [GRID.origin[0] + GRID.u[0] * a + GRID.v[0] * b, GRID.origin[1] + GRID.u[1] * a + GRID.v[1] * b];

// #23 的格線圖：黑底白格線
function drawGrid(ctx) {
  ctx.fillStyle = BLACK;
  poly(ctx, [gridPoint(0, 0), gridPoint(1, 0), gridPoint(1, 1), gridPoint(0, 1)]);
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = 1; i < GRID.cells; i++) {
    const t = i / GRID.cells;
    ctx.moveTo(...gridPoint(t, 0));
    ctx.lineTo(...gridPoint(t, 1));
    ctx.moveTo(...gridPoint(0, t));
    ctx.lineTo(...gridPoint(1, t));
  }
  ctx.stroke();
}

// #23 的紅箭頭
function drawArrow(ctx) {
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 4.6;
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  poly(ctx, ARROW, false);
  ctx.stroke();
  // 箭頭：沿最後一段的方向
  const [ax, ay] = ARROW[ARROW.length - 2], [bx, by] = ARROW[ARROW.length - 1];
  const length = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / length, dy = (by - ay) / length;
  poly(ctx, [[bx + dx * 12, by + dy * 12], [bx - dy * 8.5 - dx * 3, by + dx * 8.5 - dy * 3], [bx + dy * 8.5 - dx * 3, by - dx * 8.5 - dy * 3]]);
  ctx.fill();
}

// #24 一疊鈔票：五張，斜放；最上面一張是黑底紅框，中間一個紅色橢圓。
function drawBanknotes(ctx) {
  const face = [[549, 694], [577, 681], [634, 699], [607, 714]]; // 頂面：左、上、右、下
  const layers = 5, step = 4.6, thick = 3.2;
  const shift = (points, dy) => points.map(([x, y]) => [x, y + dy]);
  const [left, , right, bottom] = face;
  const depth = (layers - 1) * step + thick;
  // 整疊的黑色剪影（紙張之間的縫）
  ctx.fillStyle = BLACK;
  poly(ctx, [...face.slice(0, 3), ...shift([right, bottom, left], depth)]);
  ctx.fill();
  // 每一張露出來的側邊
  ctx.fillStyle = RED;
  for (let i = layers - 1; i >= 0; i--) {
    poly(ctx, [...shift([left, bottom, right], i * step + 0.7), ...shift([right, bottom, left], i * step + thick)]);
    ctx.fill();
  }
  // 最上面一張
  poly(ctx, face);
  ctx.fill();
  const center = [591.5, 697];
  ctx.fillStyle = BLACK;
  poly(ctx, face.map(([x, y]) => [center[0] + (x - center[0]) * 0.8, center[1] + (y - center[1]) * 0.72]));
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.ellipse(center[0] - 1, center[1] - 0.6, 8.4, 4.4, 0.12, 0, Math.PI * 2);
  ctx.fill();
}

// #49 三個希臘字母，黑色粗體，斜著往右上排。π 和 Σ 在轉了約 30 度的座標裡畫；第二個字是有稜角的 Σ（不是圓弧的 ε）。
function drawGreek(ctx, which) {
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 4.4;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 6;
  if (which === 2) {
    // ν：左短右長，右上帶一個小勾
    poly(ctx, [[625.5, 739.5], [637, 752.5], [644.5, 727], [651.5, 721.5]], false);
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(618, 749);
  ctx.rotate(-0.52);
  if (which === 0) {
    // π：一橫兩豎，右腳往外勾
    poly(ctx, [[-33, -8.5], [-12, -8.5]], false);
    ctx.stroke();
    poly(ctx, [[-27.5, -8.5], [-27.5, 11]], false);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-18, -8.5);
    ctx.lineTo(-18, 6);
    ctx.quadraticCurveTo(-18, 9.4, -13.5, 9.4);
    ctx.stroke();
  } else {
    // Σ：上橫 → 斜向中間的尖角 → 斜回左下 → 下橫，全部是直線
    poly(ctx, [[8, -5.5], [8, -9.6], [-7.6, -9.6], [1.6, 0.4], [-7.6, 10.4], [8.6, 10.4], [8.6, 6.2]], false);
    ctx.stroke();
  }
  ctx.restore();
}

// #94 白色的 ¥
function drawYen(ctx) {
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.9;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  poly(ctx, [[392.4, 1118], [397.5, 1124.6], [402.6, 1118]], false);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(397.5, 1124.2);
  ctx.lineTo(397.5, 1133.6);
  ctx.moveTo(392.6, 1125.4);
  ctx.lineTo(402.4, 1125.4);
  ctx.moveTo(392.6, 1128.8);
  ctx.lineTo(402.4, 1128.8);
  ctx.stroke();
}

// #95 紅色五重塔：塔刹、四層翹角的屋簷、底層有兩個門洞
function drawPagoda(ctx) {
  const cx = 427;
  ctx.fillStyle = RED;
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, 1116);
  ctx.lineTo(cx, 1127);
  ctx.stroke();
  // 每層：[屋頂上緣 y, 屋簷 y, 上緣半寬, 屋簷半寬]
  for (const [top, eave, halfTop, halfEave] of [[1123.5, 1133, 2.6, 10], [1136, 1145, 6, 16.5], [1148, 1157.5, 8.5, 20], [1160.5, 1169.5, 11, 24]]) {
    ctx.beginPath();
    ctx.moveTo(cx - halfTop, top);
    ctx.lineTo(cx + halfTop, top);
    ctx.quadraticCurveTo(cx + halfTop + 2, eave - 1.6, cx + halfEave, eave - 1.6); // 屋簷尖端往上翹
    ctx.lineTo(cx + halfEave - 2.4, eave + 0.8);
    ctx.lineTo(cx - halfEave + 2.4, eave + 0.8);
    ctx.lineTo(cx - halfEave, eave - 1.6);
    ctx.quadraticCurveTo(cx - halfTop - 2, eave - 1.6, cx - halfTop, top);
    ctx.fill();
  }
  ctx.fillRect(cx - 20, 1170.8, 41, 8);
  ctx.fillStyle = BLACK;
  ctx.fillRect(cx - 13, 1172, 7.4, 4);
  ctx.fillRect(cx + 6, 1172, 7.4, 4);
}

// #96 白線富士山：左坡短、山頂平、右坡是一條長弧線；山頂的積雪往下滴成鋸齒
function drawFuji(ctx) {
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(443, 1135.2);
  ctx.lineTo(451, 1127.6);
  ctx.lineTo(461, 1127);
  ctx.quadraticCurveTo(476, 1143, 498, 1154.6);
  ctx.stroke();
  ctx.fillStyle = WHITE;
  poly(ctx, [[451, 1127.4], [461, 1126.8], [464, 1131.5], [461.4, 1134.4], [459.6, 1131.6], [457.6, 1137], [455.6, 1132], [453, 1135.6], [452, 1131], [449.4, 1133.2]]);
  ctx.fill();
}

export function build(register) {
  const group = new Group();

  // #21 神殿
  const temple = coverSprite([370, 563, 546, 724], drawTemple, { z: 0.03, scale: 8 });
  register(21, temple);
  group.add(temple);

  // #22 四個提公事包的人：一人一張圖
  const walkers = new Group();
  for (const cx of WALKERS) {
    const walker = coverSprite([cx - 18, 666, cx + 12, 720], (ctx) => drawWalker(ctx, cx), { z: 0.05, scale: 14 });
    walker.userData.restY = walker.position.y;
    walkers.add(walker);
  }
  register(22, walkers, { count: 4 });
  group.add(walkers);

  // #23 格線圖與紅箭頭：箭頭另外一張，才能從左到右畫出來
  const grid = coverSprite([562, 590, 682, 708], drawGrid, { z: 0.02, scale: 8 });
  const arrow = coverSprite(ARROW_BOX, drawArrow, { z: 0.06, scale: 10, pad: 0 });
  arrow.userData = { restX: arrow.position.x, width: toUnits(ARROW_BOX[2] - ARROW_BOX[0]) };
  const chart = new Group();
  chart.add(grid, arrow);
  register(23, chart);
  group.add(chart);

  // #24 鈔票（壓在格線圖的左下角上）
  const banknotes = coverSprite([546, 678, 637, 737], drawBanknotes, { z: 0.07, scale: 12 });
  register(24, banknotes);
  group.add(banknotes);

  // #49 π Σ ν：一個字母一張圖
  const greek = new Group();
  for (const [which, box] of [[0, [582, 742, 614, 778]], [1, [603, 734, 633, 767]], [2, [621, 716, 656, 758]]]) {
    greek.add(coverSprite(box, (ctx) => drawGreek(ctx, which), { z: 0.04, scale: 14 }));
  }
  register(49, greek);
  group.add(greek);

  // #50 三疊籌碼：後面那疊先畫
  const chips = new Group();
  CHIP_STACKS.forEach(([cx, topY, count], i) => {
    chips.add(coverSprite([cx - CHIP_RX, topY - CHIP_RY, cx + CHIP_RX, topY + count * CHIP_H + CHIP_RY], (ctx) => drawChipStack(ctx, cx, topY, count, { rx: CHIP_RX, ry: CHIP_RY, chipHeight: CHIP_H }), { z: i === 0 ? 0.05 : 0.06, scale: 14, pad: 1 }));
  });
  register(50, chips, { count: 3 });
  group.add(chips);

  // 日本區：補在序章夜空左緣的一小塊黑色（地景，不登記）
  const nightEdge = coverSprite([382, 1094, 434, 1176], (ctx) => {
    traceBlob(ctx, NIGHT_EDGE);
    ctx.fillStyle = BLACK;
    ctx.fill();
  }, { z: 0, scale: 6 });
  group.add(nightEdge);

  // #94 ¥、#95 五重塔、#96 富士山
  const yen = coverSprite([390, 1116, 405, 1135], drawYen, { z: 0.03, scale: 16 });
  yen.userData.restY = yen.position.y;
  register(94, yen);
  const pagoda = coverSprite([402, 1114, 452, 1180], drawPagoda, { z: 0.03, scale: 14 });
  register(95, pagoda);
  const fuji = coverSprite([441, 1124, 500, 1157], drawFuji, { z: 0.03, scale: 14 });
  register(96, fuji);
  group.add(yen, pagoda, fuji);

  return { group, parts: { walkers, arrow, greek, chips, yen } };
}

/** 這一章最後一格的鏡位（圓底的日本區）；下一章若用硬切進場，要從這裡接。 */
export const END_VIEW = { px: 475, py: 1178, heightPx: 150 };

export default function createMarketChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { walkers, arrow, greek, chips, yen } = parts;
  const { strike, appear, act, vanish } = PACE.stove.beats;

  // 只屬於這一章場景的東西（不進 build，所以不會出現在終章）：
  // 封面上沒有的字（先前的「PEN?」）已依使用者要求移除；雙關只留在標註卡的解讀裡。
  const reading = [];

  const track = makeCameraTrack([
    shot(-0.3, 452, 636, 236),
    shot(0.05, 438, 646, 200), // 神殿
    shot(0.31, 434, 652, 186),
    shot(0.38, 648, 772, 126), // 字母與籌碼
    shot(0.46, 646, 776, 136),
    shot(0.57, 646, 776, 138),
    shot(0.61, 606, 698, 244), // 大景：格線圖、鈔票、字母、籌碼
    shot(0.765, 606, 698, 236),
    shot(0.805, 470, 1172, 156), // 圓底的日本區：構圖偏左上，避開下一章從畫面中心張開的光圈
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { drone: 0.3, tick: 0.15, crowd: 0.1 },
    cues: pacedCues("stove", ["click", "flip"]),
    captions: pacedCaptions("stove", [
      "六柱神殿是「機構」的通用符號，沒有標明是哪一個。四人提公事包低頭走下台階，像集體離職。",
      "π Σ ν 很可能是「pen」的雙關，呼應標題的 Le Pen。公式旁邊就是三疊籌碼。",
      "紅箭頭先漲後重挫，一路跌出格線的右下角。箭頭指著一疊鈔票。",
      "圓的底部，白色的 ¥ 掛在紅色五重塔和富士山旁：日圓與日本公債，是「某處必定斷掉」的候選。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 四個人：strike 之後一個接一個從門口走下台階，每一階身體頓一下
      walkers.children.forEach((walker, i) => {
        const start = strike + i * 0.02;
        const walk = linearstep(p, start, start + 0.2);
        const stepBob = Math.abs(Math.sin(walk * Math.PI * 3)) * toUnits(0.9);
        walker.position.y = walker.userData.restY + toUnits(DOOR_RISE) * (1 - smooth(walk)) + (walk > 0 && walk < 1 ? stepBob : 0);
      });

      // 幻象：PEN? 在 appear 的時間窗裡一個字一個字冒出來，vanish 時一起消失
      const gone = linearstep(p, vanish[0], vanish[1]);
      reading.forEach((sprite, i) => {
        const span = (appear[1] - appear[0]) / 2;
        const start = appear[0] + 0.05 + (i * span * 0.6) / reading.length;
        const shown = smooth(linearstep(p, start, start + span * 0.5)) * (1 - gone);
        sprite.material.opacity = shown;
        sprite.scale.setScalar(0.6 + 0.4 * shown);
        sprite.position.y = sprite.userData.restY - toUnits(3) * (1 - shown) + toUnits(4) * gone;
        sprite.visible = shown > 0.001;
      });
      // 讀法出現時，對應的希臘字母跟著跳一下
      greek.children.forEach((letter, i) => {
        const span = (appear[1] - appear[0]) / 2;
        const start = appear[0] + 0.05 + (i * span * 0.6) / reading.length;
        const pulse = Math.sin(linearstep(p, start, start + span * 0.5) * Math.PI);
        letter.scale.setScalar(1 + 0.1 * pulse);
      });
      // 籌碼輪流微微起伏（待機）
      chips.children.forEach((stack, i) => {
        stack.scale.y = 1 + 0.012 * Math.sin(frame.time * 1.8 + i * 2.1);
      });

      // 紅箭頭：act 的時間窗裡從左到右畫出來（先漲、後重挫），之後維持封面上的樣子
      const drawn = clamp(smooth(linearstep(p, act[0] - 0.02, act[1])), 0.0001, 1);
      arrow.scale.x = drawn;
      arrow.position.x = arrow.userData.restX - (arrow.userData.width * (1 - drawn)) / 2;
      arrow.material.map.repeat.x = drawn;
      arrow.visible = drawn > 0.001;

      // ¥：鏡頭到日本區之後往下沉到封面上的位置（日圓貶值）
      yen.position.y = yen.userData.restY + toUnits(5) * (1 - smooth(linearstep(p, 0.84, 0.95)));
    },
  };
}
