// 針筒到口紅（#54–66）。一條線：針筒 → 藥丸（旁邊是印度門）→ 實驗室 → 口紅。
//
// 節奏範本：corner。節拍對應：
//   pan    [-0.2, 0.3]   鏡頭沿著直立的針筒由針尖往下搖到推桿；推桿推進去，針尖冒出三滴（第 1 句）
//   whip   [0.27, 0.37]  甩到左邊：膠囊和藥錠在甩鏡時掉下來
//   settle [0.33, 0.58]  停在藥丸和印度門；紅色顆粒從倒下的膠囊口灑出來（第 2 句）
//   pushIn [0.56, 0.72]  移到實驗室，推近端詳紅球的科學家（第 3 句）
//   detail [0.76, 0.86]  口紅、圓罐、展示櫃的特寫（第 4 句）
//   raise  [0.84, 0.95]  口紅膏體從管子裡旋上來（原作在這裡舉起下一章要用的東西）
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { PACE, pacedCaptions } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawBottle, drawCapsule, drawFlask, drawTablet } from "../shared/world/props";
import { BLACK, DARK_RED, RED, WHITE, coverSprite, shot, toUnits, toWorld } from "../shared/world/space";

const SYRINGE_X = 473; // 針筒中線
const NEEDLE_TIP: [number, number] = [473, 792];
const PLUNGER_TRAVEL = 10; // 推桿在這一章開場時多拉出來的長度（封面像素）
const BULLET_TRAVEL = 19; // 口紅膏體縮在管子裡時往下藏的長度
const CAPSULE_MOUTH: [number, number] = [424, 921]; // 下方那顆膠囊的黑色端，顆粒從這裡灑出來

// 膠囊：[軸線起點, 軸線終點, 半徑, 起點那一半的顏色, 終點那一半的顏色]
const CAPSULES = [
  { from: [406, 863], to: [432, 873], r: 9, colors: [RED, BLACK], glint: true },
  { from: [427, 915], to: [442, 905], r: 9, colors: [BLACK, RED], glint: false },
];
// 藥錠：[中心 x, 中心 y, 長半徑, 短半徑, 傾角]
const TABLETS = [[401.5, 878, 10.5, 6.3, -0.22], [414, 890, 11, 6.3, -0.2]];
// 灑出來的紅色顆粒
const GRAINS = [[390, 904.5], [400.5, 912], [409, 914.5], [393.5, 918], [403, 922.5], [414.5, 926], [407.5, 933], [422.5, 932.5], [398.5, 950]];

// 紅色瓶子：[中線 x, 瓶口 y, 瓶底 y, 瓶身寬]。架子上 3 個、架子下 4 個
const BOTTLES = [
  [577.3, 914.5, 935, 5.6], [593, 926, 935, 5.8], [601.7, 926, 935, 5.8],
  [560.3, 942.5, 962, 6], [569.5, 942.5, 962, 6], [589.5, 942.5, 962, 6], [598, 942.5, 962, 6],
];

