// 第 2 章：倒數按下去（#33–41）。
// TRUMP 大樓與落日 → 遊艇與黑色波浪 → 沙漏被翻過來 → 紅色牛仔騎黑馬走向克里姆林宮 → 鐘面正 12 點。
//
// 節奏範本：street（走路 → 0.40 突發事件 → 連續三個結果）。對應：
//   walk    [0, 0.27]     鏡頭從 TRUMP 大樓、落日橫移到遊艇與波浪（字幕 1、2）
//   closeUp [0.27, 0.40]  推近沙漏：這時沙子全在下半，小黑鳥停在沙漏頂上
//   rush    0.40          沙漏被翻過來（音效 flip）
//   impact  [0.458, 0.474] 沙漏轉到定位，鳥被驚飛到封面上的位置，沙開始往下漏
//   chase   [0.41, 0.62]  鏡頭停在剛翻轉的沙漏上（字幕 3）
//   aftermath [0.60, 0.77] 牛仔從畫面左邊騎過沙漏前面，走向克里姆林宮（字幕 4）
//   exit    [0.74, 1]     推到救世主塔：分針走到 12，鐘面正 12 點（字幕 5）
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { PACE, pacedCaptions, pacedCues } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawWalkingLeg } from "../shared/world/animals";
import { drawWaveBand } from "../shared/world/nature";
import { tracePoly as poly } from "../shared/world/shapes";
import { drawStar } from "../shared/world/symbols";
import { BLACK, DARK_RED, RED, WHITE, coverSprite, shot, toUnits, toWorld } from "../shared/world/space";

// ---------- #33 TRUMP 大樓 ----------

function drawTrumpTower(ctx) {
  ctx.fillStyle = BLACK;
  poly(ctx, [[709, 638], [709, 582], [712, 575], [717, 571], [717, 638]]); // 左側較矮的一翼
  ctx.fill();
  poly(ctx, [[716, 638], [716, 571], [723, 567], [746, 577], [746, 586], [747.5, 588], [747.5, 638]]); // 主樓，樓頂往右下斜
  ctx.fill();
  // 旁邊的矮樓
  ctx.fillRect(700, 607, 5.5, 26);
  ctx.fillRect(750.5, 618, 7, 21);
  ctx.fillRect(757, 623, 5.5, 16);
  // 立面的五道紅色直條
  ctx.fillStyle = RED;
  [723.3, 726.9, 730.5, 734.1, 737.7].forEach((x, i) => ctx.fillRect(x, 586 + i * 0.7, 1.7, 49.5 - i * 0.7));
  // 樓頂的字：沿著斜的樓頂寫
  ctx.save();
  ctx.translate(731.6, 578.6);
  ctx.rotate(0.3);
  ctx.font = "800 6.4px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText("TRUMP").width;
  ctx.scale(20.5 / width, 1);
  ctx.fillText("TRUMP", 0, 0);
  ctx.restore();
}

// 大樓腳下的黑色岸線（不屬於任何編號）：往右一路接到遊艇的船尾
function drawShore(ctx) {
  ctx.fillStyle = BLACK;
  poly(ctx, [[698, 627], [709, 632], [762, 637], [772, 637], [784, 628], [800, 625], [808, 618], [826, 640], [826, 646], [760, 646], [735, 644], [698, 634]]);
  ctx.fill();
}

// ---------- #34 被雲橫切的紅太陽 ----------

const SUN = [781, 587, 20];
// 三條雲線：[x0, x1, y 中線, 粗細]。壓在太陽上的那一段是白的，伸出太陽外的是紅的
const CLOUD_BANDS = [[784, 819, 582.2, 2.4], [795, 810, 586.8, 2.4], [754, 778, 590.8, 2.4]];

