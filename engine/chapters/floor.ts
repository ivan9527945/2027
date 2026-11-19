// 第 14 章：世界的地板（#108–114）。
// 從隊伍腳下硬切進來，鏡頭往下落到圓外抱頭坐著的人 → 退後，看到他就在水晶球正下方
// → 帳篷搭起來、母親把嬰兒舉高、包袱和瓶子落地 → 退到整片營地。
import { Color, Group, PerspectiveCamera, Scene } from "three";
import type { Mesh, PlaneGeometry, MeshBasicMaterial } from "three";
import { clamp, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCaptions } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawTent } from "../shared/world/buildings";
import { drawTuft } from "../shared/world/nature";
import { drawBundle, traceBlob } from "../shared/world/props";
import { BLACK, WHITE, coverSprite, shot, toUnits } from "../shared/world/space";
import { END_VIEW as QUEUE_END_VIEW, borrowCrystalBall, build as buildQueue } from "./queue";

// 帳篷：[頂點 x, 頂點 y, 底邊 y, 左腳 x, 右腳 x, 入口左 x, 入口右 x]。封面上只找得到 3 頂（清單寫 4）。
const TENTS = [
  [385, 1220, 1267, 353.5, 417.5, 372, 397.5],
  [506.5, 1243, 1290, 475.5, 538, 493.5, 518.5],
  [633, 1256, 1303.5, 601.5, 664.5, 620.5, 645.5],
];
// 碎片：每片是一串輪廓點。封面上找得到 3 片（清單寫「約 6」）。
const DEBRIS = [
  [[540, 1253.4], [542.4, 1252.6], [544.4, 1253.8], [543.8, 1255.6], [541, 1255.9]],
  [[559.4, 1255.6], [561.4, 1253.5], [563.2, 1255.2], [562.4, 1257.2], [560, 1257.2]],
  [[543, 1264.2], [546.2, 1263.6], [549.6, 1261.4], [551.8, 1262.8], [550.4, 1266.4], [546.4, 1268.2], [543.2, 1267.6]],
];
// 填底的草叢（地景，不屬於任何編號）：[中線 x, 底邊 y, 寬, 高]
const TUFTS = [
  [370.5, 1283.5, 20, 11], [398.5, 1294, 27, 13], [474, 1314, 32, 15], [504, 1309.5, 20, 9.5], [557.5, 1321, 27, 13.5],
  [719.5, 1263, 19, 9.5], [755.5, 1272.5, 21, 10.5], [781, 1259, 30, 16],
];
const BOTTLE = { x: 724, y: 1278.6, angle: -0.74 }; // 倒地的瓶子：中心與瓶身方向（瓶口朝左下）

