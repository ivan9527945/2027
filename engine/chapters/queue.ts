// 第 13 章：隊伍（#100–103）。
// 鏡頭沿著一排人橫移 → 甩到隊伍盡頭的旗手和那面雙頭鷹旗 → 推回隊伍 → 往下停在他們腳下那條黑色地面。
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCaptions } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawTuft } from "../shared/world/nature";
import { drawQueuePerson } from "../shared/world/people";
import { traceBlob } from "../shared/world/props";
import { drawDoubleEagle } from "../shared/world/symbols";
import { BLACK, DARK_RED, RED, WHITE, coverSprite, shot, toUnits, toWorld } from "../shared/world/space";
import { build as buildPrologue } from "./prologue";

// 排隊的人：[中線 x, 頭心 y, 頭半徑, 身體半寬]，由左到右。量自封面，一共 10 人（清單寫「約 12」）。
// 身高是 U 形：左邊四個一路變矮，中間三個最矮，右邊三個越靠近旗手越高。
const PEOPLE = [
  [539.5, 1206.5, 5.8, 9.2], [559, 1208.5, 5.6, 8.6], [577, 1212, 5, 8.2], [594.5, 1215.5, 4.6, 7.4], [612, 1218, 4.2, 7.4],
  [629.5, 1218, 4.2, 7.4], [647, 1218.5, 4.2, 7.4], [664.5, 1213.5, 4.6, 7.6], [683, 1205, 5.8, 8.4], [705.5, 1201.5, 6.5, 10.2],
];

