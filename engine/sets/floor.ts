// floor 的 3D 場景：圓的邊緣之下（PRD-3D 6.15）。
// 上一章隊伍站的平台，其實是一個大圓盤的邊緣。鏡頭從邊緣往下降，底下是難民營：
// 三頂紅框帳篷、舉著嬰兒的母親、兩個孩子、抱頭坐著的人、包袱、倒地的瓶子、碎片；圓盤的底面像天花板一樣罩在頭頂。
// 世界和上一章是同一個（buildRimWorld），第一格鏡位等於上一章的最後一格，硬切才接得上。
// 營地在圓盤底下，頭頂沒有光：光是從圓盤邊緣外面（鏡頭這一側）低低地斜射進來的，所以每樣東西都拖著一道往圓盤深處去的長影子。
//
// 節奏範本 morning 的對應：
//   close    0–0.16     從隊伍腳邊越過圓盤邊緣往下降，落到抱頭坐著的人面前
//   pullBack 0.16–0.42  退後、仰起：他就在水晶球的正下方，中間隔著圓盤的底面
//   others   0.42–0.72  旁人進場：另外兩頂帳篷搭起來、母親和孩子出現、嬰兒被舉高、包袱從上面掉下來、瓶子滾倒
//   wide     0.42–0.70  同時橫移到整片營地
//   drift    0.70–1.45  繼續往後退，營地、頭頂的圓盤、圓盤上的隊伍一起入鏡
import { Box3, Color, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Snow, clamp, deviceTier, lerp, linearstep, seededRandom, smooth } from "../core";
import { build as buildQueueFlat } from "../chapters/queue";
import { createRegistry } from "../elements";
import { PACE } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog } from "../shared/set/env";
import { box, cone, cylinder, extrude, lathe, makePalette, sphere } from "../shared/set/model";
import { bakeFigure, inkOutline, makeFigure } from "../shared/set/figure";
import type { FigureOptions } from "../shared/set/figure";
import { BLACK, DARK_RED, RED, WHITE } from "../shared/world/space";
import { BALL, END_SHOT, FOG, GROUND_Y as G, LIGHT, PAPER_LINE, bakeKeeping, buildRimWorld, crackGeometry, crackPath, fitShot, lumpy, mergeStatic, silhouette, tuft3d } from "./queue";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：空曠的風、低鳴和微弱的心跳；抱頭的人身邊一句耳語（0.2）；帳篷搭起來（0.45）；包袱掉下來（0.5、0.55）；瓶子滾倒（0.6）；低沉的合唱。
const soundScript = soundTrack([[0, { wind: 0.3, dread: 0.2, heartbeat: 0.08 }], [0.4, { wind: 0.25, dread: 0.2, choir: 0.12, heartbeat: 0.1 }], [1, { wind: 0.25, dread: 0.22, choir: 0.15 }]]);

/** 營地的光：從邊緣外面（+Z 那一側、偏左）低角度斜射進來，仰角約 16 度；影子往右後方（圓盤深處）拖得很長 */
const CAMP_LIGHT = [-0.75, 0.28, 0.6];
// 封面座標 → 營地的位置：x 以抱頭的人（590）為中心，封面上越靠下的東西越靠近鏡頭
const campX = (px) => (px - 590) * 0.03 + BALL[0];
const campZ = (baseY) => BALL[1] + (baseY - 1308) * 0.07;

// 帳篷：[頂點 x, 底邊 y]（封面上只有 3 頂）。第三頂是抱頭的人背靠的那一頂，緊貼在他身後
const TENTS = [[385, 1267], [506.5, 1290], [633, 1296]];
// 草叢（地景）：[中線 x, 底邊 y, 寬]
const TUFTS = [[370.5, 1283.5, 20], [398.5, 1294, 27], [474, 1314, 32], [504, 1309.5, 20], [557.5, 1321, 27], [719.5, 1263, 19], [755.5, 1272.5, 21], [781, 1259, 30]];