// 蹲著的母親：面向右，馬尾甩在腦後，雙臂往前伸（嬰兒另外畫）
function drawMother(ctx) {
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 頭與臉（鼻尖朝右）
  ctx.beginPath();
  ctx.ellipse(451.6, 1241.8, 5.4, 5.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(455, 1240);
  ctx.lineTo(457.6, 1246.2);
  ctx.lineTo(453, 1247.6);
  ctx.closePath();
  ctx.fill();
  // 馬尾
  ctx.beginPath();
  ctx.moveTo(447.5, 1238.4);
  ctx.bezierCurveTo(441, 1238.6, 439.5, 1244.5, 433, 1243.8);
  ctx.bezierCurveTo(430.6, 1244.6, 432.4, 1248, 436, 1247.6);
  ctx.bezierCurveTo(441, 1247.4, 443, 1243.5, 448, 1243.6);
  ctx.closePath();
  ctx.fill();
  // 弓起的背與軀幹
  ctx.beginPath();
  ctx.moveTo(448.5, 1246.5);
  ctx.bezierCurveTo(438, 1247, 434, 1257, 434.8, 1266);
  ctx.bezierCurveTo(435.4, 1274, 439, 1280, 445, 1282);
  ctx.lineTo(450.5, 1272);
  ctx.lineTo(446.6, 1264.6);
  ctx.lineTo(452, 1258);
  ctx.lineTo(454.5, 1249.5);
  ctx.closePath();
  ctx.fill();
  // 手臂：肩 → 肘 → 托著嬰兒的手
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(452.6, 1250);
  ctx.lineTo(458.6, 1257.6);
  ctx.lineTo(465.4, 1255.8);
  ctx.stroke();
  // 大腿、小腿
  ctx.lineWidth = 7.4;
  ctx.beginPath();
  ctx.moveTo(444.5, 1269.5);
  ctx.lineTo(460.2, 1266);
  ctx.stroke();
  ctx.lineWidth = 5.2;
  ctx.beginPath();
  ctx.moveTo(461.4, 1266.4);
  ctx.lineTo(458.6, 1281);
  ctx.stroke();
  // 兩隻腳
  ctx.beginPath();
  ctx.roundRect(454.6, 1280.4, 10.4, 4.8, [2, 2.4, 1, 1]);
  ctx.roundRect(438, 1280.2, 13.6, 5, [2.4, 2.4, 1, 1]);
  ctx.fill();
}

// 被舉著的嬰兒：圓頭、短短的手腳，面向母親
function drawBaby(ctx) {
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(470.4, 1246.6, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(467, 1249.6, 7.2, 9.6, 2.6);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(468, 1252);
  ctx.lineTo(465.6, 1255.4);
  ctx.moveTo(473.4, 1252);
  ctx.lineTo(475.6, 1256.6);
  ctx.moveTo(468.6, 1258);
  ctx.lineTo(468, 1265.2);
  ctx.moveTo(472.6, 1258);
  ctx.lineTo(473.4, 1264.6);
  ctx.stroke();
}

// 坐在母親腳邊的孩子：盤腿，手垂在身側
function drawSittingChild(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.arc(427, 1263.6, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(420.6, 1267.6, 13, 14.4, [4.6, 4.6, 1, 1]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(416, 1281.6);
  ctx.quadraticCurveTo(417.5, 1279, 422, 1279.6);
  ctx.lineTo(434, 1279.4);
  ctx.quadraticCurveTo(438.6, 1281.6, 436.4, 1285.4);
  ctx.quadraticCurveTo(430, 1289, 424.6, 1287.4);
  ctx.quadraticCurveTo(421.4, 1284, 416.6, 1283.4);
  ctx.closePath();
  ctx.fill();
  // 手臂和身體之間的一道縫
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.roundRect(430.2, 1273.4, 1.2, 5, 0.6);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

// 抱頭坐地的人：側面朝左，屈膝，手肘撐在膝上、雙手抱著低下去的頭
function drawSitter(ctx) {
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 弓起的背和臀
  ctx.beginPath();
  ctx.moveTo(592, 1259);
  ctx.bezierCurveTo(602, 1261, 609, 1272, 610, 1285);
  ctx.bezierCurveTo(611, 1298, 608, 1306, 600, 1308.6);
  ctx.lineTo(594, 1308.4);
  ctx.lineTo(590.5, 1300);
  ctx.lineTo(594.6, 1291);
  ctx.lineTo(594.4, 1270.6);
  ctx.closePath();
  ctx.fill();
  // 頭
  ctx.beginPath();
  ctx.arc(590.2, 1263.6, 6.3, 0, Math.PI * 2);
  ctx.fill();
  // 上臂（肩 → 肘）與前臂（肘 → 抱著頭的手）
  ctx.lineWidth = 5.4;
  ctx.beginPath();
  ctx.moveTo(597, 1272.4);
  ctx.lineTo(582, 1282.4);
  ctx.stroke();
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.moveTo(580.6, 1281.4);
  ctx.lineTo(584.6, 1263.6);
  ctx.stroke();
  // 大腿（臀 → 膝）、小腿（膝 → 踝）
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(601, 1302.6);
  ctx.lineTo(580, 1285);
  ctx.stroke();
  ctx.lineWidth = 6.4;
  ctx.beginPath();
  ctx.moveTo(579, 1285.6);
  ctx.lineTo(570.4, 1303);
  ctx.stroke();
  // 腳掌，腳尖朝左
  ctx.beginPath();
  ctx.moveTo(574.4, 1302);
  ctx.lineTo(575, 1308.6);
  ctx.lineTo(564, 1308.6);
  ctx.quadraticCurveTo(561.4, 1307.4, 564, 1305.6);
  ctx.closePath();
  ctx.fill();
}

// 瓶子：以 BOTTLE 為中心、沿瓶身方向畫，瓶口在 -x 那一端
function drawBottle(ctx) {
  ctx.save();
  ctx.translate(BOTTLE.x, BOTTLE.y);
  ctx.rotate(BOTTLE.angle);
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(-2.4, -2.7, 9.6, 5.4, 1.5);
  ctx.roundRect(-7.6, -1, 6, 2, 0.8);
  ctx.fill();
  ctx.restore();
}

/**
 * 在封面座標系裡建立這一章的所有元素。章節本身和終章都呼叫它。
 * @param {(id: number, object: import("three").Object3D, opts?: {count?: number}) => unknown} register
 */
export function build(register) {
  const group = new Group();

  // 地景：填底的草叢
  const tufts = new Group();
  for (const [cx, baseY, w, h] of TUFTS) {
    tufts.add(coverSprite([cx - w / 2, baseY - h, cx + w / 2, baseY], (ctx) => drawTuft(ctx, cx, baseY, w, h), { z: 0.02, pad: 1, scale: 12 }));
  }
  group.add(tufts);

  // #108 紅框帳篷：貼圖的錨點在底邊，才能從地面「搭」起來
  const tents = new Group();
  for (const tent of TENTS) {
    const [, ay, baseY, x0, x1] = tent;
    const sprite = coverSprite([x0, ay, x1, baseY], (ctx) => drawTent(ctx, tent), { z: 0.04, scale: 10 });
    const half = toUnits(baseY - ay + 4) / 2;
    sprite.geometry.translate(0, half, 0);
    sprite.position.y -= half;
    tents.add(sprite);
  }
  register(108, tents, { count: 3 });
  group.add(tents);

  // #109 舉嬰兒的母親
  const mother = coverSprite([430, 1235, 467, 1286], drawMother, { z: 0.08, scale: 14 });
  register(109, mother);
  group.add(mother);

  // #110 兩個孩子：被舉著的嬰兒、坐在母親腳邊的孩子
  const baby = coverSprite([464, 1242, 478, 1267], drawBaby, { z: 0.09, scale: 16 });
  const child = coverSprite([415, 1259, 439, 1289], drawSittingChild, { z: 0.07, scale: 16 });
  const children = new Group();
  children.add(baby, child);
  register(110, children, { count: 2 });
  group.add(children);

  // #111 抱頭坐地的人：背靠著第三頂帳篷
  const sitter = coverSprite([560, 1256, 612, 1310], drawSitter, { z: 0.1, scale: 14 });
  register(111, sitter);
  group.add(sitter);

  // #112 兩個包袱
  const bundles = new Group();
  bundles.add(
    coverSprite([657, 1259, 687, 1290], (ctx) => drawBundle(ctx, 671.6, 1278.4, 14, 10.8, 673, 1260.6, [[675, 1269.4, 679.4, 1274.6]]), { z: 0.05, scale: 14 }),
    coverSprite([678, 1263, 711, 1301], (ctx) =>
      drawBundle(ctx, 694.6, 1286.6, 15.4, 13.4, 694.6, 1264.6, [[681.6, 1281, 686, 1275.6], [694.6, 1275, 696.6, 1283], [698.6, 1275.4, 702.6, 1281.4]]), { z: 0.06, scale: 14 }),
  );
  register(112, bundles, { count: 2 });
  group.add(bundles);

  // #113 倒地的瓶子
  const bottle = coverSprite([BOTTLE.x - 9, BOTTLE.y - 9, BOTTLE.x + 9, BOTTLE.y + 9], drawBottle, { z: 0.05, pad: 0, scale: 16 });
  register(113, bottle);
  group.add(bottle);

  // #114 碎片
  const debris = new Group();
  for (const piece of DEBRIS) {
    const xs = piece.map(([x]) => x), ys = piece.map(([, y]) => y);
    debris.add(coverSprite([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], (ctx) => {
      traceBlob(ctx, piece);
      ctx.fillStyle = BLACK;
      ctx.fill();
    }, { z: 0.03, pad: 1, scale: 16 }));
  }
  register(114, debris, { count: 3 });
  group.add(debris);

  for (const object of [mother, baby, child, bottle, ...bundles.children]) object.userData.rest = object.position.clone();
  return { group, parts: { tents, mother, baby, child, sitter, bundles, bottle, tufts } };
}

/** 這一章最後一格的鏡位（整片營地，上方還看得到隊伍和水晶球）；終章用硬切進場，從這裡接。 */
export const END_VIEW = { px: 558, py: 1238, heightPx: 330 };

// 節奏範本：morning（貼近 → 退後看全身 → 旁人進場 → 退到遠處）。對應：
//   close    0–0.16     硬切自上一章的最後一格（隊伍腳下），鏡頭往下落到抱頭坐地的人（第 1 句）
//   pullBack 0.16–0.42  退後，直到看見他頭頂正上方的隊伍和水晶球（第 2 句）
//   others   0.42–0.72  旁人進場：另外兩頂帳篷搭起來、母親和孩子出現、嬰兒被舉高、包袱落地、瓶子滾倒（第 3 句）
//   wide     0.42–0.70  同時退到整片營地
//   drift    0.70–1.45  鏡頭繼續慢慢往後、往上
export default function createFloorChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  const { tents, mother, baby, child, sitter, bundles, bottle, tufts } = parts;
  scene.add(group);
  // 背景：上一章的隊伍和序章的水晶球。只在這一章的場景裡借來看，不登記（各自的章節才登記）
  const { close, pullBack, others, wide } = PACE.morning.beats;

  const track = makeCameraTrack([
    shot(-0.3, QUEUE_END_VIEW.px, QUEUE_END_VIEW.py, QUEUE_END_VIEW.heightPx),
    shot(close[0], QUEUE_END_VIEW.px, QUEUE_END_VIEW.py, QUEUE_END_VIEW.heightPx),
    shot(0.08, 588, 1280, 76),
    shot(close[1], 588, 1281, 78),
    shot(0.33, 586, 1231, 224),
    shot(0.45, 585, 1232, 230),
    shot(0.58, 560, 1252, 272),
    shot(wide[1], 560, 1250, 280),
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.45, END_VIEW.px, END_VIEW.py - 14, END_VIEW.heightPx + 50),
  ]);

  const setOpacity = (object, value) => {
    object.material.opacity = value;
    object.visible = value > 0.001;
  };

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.22 },
    sound: { wind: 0.35, drone: 0.15 },
    captions: pacedCaptions("morning", [
      "隊伍腳下，圓的外面，一個人抱著頭坐在地上。",
      "他就在水晶球的正下方：預測是給上面的人看的，下面的人只能抱頭。",
      "母親把嬰兒舉高，是要讓人看見。帳篷壓在圓周線上：難民是這個世界的地板。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 抱頭的人：很慢地前後搖
      sitter.rotation.z = Math.sin(frame.time * 0.9) * 0.014;

      // 帳篷：他背靠的那一頂一直都在；另外兩頂在「旁人進場」時由近到遠從地面搭起來
      tents.children.forEach((tent, i) => {
        const order = 2 - i;
        const start = others[0] - 0.02 + order * 0.05;
        const up = order === 0 ? 1 : smooth(linearstep(p, start, start + 0.09));
        tent.scale.set(0.82 + 0.18 * up, up, 1);
        tent.visible = up > 0.001;
      });
      // 草叢跟著地面一起露出來（坐著的人腳邊那一叢一開始就在）
      tufts.children.forEach((tuft, i) => {
        (tuft as Mesh<PlaneGeometry, MeshBasicMaterial>).material.opacity = i === 4 ? 1 : smooth(linearstep(p, pullBack[0] + i * 0.012, pullBack[0] + 0.08 + i * 0.012));
      });

      // 母親和坐著的孩子從左邊進場；嬰兒先抱在胸前，第三句字幕出現時舉到封面上的高度
      const arrive = smooth(linearstep(p, others[0] + 0.02, others[0] + 0.12));
      const slide = toUnits(-12) * (1 - arrive);
      const lift = smooth(linearstep(p, 0.55, 0.64));
      mother.position.x = mother.userData.rest.x + slide;
      child.position.x = child.userData.rest.x + slide * 1.5;
      baby.position.x = baby.userData.rest.x + slide - toUnits(5) * (1 - lift);
      baby.position.y = baby.userData.rest.y - toUnits(9) * (1 - lift) + Math.sin(frame.time * 1.7) * toUnits(0.5) * lift;
      for (const object of [mother, child, baby]) setOpacity(object, arrive);

      // 包袱一個接一個落地
      bundles.children.forEach((bundle, i) => {
        const drop = smooth(linearstep(p, others[0] + 0.07 + i * 0.05, others[0] + 0.15 + i * 0.05));
        bundle.position.y = bundle.userData.rest.y + toUnits(16) * (1 - drop) * (1 - drop);
        setOpacity(bundle, linearstep(drop, 0, 0.35));
      });
      // 瓶子從包袱那邊滾出來，倒在封面上的位置
      const roll = smooth(linearstep(p, others[0] + 0.17, others[1] - 0.06));
      bottle.position.x = bottle.userData.rest.x - toUnits(16) * (1 - roll);
      bottle.rotation.z = 3.6 * (1 - roll);
      setOpacity(bottle, linearstep(roll, 0, 0.2));
    },
  };
}