// 針筒本體：針尖朝上。推桿另外畫，才能推。
function drawSyringeBarrel(ctx) {
  const x = SYRINGE_X;
  ctx.fillStyle = RED;
  ctx.fillRect(x - 0.75, 793, 1.5, 29); // 針
  ctx.beginPath(); // 針座
  ctx.moveTo(x - 2, 821);
  ctx.lineTo(x + 2, 821);
  ctx.lineTo(x + 4, 833.5);
  ctx.lineTo(x - 4, 833.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // 針筒
  ctx.roundRect(x - 9.5, 833, 19, 86, 1.5);
  ctx.fill();
  ctx.beginPath(); // 底部的凸緣
  ctx.roundRect(x - 18, 918.5, 36, 3.6, 1.6);
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.fillRect(x - 7.5, 836, 15, 4.4); // 活塞頭
  for (let i = 0; i < 22; i++) {
    // 刻度：長短交錯，靠右
    const long = i % 2 === 0;
    ctx.fillRect(long ? x - 3 : x + 0.5, 845 + i * 3.3, long ? 10.5 : 7, 1.7);
  }
}

function drawPlunger(ctx) {
  const x = SYRINGE_X;
  ctx.fillStyle = BLACK;
  ctx.fillRect(x - 2.6, 912, 5.2, 33);
  ctx.beginPath();
  ctx.roundRect(x - 11.5, 943.5, 23, 3.6, 1.6);
  ctx.fill();
}

function drawIndiaGate(ctx) {
  ctx.fillStyle = BLACK;
  ctx.fillRect(347, 863.5, 13, 5); // 頂上的小亭
  ctx.fillRect(335, 868, 36, 6);
  ctx.fillRect(329, 873.5, 47, 19.5); // 門楣
  ctx.beginPath(); // 出挑的簷口
  ctx.moveTo(325, 891);
  ctx.lineTo(380, 891);
  ctx.lineTo(386.5, 895.5);
  ctx.lineTo(380, 897);
  ctx.lineTo(325, 897);
  ctx.lineTo(318, 895.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(322, 896, 59.5, 58); // 門身
  ctx.fillRect(316, 952.5, 28.5, 8.5); // 兩個柱腳
  ctx.fillRect(360.5, 952.5, 26, 8.5);
  // 拱門
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(340, 954.5);
  ctx.lineTo(340, 917);
  ctx.arc(352.2, 917, 12.2, Math.PI, 0);
  ctx.lineTo(364.4, 954.5);
  ctx.closePath();
  ctx.fill();
  // 紅色橫線
  ctx.fillStyle = RED;
  for (const [x0, x1, y] of [
    [349, 358, 866], [340, 366, 870.5], [333, 371, 877.5], [331, 373.5, 885.5], [327, 379, 894.5],
    [325, 336, 916], [368, 379, 916], [325, 336, 928.5], [368, 379, 928.5], [322, 339, 955.5], [365, 381, 955.5],
  ]) ctx.fillRect(x0, y - 0.75, x1 - x0, 1.5);
}

function drawMicroscope(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath(); // 底座
  ctx.roundRect(429, 957.5, 22.5, 4.5, 1);
  ctx.fill();
  ctx.fillRect(437.5, 954.2, 13, 2.2); // 載物台
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4.6; // 弓形的支臂
  ctx.beginPath();
  ctx.moveTo(434.5, 957);
  ctx.quadraticCurveTo(431, 946, 437.5, 940.5);
  ctx.stroke();
  ctx.lineWidth = 5; // 鏡筒：斜向右下
  ctx.beginPath();
  ctx.moveTo(438.5, 938.5);
  ctx.lineTo(445.5, 945.5);
  ctx.stroke();
  ctx.lineWidth = 2.6;
  ctx.beginPath(); // 目鏡
  ctx.moveTo(436.8, 936.8);
  ctx.lineTo(439, 934.2);
  ctx.moveTo(446, 946); // 物鏡
  ctx.lineTo(446.6, 951.5);
  ctx.stroke();
  ctx.lineWidth = 1.6; // 調焦旋鈕
  ctx.beginPath();
  ctx.moveTo(442, 937.5);
  ctx.lineTo(446.5, 940.5);
  ctx.stroke();
}

// 左邊的實驗桌：左半是黑抽屜、右半是白門
function drawLeftBench(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(426.5, 961.5, 67, 3.6, 1);
  ctx.fill();
  ctx.fillRect(427.5, 964, 65.5, 36);
  ctx.fillStyle = WHITE;
  ctx.fillRect(428.6, 967, 37.4, 1.1); // 抽屜的上緣與左緣
  ctx.fillRect(428.6, 967, 1.1, 9);
  ctx.fillRect(436, 972.4, 11.5, 1.3);
  ctx.fillRect(436, 978.4, 11.5, 1.3);
  ctx.fillRect(466.6, 966.8, 21.8, 29.4); // 白門
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(472.5, 970.6, 9.5, 2.2, 1);
  ctx.fill();
}

// 右邊的實驗桌和桌上的架子
function drawRightBench(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(530.8, 961.8, 78.4, 3.6, 1);
  ctx.fill();
  ctx.fillRect(531.8, 964, 76.6, 36);
  // 架子：一塊橫板、中間兩根柱、右邊一根柱
  ctx.beginPath();
  ctx.roundRect(564.5, 934.8, 44.7, 4.2, 1.8);
  ctx.fill();
  ctx.fillRect(575.8, 938, 2.5, 24.5);
  ctx.fillRect(580.8, 938, 2.5, 24.5);
  ctx.fillRect(605.2, 938, 3.8, 24.5);
  // 桌面下的白線框與櫃門
  ctx.fillStyle = WHITE;
  ctx.fillRect(535, 966.6, 70, 1.1);
  ctx.fillRect(603.9, 966.6, 1.1, 30.4);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(548.4, 998);
  ctx.lineTo(548.4, 973);
  ctx.lineTo(575.6, 973);
  ctx.lineTo(575.6, 998);
  ctx.stroke();
  ctx.fillRect(556, 978.2, 11.5, 1.3);
}

// 科學家：側面朝右的剪影，右手舉到胸前托著球
function drawScientist(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath(); // 頭
  ctx.ellipse(526.3, 916, 7.6, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // 平頭與前額的瀏海
  ctx.moveTo(518.2, 915);
  ctx.quadraticCurveTo(518, 906, 526, 905.3);
  ctx.quadraticCurveTo(533, 905, 536.2, 912.8);
  ctx.lineTo(532.5, 912);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // 鼻子與下巴
  ctx.moveTo(532.5, 913.5);
  ctx.lineTo(535.8, 919);
  ctx.lineTo(533.4, 920.2);
  ctx.lineTo(533, 924);
  ctx.lineTo(527, 926.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // 身體、手臂
  ctx.moveTo(520.5, 921);
  ctx.quadraticCurveTo(508, 925, 502.5, 937);
  ctx.quadraticCurveTo(498.5, 953, 498, 984);
  ctx.lineTo(500.8, 1000);
  ctx.lineTo(519.8, 1000);
  ctx.lineTo(520.4, 988); // 兩腿之間的縫
  ctx.lineTo(521.8, 988);
  ctx.lineTo(522.2, 1000);
  ctx.lineTo(527, 1000);
  ctx.lineTo(527, 953.5);
  ctx.lineTo(537.5, 945.5); // 前臂下緣
  ctx.lineTo(546.5, 936);
  ctx.quadraticCurveTo(551, 934.5, 552.5, 930.5); // 托著球的手
  ctx.lineTo(545.5, 931.5);
  ctx.lineTo(543.2, 929.2);
  ctx.lineTo(536.5, 935.8);
  ctx.quadraticCurveTo(532, 928.5, 528.5, 926.5);
  ctx.closePath();
  ctx.fill();
}

// 試管架：黑框、兩格，各放一個紅色錐形瓶；頂上一個黑瓶一個紅瓶
function drawRack(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(614, 945.8, 19.4, 54, 1.5);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillRect(618.2, 950, 11, 15.8);
  ctx.fillRect(618.2, 969.2, 11, 18.4);
  drawFlask(ctx, 623.7, 951.5, 965, 8.6);
  drawFlask(ctx, 623.7, 971.5, 986.8, 9.6);
  drawBottle(ctx, 621.6, 930, 946.5, 5, BLACK);
  drawBottle(ctx, 628.6, 937, 946.5, 5.4, RED);
}

function drawLipstickTube(ctx) {
  ctx.fillStyle = RED; // 中段的紅管
  ctx.fillRect(645.4, 944, 12.6, 17.5);
  ctx.fillStyle = DARK_RED;
  ctx.fillRect(646.9, 946.5, 1.2, 12.5);
  ctx.fillRect(654.6, 946.5, 1.2, 12.5);
  ctx.fillStyle = BLACK; // 底座
  ctx.beginPath();
  ctx.roundRect(644.4, 960.2, 14.6, 4, 1);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(643, 962.8, 17.2, 21, 2);
  ctx.fill();
  ctx.fillStyle = DARK_RED;
  ctx.fillRect(645.4, 967, 1, 13);
}

function drawLipstickBullet(ctx) {
  ctx.fillStyle = DARK_RED;
  ctx.beginPath();
  ctx.moveTo(647, 945);
  ctx.lineTo(647, 935);
  ctx.quadraticCurveTo(650.5, 929.5, 653.4, 927.3);
  ctx.quadraticCurveTo(655.9, 926.6, 655.9, 929.5);
  ctx.lineTo(655.9, 945);
  ctx.closePath();
  ctx.fill();
}

function drawJar(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(666.4, 949.3, 14.6, 28.6, 2);
  ctx.fill();
  ctx.fillStyle = DARK_RED;
  ctx.fillRect(668.9, 952, 1, 22);
}

function drawCabinet(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(687.4, 946, 26.2, 30.4, 1.6);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillRect(692, 950.6, 17.7, 9.2);
  ctx.fillRect(692, 962, 17.7, 10);
  for (const [x, top, bottom] of [[695, 954, 959.8], [699.2, 954.5, 959.8], [705.4, 952.2, 959.8], [696.4, 965.4, 972], [703.6, 966, 972], [707, 965, 972]]) {
    drawBottle(ctx, x, top, bottom, 3.6);
  }
}

// 製藥場景底下的黑色地面（不屬於任何編號）：印度門腳下高一階，實驗桌底下低一階，往右斜上去
function drawGround(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(306, 960);
  ctx.lineTo(394, 960);
  // 印度門右邊的草尖
  for (const [x, y] of [[397, 955], [400, 961], [403.5, 952.5], [406, 961], [410, 956], [413, 962], [417, 958.5]]) ctx.lineTo(x, y);
  ctx.lineTo(422, 966);
  ctx.lineTo(426, 998.5);
  ctx.lineTo(634, 998.5);
  ctx.quadraticCurveTo(637, 993.5, 644, 992.5);
  ctx.lineTo(800, 964.5);
  ctx.lineTo(800, 1010);
  ctx.lineTo(306, 1010);
  ctx.closePath();
  ctx.fill();
}

export function build(register) {
  const group = new Group();

  const ground = coverSprite([306, 950, 800, 1010], drawGround, { z: 0, scale: 5 });
  group.add(ground);

  // #54 針筒：本體一張、推桿一張（推桿在本體後面，推進去時被針筒蓋住）
  const syringe = new Group();
  const barrel = coverSprite([453, 791, 493, 924], drawSyringeBarrel, { z: 0.08, scale: 10 });
  const plunger = coverSprite([459, 910, 487, 949], drawPlunger, { z: 0.06, scale: 12 });
  syringe.add(plunger, barrel);
  register(54, syringe);
  group.add(syringe);
  // 針尖冒出的三滴藥水：只在這一章的動畫裡出現，封面上沒有，所以不登記、預設隱藏
  const drops = [0, 1, 2].map(() => {
    const drop = coverSprite([NEEDLE_TIP[0] - 2, NEEDLE_TIP[1] - 2.5, NEEDLE_TIP[0] + 2, NEEDLE_TIP[1] + 2.5], (ctx) => {
      const [x, y] = NEEDLE_TIP;
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.moveTo(x, y - 2.4);
      ctx.quadraticCurveTo(x + 2.2, y + 0.8, x, y + 2.2);
      ctx.quadraticCurveTo(x - 2.2, y + 0.8, x, y - 2.4);
      ctx.fill();
    }, { z: 0.1, pad: 1, scale: 16 });
    drop.visible = false;
    return drop;
  });
  group.add(...drops);

  // #55 膠囊 2、藥錠 2，加上灑出來的顆粒：各自一張圖
  const pills = new Group();
  const solids = [
    coverSprite([396, 852, 442, 884], (ctx) => drawCapsule(ctx, CAPSULES[0]), { z: 0.1, scale: 12 }),
    coverSprite([389, 869, 414, 890], (ctx) => drawTablet(ctx, TABLETS[0]), { z: 0.12, scale: 12 }),
    coverSprite([401, 881, 427, 902], (ctx) => drawTablet(ctx, TABLETS[1]), { z: 0.14, scale: 12 }),
    coverSprite([416, 894, 453, 926], (ctx) => drawCapsule(ctx, CAPSULES[1]), { z: 0.1, scale: 12 }),
  ];
  const grains = GRAINS.map(([x, y]) =>
    coverSprite([x - 2.2, y - 2.2, x + 2.2, y + 2.2], (ctx) => {
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }, { z: 0.09, pad: 1, scale: 16 }),
  );
  for (const sprite of [...solids, ...grains]) sprite.userData.rest = sprite.position.clone();
  pills.add(...solids, ...grains);
  register(55, pills);
  group.add(pills);

  // #56 印度門
  const gate = coverSprite([316, 862, 388, 962], drawIndiaGate, { z: 0.05, scale: 8 });
  register(56, gate);
  group.add(gate);

  // #59 顯微鏡、#60 實驗桌 ×2
  const microscope = coverSprite([427, 932, 453, 963], drawMicroscope, { z: 0.08, scale: 14 });
  register(59, microscope);
  const benches = new Group();
  benches.add(
    coverSprite([425, 960, 495, 1000], drawLeftBench, { z: 0.04, scale: 10 }),
    coverSprite([529, 932, 611, 1000], drawRightBench, { z: 0.04, scale: 10 }),
  );
  register(60, benches, { count: 2 });
  group.add(benches, microscope);

  // #61 紅色瓶子：封面上數得到 7 個（架上 3、架下 4），清單寫「約 8」
  const bottles = new Group();
  for (const [cx, top, bottom, width] of BOTTLES) {
    bottles.add(coverSprite([cx - 4, top, cx + 4, bottom], (ctx) => drawBottle(ctx, cx, top, bottom, width), { z: 0.07, pad: 1, scale: 14 }));
  }
  register(61, bottles, { count: 7 });
  group.add(bottles);

  // #62 試管架、#63 培養皿
  const rack = coverSprite([613, 929, 635, 1000], drawRack, { z: 0.06, scale: 12 });
  register(62, rack);
  const dish = coverSprite([535, 957, 554, 963], (ctx) => {
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.roundRect(535.8, 957.6, 17.6, 2.6, 1.3);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(537.6, 959, 14, 3.4, [0, 0, 2.4, 2.4]);
    ctx.fill();
  }, { z: 0.08, pad: 1, scale: 16 });
  register(63, dish);
  group.add(rack, dish);

  // #57 科學家、#58 紅色球體
  const scientist = coverSprite([496, 903, 554, 1001], drawScientist, { z: 0.1, scale: 10 });
  register(57, scientist);
  const sphere = coverSprite([540, 917, 555, 932], (ctx) => {
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(547.8, 924.3, 6.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = WHITE; // 球面上的小亮點
    for (const [x, y, r] of [[545.4, 921.6, 0.55], [549.6, 920.8, 0.45], [550.6, 925.4, 0.5], [546.6, 926.8, 0.45]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { z: 0.12, scale: 16 });
  register(58, sphere);
  group.add(scientist, sphere);

  // #64 口紅：管身一張、膏體一張（膏體在管身後面，才能旋上來）
  const lipstick = new Group();
  const bullet = coverSprite([645, 925, 658, 946], drawLipstickBullet, { z: 0.06, scale: 16 });
  const tube = coverSprite([642, 943, 661, 985], drawLipstickTube, { z: 0.08, scale: 14 });
  lipstick.add(bullet, tube);
  register(64, lipstick);
  // #65 圓罐、#66 展示櫃
  const jar = coverSprite([665, 948, 682, 979], drawJar, { z: 0.07, scale: 14 });
  register(65, jar);
  const cabinet = coverSprite([686, 945, 715, 977], drawCabinet, { z: 0.07, scale: 14 });
  register(66, cabinet);
  group.add(lipstick, jar, cabinet);

  return { group, parts: { plunger, drops, solids, grains, sphere, bullet, bottles } };
}

/** 這一章最後一格的鏡位（口紅、圓罐、展示櫃）。 */
export const END_VIEW = { px: 676, py: 955, heightPx: 88 };

export default function createPharmaChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { plunger, drops, solids, grains, sphere, bullet, bottles } = parts;
  const { whip, raise } = PACE.corner.beats;

  const plungerRest = plunger.position.y;
  const bulletRest = bullet.position.y;
  const [tipX, tipY] = toWorld(...NEEDLE_TIP);
  const [mouthX, mouthY] = toWorld(...CAPSULE_MOUTH);

  const track = makeCameraTrack([
    shot(-0.3, 480, 812, 104), // 針尖
    shot(0.03, 482, 832, 120),
    shot(0.25, 486, 884, 150), // 往下搖到推桿
    shot(whip[0], 486, 886, 150),
    shot(whip[1], 388, 908, 132), // 甩到藥丸與印度門
    shot(0.56, 384, 911, 124),
    shot(0.62, 536, 952, 136), // 實驗室全景
    shot(0.72, 546, 944, 96), // 推近科學家與紅球
    shot(0.755, 548, 944, 94),
    shot(0.79, 674, 956, 96), // 口紅
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { drone: 0.3, tick: 0.15 },
    captions: pacedCaptions("corner", [
      "一支紅色針筒直直立著：減重針。整張封面上，它離圓心第二近。",
      "膠囊和藥錠灑出來，可能指注射轉口服與藥價。印度門被製藥包圍，可能指學名藥與 AI 外包。",
      "大腦正下方，科學家端詳一顆紅球，可能是 AI 驅動的生物研究、長壽療法。瓶罐是道具。",
      "最後是口紅：減重之後的報復性消費，不是口紅效應。針筒、藥丸、實驗室、口紅是同一條線。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 針筒：推桿在第 1 句字幕期間推進去，回到封面上的位置
      const push = smooth(linearstep(p, 0.06, 0.24));
      plunger.position.y = plungerRest - toUnits(PLUNGER_TRAVEL) * (1 - push);
      // 針尖冒出三滴，各自沿小拋物線落下
      drops.forEach((drop, i) => {
        const t = linearstep(p, 0.09 + i * 0.045, 0.16 + i * 0.045);
        const side = [-1, 1, -0.4][i];
        drop.visible = t > 0 && t < 1;
        drop.position.x = tipX + toUnits(7 * side) * t;
        drop.position.y = tipY + toUnits(9) * Math.sin(t * Math.PI * 0.75) - toUnits(16) * t * t;
        drop.scale.setScalar(0.6 + 0.6 * Math.sin(t * Math.PI));
      });

      // 膠囊與藥錠：甩鏡時一顆接一顆掉下來，落地時轉正
      solids.forEach((sprite, i) => {
        const start = whip[0] + 0.005 + i * 0.022;
        const fall = linearstep(p, start, start + 0.075);
        const eased = 1 - (1 - fall) * (1 - fall);
        const bounce = Math.sin(Math.min(1, linearstep(p, start + 0.075, start + 0.13)) * Math.PI) * toUnits(2.4);
        sprite.visible = fall > 0;
        sprite.position.y = sprite.userData.rest.y + toUnits(46) * (1 - eased) + bounce;
        sprite.position.x = sprite.userData.rest.x + toUnits(i % 2 ? 9 : -7) * (1 - eased);
        sprite.rotation.z = (i % 2 ? 1 : -1) * 1.3 * (1 - eased);
      });
      // 顆粒：從下方那顆膠囊的開口滾出來，離得近的先到
      grains.forEach((sprite, i) => {
        const start = 0.39 + i * 0.014;
        const roll = smooth(linearstep(p, start, start + 0.07));
        const rest = sprite.userData.rest;
        sprite.visible = roll > 0;
        sprite.position.x = mouthX + (rest.x - mouthX) * roll;
        sprite.position.y = mouthY + (rest.y - mouthY) * roll + Math.sin(roll * Math.PI) * toUnits(5);
        sprite.scale.setScalar(0.4 + 0.6 * roll);
      });

      // 紅球在科學家手上微微脹縮；瓶子輪流晃一下
      sphere.scale.setScalar(1 + 0.05 * Math.sin(frame.time * 2.2));
      bottles.children.forEach((bottle, i) => {
        bottle.scale.y = 1 + 0.03 * Math.max(0, Math.sin(frame.time * 1.7 + i * 1.3));
      });

      // 口紅：膏體藏在管子裡，raise 節拍時旋上來
      const twist = smooth(linearstep(p, raise[0], raise[1]));
      bullet.position.y = bulletRest - toUnits(BULLET_TRAVEL) * (1 - twist);
    },
  };
}