// 帳篷：四角錐，紅色；四條稜線是暗紅的縫邊，頂上一個小帽。朝鏡頭的那一面有黑色的三角形入口，
// 入口左邊是掀開的門簾：一片有厚度的暗紅布，沿著入口的左緣往外翻開，所以它有自己的亮暗面和影子。原點在底面中央。
function makeTent(mat) {
  const tent = new Group();
  const half = 0.96, height = 1.41; // 封面上底寬 64、高 47 像素
  const shell = cone(mat.custom(RED, DARK_RED, 0), half * Math.SQRT2, height, 0, 0, 0, 4); // 不加邊緣光：斜著看的那一面才不會泛白
  shell.rotation.y = Math.PI / 4;
  tent.add(shell);
  const edge = Math.hypot(half, half, height);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const seam = cylinder(mat.darkRed, 0.028, 0.028, edge, 0, 0, 0, 6);
    seam.position.set((sx * half) / 2, height / 2, (sz * half) / 2);
    seam.lookAt(sx * half, 0, sz * half); // 稜線從頂點到底角
    seam.rotateX(Math.PI / 2);
    tent.add(seam);
  }
  tent.add(cone(mat.ink, 0.07, 0.14, 0, height - 0.06, 0, 6));
  const tilt = Math.atan(half / height), slant = Math.hypot(half, height);
  const front = new Group(); // 貼在正面斜面上的東西
  front.position.set(0, 0, half + 0.012);
  front.rotation.x = -tilt;
  const door = extrude(mat.flat(BLACK), [[-0.36, 0], [0.38, 0], [0.03, slant * 0.88], [-0.01, slant * 0.88]], 0.012);
  // 門簾：以入口的左緣為軸往外掀開
  const hinge = new Group();
  hinge.position.set(-0.36, 0, 0.01);
  hinge.rotation.z = -Math.atan2(0.35, slant * 0.88); // 軸沿著入口的左緣
  const flap = extrude(mat.darkRed, [[0, 0], [-0.4, 0], [-0.3, slant * 0.5], [0, slant * 0.93]], 0.035);
  flap.rotation.y = -0.6; // 往外翻
  hinge.add(flap);
  front.add(door, hinge);
  // 布的細節：正面兩道從頂點往下的褶（暗紅細條）、門邊一排縫線
  for (const x of [0.52, -0.6]) {
    const fold = extrude(mat.darkRed, [[x - 0.025, 0.02], [x + 0.025, 0.02], [x * 0.12 + 0.01, slant * 0.8], [x * 0.12 - 0.01, slant * 0.8]], 0.008);
    front.add(fold);
  }
  for (let i = 0; i < 6; i++) front.add(box(mat.darkRed, 0.05, 0.016, 0.01, 0.31 - i * 0.052 * 0.4, 0.08 + i * slant * 0.13, 0.014));
  tent.add(front);
  // 底邊一圈暗紅的布邊（帳篷的裙襬，壓在地上）
  for (const [x, z, w, d] of [[0, half, half * 2, 0.06], [0, -half, half * 2, 0.06], [half, 0, 0.06, half * 2], [-half, 0, 0.06, half * 2]]) tent.add(box(mat.darkRed, w + 0.04, 0.05, d + 0.04, x, 0.025, z));
  // 營繩與營釘：從四條稜線的三分之一高處拉到地上的木樁
  const rope = new Group();
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const from = new Vector3(sx * half * 0.66, height * 0.34, sz * half * 0.66), to = new Vector3(sx * half * 1.65, 0.05, sz * half * 1.65);
    const line = cylinder(mat.ink, 0.008, 0.008, from.distanceTo(to), 0, 0, 0, 4);
    line.position.copy(from).add(to).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
    line.geometry.translate(0, 0, 0);
    rope.add(line, cylinder(mat.ink, 0.022, 0.012, 0.16, to.x, -0.04, to.z, 5));
  }
  tent.add(rope);
  return tent;
}

