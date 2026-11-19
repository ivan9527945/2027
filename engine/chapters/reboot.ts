// 第 12 章：舊片重映（#106–107）。
// 一台放映機，兩個紅色片盤；機身右邊掛著一張紅色蜘蛛網。只有兩個元素，靠鏡頭和小動作撐：
// 片盤的轉角是 progress 的函式，越轉越慢，蜘蛛網從網心一圈一圈張開時剛好停住。
//
// 節奏範本：matches（安靜的特寫）。節拍對應：
//   approach −0.4–0.3   鏡頭從遠處慢慢靠近整台放映機，片盤在轉（第 1 句），再貼近到兩個片盤（第 2 句）
//   tilt 0.3–0.5        鏡頭從片盤往右下搖到機身右側；蜘蛛網的主絲開始拉出來
//   pushIn 0.45–0.78    推近蜘蛛網，輻絲與三圈橫絲依序張開，片盤停住（第 3 句）
//   cutToDetail 0.78    硬切到網心的大特寫
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCaptions } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawFilmReel } from "../shared/world/props";
import { BLACK, DARK_RED, RED, WHITE, coverSprite, shot } from "../shared/world/space";

// 片盤：[中心 x, 中心 y]，半徑 15。左邊那個在前、較低；右邊那個在後、較高。
const REELS = [[317, 1140], [350, 1126]];
const REEL_R = 15;

// 蜘蛛網：掛在右片盤右下緣（TOP）、機身右側和右下方的地面（FAR）之間，網心在 HUB
const HUB = [371, 1169];
const WEB_TOP = [364, 1139];
const WEB_FAR = [403, 1187];
// 輻絲的外端，順時針：從右片盤一路繞到機身腳邊
const SPOKES = [[365, 1146], [377.6, 1155.8], [387.4, 1167.8], [396, 1178.4], [388, 1181.6], [377, 1180], [365, 1178.5], [363.5, 1164]];
const RINGS = [0.34, 0.6, 0.86]; // 三圈橫絲在輻絲上的位置
const WEB_BOX = [HUB[0] - 34, HUB[1] - 32, HUB[0] + 34, HUB[1] + 32]; // 以網心為中心，縮放時才會從網心張開

