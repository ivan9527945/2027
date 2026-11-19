// 第 8 章：圓心（#45–48、#51–53）。
// 鏡頭一路往下到圓心的 AI 大腦 → 四名科技人與晶片 → 被打開的保險箱 → 背著麻袋逃跑的機器人
// → 0 和 1 從保險箱灑到封面上的 54 個位置 → 充電中的紅色皮卡 → 回到大腦。
import { Color, Group, PerspectiveCamera, Scene } from "three";
import binaryDigits from "@cover/binary-digits.json";
import { clamp, linearstep, smooth } from "../core";
import { PACE, pacedCaptions, pacedCues } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawStandingFigure, head } from "../shared/world/people";
import { drawMicrochip } from "../shared/world/props";
import { BLACK, RED, WHITE, coverSprite, shot, toUnits, toWorld } from "../shared/world/space";

const BRAIN_X = 568.5; // 大腦的中線
const SAFE_MOUTH: [number, number] = [417, 812]; // 保險箱開口，0 和 1 從這裡灑出來

// 54 個散落的 0/1：[x, y, 數字]，封面像素。E 區是保險箱裡的三排字，另外畫。
const DIGITS = Object.entries(binaryDigits.zones as unknown as Record<string, [number, number, number][]>)
  .filter(([zone]) => !zone.startsWith("E_"))
  .flatMap(([, list]) => list);

// 四名科技人：[中線 x, 腳底 y, 是否有紅色衣襟線, 是否戴眼鏡]
const TECH_MEN: [number, number, boolean, boolean][] = [[311, 787, false, false], [336, 797, true, true], [359, 800, true, false], [382, 798, true, false]];
// 晶片：[中心 x, 中心 y, 邊長]。封面上只找得到 3 枚（見 data/count-overrides.json）
const CHIPS = [[226, 770, 15], [275, 768, 21], [406, 767, 11]];

// 右半腦的線路：每條是一串折點，最後一點畫節點；左半腦是鏡像
const CIRCUITS = [
  [[573.5, 897], [573.5, 862], [585, 848], [585, 824]],
  [[573.5, 846], [573.5, 812], [582, 801]],
  [[579, 873], [596, 856], [613, 856]],
  [[591, 838], [606, 823], [606, 806]],
  [[598, 882], [609, 871], [622, 871]],
  [[589, 801], [601, 813], [618, 813]],
  [[600, 840], [620, 840]],
  [[585, 866], [585, 884], [594, 893]],
];

