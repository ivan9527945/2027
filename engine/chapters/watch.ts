// 第 7 章：看螢幕的人（#42–44）。
// 一塊畫著中國國旗的看板、看板前約四十個空心的人、旁邊高桿上一台紅色的監視攝影機。
// 和上一章巴黎的群眾是對照：那邊的人舉手、跳、喊；這裡沒有任何人動，整章只有攝影機在動。
//
// 節奏範本：matches（安靜的特寫）。節拍對應：
//   approach -0.4–0.30   從看板與人群的全景慢慢靠近，落到人群的背影上。字幕 1（看板）、字幕 2（人群）
//   tilt 0.30–0.50       鏡頭往右上搖，離開人群，找到高桿上的攝影機
//   pushIn 0.45–0.78     推近攝影機。字幕 3
//   cutToDetail 0.78     硬切到攝影機的大特寫：它停止來回掃視，鏡頭口的燈亮著
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { PACE, pacedCaptions } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawWatcher } from "../shared/world/people";
import { drawPine } from "../shared/world/props";
import { BLACK, RED, WHITE, coverSprite, shot, toWorld } from "../shared/world/space";
import { drawStar } from "../shared/world/symbols";

/** 人群腳下那塊黑色地面的下緣：往右上斜 */
const groundY = (x) => 803 - (x - 90) * 0.385;

// #44 空心的人：六排共 40 人，[中線 x, 頭的 y]。最後一排（最上面）是黑色剪影，其餘是黑底白線
const ROWS = [
  [[105, 723], [116, 722], [127, 721], [139, 722], [150, 722], [161, 723], [171, 724], [181, 725], [191, 727], [201, 729], [212, 733]],
  [[99, 735], [110, 733], [121.5, 734], [133, 733], [144.5, 734], [155.5, 734], [166, 735], [176, 736], [186, 737], [196, 739], [206, 741]],
  [[104, 747], [118, 746], [131, 747], [145, 746], [159, 746], [172, 746], [185, 746], [197, 746]],
  [[97, 759], [112, 758], [127, 759], [142, 758], [157, 758], [170, 757]],
  [[103, 771], [122, 770], [141, 768], [158, 765]],
];