// 隊伍腳下的黑色地面：一條往下彎的弧帶，左端接進觀星者那片夜空，右端收成尖角（地景，不屬於任何編號）
const GROUND = [
  [508, 1231], [524, 1232], [548, 1236.5], [568, 1238.5], [586, 1240], [603, 1241.5], [620, 1242], [638, 1242], [656, 1241], [673, 1240],
  [692, 1238.5], [716, 1236], [745, 1233], [766, 1229], [777, 1229],
  [768, 1234.5], [744, 1240.5], [720, 1244], [700, 1246.5], [660, 1249.5], [620, 1251], [590, 1250.5], [560, 1247], [535, 1243], [516, 1239],
];
/** 地面頂緣在 x 處的 y（人腳要踩到這裡以下，才不會露出腳底） */
const groundTopAt = (x) => {
  for (let i = 0; i < 14; i++) {
    const [x0, y0] = GROUND[i], [x1, y1] = GROUND[i + 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return 1229;
};

const FLAG_HAND: [number, number] = [717, 1189]; // 旗手握旗的位置，旗子繞這一點擺動

// 旗手：正面站立的黑色剪影，頭髮在右後方紮起；左手（畫面左側）握著旗
function drawBearer(ctx) {
  ctx.fillStyle = BLACK;
  // 頭與髮髻
  ctx.beginPath();
  ctx.ellipse(729.5, 1151, 8, 9.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(738.6, 1153.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // 上身連手臂
  ctx.beginPath();
  ctx.moveTo(723, 1158.5);
  ctx.bezierCurveTo(717, 1159.5, 715.2, 1163, 715.2, 1169);
  ctx.lineTo(715.4, 1192);
  ctx.quadraticCurveTo(716, 1198, 719.5, 1198);
  ctx.lineTo(741.8, 1198);
  ctx.lineTo(742, 1189.5);
  ctx.quadraticCurveTo(747.2, 1188.5, 747.2, 1183);
  ctx.lineTo(745.6, 1168);
  ctx.bezierCurveTo(745.4, 1162, 742, 1159.5, 736, 1158.5);
  ctx.closePath();
  ctx.fill();
  // 兩腿
  ctx.beginPath();
  ctx.moveTo(719.4, 1196);
  ctx.lineTo(741.8, 1196);
  ctx.lineTo(740.4, 1239);
  ctx.lineTo(732.6, 1239);
  ctx.lineTo(729.6, 1205);
  ctx.lineTo(727.6, 1239);
  ctx.lineTo(721.4, 1239);
  ctx.closePath();
  ctx.fill();
  // 手臂和身體之間的兩道縫
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.roundRect(720.6, 1168, 1.5, 16.5, 0.7);
  ctx.roundRect(738.9, 1168, 1.5, 11.5, 0.7);
  ctx.fill();
}

// 旗：紅底、上緣波浪、下緣一道暗紅的布褶，中央是黑色雙頭鷹
function drawFlag(ctx) {
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(689.8, 1156.4);
  ctx.quadraticCurveTo(694, 1158.5, 696.5, 1161.2);
  ctx.quadraticCurveTo(700, 1163.4, 703.5, 1160.6);
  ctx.quadraticCurveTo(707, 1157.6, 709.6, 1160.2);
  ctx.quadraticCurveTo(712.5, 1163, 716.6, 1162.6);
  ctx.lineTo(717.4, 1189.4);
  ctx.quadraticCurveTo(707, 1190.2, 699, 1192);
  ctx.lineTo(695.4, 1190.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = DARK_RED;
  ctx.beginPath();
  ctx.moveTo(694.7, 1185.8);
  ctx.quadraticCurveTo(706, 1186.6, 717.3, 1184.6);
  ctx.lineTo(717.4, 1189.4);
  ctx.quadraticCurveTo(707, 1190.2, 699, 1192);
  ctx.lineTo(695.4, 1190.4);
  ctx.closePath();
  ctx.fill();
  drawDoubleEagle(ctx, 703.6, 1172.6, 1);
}

/**
 * 在封面座標系裡建立這一章的所有元素。章節本身、下一章（當背景）和終章都呼叫它。
 * @param {(id: number, object: import("three").Object3D, opts?: {count?: number}) => unknown} register
 */
export function build(register) {
  const group = new Group();

  // 地景：隊伍腳下的黑色地面，蓋住所有人的腳
  const ground = coverSprite([506, 1226, 780, 1253], (ctx) => {
    traceBlob(ctx, GROUND);
    ctx.fillStyle = BLACK;
    ctx.fill();
  }, { z: 0.12, scale: 8 });
  group.add(ground);

  // #100 排隊的人：一人一張圖，才能各自走動
  const people = new Group();
  for (const [cx, headY, r, half] of PEOPLE) {
    const person = coverSprite([cx - half, headY - r, cx + half, groundTopAt(cx) + 5], (ctx) => drawQueuePerson(ctx, cx, headY, r, half, groundTopAt(cx) + 5), { z: 0.06, pad: 1, scale: 12 });
    person.userData.rest = person.position.clone();
    people.add(person);
  }
  register(100, people, { count: 10 });
  group.add(people);

  // #101 旗手
  const bearer = coverSprite([713, 1140, 749, 1239], drawBearer, { z: 0.08, scale: 12 });
  register(101, bearer);
  group.add(bearer);

  // #102 雙頭鷹旗：掛在一個以握旗處為軸的群組裡，轉這個群組就是擺旗
  const flag = new Group();
  const [handX, handY] = toWorld(...FLAG_HAND);
  flag.position.set(handX, handY, 0);
  const cloth = coverSprite([688, 1154, 719, 1194], drawFlag, { z: 0.1, scale: 16 });
  cloth.position.x -= handX;
  cloth.position.y -= handY;
  flag.add(cloth);
  register(102, flag);
  group.add(flag);

  // #103 地面右端的草叢小丘
  const mound = coverSprite([743, 1214, 773, 1237], (ctx) => drawTuft(ctx, 758, 1236.5, 27, 20), { z: 0.14, scale: 14 });
  register(103, mound);
  group.add(mound);

  return { group, parts: { people, bearer, flag, mound } };
}

/** 這一章最後一格的鏡位（隊伍中段的腳下，水晶球球座的正下方）；下一章用硬切進場，從這裡接。 */
export const END_VIEW = { px: 628, py: 1222, heightPx: 64 };

/** 隊伍正上方的水晶球（#99）是序章畫的。這裡只借它的圖當背景，不登記；終章裡仍然只有序章那一顆。 */
export function borrowCrystalBall() {
  let ball = null;
  buildPrologue((id, object) => {
    if (id === 99) ball = object;
    return object;
  });
  return ball;
}

// 節奏範本：corner（橫移 → 甩鏡 → 逐步靠近 → 結尾舉起下一章要用的東西）。對應：
//   pan    -0.20–0.30  鏡頭由左往右沿著隊伍橫移，十個人一個接一個走到定位（第 1 句）
//   whip    0.27–0.37  甩到隊伍盡頭的旗手
//   settle  0.33–0.58  鏡頭在旗前停穩，垂著的旗被舉到定位（第 2 句）
//   pushIn  0.56–0.72  退回看整排人，再推近（第 3 句）
//   detail  0.76–0.86  隊尾的特寫：最高的幾個人、旗手的腳、草叢小丘（第 4 句開始）
//   raise   0.84–0.95  原作在這裡舉起下一章要用的東西；這裡是鏡頭降到隊伍腳下的地面，下一章從地面以下開始
export default function createQueueChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  const { people, flag, mound } = parts;
  scene.add(group);
  const { pan, whip, settle, pushIn, detail, raise } = PACE.corner.beats;

  const track = makeCameraTrack([
    shot(-0.3, 566, 1220, 88),
    shot(0.03, 584, 1220, 84),
    shot(0.25, 652, 1214, 84),
    shot(whip[0], 660, 1212, 86),
    shot(whip[1], 714, 1180, 104),
    shot(0.44, 711, 1176, 84),
    shot(pushIn[0], 710, 1175, 80),
    shot(0.62, 634, 1198, 176),
    shot(pushIn[1], 630, 1210, 112),
    shot(0.75, 630, 1212, 106),
    shot(0.79, 716, 1215, 80),
    shot(detail[1], 718, 1217, 76),
    shot(raise[1], END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { crowd: 0.3, wind: 0.15 },
    captions: pacedCaptions("corner", [
      "水晶球底下，十個人排成一列，朝舉旗的人走去。可能是「被帶領的隊伍」，或「世代」的畫法。",
      "旗上是阿爾巴尼亞的雙頭鷹。圖認得出來，用意不確定：可能是入歐進程，也可能只是插畫家的簽名。",
      "有人把這排人讀成十二個月。這個說法沒有根據。",
      "他們是實心的黑，站在圓裡面，所以不是難民。難民在圓的外面。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 隊伍：橫移期間由前往後一個個走到定位（離旗手近的先到）；到位後只剩很輕的原地晃動
      const last = people.children.length - 1;
      people.children.forEach((person, i) => {
        const start = pan[0] + 0.05 + (last - i) * 0.028;
        const arrive = smooth(linearstep(p, start, start + 0.2));
        const walking = arrive > 0 && arrive < 1 ? 1 : 0.22;
        const rest = person.userData.rest;
        person.position.x = rest.x - toUnits(13) * (1 - arrive);
        person.position.y = rest.y + Math.abs(Math.sin(frame.time * 5.2 + i * 1.3)) * toUnits(0.9) * walking;
      });

      // 旗：鏡頭停穩時從垂著舉到封面上的位置，之後隨風輕擺
      const lifted = smooth(linearstep(p, settle[0] - 0.04, settle[0] + 0.07));
      flag.rotation.z = 0.95 * (1 - lifted) + Math.sin(frame.time * 1.5) * 0.035 * lifted;

      // 草叢小丘：風吹時微微伸縮
      mound.scale.x = 1 + Math.sin(frame.time * 1.1) * 0.025;
    },
  };
}