function drawSun(ctx) {
  const [cx, cy, r] = SUN;
  const bars = (color) => {
    ctx.fillStyle = color;
    for (const [x0, x1, y, t] of CLOUD_BANDS) {
      ctx.beginPath();
      ctx.roundRect(x0, y - t / 2, x1 - x0, t, t / 2);
      ctx.fill();
    }
  };
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  bars(RED);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  bars(WHITE);
  ctx.restore();
}

// ---------- #35 遊艇 ----------

function drawYacht(ctx) {
  ctx.fillStyle = BLACK;
  // 船身＋上層甲板：船頭在右
  poly(ctx, [
    [771, 641], [786, 627.5], [800, 625], [808, 618.5], [822, 611.5], [828, 609.5], [880, 609.5], [885, 613.5], [898, 614], [904, 619.5],
    [933, 618.5], [917, 636], [936, 637.5], [937, 641],
  ]);
  ctx.fill();
  // 雷達桅杆：兩道橫桿
  poly(ctx, [[840.5, 610], [843.6, 596], [845, 587], [846.6, 587], [848.2, 596], [851.5, 610]]);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(838.5, 601.2, 22, 2.8, 1.4);
  ctx.roundRect(840.5, 592.6, 12, 2.2, 1.1);
  ctx.fill();
  // 兩道紅色的舷窗線
  ctx.fillStyle = RED;
  poly(ctx, [[834, 613.2], [883, 610.6], [885.5, 613], [832, 615.8]]);
  ctx.fill();
  poly(ctx, [[820, 619.6], [902, 616.8], [904.5, 619.4], [818, 622.4]]);
  ctx.fill();
}

// ---------- #36 黑色波浪：一列一張圖，各自左右晃 ----------

// 每一列是幾段 [x0, x1]；y 是中線
const WAVE_ROWS = [
  { y: 643.2, thick: 4.6, spans: [[746, 934]] },
  { y: 649.4, thick: 3.4, spans: [[772, 811], [816, 858], [864, 928]] },
  { y: 655.6, thick: 3.8, spans: [[788, 838], [846, 884], [890, 926]] },
  { y: 661.4, thick: 4.2, spans: [[858, 924]] },
  { y: 666.6, thick: 2.6, spans: [[899, 916]] },
  // 克宮右側的那幾道
  { y: 639.6, thick: 4, spans: [[957, 976]] },
  { y: 646.6, thick: 3.6, spans: [[962, 978]] },
  { y: 652.6, thick: 3.8, spans: [[966, 986]] },
  { y: 662.8, thick: 5, spans: [[971, 990]] },
  { y: 676, thick: 3, spans: [[985, 995]] },
];

// ---------- #37 沙漏 ----------

const GLASS = { cx: 765.5, top: 667, neck: 695, bottom: 718.5 };

// 玻璃的輪廓：上下兩個球，中間收成細頸
function traceGlass(ctx, inset = 0) {
  const { cx, top, neck, bottom } = GLASS;
  const half = 12.5 - inset, waist = Math.max(0.5, 1.6 - inset * 0.5);
  const t = top + inset, b = bottom - inset;
  ctx.beginPath();
  ctx.moveTo(cx - half, t);
  ctx.lineTo(cx + half, t);
  ctx.lineTo(cx + half, t + 9 - inset);
  ctx.bezierCurveTo(cx + half, neck - 8, cx + waist, neck - 7, cx + waist, neck);
  ctx.bezierCurveTo(cx + waist, neck + 7, cx + half, neck + 8, cx + half, b - 6);
  ctx.quadraticCurveTo(cx + half, b, cx + half - 2.5, b);
  ctx.lineTo(cx - half + 2.5, b);
  ctx.quadraticCurveTo(cx - half, b, cx - half, b - 6);
  ctx.bezierCurveTo(cx - half, neck + 8, cx - waist, neck + 7, cx - waist, neck);
  ctx.bezierCurveTo(cx - waist, neck - 7, cx - half, neck - 8, cx - half, t + 9 - inset);
  ctx.closePath();
}

