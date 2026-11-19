// 第 1 章：權力舞台（#1–11）。
// 從六位領袖的特寫開始，一個連續的長鏡頭往下退：兩旁的九面旗 → 高台底下的握手 → 通訊塔。
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, envelope, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawProfileFigure, drawStandingFigure, head } from "../shared/world/people";
import { drawFurledFlag, drawHangingFlag, drawPine, traceLatticeTower } from "../shared/world/props";
import { cityEase, pacedCaptions } from "../pace";
import { BLACK, DARK_RED, LEADERS_VIEW, RED, WHITE, boxOf, coverSprite, shot, toUnits } from "../shared/world/space";

const FEET_Y = 453; // 領袖腳底＝高台頂面
const LEDGE_Y = 461; // 旗桿立足的那一階

// 六位領袖。座標量自封面；頭髮與服裝照封面的畫法，身分見 analysis.json（#1–6）。
const LEADERS = [
  {
    id: 1, // 紅髮女性：長髮垂到肩上，白襯衫領口，外套兩側各一道淺色縫線
    cx: 482.5, shoulderY: 398, halfWidth: 12.5, hipY: 430, legHalf: 6.5, hands: null, collar: "blouse",
    head: head({
      faceY: 391, faceRx: 3.4, faceRy: 4.6,
      hairBack: (ctx, cx, cy) => {
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.moveTo(cx - 6.5, cy + 9);
        ctx.bezierCurveTo(cx - 8, cy - 2, cx - 5, cy - 7.5, cx, cy - 7.5);
        ctx.bezierCurveTo(cx + 5, cy - 7.5, cx + 8, cy - 2, cx + 6.5, cy + 9);
        ctx.closePath();
        ctx.fill();
      },
      face: "#e8604f",
    }),
    extra: (ctx, p) => {
      ctx.fillStyle = "#9a978f";
      ctx.fillRect(p.cx - 8.6, p.shoulderY + 7, 0.9, 13);
      ctx.fillRect(p.cx + 7.7, p.shoulderY + 7, 0.9, 13);
    },
  },
  {
    id: 2, // 光頭男性：黑領帶，六人中唯一沒有紅領帶的
    cx: 511.5, shoulderY: 396, halfWidth: 12.5, tie: BLACK,
    head: head({ faceY: 389.5, face: DARK_RED, faceRx: 4, faceRy: 5.4 }),
  },
  {
    id: 3, // 橘髮紅領帶：六人中最高、肩最寬
    cx: 544, shoulderY: 392, halfWidth: 14.5, legHalf: 8.5,
    head: head({
      faceY: 386.5, faceRx: 4.2, faceRy: 5.2, face: "#e8604f",
      hairFront: (ctx, cx, cy) => {
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.moveTo(cx - 5.2, cy - 1);
        ctx.bezierCurveTo(cx - 6, cy - 7.5, cx + 2, cy - 8.5, cx + 5.4, cy - 5.5);
        ctx.lineTo(cx + 5.2, cy - 1.5);
        ctx.bezierCurveTo(cx + 2, cy - 4.2, cx - 2, cy - 4, cx - 5.2, cy - 1);
        ctx.fill();
      },
    }),
  },
  {
    id: 4, // 黑髮紅領帶：臉是被頭髮陰影壓暗的深紅
    cx: 575, shoulderY: 394, halfWidth: 14,
    head: head({
      faceY: 388.5, faceRx: 4.2, faceRy: 5.2, face: DARK_RED,
      hairFront: (ctx, cx, cy) => {
        ctx.fillStyle = BLACK;
        ctx.beginPath();
        ctx.moveTo(cx - 5.2, cy - 0.5);
        ctx.bezierCurveTo(cx - 6, cy - 8, cx + 6, cy - 8, cx + 5.2, cy - 0.5);
        ctx.bezierCurveTo(cx + 3, cy - 3.6, cx - 3, cy - 3.6, cx - 5.2, cy - 0.5);
        ctx.fill();
      },
    }),
  },
  {
    id: 5, // 紅臉白鬚、黑背心、紅袖、紅褲；腰到膝是白色長衫下襬（最終分析的裁定，不是標語牌）
    cx: 605, shoulderY: 396.5, halfWidth: 12.5, hipY: 423, legHalf: 7, sleeves: RED, legs: RED, collar: "none",
    head: head({
      faceY: 389.5, faceRx: 3.8, faceRy: 5,
      hairBack: (ctx, cx, cy) => {
        // 白髮與白鬚包住臉
        ctx.fillStyle = WHITE;
        ctx.strokeStyle = RED;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 0.6, 5.2, 6.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      },
      hairFront: (ctx, cx, cy) => {
        ctx.fillStyle = WHITE;
        ctx.beginPath();
        ctx.moveTo(cx - 3.6, cy + 1.6);
        ctx.quadraticCurveTo(cx, cy + 3.4, cx + 3.6, cy + 1.6);
        ctx.quadraticCurveTo(cx + 3, cy + 7.4, cx, cy + 7.6);
        ctx.quadraticCurveTo(cx - 3, cy + 7.4, cx - 3.6, cy + 1.6);
        ctx.fill();
      },
      neck: false,
    }),
    extra: (ctx, p) => {
      // 長衫下襬：白底紅邊，從腰垂到膝
      ctx.fillStyle = WHITE;
      ctx.strokeStyle = RED;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(p.cx - 9, 422.5, 18, 14.5);
      ctx.fill();
      ctx.stroke();
    },
  },
  {
    id: 6, // 黑色捲髮女性：長外套到膝，紅領巾
    cx: 636, shoulderY: 401, halfWidth: 12, hipY: 439, legHalf: 4.6, collar: "scarf",
    head: head({
      faceY: 395.5, faceRx: 3.2, faceRy: 4.2,
      hairBack: (ctx, cx, cy) => {
        ctx.fillStyle = BLACK;
        for (const [dx, dy, r] of [[0, -3.5, 5.6], [-4, -1.5, 3.6], [4, -1.5, 3.6], [-3, -5.5, 3.2], [3, -5.5, 3.2]]) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    }),
  },
];

// 捲旗 7 支、紅旗 2 面：[旗桿 x, 旗桿頂 y]，由外往內越來越高
const FURLED_FLAGS = [[378, 418], [396, 408], [414, 402], [453, 392], [668, 392], [699, 402], [717, 408]];
const RED_FLAGS = [[433, 397], [683, 397]];

// 高台下方的黑色山丘（不屬於任何編號，是讓握手與通訊塔有地方站的地景）
const HILL = [
  [352, 470], [360, 446], [372, 436], [395, 455], [440, 462], [735, 462], [738, 472], [712, 480], [690, 492], [650, 510],
  [620, 528], [590, 540], [560, 548], [520, 552], [470, 552], [440, 556], [400, 560], [366, 560], [350, 530], [346, 498],
];
function traceHill(ctx) {
  // 用相鄰兩點的中點當端點、原本的點當控制點，把折線修圓
  const n = HILL.length;
  const mid = (i) => [(HILL[i % n][0] + HILL[(i + 1) % n][0]) / 2, (HILL[i % n][1] + HILL[(i + 1) % n][1]) / 2];
  ctx.beginPath();
  ctx.moveTo(...mid(0));
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(HILL[i % n][0], HILL[i % n][1], ...mid(i));
  ctx.closePath();
}

const TOWER_APEX = [564, 474];
const TOWER_BASE_Y = 556;

/**
 * 在封面座標系裡建立這一章的所有元素。章節本身和終章都呼叫它。
 * @param {(id: number, object: import("three").Object3D, opts?: {count?: number}) => unknown} register
 * @returns {{ group: Group, parts: object }} parts 是動畫要用到的物件
 */
export function build(register) {
  const group = new Group();

  // 地景
  const hill = coverSprite([340, 430, 745, 565], (ctx) => {
    traceHill(ctx);
    ctx.fillStyle = BLACK;
    ctx.fill();
    // 山丘上的兩顆星
    ctx.fillStyle = WHITE;
    for (const [x, y, r] of [[447, 478, 2.4], [460, 499, 1.8]]) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    }
  }, { z: 0, scale: 6 });
  const pines = coverSprite([525, 520, 625, 565], (ctx) => {
    drawPine(ctx, 544, 562, 30);
    drawPine(ctx, 590, 560, 34);
    drawPine(ctx, 606, 564, 22);
  }, { z: 0.06 });
  group.add(hill, pines);

  // #8 捲起的旗 ×7、#9 展開的紅旗 ×2
  const furled = new Group();
  for (const [x, topY] of FURLED_FLAGS) {
    furled.add(coverSprite([x - 10, topY - 3, x + 10, LEDGE_Y], (ctx) => drawFurledFlag(ctx, x, topY, LEDGE_Y), { z: 0.02 }));
  }
  register(8, furled, { count: 7 });
  const redFlags = new Group();
  for (const [x, topY] of RED_FLAGS) {
    redFlags.add(coverSprite([x - 12, topY - 3, x + 12, LEDGE_Y], (ctx) => drawHangingFlag(ctx, x, topY, LEDGE_Y), { z: 0.04 }));
  }
  register(9, redFlags, { count: 2 });
  group.add(furled, redFlags);

  // #1–6 領袖：各自一張圖
  const leaders = LEADERS.map((leader) => {
    const sprite = coverSprite([leader.cx - 16, 376, leader.cx + 16, FEET_Y], (ctx) => drawStandingFigure(ctx, { feetY: FEET_Y, ...leader }), { z: 0.05 });
    return sprite;
  });
  register(1, leaders[0]);
  register(2, leaders[1]);
  register(3, leaders[2]);
  register(4, leaders[3]);
  register(5, leaders[4]);
  register(6, leaders[5]);
  group.add(...leaders);

  // #7 高台
  const [px0, py0, px1] = boxOf(7);
  const podium = coverSprite([px0, py0, px1, 475], (ctx) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(px0, FEET_Y, px1 - px0, 22);
  }, { z: 0.03, pad: 1 });
  register(7, podium);
  group.add(podium);
  // #10 握手的兩人：兩張圖，往中間靠攏
  const leftMan = coverSprite([470, 470, 500, 554], (ctx) => drawProfileFigure(ctx, { cx: 483, headY: 480, feetY: 552, facing: 1, reach: 9 }), { z: 0.32 });
  const rightMan = coverSprite([490, 470, 520, 554], (ctx) => drawProfileFigure(ctx, { cx: 507, headY: 481, feetY: 552, facing: -1, reach: 9 }), { z: 0.3 });
  for (const man of [leftMan, rightMan]) {
    man.userData.restX = man.position.x;
    man.userData.restY = man.position.y;
  }
  const handshake = new Group();
  handshake.add(leftMan, rightMan);
  register(10, handshake);
  group.add(handshake);

  // #11 通訊塔：格架在黑色山丘上是白線，伸到白底的部分是黑線；電波另外一張圖，會脈動
  const tower = new Group();
  tower.add(
    coverSprite([540, 462, 588, 558], (ctx) => {
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.save();
      traceHill(ctx);
      ctx.clip();
      traceLatticeTower(ctx, TOWER_APEX, TOWER_BASE_Y, 17);
      ctx.strokeStyle = WHITE;
      ctx.stroke();
      ctx.restore();
      // 同一組線再用黑色畫在「底下」（destination-over）：山丘範圍內被白線蓋住，伸到白底的部分才看得到黑線
      ctx.save();
      ctx.globalCompositeOperation = "destination-over";
      traceLatticeTower(ctx, TOWER_APEX, TOWER_BASE_Y, 17);
      ctx.strokeStyle = BLACK;
      ctx.stroke();
      ctx.restore();
    }, { z: 0.3 }),
  );
  const waveCenter = [TOWER_APEX[0], TOWER_APEX[1] + 9];
  const waves = [0, 1, 2].map((i) =>
    coverSprite([530, 458, 598, 510], (ctx) => {
      const r = 10 + i * 8, spread = 0.62 - i * 0.04;
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      for (const [from, to] of [[-spread, spread], [Math.PI - spread, Math.PI + spread]]) {
        ctx.beginPath();
        ctx.arc(waveCenter[0], waveCenter[1], r, from, to);
        ctx.stroke();
      }
    }, { z: 0.31 }),
  );
  tower.add(...waves);
  register(11, tower);
  group.add(tower);

  return { group, parts: { leaders, redFlags, leftMan, rightMan, waves } };
}