// #42 國旗看板：黑框、四角有固定點，底下兩根短柱
function drawBillboard(ctx) {
  ctx.fillStyle = BLACK;
  ctx.fillRect(145.6, 714, 2.6, 13);
  ctx.fillRect(187.8, 714, 2.6, 13);
  ctx.fillRect(143.5, 665.5, 49, 49);
  for (const [x, y] of [[144.5, 666.5], [191.5, 666.5], [144.5, 713.5], [191.5, 713.5]]) {
    ctx.beginPath();
    ctx.arc(x, y, 3.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = RED;
  ctx.fillRect(147.5, 669.5, 41, 41);
  ctx.fillStyle = WHITE;
  drawStar(ctx, 158.5, 688, 7.6);
  for (const [x, y, rotation] of [[174, 679, 0.5], [181, 685.5, 0.9], [181, 696, 0.2], [174, 703, 0.6]]) drawStar(ctx, x, y, 2.6, { rotation });
}

const CAMERA_MOUNT: [number, number] = [233, 665]; // 攝影機裝在桿頂的位置，也是它轉動的軸
const CAMERA_TILT = -0.39; // 機身的角度：鏡頭口朝左下，對著人群

// #43 攝影機機身：上半紅、下半黑，左端是黑色的鏡頭罩
function drawCameraBody(ctx) {
  ctx.save();
  ctx.translate(225, 664);
  ctx.rotate(CAMERA_TILT);
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(-13, -5.4, 28, 10.8, 1.6);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.roundRect(-10, -5.4, 25, 6.6, [1.6, 1.6, 0, 0]);
  ctx.fill();
  // 鏡頭罩與鏡頭口
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(-16.5, -6.2, 7.5, 12.4, 1.8);
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(-14.2, 0.4, 1.5, 3.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
/** 鏡頭口的燈：一個白點，大特寫時一明一滅 */
function drawCameraLight(ctx) {
  ctx.save();
  ctx.translate(225, 664);
  ctx.rotate(CAMERA_TILT);
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.arc(-14.2, 0.4, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function build(register) {
  const group = new Group();

  // 地景（不屬於任何編號）：人群腳下的黑色地面、看板四周的松樹和右邊的坡線
  const ground = coverSprite([86, 728, 244, 808], (ctx) => {
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.moveTo(98, 738);
    ctx.lineTo(214, 740);
    ctx.lineTo(240, 747);
    ctx.quadraticCurveTo(244, 750, 238, 751);
    ctx.lineTo(96, 805.5);
    ctx.quadraticCurveTo(88, 806, 88, 798);
    ctx.lineTo(88, 772);
    ctx.quadraticCurveTo(90, 752, 98, 738);
    ctx.fill();
  }, { z: 0, scale: 6 });
  const trees = coverSprite([100, 636, 236, 726], (ctx) => {
    drawPine(ctx, 131, 669, 31);
    drawPine(ctx, 154, 667, 23);
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.moveTo(119, 673);
    ctx.lineTo(146, 664);
    ctx.lineTo(146, 668);
    ctx.closePath();
    ctx.fill();
    drawPine(ctx, 117, 713, 30);
    ctx.beginPath();
    ctx.ellipse(120, 712, 16, 2.2, -0.12, 0, Math.PI * 2);
    ctx.fill();
    drawPine(ctx, 200, 711, 14);
    drawPine(ctx, 213, 716, 27);
    ctx.beginPath();
    ctx.moveTo(190, 706.5);
    ctx.lineTo(233, 720);
    ctx.lineTo(233, 723.5);
    ctx.lineTo(190, 712);
    ctx.closePath();
    ctx.fill();
  }, { z: 0, scale: 8 });
  group.add(ground, trees);

  // #42 國旗看板
  const billboard = coverSprite([140, 662, 196, 728], drawBillboard, { z: 0.01, scale: 12 });
  register(42, billboard);
  group.add(billboard);

  // #44 空心的人：一人一張圖，最遠的一排先畫
  const crowd = new Group();
  ROWS.forEach((row, rowIndex) => {
    for (const [cx, headY] of row) {
      const bottom = Math.min(headY + 27, groundY(cx + 5.4));
      crowd.add(coverSprite([cx - 6, headY - 4.5, cx + 6, bottom], (ctx) => drawWatcher(ctx, cx, headY, rowIndex > 0, Math.min(headY + 27, groundY(cx + 5.4) - 0.4)), { z: 0.02 + rowIndex * 0.01, scale: 14, pad: 1 }));
    }
  });
  register(44, crowd, { count: 40 });
  group.add(crowd);

  // #43 監視攝影機：桿子一張圖，機身掛在桿頂的轉軸上
  const surveillance = new Group();
  const pole = coverSprite([226, 664, 242, 750], (ctx) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(231, 665, 3.6, 82);
    ctx.beginPath();
    ctx.moveTo(228, 749.5);
    ctx.lineTo(231, 744);
    ctx.lineTo(234.6, 744);
    ctx.lineTo(241, 749.5);
    ctx.closePath();
    ctx.fill();
  }, { z: 0.08 });
  const [mountX, mountY] = toWorld(...CAMERA_MOUNT);
  const head = new Group();
  head.position.set(mountX, mountY, 0);
  const body = coverSprite([205, 648, 245, 680], drawCameraBody, { z: 0.09, scale: 30 });
  const light = coverSprite([205, 648, 245, 680], drawCameraLight, { z: 0.091, scale: 30 });
  for (const part of [body, light]) {
    part.position.x -= mountX;
    part.position.y -= mountY;
    head.add(part);
  }
  surveillance.add(pole, head);
  register(43, surveillance);
  group.add(surveillance);

  return { group, parts: { billboard, crowd, head, light } };
}

/** 這一章最後一格的鏡位：攝影機的大特寫。 */
export const END_VIEW = { px: 224, py: 664, heightPx: 40 };

export default function createWatchChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { head, light } = parts;
  const { cutToDetail } = PACE.matches.beats;

  // 0.78 之前是一個連續的長鏡頭；0.78 硬切到大特寫，所以分成兩條軌道
  const approach = makeCameraTrack([
    shot(-0.4, 163, 716, 250),
    shot(0.04, 163, 714, 196), // 字幕 1：看板和它前面的人
    shot(0.2, 160, 722, 168),
    shot(0.23, 156, 752, 112), // 字幕 2：人群的背影，沒有人舉手
    shot(0.37, 160, 750, 104),
    shot(0.5, 212, 700, 118), // 搖到高桿
    shot(0.56, 220, 682, 84), // 字幕 3：攝影機
    shot(0.78, 223, 670, 58),
  ]);
  const detail = makeCameraTrack([
    shot(cutToDetail, 221, 665, 34, { z: 0.09 }),
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx, { z: 0.09 }),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx + 6, { z: 0.09 }),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.22 },
    sound: { drone: 0.35, tick: 0.12 },
    captions: pacedCaptions("matches", [
      "中國國旗被畫成一塊看板，不是飄揚的旗：國家是被展示的，不是在行動的。",
      "看板前約四十個空心的人，沒有人舉手。人數和巴黎那群相當：一群在喊，一群看螢幕。",
      "這一區唯一會動的紅色物件是監視攝影機：中國的 2027，被畫成對內監控。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      const close = p >= cutToDetail;
      applyCameraShot(camera, close ? detail(p) : approach(p), frame.aspect, frame.pointer, close ? 0.006 : 0.03);

      // 人群和看板完全不動。只有攝影機來回掃視；切到大特寫後它停下來，鏡頭口的燈一明一滅
      const sweeping = 1 - smooth(linearstep(p, cutToDetail - 0.06, cutToDetail));
      head.rotation.z = sweeping * Math.sin(frame.time * 0.8) * 0.2;
      light.material.opacity = close ? 0.25 + 0.75 * Math.max(0, Math.sign(Math.sin(frame.time * 4))) : 0.9;
    },
  };
}