/**
 * @param {"fresh" | "spent"} state
 *   fresh：封面上的樣子：上半球除了頂端一道白色空隙以外全黑，下半球整個是黑的（照圖畫，不另外畫成空的）。
 *   spent：翻轉之前，直立時上半是空的、沙全在下半。翻轉動畫前半段用這張，轉過 90 度之後換成 fresh。
 */
function drawHourglass(ctx, state) {
  const { cx, neck } = GLASS;
  // 玻璃後面的紅色底板
  ctx.fillStyle = RED;
  ctx.fillRect(750.5, 665, 30.5, 56.5);
  // 玻璃（黑）
  traceGlass(ctx);
  ctx.fillStyle = BLACK;
  ctx.fill();
  // 空的那一半：黑色玻璃邊裡面是深紅
  const hollow = (fromY, toY) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(740, fromY, 50, toY - fromY);
    ctx.clip();
    traceGlass(ctx, 1.7);
    ctx.fillStyle = DARK_RED;
    ctx.fill();
    ctx.restore();
  };
  if (state === "fresh") {
    // 上半球：沙面上方的空隙是白的，沙面略有起伏
    ctx.save();
    traceGlass(ctx);
    ctx.clip();
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.moveTo(cx - 13, 667.8);
    ctx.lineTo(cx + 13, 667.8);
    ctx.lineTo(cx + 13, 674.6);
    ctx.bezierCurveTo(cx + 7, 673, cx + 3, 677.4, cx - 2, 675.6);
    ctx.bezierCurveTo(cx - 6, 674.2, cx - 9, 673.6, cx - 13, 675.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    hollow(650, neck - 1.5);
  }
  // 木框：上下兩片頂板、左右兩根柱子
  ctx.fillStyle = BLACK;
  ctx.fillRect(747.6, 664, 3.4, 58);
  ctx.fillRect(780, 664, 3.4, 58);
  ctx.beginPath();
  ctx.roundRect(743.6, 660.8, 43.8, 4.8, 2.4);
  ctx.roundRect(743.6, 720.6, 43.8, 4.8, 2.4);
  ctx.fill();
}

// 剛開始往下漏的沙：一條細線、底下一小堆
function drawSandStream(ctx) {
  const { cx, neck, bottom } = GLASS;
  ctx.fillStyle = BLACK;
  ctx.fillRect(cx - 0.45, neck, 0.9, bottom - neck - 3);
  ctx.beginPath();
  ctx.moveTo(cx - 6.5, bottom - 1.6);
  ctx.quadraticCurveTo(cx, bottom - 6.6, cx + 6.5, bottom - 1.6);
  ctx.closePath();
  ctx.fill();
}

// ---------- #38 小黑鳥 ----------

function drawBird(ctx) {
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.lineJoin = "round";
  ctx.lineWidth = 1;
  poly(ctx, [[795.2, 674.2], [799, 673.4], [800, 667.2], [801.8, 667], [803, 673.2], [805.2, 671], [806.2, 669.2], [808, 670], [807.2, 675], [811, 676.2], [808.6, 679], [803, 680], [797.6, 677.6]]);
  ctx.fill();
  ctx.stroke();
}

// ---------- #39 紅色牛仔騎黑馬（朝右，走向克里姆林宮）----------

// 四條腿在封面上的姿勢：髖、膝、蹄；off 是步伐的相位差
const HORSE_LEGS = [
  { hip: [818, 716], knee: [806.5, 736], hoof: [806, 746.5], off: 0, upper: 8, lower: 4.2 },
  { hip: [827, 717], knee: [828, 735], hoof: [836, 747.5], off: Math.PI, upper: 8, lower: 4.2 },
  { hip: [857, 718], knee: [851, 736], hoof: [849, 749], off: Math.PI * 0.5, upper: 6.5, lower: 3.8 },
  { hip: [866, 716], knee: [877, 730], hoof: [878, 749.5], off: Math.PI * 1.5, upper: 6.5, lower: 3.8 },
];