/** 把擺好姿勢的人縮放到指定的高度（量包圍盒，所以坐著、蹲著的人也對得上平面版的大小）。 */
function fitHeight(person, height) {
  person.updateMatrixWorld(true);
  const box3 = new Box3().setFromObject(person);
  person.scale.multiplyScalar(height / (box3.max.y - Math.min(0, box3.min.y)));
  return person;
}

/** 烘成少數幾個 mesh，保留 fitHeight 設的大小（bakeFigure 會把人物本身的縮放拿掉） */
function bakeScaled(person) {
  const baked = bakeFigure(person);
  baked.scale.copy(person.scale);
  return baked;
}

/** 黑色剪影人物（封面上營地的人都是實心黑影），紙白外框：疊在帳篷黑色的入口前也分得開 */
const campFigure = (mat, o: FigureOptions & { headScale?: number } = {}) => silhouette(makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: null, hair: "bald", outline: PAPER_LINE, outlineWidth: 0.022, ...o }), o.headScale ?? 1.15);

// ---- 兩節肢體的解析解（第四輪精修）：讓手（或腳踝）落在指定的點上 ----
// upper、lower 是 makeFigure 的關節（肩→肘，或髖→膝）；a、b 是兩節的長度（關節局部座標）；
// target 是世界座標；pole 是手肘（膝蓋）要朝向的方向，用 upper 的父關節（spine 或 hips）的局部座標；
// bend：手臂 -1（前臂往前折）、腿 +1（小腿往後折）。呼叫前要先 updateMatrixWorld。
const _ik = { t: new Vector3(), d: new Vector3(), h: new Vector3(), e: new Vector3(), p: new Vector3(), c: new Vector3(), q: new Quaternion(), r: new Quaternion() };
function solveLimb(upper, lower, a, b, target, pole, bend) {
  const { t, d, h, e, p, c, q, r } = _ik;
  upper.parent.worldToLocal(t.copy(target)).sub(upper.position);
  const dist = Math.min(Math.max(t.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
  d.copy(t).normalize();
  const inner = Math.acos(Math.min(1, Math.max(-1, (a * a + b * b - dist * dist) / (2 * a * b))));
  const angle = bend * (Math.PI - inner);
  lower.rotation.set(angle, 0, 0);
  h.set(0, -a - b * Math.cos(angle), -b * Math.sin(angle)).normalize();
  q.setFromUnitVectors(h, d);
  // 繞著肩→手的軸轉，讓手肘朝 pole
  e.set(0, -a, 0).applyQuaternion(q);
  e.addScaledVector(d, -e.dot(d));
  p.copy(pole).addScaledVector(d, -pole.dot(d));
  if (e.lengthSq() > 1e-8 && p.lengthSq() > 1e-8) {
    const twist = Math.atan2(c.crossVectors(e, p).dot(d), e.dot(p));
    q.premultiply(r.setFromAxisAngle(d, twist));
  }
  upper.quaternion.copy(q);
}

// #111 抱頭坐著的人：坐在地上、膝蓋立起來，低著頭，雙手抱住頭的兩側，手肘撐在膝蓋上（封面上側身朝左）
// 精修：以前是一手抱膝、一手壓在後腦，近景裡壓在後腦的那隻手像頭頂長了一個包。
// 現在兩隻手都貼在頭的兩側偏後（太陽穴到耳後），兩條前臂從膝蓋往上夾住頭，從側面和斜前方看都是「抱著頭」。
function makeSitter(mat, height) {
  const person = campFigure(mat, { build: 1.1, headScale: 1.05 });
  const j = person.userData.joints;
  j.hips.position.y = 0.13;
  // 大腿幾乎豎直往上、小腿略往前落地，膝蓋頂到胸口；上身前傾、頭再往下低，臉埋在兩膝之間的上方
  person.userData.pose({
    legL: [-2.75, 0, 0.16], legR: [-2.7, 0, -0.14], kneeL: 2.5, kneeR: 2.45,
    spine: [0.62, 0, 0], neck: [0.7, 0, 0], head: [0.15, 0, 0],
  });
  person.updateMatrixWorld(true);
  // 手掌貼在頭骨兩側偏後（頭的局部座標；頭骨半寬約 0.097），手肘朝前下方、落在膝蓋上
  for (const [side, s] of [["L", 1], ["R", -1]] as [string, number][]) {
    const hand = j.head.localToWorld(new Vector3(s * 0.128, 0.115, -0.02));
    solveLimb(j[`shoulder${side}`], j[`elbow${side}`], 0.3, 0.31, hand, new Vector3(s * 0.45, -0.55, 1), -1);
  }
  return bakeScaled(fitHeight(person, height));
}

// #109 母親：蹲著、往後甩的馬尾，雙手往前伸（舉嬰兒的那兩隻手臂保留可以動）
function makeMother(mat, height) {
  const person = campFigure(mat, { build: 1.05, headScale: 1.1 });
  const j = person.userData.joints;
  // 馬尾：從後腦往後下方甩出去的一束，末端收尖
  const tail = new Group();
  tail.position.set(0, 0.17, -0.09);
  tail.rotation.x = -2.1;
  const strand = cone(mat.ink, 0.045, 0.3, 0, 0, 0, 10);
  strand.rotation.z = Math.PI;
  strand.position.y = 0.3;
  tail.add(strand, sphere(mat.ink, 0.045, 0, 0.02, 0, 10, 8));
  j.head.add(tail);
  inkOutline(tail, { width: 0.022, color: PAPER_LINE });
  j.hips.position.y = 0.43;
  person.userData.pose({ legL: [-1.45, 0, 0.12], legR: [-1.35, 0, -0.1], kneeL: 2.3, kneeR: 2.2, spine: [0.38, 0, 0], neck: [-0.25, 0, 0], head: [-0.1, 0, 0] });
  // 先擺成舉高的手勢量高度（平面版的圖就是這個姿勢），再保留兩隻手臂
  person.userData.pose({ armL: [-2.0, 0, 0.12], armR: [-2.0, 0, -0.12], elbowL: -0.35, elbowR: -0.35 });
  fitHeight(person, height);
  const grips = [j.elbowL, j.elbowR].map((elbow) => {
    const grip = new Group();
    grip.position.set(0, -0.3, 0.03);
    elbow.add(grip);
    return grip;
  });
  const baked = bakeKeeping(person, ["shoulderL", "shoulderR"]);
  baked.scale.copy(person.scale);
  baked.userData.elbows = [j.elbowL, j.elbowR];
  baked.userData.grips = grips;
  return baked;
}

// #110 嬰兒（被舉在半空、手腳張開）與坐在地上的孩子（腿往前伸、手撐著膝蓋）
function makeBaby(mat, height) {
  const person = campFigure(mat, { build: 1.35, headScale: 1.45 });
  person.userData.pose({ armL: [-0.3, 0, 0.9], armR: [-0.3, 0, -0.9], elbowL: -0.5, elbowR: -0.5, legL: [-0.25, 0, 0.18], legR: [0.15, 0, -0.15], kneeL: 0.5, kneeR: 0.3 });
  return bakeScaled(fitHeight(person, height));
}
function makeChild(mat, height) {
  const person = campFigure(mat, { build: 1.25, headScale: 1.35 });
  person.userData.joints.hips.position.y = 0.12;
  person.userData.pose({ legL: [-1.45, 0, 0.1], legR: [-1.5, 0, -0.08], kneeL: 0.25, kneeR: 0.15, spine: [0.12, 0, 0], neck: [0.1, 0, 0], armL: [-0.75, 0, 0.12], armR: [-0.7, 0, -0.12], elbowL: -0.5, elbowR: -0.55 });
  return bakeScaled(fitHeight(person, height));
}

// 包袱：一團不規則的球，頂上束口打了結；表面幾道紅色的短褶。原點在底部。
function makeBundle(mat, rx, ry, creases) {
  const bundle = new Group();
  const body = new Mesh(lumpy(new SphereGeometry(1, 16, 12), 0.16), mat.ink);
  body.scale.set(rx, ry, rx * 0.9);
  body.position.y = ry * 0.94;
  const neck = cylinder(mat.ink, 0.05, 0.1, ry * 0.5, 0.02, ry * 1.75, 0, 8);
  const knot = new Mesh(lumpy(new SphereGeometry(0.12, 8, 6), 0.3), mat.ink);
  knot.scale.set(1.3, 0.8, 1);
  knot.position.set(0.03, ry * 2.3, 0);
  bundle.add(body, neck, knot);
  for (const [x, y, angle] of creases) {
    const z = rx * 0.9 * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2 - (y / ry) ** 2)) + 0.03;
    const crease = box(mat.flat(RED), 0.16, 0.035, 0.02, x, ry * 0.94 + y, z);
    crease.rotation.z = angle;
    bundle.add(crease);
  }
  return bundle;
}