/** 這一章最後一格的鏡位；下一章若用硬切進場，要從這裡接。 */
export const END_VIEW = { px: 538, py: 508, heightPx: 170 };

// 節奏範本：city。一個連續的長鏡頭，從領袖特寫往下退到握手與通訊塔；兩句字幕。
export default function createStageChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  const { redFlags, leftMan, rightMan, waves } = parts;
  scene.add(group);

  // 鏡頭路徑的三個點：開場（接序章的硬切）→ 拉開看到九面旗 → 握手與塔
  const track = makeCameraTrack([
    shot(0, LEADERS_VIEW.px, LEADERS_VIEW.py, LEADERS_VIEW.heightPx),
    shot(0.5, 553, 446, 250),
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { wind: 0.25, drone: 0.25 },
    captions: pacedCaptions("city", [
      "圓的最上面站著六個人，整張封面只有他們高出這個圓。正中央最高的那位，橘髮、紅領帶。",
      "高台底下，兩個人握手；通訊塔立在六人的正下方。交易在領袖腳下談成，再從這裡往下廣播。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, 0, 1);
      // 原作 city 章的走法：整章一個鏡頭，路徑參數是 85% easeInOutCubic + 15% 線性；超過 1 的轉場期間繼續慢慢往下
      const shotNow = track(cityEase(p));
      shotNow.pos.y -= Math.max(0, progress - 1) * 0.4;
      shotNow.at.y -= Math.max(0, progress - 1) * 0.4;
      applyCameraShot(camera, shotNow, frame.aspect, frame.pointer, 0.03 * (1 - p * 0.8));

      // 紅旗輕微擺動（捲旗不動）
      redFlags.children.forEach((flag, i) => {
        flag.scale.x = 1 + Math.sin(frame.time * 1.3 + i * 2) * 0.06;
      });

      // 握手：第二句字幕（0.50）出現前，兩人從兩側走近握上
      const meet = smooth(linearstep(p, 0.38, 0.5));
      leftMan.position.x = leftMan.userData.restX - toUnits(9) * (1 - meet);
      rightMan.position.x = rightMan.userData.restX + toUnits(9) * (1 - meet);
      const shake = envelope(p, 0.5, 0.52, 0.6, 0.64) * Math.sin(frame.time * 9) * toUnits(0.7);
      leftMan.position.y = leftMan.userData.restY + shake;
      rightMan.position.y = rightMan.userData.restY + shake;

      // 電波：三道弧線由內往外輪流亮起，鏡頭到塔前時（0.6 之後）最明顯
      const broadcasting = smooth(linearstep(p, 0.6, 0.72));
      waves.forEach((wave, i) => {
        const phase = (((frame.time * 0.9 - i * 0.22) % 1) + 1) % 1;
        wave.material.opacity = (0.25 + 0.75 * Math.max(0, 1 - Math.abs(phase - 0.3) * 3)) * (0.35 + 0.65 * broadcasting);
      });
    },
  };
}
