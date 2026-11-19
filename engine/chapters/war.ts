// 第 11 章：戰火（#78–85）。
// 飛彈從圓的左緣射進來 → 白線廢墟、大爆炸與被炸的城市 → 兩輛對射的戰車、砲擊點、白煙 → 三架無人機 → 退後看整片戰場。
//
// 節奏範本：tree。節拍對應：
//   strike 0.035      第一枚飛彈越過圓的左緣（音效 flip）
//   grow 0.08–0.36    飛彈一枚接一枚飛到封面上的位置；最後 0.30–0.37 大爆炸在城市後面炸開
//   climb 0.12–0.56   鏡頭順著飛彈的方向往右下走：飛彈 → 廢墟與爆炸 → 戰車
//   out 0.55          兩輛戰車開火，砲彈在中間炸開（音效 boom），車身後座
//   dissolve 0.55–0.66、rise 0.55–0.84   白煙一團一團冒出來、往上升到封面上的位置（0.72 前到位，趕上第 3 句），之後原地飄
//   streak 0.77–0.97  三架無人機從畫面左邊橫越進來（原作的那顆流星），之後懸停
import { Color, Group, PerspectiveCamera, Scene } from "three";
import type { Object3D } from "three";
import { clamp, envelope, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCaptions, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawSparkle, traceBlob } from "../shared/world/props";
import { tracePoly as polygon } from "../shared/world/shapes";
import { BLACK, RED, WHITE, coverSprite, shot, toUnits } from "../shared/world/space";
import { drawDroneBody, drawDroneRotors, drawMissile, drawStreak } from "../shared/world/vehicles";

// 飛彈的飛行方向：往右下約 26°（封面像素，y 向下）
const FLIGHT_ANGLE = Math.atan2(28, 57);
const FLIGHT = [Math.cos(FLIGHT_ANGLE), Math.sin(FLIGHT_ANGLE)];

// 有彈體的飛彈：[彈頭尖端 x, y, 大小]。放大後數到 4 枚。
const MISSILES = [[182, 968, 1], [260, 987, 1], [303, 988, 0.86], [211, 1028, 1]];
// 只畫成紅色細長水滴的飛彈（較遠的）：[尾端 x, y, 頭端 x, y]。放大後數到 5 道。
const STREAKS = [[90, 922, 118, 938], [146, 926, 194, 952], [218, 937, 255, 958], [106, 976, 144, 996], [197, 995, 252, 1025]];

// 這一章範圍內的黑色地塊（不屬於任何編號）：左邊貼著圓周，上緣到實驗室底下，下緣是廢墟與城市站的地方
const TERRAIN = [
  [92, 890], [150, 884], [215, 888], [255, 905], [290, 935], [325, 956], [385, 962], [440, 978], [520, 983], [600, 982],
  [618, 992], [606, 1010], [575, 1022], [540, 1031], [500, 1042], [455, 1054], [420, 1062], [395, 1072], [388, 1094],
  [340, 1094], [300, 1088], [270, 1084], [235, 1090], [190, 1086], [160, 1090], [149, 1075], [154, 1048], [166, 1030],
  [150, 1017], [128, 1012], [110, 994], [99, 975], [88, 960], [94, 942], [86, 922],
];

// 大爆炸：外層紅、內層白，尖角與凹角交替（座標量自封面）
const BLAST_RED = [
  [262, 1059], [284, 1046], [263, 1018], [288, 1026], [279, 1001], [300, 1018], [320, 1001], [331, 1017], [343, 1000],
  [352, 1022], [372, 1013], [360, 1036], [379, 1041], [358, 1052], [364, 1070], [340, 1080], [300, 1085], [268, 1079], [285, 1066],
];
const BLAST_WHITE = [
  [289, 1049], [300, 1043], [294, 1028], [306, 1035], [306, 1020], [315, 1031], [324, 1021], [331, 1033], [343, 1029],
  [339, 1042], [353, 1046], [341, 1052], [350, 1062], [338, 1066], [335, 1085], [295, 1085], [300, 1062], [286, 1066], [298, 1054],
];
const BLAST_BOX = [256, 994, 386, 1090];

// 無人機：[機身中心 x, y, 大小]，由左上往右下越來越小
const DRONES = [[390, 997, 1], [449, 1012, 0.9], [500, 1023, 0.7]];