function drawCowboy(ctx, phase) {
  // 馬
  for (const leg of HORSE_LEGS) drawWalkingLeg(ctx, leg, phase, 1);
  ctx.fillStyle = BLACK;
  // 尾巴
  ctx.beginPath();
  ctx.moveTo(814, 693.5);
  ctx.bezierCurveTo(804, 689.5, 798.6, 700, 799.6, 712);
  ctx.bezierCurveTo(799.8, 718, 800.6, 722, 802.6, 723.6);
  ctx.bezierCurveTo(807.4, 716, 805, 706, 811, 700);
  ctx.closePath();
  ctx.fill();
  // 軀幹、脖子、頭
  ctx.beginPath();
  ctx.moveTo(811, 698);
  ctx.bezierCurveTo(817, 689, 845, 691, 856, 693); // 背
  ctx.bezierCurveTo(859, 684, 866, 677, 882, 677); // 頸脊
  ctx.lineTo(888.4, 673.4); // 耳
  ctx.lineTo(890.2, 679.4);
  ctx.bezierCurveTo(893, 685, 896.4, 694, 896.4, 699); // 臉
  ctx.bezierCurveTo(896.4, 703.4, 891, 703.4, 889, 700.2); // 口鼻
  ctx.bezierCurveTo(885, 699.4, 880, 697.4, 877.4, 693.6); // 下顎
  ctx.bezierCurveTo(876.6, 702, 874.6, 710, 871.6, 716); // 頸前緣
  ctx.bezierCurveTo(868.6, 724.6, 858, 725.4, 850, 722.4); // 胸
  ctx.bezierCurveTo(840, 719.6, 830, 722.6, 822, 723.4); // 腹
  ctx.bezierCurveTo(811, 722.4, 807, 708, 811, 698); // 臀
  ctx.closePath();
  ctx.fill();
  // 韁繩
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 0.9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(858.6, 689.4);
  ctx.quadraticCurveTo(872, 698.6, 886, 697.4);
  ctx.stroke();

  // 牛仔：紅衣紅褲
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(833.4, 675);
  ctx.quadraticCurveTo(833.4, 667.6, 840, 667.4);
  ctx.lineTo(846, 667.4);
  ctx.quadraticCurveTo(851.2, 668.4, 851, 676);
  ctx.bezierCurveTo(850.6, 686, 848.6, 692, 849.4, 700);
  ctx.lineTo(836, 700.6);
  ctx.bezierCurveTo(836.6, 692, 834, 684, 833.4, 675);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(841.4, 665, 3.6, 3.4); // 脖子
  ctx.strokeStyle = RED;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 腿
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(840, 697.4);
  ctx.lineTo(847.6, 706);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(847.6, 706);
  ctx.lineTo(845.4, 721.6);
  ctx.stroke();
  poly(ctx, [[843, 721], [848, 722], [850.4, 729], [845, 728.2]]);
  ctx.fill();
  // 握韁繩的手臂：外緣一道深紅線，才不會和身體糊在一起
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(848, 673.6);
  ctx.lineTo(852.6, 683);
  ctx.lineTo(858, 689);
  ctx.stroke();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 3.8;
  ctx.stroke();
  // 頭與牛仔帽
  ctx.fillStyle = DARK_RED;
  ctx.beginPath();
  ctx.arc(843.2, 663.4, 3.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(843.4, 660, 7.4, 1.8, -0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(839.4, 654.2, 8, 6, [3, 3, 0.5, 0.5]);
  ctx.fill();
}

const WALK_FRAMES = 8;
const STRIDE = 34; // 一個完整步伐走幾個封面像素
const RIDE_DISTANCE = 232; // 牛仔出發時在封面位置的左邊多遠（沙漏特寫時剛好在畫面外）

// ---------- #40 救世主塔、#41 紅星 ----------

const CLOCK = [945, 689];

function drawKremlin(ctx) {
  const cx = 945;
  const cone = (x, apexY, baseY, half) => {
    poly(ctx, [[x, apexY], [x + half, baseY], [x - half, baseY]]);
    ctx.fill();
  };
  // 尖拱：黑色外框、裡面留紅
  const arch = (x, topY, baseY, half, lineWidth = 1.2) => {
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(x - half, baseY);
    ctx.lineTo(x - half, topY + half * 1.3);
    ctx.quadraticCurveTo(x - half, topY + half * 0.4, x, topY);
    ctx.quadraticCurveTo(x + half, topY + half * 0.4, x + half, topY + half * 1.3);
    ctx.lineTo(x + half, baseY);
    ctx.stroke();
  };

  // 基座：紅色的土丘，兩端尖出
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(875, 757);
  ctx.lineTo(893, 749.5);
  ctx.lineTo(996, 749.5);
  ctx.quadraticCurveTo(1004, 747.4, 1008, 752);
  ctx.lineTo(1017, 758.6);
  ctx.bezierCurveTo(985, 762, 965, 780.4, 942, 780.4);
  ctx.bezierCurveTo(915, 780.4, 900, 764, 875, 757);
  ctx.closePath();
  ctx.fill();
  // 城牆與燕尾形城垛
  for (const [x0, x1] of [[895, 921], [969, 995]]) {
    ctx.fillRect(x0, 745, x1 - x0, 12);
    for (let x = x0 + 0.6; x + 4.6 <= x1; x += 8.2) {
      poly(ctx, [[x, 745.5], [x, 737.6], [x + 1.4, 737.6], [x + 2.3, 739.6], [x + 3.2, 737.6], [x + 4.6, 737.6], [x + 4.6, 745.5]]);
      ctx.fill();
    }
  }
  // 塔身，由下往上四層
  ctx.fillRect(921, 731, 48, 46);
  ctx.fillRect(918, 714, 54, 18);
  ctx.fillRect(932, 650, 26, 65);
  ctx.fillRect(919, 705.6, 8, 9);
  ctx.fillRect(963, 705.6, 8, 9);

  ctx.fillStyle = BLACK;
  // 層與層之間的黑色腰線
  for (const [x, y, w, h] of [[916.6, 713, 56.8, 2.2], [916.6, 730.2, 56.8, 2.2], [930.6, 666, 28.8, 2], [930.6, 650, 28.8, 1.4]]) ctx.fillRect(x, y, w, h);
  // 尖頂、四角的小尖塔
  poly(ctx, [[cx, 620], [cx + 2.6, 632], [cx + 6.6, 650.4], [cx - 6.6, 650.4], [cx - 2.6, 632]]);
  ctx.fill();
  for (const x of [933, 936.8, 953.2, 957]) cone(x, 644.4, 651, 1.5);
  cone(923, 691.6, 706, 4.4);
  cone(967, 691.6, 706, 4.4);
  cone(930.4, 675.4, 680.6, 1.8);
  cone(959.6, 675.4, 680.6, 1.8);
  // 最上層：兩側各兩道窗、中間一個尖山牆
  for (const x of [935.6, 939, 950, 953.4]) ctx.fillRect(x, 655, 1.7, 9.4);
  arch(cx, 651.4, 660, 2.6, 1.3);
  // 鐘的上緣尖角與兩側窗
  for (const x of [938.4, 950]) ctx.fillRect(x, 668.4, 1.6, 5);
  cone(cx, 671.6, 677, 2.8);
  // 鐘下面的三個尖拱
  for (const x of [937.6, cx, 952.4]) arch(x, 702.4, 712.6, 2.2, 1.3);
  // 小角樓的窗
  ctx.fillRect(922.3, 708, 1.4, 3.6);
  ctx.fillRect(966.3, 708, 1.4, 3.6);
  // 寬的那一層：五道窗，中間的最高
  for (const x of [926, 933, 954.4, 961.4]) {
    ctx.beginPath();
    ctx.roundRect(x, 718, 2.6, 9.6, [1.3, 1.3, 0, 0]);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(cx - 2.1, 716.8, 4.2, 13.6, [2.1, 2.1, 0, 0]);
  ctx.fill();
  // 下層：一扇窗、大門（黑色拱門外面再一圈拱形線）、兩側的細縫
  ctx.beginPath();
  ctx.roundRect(cx - 2.1, 735.6, 4.2, 9.6, [2.1, 2.1, 0, 0]);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx - 3.9, 753, 7.8, 27.6, [3.9, 3.9, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(935, 777.6);
  ctx.lineTo(935, 757);
  ctx.quadraticCurveTo(936, 749, cx, 746.6);
  ctx.quadraticCurveTo(954, 749, 955, 757);
  ctx.lineTo(955, 777.6);
  ctx.stroke();
  ctx.fillRect(919.6, 750, 1.4, 20);
  ctx.fillRect(969.4, 750, 1.4, 18);

  // 鐘：黑外圈、紅圈、黑鐘面；時針指正上方
  const [kx, ky] = CLOCK;
  ctx.beginPath();
  ctx.arc(kx, ky, 13.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(kx, ky, 11.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.arc(kx, ky, 8.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(kx, ky);
  ctx.lineTo(kx, ky - 4.4);
  ctx.stroke();
}

// 分針：單獨一張圖，以鐘心為中心旋轉
function drawMinuteHand(ctx) {
  const [kx, ky] = CLOCK;
  ctx.strokeStyle = WHITE;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(kx, ky);
  ctx.lineTo(kx, ky - 7.2);
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(kx, ky, 1.3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 在封面座標系裡建立這一章的所有元素。章節本身和終章都呼叫它。
 * @param {(id: number, object: import("three").Object3D, opts?: {count?: number}) => unknown} register
 */
export function build(register) {
  const group = new Group();

  // 地景：大樓腳下的岸線
  group.add(coverSprite([696, 615, 828, 648], drawShore, { z: 0.01, scale: 8 }));

  // #34 落日
  const sun = coverSprite([752, 565, 822, 609], drawSun, { z: 0, scale: 12 });
  sun.userData.rest = sun.position.clone();
  register(34, sun);
  group.add(sun);

  // #33 TRUMP 大樓
  const tower = coverSprite([698, 565, 764, 640], drawTrumpTower, { z: 0.02, scale: 14 });
  register(33, tower);
  group.add(tower);

  // #35 遊艇
  const yacht = coverSprite([768, 585, 940, 642], drawYacht, { z: 0.03, scale: 8 });
  yacht.userData.rest = yacht.position.clone();
  register(35, yacht);
  group.add(yacht);

  // #36 黑色波浪
  const waves = new Group();
  WAVE_ROWS.forEach((row, i) => {
    const x0 = Math.min(...row.spans.map((s) => s[0])), x1 = Math.max(...row.spans.map((s) => s[1]));
    const sprite = coverSprite([x0 - 3, row.y - 5, x1 + 3, row.y + 5], (ctx) => {
      row.spans.forEach(([a, b], n) => drawWaveBand(ctx, a, b, row.y, row.thick, i * 2.3 + n, BLACK));
    }, { z: 0.04, scale: 8 });
    sprite.userData.rest = sprite.position.clone();
    waves.add(sprite);
  });
  register(36, waves);
  group.add(waves);

  // #37 沙漏：三張圖放在同一個群組裡，群組原點在沙漏中心，翻轉時繞著它轉
  const hourglass = new Group();
  const glassBox = [741, 658, 790, 728];
  const [hx, hy] = toWorld((glassBox[0] + glassBox[2]) / 2, (glassBox[1] + glassBox[3]) / 2);
  hourglass.position.set(hx, hy, 0);
  const spent = coverSprite(glassBox, (ctx) => drawHourglass(ctx, "spent"), { z: 0.05, scale: 14 });
  const fresh = coverSprite(glassBox, (ctx) => drawHourglass(ctx, "fresh"), { z: 0.05, scale: 14 });
  const sand = coverSprite(glassBox, drawSandStream, { z: 0.06, scale: 14 });
  for (const sprite of [spent, fresh, sand]) {
    sprite.position.x -= hx;
    sprite.position.y -= hy;
    hourglass.add(sprite);
  }
  spent.visible = false;
  register(37, hourglass);
  group.add(hourglass);

  // #38 小黑鳥
  const bird = coverSprite([793, 665, 813, 682], drawBird, { z: 0.07, scale: 16 });
  bird.userData.rest = bird.position.clone();
  register(38, bird);
  group.add(bird);

  // #40 救世主塔、#41 塔頂的紅星
  const kremlin = new Group();
  kremlin.add(coverSprite([873, 618, 1019, 783], drawKremlin, { z: 0.05, scale: 10 }));
  const minuteHand = coverSprite([CLOCK[0] - 9, CLOCK[1] - 9, CLOCK[0] + 9, CLOCK[1] + 9], drawMinuteHand, { z: 0.06, scale: 20, pad: 0 });
  kremlin.add(minuteHand);
  register(40, kremlin);
  group.add(kremlin);
  const star = coverSprite([938, 607, 952, 621], (ctx) => {
    ctx.fillStyle = RED;
    drawStar(ctx, 945, 614.2, 6, { inner: 2.5 });
  }, { z: 0.06, scale: 20, pad: 1 });
  register(41, star);
  group.add(star);

  // #39 牛仔：走路的八格，一次只顯示一格；第 0 格就是封面上的姿勢
  const cowboy = new Group();
  for (let i = 0; i < WALK_FRAMES; i++) {
    const frame = coverSprite([794, 650, 902, 756], (ctx) => drawCowboy(ctx, (i / WALK_FRAMES) * Math.PI * 2), { z: 0.09, scale: 9 });
    frame.visible = i === 0;
    cowboy.add(frame);
  }
  register(39, cowboy);
  group.add(cowboy);

  return { group, parts: { sun, yacht, waves, hourglass, spent, fresh, sand, bird, minuteHand, star, cowboy } };
}

/** 這一章最後一格的鏡位（救世主塔的鐘）。 */
export const END_VIEW = { px: 900, py: 680, heightPx: 106 };

export default function createCountdownChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { sun, yacht, waves, hourglass, spent, fresh, sand, bird, minuteHand, star, cowboy } = parts;
  const { rush, impact, aftermath } = PACE.street.beats;

  const track = makeCameraTrack([
    shot(-0.3, 748, 590, 150),
    shot(0.02, 758, 598, 112), // 字幕 1：TRUMP 大樓與落日
    shot(0.15, 762, 600, 108),
    shot(0.19, 852, 626, 112), // 字幕 2：遊艇與波浪
    shot(0.29, 858, 628, 108),
    shot(0.35, 756, 698, 102), // 推近沙漏（沙漏偏右上，避開左下的字幕框）
    shot(0.5, 757, 699, 98), // 字幕 3：剛翻轉的沙漏
    shot(0.635, 759, 699, 100),
    shot(0.69, 800, 702, 180), // 字幕 4：跟著牛仔，看到克里姆林宮
    shot(0.77, 880, 702, 190),
    shot(0.83, END_VIEW.px, 684, 116), // 字幕 5：鐘面（偏在畫面右側，下一章的光圈從中心張開時不會馬上蓋住）
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx - 4),
  ]);

  // 鳥在翻轉前停在沙漏頂板上：相對於封面位置的位移（封面像素）
  const PERCH = [-38, -19.4];

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { wind: 0.2, tick: 0.3 },
    cues: pacedCues("street", ["flip"]),
    captions: pacedCaptions("street", [
      "整張封面只有這棟樓寫了字：TRUMP。緊貼著它的，是一顆被雲橫切的落日。",
      "這艘船的線條是遊艇，不是軍艦，多半指寡頭的財富。黑色波浪從船下一路延伸到克里姆林宮。",
      "大樓正下方的沙漏剛被翻過來：上半幾乎還是滿的。倒數才剛開始。",
      "紅色牛仔騎著黑馬，正走向克里姆林宮，中間沒有任何障礙。",
      "救世主塔的鐘指著正十二點：零時。一個週期結束，下一個開始。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 落日：開場時還高一點，第一句字幕期間沉到封面上的位置
      sun.position.y = sun.userData.rest.y + toUnits(9) * (1 - smooth(linearstep(p, -0.2, 0.14)));

      // 遊艇慢慢滑進定位，隨浪輕輕起伏；波浪一列一列左右晃
      const sail = smooth(linearstep(p, -0.1, 0.3));
      yacht.position.x = yacht.userData.rest.x - toUnits(10) * (1 - sail);
      yacht.position.y = yacht.userData.rest.y + Math.sin(frame.time * 1.1) * toUnits(0.35);
      waves.children.forEach((row, i) => {
        row.position.x = row.userData.rest.x + Math.sin(frame.time * 0.9 + i * 1.7) * toUnits(1.1) * (i % 2 ? 1 : -1);
      });

      // 沙漏：0.40 被翻過來，在 impact 結束時（0.474）轉到定位。前半圈用「沙在下半」那張，過 90 度換成封面上的樣子
      const flip = smooth(linearstep(p, rush, impact[1]));
      spent.visible = flip < 0.5;
      fresh.visible = !spent.visible;
      hourglass.rotation.z = spent.visible ? -Math.PI * flip : Math.PI * (1 - flip);
      // 沙開始漏：細線微微閃動
      sand.visible = false; // 封面上下半球是全黑的，看不到漏下來的沙，所以不顯示
      sand.material.opacity = 0.8 + 0.2 * Math.sin(frame.time * 14);

      // 鳥：原本停在沙漏頂上，翻轉時被驚飛，沿弧線飛到封面上的位置
      const fly = smooth(linearstep(p, rush, 0.5));
      const flying = fly > 0 && fly < 1;
      bird.position.x = bird.userData.rest.x + toUnits(PERCH[0]) * (1 - fly);
      bird.position.y = bird.userData.rest.y - toUnits(PERCH[1]) * (1 - fly) + Math.sin(fly * Math.PI) * toUnits(9);
      bird.scale.y = flying ? 1 + 0.3 * Math.sin(frame.time * 22) : 1;

      // 牛仔：aftermath（0.60–0.77）騎過沙漏前面走向克里姆林宮；步伐由走過的距離決定，倒著捲也對
      const ride = smooth(linearstep(p, aftermath[0], aftermath[1] + 0.02));
      const remaining = RIDE_DISTANCE * (1 - ride);
      const step = remaining / STRIDE;
      const frameIndex = (WALK_FRAMES - (Math.round(step * WALK_FRAMES) % WALK_FRAMES)) % WALK_FRAMES;
      cowboy.children.forEach((sprite, i) => (sprite.visible = i === frameIndex));
      cowboy.position.x = -toUnits(remaining);
      cowboy.position.y = toUnits(1.1) * Math.abs(Math.sin(step * Math.PI * 2));

      // 鐘：分針在牛仔走過來的同時走到 12，之後兩根指針都朝正上方
      const strike = smooth(linearstep(p, rush, 0.8));
      minuteHand.rotation.z = (1 - strike) * 0.63; // 0.63 弧度 = 6 分鐘
      // 紅星：到了零時閃一下，之後緩慢脈動
      const glow = smooth(linearstep(p, 0.78, 0.84));
      star.scale.setScalar(1 + glow * (0.1 + 0.07 * Math.sin(frame.time * 3)));
    },
  };
}