export default async function createFloorSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(40, 1, 0.05, 600);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette(LIGHT); // 圓盤上面的世界，和上一章同一個光
  const campMat = makePalette(CAMP_LIGHT); // 圓盤底下的營地
  addFog(scene, mat, WHITE, ...FOG);
  campMat.setFog({ color: WHITE, near: FOG[0], far: FOG[1] });
  const { close, pullBack, others, wide } = PACE.morning.beats;

  // 上面的世界：和上一章同一個函式建出來的圓盤、隊伍、旗手、水晶球（不登記，那些編號屬於上一章）
  const world = await buildRimWorld(mat, buildQueueFlat(() => {}).parts, undefined, () => chapterContext.yield?.());
  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  scene.add(world.group);

  // ---- 營地：在圓盤底下的白色地面上，原點放在地面高度 ----
  const camp = new Group();
  camp.position.y = G;
  scene.add(camp);

  // #108 三頂紅框帳篷
  const tents = new Group();
  TENTS.forEach(([px, baseY], i) => {
    const tent = makeTent(campMat);
    tent.position.set(campX(px) + (i === 2 ? 0.3 : 0), 0, campZ(baseY) - 0.96);
    tent.rotation.y = [0.22, -0.12, -0.3][i];
    tents.add(tent);
  });
  register(108, tents, { count: 3 });
  camp.add(tents);

  // #111 抱頭坐著的人：立體人物，在水晶球的正下方，背靠第三頂帳篷；側身朝左前（封面上他面向左邊）
  const sitter = new Group();
  const sitterBody = makeSitter(campMat, flat.object(111).geometry.parameters.height * 3);
  sitter.add(sitterBody);
  sitter.position.set(BALL[0], 0, BALL[1]);
  sitter.rotation.y = -1.75;
  register(111, sitter);
  camp.add(sitter);

  // #109 舉著嬰兒的母親、#110 兩個孩子（被舉著的嬰兒、坐在她腳邊的孩子）：照封面上的相對位置擺成一組。
  // 母親蹲著、側身朝右；嬰兒掛在她兩手之間，跟著手臂舉高；坐著的孩子在她左後方。整組略轉向鏡頭。
  const family = new Group();
  const mother = makeMother(campMat, flat.object(109).geometry.parameters.height * 3);
  mother.rotation.y = Math.PI / 2;
  register(109, mother);
  const [babySprite, childSprite] = flat.object(110).children;
  const babyHeight = babySprite.geometry.parameters.height * 3;
  const baby = makeBaby(campMat, babyHeight);
  const child = makeChild(campMat, childSprite.geometry.parameters.height * 3);
  baby.rotation.y = -Math.PI / 2; // 面向母親
  child.rotation.y = 0.75;
  const kids = new Group();
  kids.add(baby, child);
  register(110, kids, { count: 2 });
  child.position.set(-0.65, 0, 0.16);
  family.add(mother, kids);
  family.position.set(campX(448.5), 0, campZ(1286));
  family.rotation.y = 0.17;
  camp.add(family);
  const [elbowL, elbowR] = mother.userData.elbows;
  const shoulders = [elbowL.parent, elbowR.parent];
  const handA = new Vector3(), handB = new Vector3();

  // #112 兩個包袱
  const bundles = new Group();
  bundles.add(makeBundle(campMat, 0.42, 0.33, [[0.14, 0.2, 0.9]]), makeBundle(campMat, 0.47, 0.4, [[-0.3, 0.22, -0.9], [0.03, 0.3, 1.3], [0.2, 0.26, 0.95]]));
  bundles.children[0].position.set(campX(671.6), 0, campZ(1290));
  bundles.children[1].position.set(campX(694.6), 0, campZ(1301));
  bundles.children.forEach((bundle) => (bundle.userData.rest = bundle.position.clone()));
  register(112, bundles, { count: 2 });
  camp.add(bundles);

  // #113 倒地的瓶子：車床做的，橫躺在地上，瓶口朝左前
  const bottle = new Group();
  const glass = lathe(campMat.ink, [[0, 0], [0.11, 0], [0.125, 0.04], [0.125, 0.36], [0.05, 0.47], [0.05, 0.64], [0.062, 0.64], [0.062, 0.7], [0, 0.7]], 20);
  glass.rotation.z = Math.PI / 2; // 躺平：瓶底在 +x、瓶口在 -x
  glass.position.set(0.35, 0.125, 0);
  bottle.add(glass);
  // 瓶身上一道紙白的反光、瓶頸一圈環
  const glint = box(campMat.paper, 0.22, 0.018, 0.02, 0.18, 0.2, 0.09);
  glint.userData.noShadow = true;
  bottle.add(glint, cylinder(campMat.ink, 0.07, 0.07, 0.03, -0.25, 0.11, 0, 12));
  bottle.children.at(-1).rotation.z = Math.PI / 2;
  bottle.scale.setScalar(1.3);
  const bottleRest = new Vector3(campX(724) + 0.5, 0, BALL[1] + 0.3); // 比封面上的位置靠前一點，才不會被包袱擋住
  register(113, bottle);
  camp.add(bottle);

  // #114 三塊碎片：不規則的小石塊
  const debris = new Group();
  for (const [px, py, r] of [[536, 1252, 0.1], [565, 1254, 0.09], [548, 1268, 0.15]]) { // 比封面上分得開一點：低角度看過去加上長影子才不會黏成一塊
    const piece = new Mesh(lumpy(new IcosahedronGeometry(r, 0), 0.5), campMat.ink);
    piece.scale.set(1.3, 0.75, 1);
    piece.position.set(campX(px), r * 0.6, campZ(py + 18));
    piece.rotation.y = px;
    debris.add(piece);
  }
  register(114, debris, { count: 3 });
  camp.add(debris);

  // 地景：草叢、碎石、地上的裂縫與拖行的痕跡（不會動，合併成一個 mesh）
  const random = seededRandom(1508);
  const tufts = new Group();
  for (const [px, baseY, w] of TUFTS) {
    const tuft = tuft3d(campMat.ink, w * 0.03, w * 0.017);
    tuft.position.set(campX(px), 0, campZ(baseY));
    tufts.add(tuft);
  }
  const stone = lumpy(new IcosahedronGeometry(1, 0), 0.45);
  for (let i = 0; i < 70; i++) {
    const r = 0.02 + random() * 0.05;
    const pebble = new Mesh(stone, campMat.ink);
    pebble.scale.set(r * 1.4, r * 0.65, r);
    pebble.position.set(-9 + random() * 16, r * 0.25, -7.5 + random() * 8.5);
    pebble.rotation.y = random() * 6;
    tufts.add(pebble);
  }
  camp.add(mergeStatic(tufts));
  const cracks = [];
  for (let i = 0; i < 16; i++) {
    const x = -9 + random() * 16, z = -7 + random() * 8;
    cracks.push(crackGeometry(crackPath(random, x, z, random() * Math.PI * 2, 5 + Math.floor(random() * 5), 0.3), 0.025));
  }
  // 拖行的痕跡：包袱被拖過來的兩道平行的淺溝
  for (const dz of [-0.12, 0.12]) cracks.push(crackGeometry([[campX(560), campZ(1300) + dz], [campX(600), campZ(1302) + dz], [campX(640), campZ(1297) + dz], [campX(670), campZ(1292) + dz]], 0.02));
  const crackMesh = new Mesh(mergeGeometries(cracks), new MeshBasicMaterial({ color: BLACK, side: DoubleSide }));
  crackMesh.position.y = 0.004;
  crackMesh.userData.noShadow = true;
  camp.add(crackMesh);

  // 空氣：從圓盤邊緣落下來的塵。開場那一格看不到它（上一章沒有），鏡頭開始下降才淡入
  const dust = new Snow({ count: Math.round(320 * deviceTier.particleScale), box: new Vector3(24, 5, 12), center: new Vector3(0, G + 2.5, -1), size: 22, speed: 0.45, wind: 0.5, color: BLACK, opacity: 0 });
  scene.add(dust);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- 鏡頭：越過圓盤邊緣往下降 → 抱頭的人 → 退後仰看 → 整片營地 → 退到遠處 ----
  const sit = [BALL[0], G, BALL[1]];
  // 第三輪：整章只換一次推拉方向。先從上一章的最後一格一路往下推到抱頭的人面前（0–0.15），
  // 之後一路往後退：仰起看到水晶球、橫移到整片營地、再退到連圓盤上的隊伍一起入鏡，中間每一格都比前一格寬一點。
  // 原本「退到 13 → 推回 11 看營地 → 再退」多了兩次反轉，0.16–0.33 的後退也太急（一步 0.11）。1.0 和 1.3 兩格不變（終章螢幕上的畫面）。
  const track = makeCameraTrack([
    { t: -0.3, ...END_SHOT },
    { t: close[0], ...END_SHOT }, // 上一章的最後一格
    // 往下降的這一段鏡頭和注視點保持差不多的距離（4.6–5），取景只略微放寬，不先推再退
    { t: 0.08, pos: [0.45, -1.5, 2.6], at: [0.07, -3.28, -1.63], fov: 37 }, // 邊緣從畫面上方滑過，底面變成天花板
    { t: close[1] + 0.01, pos: [-1.38, G + 2.22, 2.16], at: [sit[0] + 0.1, G + 0.8, sit[2]], fov: 35 }, // 抱頭的人面前（和舊版實際的取景差不多大）
    { t: 0.29, pos: [-0.7, G + 2.2, 5.0], at: [sit[0], -2.6, sit[2]], fov: 42 }, // 往後退、慢慢仰起
    { t: pullBack[1] + 0.01, pos: [-0.42, G + 2.6, 8.4], at: [sit[0], -0.8, sit[2]], fov: 46 }, // 他和正上方的水晶球
    { t: 0.48, pos: [-0.6, G + 2.6, 8.6], at: [sit[0] - 0.2, -0.9, sit[2]], fov: 46 },
    { t: 0.58, pos: [-2.35, G + 2.25, 8.7], at: [-1.3, G + 1.1, -3.2], fov: 44 }, // 整片營地
    { t: wide[1], pos: [-1.8, G + 2.3, 9.0], at: [-1.2, G + 1.3, -3.2], fov: 44 },
    { t: 1.0, pos: [-1.0, G + 2.5, 12.5], at: [-0.8, -1.2, sit[2]], fov: 44 }, // 營地、頭頂的圓盤、圓盤上的隊伍
    { t: 1.3, pos: [-1.0, G + 2.8, 14], at: [-0.8, -0.8, sit[2]], fov: 44 },
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList([], [{ at: 0.2, cue: "whisperCue" }, { at: 0.45, cue: "flag" }, { at: 0.5, cue: "bundle" }, { at: 0.55, cue: "bundle" }, { at: 0.6, cue: "bottle" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      // 直式螢幕把鏡頭往後拉（第一格不拉，和上一章的最後一格一樣）
      const away = smooth(linearstep(p, 0, 0.1));
      applyCameraShot(camera, fitShot(track(p), frame.aspect, 0.6 * away, 1 - away), frame.aspect, frame.pointer, 0.05);
      world.update(frame.time, camera);

      // 抱頭的人：很慢地前後搖（以坐著的地方為軸），肩膀跟著呼吸起伏
      sitterBody.rotation.x = Math.sin(frame.time * 0.9) * 0.035;
      sitter.scale.set(1, 1 + Math.sin(frame.time * 1.4) * 0.008, 1);

      // 帳篷：他背靠的那一頂一直都在；另外兩頂在「旁人進場」時由近到遠從地面搭起來
      tents.children.forEach((tent, i) => {
        const order = 2 - i;
        const start = others[0] - 0.02 + order * 0.05;
        const up = order === 0 ? 1 : smooth(linearstep(p, start, start + 0.09));
        tent.scale.set(0.8 + 0.2 * up, Math.max(up, 0.001), 0.8 + 0.2 * up);
        tent.visible = up > 0.001;
      });

      // 母親和坐著的孩子像立體書一樣從地面立起來；嬰兒先抱在胸前，0.55–0.64 舉到封面上的高度
      const arrive = smooth(linearstep(p, others[0] + 0.02, others[0] + 0.12));
      const lift = smooth(linearstep(p, 0.55, 0.64));
      family.visible = arrive > 0.001;
      family.scale.y = Math.max(arrive + Math.sin(arrive * Math.PI) * 0.08, 0.001); // 立起來時多彈一下
      // 母親的兩隻手臂：先把嬰兒抱在胸前（手肘彎著），再往前上方伸直舉高；嬰兒掛在兩手之間，舉高後輕輕晃
      const raise = lift + Math.sin(frame.time * 1.7) * 0.03 * lift;
      shoulders.forEach((shoulder, i) => shoulder.rotation.set(lerp(-0.95, -2.0, raise), 0, (i ? -1 : 1) * lerp(0.28, 0.12, lift)));
      elbowL.rotation.x = elbowR.rotation.x = lerp(-1.55, -0.35, lift);
      family.updateMatrixWorld(true);
      mother.userData.grips[0].getWorldPosition(handA);
      mother.userData.grips[1].getWorldPosition(handB);
      kids.worldToLocal(handA.add(handB).multiplyScalar(0.5));
      baby.position.set(handA.x, handA.y - babyHeight * 0.66, handA.z);
      baby.rotation.z = Math.sin(frame.time * 1.7 + 0.6) * 0.06 * lift;

      // 包袱一個接一個從上面掉下來
      bundles.children.forEach((bundle, i) => {
        const drop = linearstep(p, others[0] + 0.07 + i * 0.05, others[0] + 0.15 + i * 0.05);
        bundle.position.y = (-G - 1.2) * (1 - drop * drop);
        bundle.scale.y = 1 - 0.18 * Math.sin(linearstep(drop, 0.9, 1) * Math.PI); // 落地時壓扁一下
        bundle.visible = drop > 0;
      });
      // 瓶子從包袱那邊滾出來，倒在封面上的位置
      const roll = smooth(linearstep(p, others[0] + 0.17, others[1] - 0.06));
      bottle.position.set(bottleRest.x - 1.6 * (1 - roll), 0, bottleRest.z);
      bottle.rotation.y = -0.25 + 4.2 * (1 - roll);
      bottle.visible = roll > 0.001;

      // 塵：鏡頭開始下降才出現
      dust.material.uniforms.uOpacity.value = linearstep(p, 0.02, 0.1);
      dust.update(frame.time);
    },
  };
}