const TANK_MIRROR_X = 560; // 兩輛戰車以這條線左右對稱
const BURST = [556, 1067]; // 砲擊點
const BURST_TIPS = [[526, 1044], [543, 1032], [569, 1033], [590, 1044], [580, 1066], [574, 1083], [556, 1092], [540, 1083], [527, 1070]];

function drawTerrain(ctx) {
  traceBlob(ctx, TERRAIN);
  ctx.fillStyle = BLACK;
  ctx.fill();
  drawSparkle(ctx, 531, 1026, 5); // 戰車上方那顆白色星芒
}

// #79 白線廢墟：左邊一棟只剩骨架，右邊一棟還有兩扇窗
function drawRuins(ctx) {
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2.6;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  const line = (...p) => {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  };
  line(166, 1048.5, 175, 1041.5, 175, 1079); // 斷掉的屋頂與左牆
  line(175, 1058, 186, 1058);
  line(175, 1067, 186, 1067);
  line(186, 1052, 186, 1079);
  line(186, 1075, 204, 1075); // 兩棟之間的矮牆
  line(194, 1063, 194, 1075);
  ctx.fillStyle = WHITE;
  ctx.fillRect(201, 1044, 18, 36);
  ctx.fillStyle = BLACK;
  ctx.fillRect(207, 1050, 7.5, 7);
  ctx.fillRect(207, 1061, 7.5, 7);
  polygon(ctx, [[200, 1043], [207, 1043], [200, 1051]]); // 缺了一角
  ctx.fill();
  // 牆腳的瓦礫
  for (const [x, y, r] of [[180, 1081, 4], [190, 1080, 3], [197, 1081.5, 4], [211, 1082, 4.5], [221, 1079, 3]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// #81 被炸的城市：黑色剪影，站在爆炸前面
function drawCity(ctx) {
  ctx.fillStyle = BLACK;
  polygon(ctx, [[296, 1096], [296, 1061], [303, 1058], [303, 1054], [316, 1045], [316, 1096]]);
  ctx.fill();
  ctx.fillRect(316, 1047, 16, 49);
  ctx.fillRect(321.5, 1041.5, 4.5, 7);
  ctx.fillRect(331, 1079, 16, 18);
  polygon(ctx, [[345, 1098], [345, 1071], [372, 1066], [372, 1098]]);
  ctx.fill();
  ctx.fillRect(377, 1064, 9, 35);
  // 地基與瓦礫
  ctx.beginPath();
  ctx.moveTo(280, 1090);
  ctx.quadraticCurveTo(284, 1076, 297, 1080);
  ctx.lineTo(388, 1088);
  ctx.lineTo(389, 1099);
  ctx.quadraticCurveTo(330, 1099, 300, 1094);
  ctx.quadraticCurveTo(284, 1095, 280, 1090);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(339, 1081, 5, 0, Math.PI * 2);
  ctx.fill();
  // 窗
  ctx.fillStyle = WHITE;
  const windows = [[308, 1069], [308, 1080], [320, 1058], [320, 1069], [320, 1080], [364, 1075], [364, 1086], [353, 1081], [353, 1090]];
  for (const [x, y] of windows) {
    ctx.beginPath();
    ctx.roundRect(x, y, 3, 6, 1.2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(339.5, 1088, 1.4, 0, Math.PI * 2);
  ctx.fill();
}

// #83 戰車：照左邊那輛（砲口朝右）畫；右邊那輛是鏡像
function drawTank(ctx, mirrored) {
  ctx.save();
  if (mirrored) {
    ctx.translate(TANK_MIRROR_X * 2, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = BLACK;
  // 車體與履帶
  ctx.beginPath();
  ctx.moveTo(430, 1080);
  ctx.lineTo(529, 1080);
  ctx.quadraticCurveTo(539, 1084, 538, 1092);
  ctx.quadraticCurveTo(534, 1107, 520, 1107);
  ctx.lineTo(440, 1107);
  ctx.quadraticCurveTo(425, 1107, 421, 1092);
  ctx.quadraticCurveTo(420, 1084, 430, 1080);
  ctx.fill();
  ctx.fillRect(440, 1075.5, 72, 6);
  // 砲塔、艙蓋、砲管
  polygon(ctx, [[455, 1062], [497, 1062], [505, 1070], [508, 1077], [445, 1077], [448, 1070]]);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(463, 1057.5, 16, 6, 1.5);
  ctx.fill();
  ctx.fillRect(497, 1063, 13, 6.5);
  ctx.fillRect(505, 1064.8, 38, 3);
  // 紅色細節
  ctx.fillStyle = RED;
  ctx.fillRect(462, 1072.6, 26, 1.8);
  ctx.beginPath();
  ctx.ellipse(484, 1066.5, 3.2, 1.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(430, 1086.8, 100, 1.5);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2;
  for (const x of [458, 477, 496, 515]) {
    ctx.beginPath();
    ctx.arc(x, 1098, 3.3, -Math.PI / 2 + 0.7, Math.PI * 1.5 - 0.7); // 開口朝上的 C 形路輪
    ctx.stroke();
  }
  for (const [x, y, r] of [[437, 1097, 1.8], [527, 1094, 2], [447.5, 1101.5, 0.8], [467.5, 1101.5, 0.8], [486.5, 1101.5, 0.8], [505.5, 1101.5, 0.8]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// #84 砲擊點：九個尖角的紅色星爆，中心一小塊黑
function drawBurst(ctx) {
  const [cx, cy] = BURST;
  const angles = BURST_TIPS.map(([x, y]) => Math.atan2(y - cy, x - cx));
  ctx.fillStyle = RED;
  ctx.beginPath();
  BURST_TIPS.forEach(([x, y], i) => {
    let next = angles[(i + 1) % angles.length];
    if (next < angles[i]) next += Math.PI * 2;
    const mid = (angles[i] + next) / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.lineTo(cx + Math.cos(mid) * 9.5, cy + Math.sin(mid) * 9.5);
  });
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 ? 2.4 : 5.2, a = (i / 16) * Math.PI * 2 + 0.2;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(cx, cy, 1, 0, Math.PI * 2);
  ctx.fill();
}

// #85 白煙：三團，各自一張圖。每團是幾個圓；dashes 是煙底下那幾撇黑。
const SMOKE_PUFFS = [
  { circles: [[463, 1042, 6.5], [457.5, 1045.5, 4]], dashes: [] },
  { circles: [[473, 1038.5, 7.5], [470, 1044, 5.5], [478, 1044, 5.5]], dashes: [[469, 1046.5], [475.5, 1046], [482, 1045.2]] },
  { circles: [[484, 1041, 6.5], [489.5, 1045, 4]], dashes: [] },
];

export function build(register) {
  const group = new Group();

  // 地景
  group.add(coverSprite([82, 880, 622, 1096], drawTerrain, { z: 0, scale: 5 }));

  // #78 飛彈：一枚一張圖，才能各自飛進來
  const missiles = new Group();
  const [ux, uy] = FLIGHT;
  for (const [x, y, size] of MISSILES) {
    const tail = [x - ux * 61 * size, y - uy * 61 * size];
    const box = [Math.min(x, tail[0]) - 8, Math.min(y, tail[1]) - 13, Math.max(x, tail[0]) + 8, Math.max(y, tail[1]) + 13];
    missiles.add(coverSprite(box, (ctx) => drawMissile(ctx, x, y, size, FLIGHT_ANGLE), { z: 0.12, scale: 12 }));
  }
  for (const streak of STREAKS) {
    const [x0, y0, x1, y1] = streak;
    missiles.add(coverSprite([x0 - 1, y0 - 3, x1 + 3, y1 + 3], (ctx) => drawStreak(ctx, streak), { z: 0.1, scale: 12 }));
  }
  for (const sprite of missiles.children) sprite.userData.rest = sprite.position.clone();
  register(78, missiles, { count: 9 });
  group.add(missiles);

  // #79 白線廢墟
  const ruins = coverSprite([163, 1038, 226, 1088], drawRuins, { z: 0.04, scale: 12 });
  register(79, ruins);
  group.add(ruins);

  // #80 大爆炸：紅、白兩層，同一個外框，縮放時中心才會一致
  const blast = new Group();
  const blastRed = coverSprite(BLAST_BOX, (ctx) => { polygon(ctx, BLAST_RED); ctx.fillStyle = RED; ctx.fill(); }, { z: 0.05, scale: 8 });
  const blastWhite = coverSprite(BLAST_BOX, (ctx) => { polygon(ctx, BLAST_WHITE); ctx.fillStyle = WHITE; ctx.fill(); }, { z: 0.06, scale: 8 });
  blast.add(blastRed, blastWhite);
  register(80, blast);
  group.add(blast);

  // #81 被炸的城市
  const city = coverSprite([278, 1040, 392, 1100], drawCity, { z: 0.08, scale: 10 });
  city.userData.rest = city.position.clone();
  register(81, city);
  group.add(city);

  // #82 無人機：每架是機身＋旋翼兩張圖
  const drones = new Group();
  for (const [cx, cy, s] of DRONES) {
    const box = [cx - 34 * s, cy - 10 * s, cx + 34 * s, cy + 10 * s];
    const drone = new Group();
    const rotors = coverSprite(box, (ctx) => drawDroneRotors(ctx, cx, cy, s), { z: 0.11, scale: 14 });
    drone.add(coverSprite(box, (ctx) => drawDroneBody(ctx, cx, cy, s), { z: 0.1, scale: 14 }), rotors);
    drone.userData.rotors = rotors;
    drones.add(drone);
  }
  register(82, drones, { count: 3 });
  group.add(drones);

  // #83 兩輛對射的戰車
  const tanks = new Group();
  const leftTank = coverSprite([418, 1054, 546, 1110], (ctx) => drawTank(ctx, false), { z: 0.1, scale: 10 });
  const rightTank = coverSprite([574, 1054, 702, 1110], (ctx) => drawTank(ctx, true), { z: 0.1, scale: 10 });
  for (const tank of [leftTank, rightTank]) tank.userData.rest = tank.position.clone();
  tanks.add(leftTank, rightTank);
  register(83, tanks, { count: 2 });
  group.add(tanks);

  // #84 砲擊點（外框以砲擊點為中心，縮放時才會從中心炸開）
  const burst = coverSprite([BURST[0] - 36, BURST[1] - 37, BURST[0] + 36, BURST[1] + 37], drawBurst, { z: 0.13, scale: 12 });
  register(84, burst);
  group.add(burst);

  // #85 白煙
  const smoke = new Group();
  for (const puff of SMOKE_PUFFS) {
    const xs = puff.circles.map(([x, , r]) => [x - r, x + r]).flat(), ys = puff.circles.map(([, y, r]) => [y - r, y + r]).flat();
    const sprite = coverSprite([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], (ctx) => {
      ctx.fillStyle = WHITE;
      for (const [x, y, r] of puff.circles) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = BLACK;
      for (const [x, y] of puff.dashes) {
        ctx.beginPath();
        ctx.ellipse(x, y, 2.2, 0.9, -0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }, { z: 0.09, scale: 14 });
    sprite.userData.rest = sprite.position.clone();
    smoke.add(sprite);
  }
  register(85, smoke);
  group.add(smoke);

  return { group, parts: { missiles, blastRed, blastWhite, city, drones, leftTank, rightTank, burst, smoke } };
}

/** 這一章最後一格的鏡位：整片戰場。 */
export const END_VIEW = { px: 392, py: 1040, heightPx: 350 };

export default function createWarChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { missiles, blastRed, blastWhite, city, drones, leftTank, rightTank, burst, smoke } = parts;
  const { strike, grow, out, dissolve, rise, streak } = PACE.tree.beats;

  // 飛彈的出發順序：越靠右（飛得越遠）的越早越過圓周
  const launchOrder = missiles.children
    .map((sprite, index) => ({ index, x: sprite.userData.rest.x }))
    .sort((a, b) => b.x - a.x)
    .map((item, rank): [Object3D, number] => [missiles.children[item.index], rank / (missiles.children.length - 1)]);

  // 鏡頭在每句字幕的時間窗裡停在那句話講的東西上
  const track = makeCameraTrack([
    shot(-0.3, 140, 945, 230),
    shot(strike, 150, 955, 200),
    shot(0.12, 192, 974, 166),
    shot(0.3, 200, 976, 160), // 第 1 句：飛彈
    shot(0.35, 275, 1058, 162),
    shot(0.5, 277, 1058, 156), // 第 2 句：廢墟、爆炸、城市
    shot(0.545, 560, 1084, 196),
    shot(0.72, 560, 1084, 186), // 第 3 句：戰車
    shot(0.765, 448, 1036, 108),
    shot(0.88, 448, 1036, 104), // 第 4 句：無人機（畫面下緣是戰車）
    shot(0.93, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx), // 第 5 句：整片戰場
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.24 },
    sound: { drone: 0.4, wind: 0.2, fire: 0.25 },
    cues: pacedCues("tree", ["flip", "boom"]),
    captions: pacedCaptions("tree", [
      "一群飛彈從圓的左緣射進來，來源在畫框之外。圖上沒有指明是誰發射的。",
      "它們飛向白線畫的廢墟：一座已經被摧毀的城市。旁邊的大爆炸，是空襲的場面。",
      "兩輛戰車對射，砲彈在中間炸開，白煙升起。地面戰正在進行。",
      "三架無人機飛在實驗室和戰車之間：科技與戰爭的接點，廉價飛行器羞辱傳統軍力。",
      "這片戰場沒有名字。圖上找不到任何能指認地點的符號。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);
      const time = frame.time;

      // 飛彈：strike 起依序越過圓周，grow 結束前全部飛到位；到位後沿飛行方向微微前後晃
      launchOrder.forEach(([sprite, rank], i) => {
        const start = strike + rank * 0.1;
        const arrive = linearstep(p, start, start + (grow[1] - 0.04 - strike - 0.1));
        const back = (1 - arrive) * (1 - arrive) * 330 - Math.sin(time * 2.2 + i * 1.7) * 1.2;
        sprite.position.x = sprite.userData.rest.x - toUnits(FLIGHT[0] * back);
        sprite.position.y = sprite.userData.rest.y + toUnits(FLIGHT[1] * back);
        sprite.visible = arrive > 0;
      });

      // 大爆炸：grow 的最後一段炸開，之後紅、白兩層錯開脈動；城市剪影跟著震一下
      const blastGrow = smooth(linearstep(p, 0.3, grow[1] + 0.01));
      const overshoot = 1 + 0.12 * envelope(p, 0.3, grow[1], grow[1], 0.42);
      blastRed.scale.setScalar(blastGrow * overshoot * (1 + 0.025 * Math.sin(time * 5)));
      blastWhite.scale.setScalar(smooth(linearstep(p, 0.315, grow[1] + 0.02)) * overshoot * (1 + 0.04 * Math.sin(time * 7 + 1)));
      blastRed.visible = blastWhite.visible = blastGrow > 0;
      city.position.x = city.userData.rest.x + envelope(p, 0.3, 0.33, 0.36, 0.42) * Math.sin(time * 40) * toUnits(0.8);

      // 戰車：out（0.55）前互相逼近，開火那一下後座
      const advance = 1 - smooth(linearstep(p, 0.46, out));
      const recoil = envelope(p, out, out + 0.012, out + 0.03, dissolve[1]);
      const offset = toUnits(advance * 9 + recoil * 4);
      leftTank.position.x = leftTank.userData.rest.x - offset;
      rightTank.position.x = rightTank.userData.rest.x + offset;

      // 砲擊點：0.55 從中心炸開，之後不規則地閃
      const bang = linearstep(p, out, out + 0.025);
      burst.scale.setScalar(bang * (1 + 0.25 * envelope(p, out, out + 0.02, out + 0.03, dissolve[1])) * (1 + 0.05 * Math.sin(time * 9)));
      burst.rotation.z = Math.sin(time * 3.1) * 0.03;
      burst.visible = bang > 0;

      // 白煙：dissolve 期間一團一團冒出來，rise 期間升到封面上的位置
      smoke.children.forEach((puff, i) => {
        const appear = smooth(linearstep(p, dissolve[0] + i * 0.03, dissolve[1] + i * 0.03));
        const lift = smooth(linearstep(p, rise[0] + i * 0.02, rise[0] + 0.13 + i * 0.02));
        puff.scale.setScalar(appear * (1 + 0.04 * Math.sin(time * 1.7 + i * 2)));
        puff.position.y = puff.userData.rest.y - toUnits(16) * (1 - lift) + Math.sin(time * 1.1 + i) * toUnits(0.5) * appear;
        puff.visible = appear > 0;
      });

      // 無人機：streak 開始前後從左邊橫越進來，之後上下懸停、旋翼閃動
      drones.children.forEach((drone, i) => {
        const fly = smooth(linearstep(p, streak[0] - 0.07 + i * 0.015, streak[0] + 0.04 + i * 0.015));
        drone.position.x = -toUnits(150) * (1 - fly);
        drone.position.y = toUnits(34) * (1 - fly) + Math.sin(time * 2.3 + i * 2.1) * toUnits(0.9);
        drone.rotation.z = 0;
        drone.visible = fly > 0;
        drone.userData.rotors.scale.x = 0.55 + 0.45 * Math.abs(Math.sin(time * 31 + i * 1.3));
      });
    },
  };
}