function drawProjector(ctx) {
  // 撐住右片盤的三根紅色細桿
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  for (const [x0, x1] of [[343, 345], [350, 351], [357.5, 357.5]]) {
    ctx.beginPath();
    ctx.moveTo(x0, 1138);
    ctx.lineTo(x1, 1150);
    ctx.stroke();
  }
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  // 伸向左片盤的支臂
  ctx.lineWidth = 6;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(319, 1142);
  ctx.lineTo(341, 1157);
  ctx.stroke();
  // 機身：右邊高的主體、左邊矮的一截、右側的旋鈕
  ctx.beginPath();
  ctx.roundRect(338, 1148, 25.5, 35, 1.5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(316, 1162, 26, 21, 2);
  ctx.fill();
  ctx.fillRect(318.5, 1159.8, 6, 4);
  ctx.beginPath();
  ctx.roundRect(362, 1154, 14, 12, 2.5);
  ctx.fill();
  ctx.fillRect(371.5, 1151.5, 4, 5);
  // 腳與底座
  ctx.beginPath();
  ctx.moveTo(318, 1182);
  ctx.lineTo(334, 1182);
  ctx.lineTo(329, 1187.6);
  ctx.lineTo(315, 1187.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(355, 1182);
  ctx.lineTo(364, 1182);
  ctx.lineTo(373, 1187.6);
  ctx.lineTo(360, 1187.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(315, 1187, 58, 5.5, 2);
  ctx.fill();
  // 機身上的紅色細節
  ctx.fillStyle = RED;
  ctx.fillRect(345, 1161, 13, 1.6);
  ctx.fillRect(345, 1166, 13, 1.6);
  ctx.fillStyle = DARK_RED;
  for (const [x, y, r] of [[347.5, 1157.2, 1.1], [336, 1166.5, 1.2]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

const webStroke = (ctx, width) => {
  ctx.strokeStyle = RED;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
};

// 主絲：從片盤拉到地面的兩條長絲，加上貼著地面的兩條
function drawWebFrame(ctx) {
  webStroke(ctx, 1);
  ctx.beginPath();
  ctx.moveTo(...WEB_TOP);
  ctx.lineTo(...WEB_FAR);
  ctx.moveTo(361.5, 1141);
  ctx.quadraticCurveTo(372, 1162, 392, 1183);
  ctx.moveTo(363.5, 1178);
  ctx.quadraticCurveTo(386, 1179, WEB_FAR[0], WEB_FAR[1]);
  ctx.moveTo(371, 1183.5);
  ctx.lineTo(382, 1188);
  ctx.stroke();
}

function drawWebSpokes(ctx) {
  webStroke(ctx, 0.8);
  ctx.beginPath();
  for (const [x, y] of SPOKES) {
    ctx.moveTo(...HUB);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(HUB[0], HUB[1], 1.3, 0, Math.PI * 2);
  ctx.fill();
}

// 一圈橫絲：相鄰兩根輻絲之間各一段，往網心垂一點
function drawWebRing(ctx, fraction) {
  webStroke(ctx, 0.75);
  const points = SPOKES.map(([x, y]) => [HUB[0] + (x - HUB[0]) * fraction, HUB[1] + (y - HUB[1]) * fraction]);
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    const mx = (x + nx) / 2, my = (y + ny) / 2;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx + (HUB[0] - mx) * 0.22, my + (HUB[1] - my) * 0.22, nx, ny);
  });
  ctx.stroke();
}

export function build(register) {
  const group = new Group();

  // #106 放映機：機身一張圖，兩個片盤各一張（外框以盤心為中心，才能原地轉）
  const projector = new Group();
  const body = coverSprite([312, 1136, 378, 1194], drawProjector, { z: 0.1, scale: 16 });
  const reels = REELS.map(([cx, cy], i) =>
    coverSprite([cx - REEL_R, cy - REEL_R, cx + REEL_R, cy + REEL_R], (ctx) => drawFilmReel(ctx, cx, cy, REEL_R), { z: i === 0 ? 0.13 : 0.12, scale: 20 }),
  );
  projector.add(body, ...reels);
  register(106, projector);
  group.add(projector);

  // #107 紅蜘蛛網：主絲、輻絲、三圈橫絲各一張，依序張開
  const web = new Group();
  const layer = (draw, z) => coverSprite(WEB_BOX, draw, { z, pad: 0, scale: 20 });
  const strands = layer(drawWebFrame, 0.14);
  const spokes = layer(drawWebSpokes, 0.15);
  const rings = RINGS.map((fraction, i) => layer((ctx) => drawWebRing(ctx, fraction), 0.16 + i * 0.01));
  web.add(strands, spokes, ...rings);
  register(107, web);
  group.add(web);

  return { group, parts: { reels, web, strands, spokes, rings } };
}

/** 這一章最後一格的鏡位：網心的大特寫。 */
export const END_VIEW = { px: 374, py: 1167, heightPx: 36 };

export default function createRebootChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { reels, web, strands, spokes, rings } = parts;
  const { tilt, pushIn, cutToDetail } = PACE.matches.beats;
  const near = { z: 0.12 }; // 特寫時以放映機所在的深度算距離

  // 硬切之前：靠近 → 片盤 → 搖到網 → 推近
  const track = makeCameraTrack([
    shot(-0.4, 345, 1152, 300),
    shot(0.04, 345, 1152, 150, near),
    shot(0.2, 344, 1150, 118, near), // 第 1 句：整台放映機
    shot(0.25, 334, 1141, 76, near),
    shot(tilt[0] + 0.07, 334, 1140, 70, near), // 第 2 句：兩個片盤
    shot(tilt[1], 364, 1160, 82, near),
    shot(0.54, 370, 1164, 72, near),
    shot(cutToDetail, 372, 1166, 62, near), // 第 3 句：蜘蛛網
  ]);
  // 硬切之後：網心的大特寫，繼續極慢地推
  const detail = makeCameraTrack([
    shot(cutToDetail, END_VIEW.px, END_VIEW.py, 42, { z: 0.15 }),
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx, { z: 0.15 }),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx - 2, { z: 0.15 }),
  ]);

  // 片盤轉角：角速度隨進度線性降到 0，在蜘蛛網織完時（第 3 句結束）停住
  const STOP = 0.74, START = -0.3, TURNS = 3.5;
  const reelAngle = (p) => {
    const s = clamp((p - START) / (STOP - START), 0, 1);
    return -Math.PI * 2 * TURNS * (2 * s - s * s);
  };

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.26 },
    sound: { tick: 0.3, wind: 0.12 },
    captions: pacedCaptions("matches", [
      "一台放映機。它對應的題目是「系列電影疲乏」。",
      "兩個片盤是紅的：重啟舊作的風潮，正是熱門話題。",
      "機身上卻掛著一張紅色的蜘蛛網。蜘蛛網的意思是陳舊。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, (p < cutToDetail ? track : detail)(p), frame.aspect, frame.pointer, p < cutToDetail ? 0.03 : 0.012);

      // 片盤：兩個同向轉，後面那個慢一點起步的相位差
      reels[0].rotation.z = reelAngle(p);
      reels[1].rotation.z = reelAngle(p) + 0.5;

      // 蜘蛛網：tilt 時主絲從網心拉出去，pushIn 期間輻絲和三圈橫絲由內往外張開
      const open = (from, to) => smooth(linearstep(p, from, to));
      const sway = 1 + 0.012 * Math.sin(frame.time * 1.3);
      const stages: [typeof strands, number][] = [
        [strands, open(tilt[0] + 0.04, tilt[1] - 0.04)],
        [spokes, open(0.42, pushIn[0] + 0.07)],
        ...rings.map((ring, i): [typeof strands, number] => [ring, open(0.5 + i * 0.07, 0.58 + i * 0.07)]),
      ];
      for (const [sprite, amount] of stages) {
        sprite.scale.set(amount * sway, amount, 1);
        sprite.visible = amount > 0;
      }
      web.rotation.z = 0;
    },
  };
}