function drawBrain(ctx) {
  // 輪廓：每個半腦是幾個圓疊出來的凹凸邊
  ctx.fillStyle = BLACK;
  for (const side of [1, -1]) {
    for (const [dx, y, r] of [[22, 814, 25], [40, 838, 23], [42, 866, 21], [24, 880, 22], [18, 848, 30]]) {
      ctx.beginPath();
      ctx.arc(BRAIN_X + side * dx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillRect(BRAIN_X - 22, 826, 44, 62); // 補滿兩個半腦中間
  ctx.fillRect(BRAIN_X - 10, 880, 20, 26); // 腦幹
  // 兩個半腦之間的縫
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.roundRect(BRAIN_X - 3, 785, 6, 49, [0, 0, 3, 3]);
  ctx.fill();
  // 紅色線路與節點
  ctx.strokeStyle = RED;
  ctx.fillStyle = RED;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const side of [1, -1]) {
    for (const line of CIRCUITS) {
      const mirror = (x) => BRAIN_X + side * (x - BRAIN_X);
      ctx.beginPath();
      ctx.moveTo(mirror(line[0][0]), line[0][1]);
      for (const [x, y] of line.slice(1)) ctx.lineTo(mirror(x), y);
      ctx.stroke();
      const [ex, ey] = line[line.length - 1];
      ctx.beginPath();
      ctx.arc(mirror(ex), ey, 2.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 機器人：粗黑線畫四肢，關節是白圈；背上一個大麻袋。朝左跑。
function drawRobot(ctx) {
  const limb = (points, width = 9) => {
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  };
  const joint = (x, y, r = 5) => {
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
  };
  // 麻袋
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(324, 812, 35, 31, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(322, 813, 27, -1.25, 0.1);
  ctx.stroke();
  // 後腿（蹬向左下）
  limb([[304, 838], [270, 838]], 10);
  limb([[268, 839], [248, 862]], 8);
  limb([[250, 863], [240, 859]], 6);
  // 前腿（跨向右）
  limb([[305, 836], [328, 852]], 10);
  limb([[329, 852], [356, 845]], 8);
  limb([[356, 845], [362, 852]], 6);
  // 軀幹與頭
  limb([[283, 806], [304, 836]], 13);
  limb([[274, 797], [283, 806]], 7);
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(262, 785, 18, 15, 5);
  ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.fillRect(265, 789, 2.4, 7);
  // 手臂（甩向左後）
  limb([[282, 806], [254, 822]], 8);
  limb([[253, 822], [234, 808]], 7);
  limb([[234, 808], [231, 803]], 5);
  joint(281, 806);
  joint(253, 822, 4.4);
  joint(304, 837);
  joint(269, 838, 4.4);
  joint(328, 852, 4.6);
}

function drawSafe(ctx) {
  // 箱體：正面加一點頂面，表示立體
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(399, 791);
  ctx.lineTo(425, 783);
  ctx.lineTo(456, 792);
  ctx.lineTo(456, 832);
  ctx.lineTo(399, 832);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(403, 832, 5, 3.5);
  ctx.fillRect(446, 832, 5, 3.5);
  // 往左完全打開的門：紅色，門上有轉盤和把手
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(383, 791);
  ctx.lineTo(400, 794);
  ctx.lineTo(400, 829);
  ctx.lineTo(383, 827);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(391.5, 808, 3.6, 0, Math.PI * 2);
  ctx.moveTo(391.5, 798);
  ctx.lineTo(391.5, 820);
  ctx.stroke();
  ctx.fillStyle = BLACK;
  for (const y of [797, 823]) {
    ctx.beginPath();
    ctx.arc(386.5, y, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // 箱內：紅線框出內壁，裡面三排靠右對齊的數字 0／000／01000
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1;
  ctx.strokeRect(403.5, 794.5, 28, 33);
  ctx.fillStyle = "#cfcbc0";
  ctx.font = "600 6px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  binaryDigits.zones["E_保險箱內（灰白色，靠右對齊 3 排）"].rows.forEach((row, i) => {
    Array.from(row).reverse().forEach((char, n) => ctx.fillText(char, 429 - n * 4.4, 811 + i * 7));
  });
}

function drawCybertruck(ctx) {
  // 地面
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(424, 766, 143, 4.5, 1.5);
  ctx.fill();
  // 充電樁與電纜
  ctx.beginPath();
  ctx.roundRect(539, 727, 17, 40, 2);
  ctx.fill();
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(527, 751);
  ctx.bezierCurveTo(534, 752, 530, 738, 540, 737);
  ctx.stroke();
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(549.5, 733);
  ctx.lineTo(544.5, 744);
  ctx.lineTo(548, 744);
  ctx.lineTo(545.5, 752);
  ctx.lineTo(551.5, 741);
  ctx.lineTo(548, 741);
  ctx.closePath();
  ctx.fill();
  // 車身：一條稜線到底的楔形
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(426, 753);
  ctx.lineTo(450, 742);
  ctx.lineTo(474, 733.5);
  ctx.lineTo(527, 747);
  ctx.lineTo(528, 759);
  ctx.lineTo(427, 761);
  ctx.closePath();
  ctx.fill();
  // 車窗
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(454, 743.5);
  ctx.lineTo(474, 736.5);
  ctx.lineTo(504, 744.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.fillRect(476.5, 736, 1.2, 9);
  // 輪拱與車輪
  ctx.fillStyle = BLACK;
  for (const x of [446, 512]) {
    ctx.beginPath();
    ctx.arc(x, 761, 9.5, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, 761, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function build(register) {
  const group = new Group();

  // #53 AI 大腦：在圓心
  const brain = coverSprite([505, 783, 632, 908], drawBrain, { z: 0.06, scale: 8 });
  register(53, brain);
  group.add(brain);

  // #45 四名黑衣人
  const men = new Group();
  for (const [cx, feetY, stripes, glasses] of TECH_MEN) {
    const shoulderY = feetY - 56;
    const drawHead = head({
      faceY: shoulderY - 7.5, faceRx: 4.1, faceRy: 5.2,
      hairBack: (ctx, x, y) => {
        ctx.fillStyle = BLACK;
        for (const [dx, dy, r] of [[0, -3.6, 5.3], [-3.7, -1.4, 3.3], [3.7, -1.4, 3.3]]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      hairFront: (ctx, x, y) => {
        if (!glasses) return;
        ctx.fillStyle = BLACK;
        ctx.fillRect(x - 4.1, y - 0.9, 8.2, 1.9);
      },
    });
    men.add(
      coverSprite([cx - 15, feetY - 74, cx + 15, feetY], (ctx) =>
        drawStandingFigure(ctx, {
          cx, shoulderY, halfWidth: 12.5, hipY: feetY - 26, feetY, legHalf: 7.5, hands: null, collar: "none", head: drawHead,
          extra: (c) => {
            if (!stripes) return;
            c.fillStyle = RED; // 外套前襟的兩道紅線
            c.fillRect(cx - 4.4, shoulderY + 3, 1.5, 22);
            c.fillRect(cx + 2.9, shoulderY + 3, 1.5, 22);
          },
        }), { z: 0.14 }),
    );
  }
  register(45, men, { count: 4 });
  group.add(men);

  // #46 晶片
  const chips = new Group();
  for (const [x, y, size] of CHIPS) {
    chips.add(coverSprite([x - size, y - size, x + size, y + size], (ctx) => drawMicrochip(ctx, x, y, size), { z: 0.04, pad: 0, scale: 14 }));
  }
  register(46, chips, { count: 3 });
  group.add(chips);

  // #52 保險箱
  const safe = coverSprite([380, 780, 460, 838], drawSafe, { z: 0.05, scale: 14 });
  register(52, safe);
  group.add(safe);

  // #51 機器人
  const robot = coverSprite([224, 778, 366, 872], drawRobot, { z: 0.12, scale: 8 });
  register(51, robot);
  group.add(robot);

  // #47 散落的 0 與 1：一個數字一張小圖，才能各自飛行
  const digits = new Group();
  for (const [x, y, value] of DIGITS) {
    const sprite = coverSprite([x - 5, y - 7, x + 5, y + 7], (ctx) => {
      ctx.fillStyle = RED;
      ctx.font = "700 14px ui-monospace, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), x, y + 0.5);
    }, { z: 0.08, pad: 0, scale: 12 });
    sprite.userData.rest = sprite.position.clone();
    digits.add(sprite);
  }
  register(47, digits, { count: 54 });
  group.add(digits);

  // #48 充電中的紅色皮卡
  const truck = coverSprite([422, 724, 570, 772], drawCybertruck, { z: 0.07, scale: 8 });
  register(48, truck);
  group.add(truck);

  return { group, parts: { brain, men, chips, safe, robot, digits, truck } };
}

/** 這一章最後一格的鏡位（紅色皮卡）；下一章若用硬切進場，要從這裡接。 */
export const END_VIEW = { px: 492, py: 752, heightPx: 110 };

// 節奏範本：grandmother（全片的高潮）。兩次觸發：0.035 鏡頭落到大腦；0.445 保險箱被破、機器人衝出來。
// 六句字幕照原作的時間窗；原作 0.445–0.57 的白場對應成機器人逃跑的那一段。
export default function createCoreChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { brain, robot, digits, chips } = parts;
  const { strike2, flash, ascend } = PACE.grandmother.beats;

  const [mouthX, mouthY] = toWorld(...SAFE_MOUTH);
  const robotRest = robot.position.clone();
  // 每個數字的出發順序：離保險箱越近的越早落地
  const order = digits.children
    .map((sprite, index) => ({ index, distance: Math.hypot(sprite.userData.rest.x - mouthX, sprite.userData.rest.y - mouthY) }))
    .sort((a, b) => a.distance - b.distance)
    .map((item, rank) => [item.index, rank / (digits.children.length - 1)]);

  // 鏡頭在每句字幕的時間窗裡停在對應的東西上，窗與窗之間移動
  const track = makeCameraTrack([
    shot(-0.3, 553, 640, 320),
    shot(0.07, BRAIN_X, 846, 190),
    shot(0.22, BRAIN_X, 846, 176),
    shot(0.26, 322, 762, 150),
    shot(0.345, 326, 764, 142),
    shot(0.38, 420, 808, 108),
    shot(0.445, 420, 808, 100),
    shot(0.5, 300, 826, 150),
    shot(0.6, 296, 828, 150),
    shot(0.66, 440, 850, 300),
    shot(0.78, 440, 850, 286),
    shot(0.86, END_VIEW.px, END_VIEW.py, 118),
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { drone: 0.4, tick: 0.1 },
    cues: pacedCues("grandmother", ["click", "flip"]),
    captions: pacedCaptions("grandmother", [
      "圓的正中心是一顆大腦。黑色的：在這張圖裡，黑色是已經成為結構的東西。",
      "旁邊站著四個黑衣人，科技公司的掌門人。",
      "腳邊是晶片。再過去，一個保險箱被打開了，裡面是三排數字。",
      "一個機器人背著麻袋往反方向跑。這是整張封面唯一的犯罪現場。",
      "五十四個 0 和 1 灑了一地。有人說是密碼；試過六種讀法，全是亂碼。",
      "離大腦最近的商品，是一輛正在充電的紅色皮卡。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 大腦緩慢起伏，像在呼吸
      brain.scale.setScalar(1 + 0.012 * Math.sin(frame.time * 1.6));
      // 晶片輪流閃一下
      chips.children.forEach((chip, i) => {
        chip.scale.setScalar(1 + 0.08 * Math.max(0, Math.sin(frame.time * 2.4 + i * 2.1)));
      });

      // 機器人：第二次觸發（0.445）時從保險箱旁衝出來，在原作白場的那段時間（到 0.57）跑到封面上的位置
      const run = smooth(linearstep(p, strike2, flash[1]));
      const running = run > 0 && run < 1 ? 1 : 0;
      robot.position.x = robotRest.x + toUnits(96) * (1 - run);
      robot.position.y = robotRest.y + toUnits(8) * (1 - run) + running * Math.abs(Math.sin(frame.time * 11)) * toUnits(3);
      robot.rotation.z = running * Math.sin(frame.time * 11) * 0.05;
      robot.visible = p > strike2 - 0.01;

      // 0 和 1：跟在機器人後面從保險箱開口灑出來（原作「飛升」的前半段，0.52–0.78），沿拋物線飛到各自的位置
      for (const [index, rank] of order) {
        const sprite = digits.children[index];
        const start = ascend[0] - 0.04 + rank * 0.22;
        const fly = smooth(linearstep(p, start, start + 0.08));
        const rest = sprite.userData.rest;
        sprite.position.x = mouthX + (rest.x - mouthX) * fly;
        sprite.position.y = mouthY + (rest.y - mouthY) * fly + Math.sin(fly * Math.PI) * toUnits(14);
        sprite.scale.setScalar(0.3 + 0.7 * fly);
        sprite.visible = fly > 0;
      }
    },
  };
}
