// core 的 3D 場景：機房（PRD-3D 6.9）。
// 一個黑色的大廳：中央台座上是 AI 大腦，紅光照亮四周；左邊四個人站在一道發亮的門前，右邊是保險箱，
// 更右邊的車庫門口停著充電中的皮卡。地板是黑的，所以每一站都用「光」交代物件和地面的接觸：
// 門口灑進來的光、追著機器人的探照燈光圈、白色的充電車位、每個數字落地時亮起的小光點。
// 節奏範本 grandmother：0.035 鏡頭落到大腦前；0.445 保險箱的門彈開、機器人衝出來；之後數字噴出來落了一地。
import {
  CatmullRomCurve3, CircleGeometry, Color, ExtrudeGeometry, Group, InstancedMesh, Matrix4, Mesh, Path, PerspectiveCamera, Quaternion,
  RingGeometry, Scene, Shape, ShapeGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";
import binaryDigits from "@cover/binary-digits.json";
import { Snow, canvasTexture, clamp, deviceTier, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cylinder, extrude, lathe, makePalette, sphere } from "../shared/set/model";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";
import { bakeFigure, inkOutline, makeFigure } from "../shared/set/figure";

// 聲音（2026-11-19，陰森版）：機房的嗡嗡聲、低鳴、靜電；大腦通電（0.035）；保險箱轉盤（0.335）、鐵門彈開與警報（0.445）；機器人跑出來（0.47）；數字灑落（0.55），夾著一句耳語（0.6）；充電的電弧（0.82）。
const soundScript = soundTrack([[0, { hum: 0.3, dread: 0.22, static: 0.08 }], [0.45, { hum: 0.3, dread: 0.28, static: 0.12 }], [0.75, { hum: 0.25, dread: 0.2, whisper: 0.08 }]]);

const BRAIN = new Vector3(0, 2.25, 0);
const SAFE = new Vector3(2.9, 0, 0.4);
const TRUCK = new Vector3(6.4, 0, 1.6);
const DOOR = [-4.9, 0.1], DOOR_TURN = 0.32; // 四個人背後那道門：中心的 x、z，和它朝大廳中央轉的角度

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

// 54 個數字落地的位置：把封面上的座標攤到地板上（x 往右、封面的下方朝向鏡頭）
const DIGITS = Object.entries(binaryDigits.zones as unknown as Record<string, [number, number, number][]>)
  .filter(([zone]) => !zone.startsWith("E_"))
  .flatMap(([, list]) => list)
  .map(([px, py, value]): { value: number; x: number; z: number; rank?: number; yaw?: number } => ({ value, x: (px - 440) / 52, z: (py - 800) / 40 + 1.2 }));

// ---- 大腦：封面像素 → 大腦自己的座標（中線 x = 568.5，中心 y = 846） ----
const BK = 0.022;
const bx = (px) => (px - 568.5) * BK, by = (py) => (846 - py) * BK;
const LOBE_FLAT = 0.68; // 腦葉前後壓扁的比例
// 一個半腦的腦葉：[離中線的距離, y, 半徑]（封面像素，和平面版同一組圓）
const LOBES = [[22, 814, 25], [40, 838, 23], [42, 866, 21], [24, 880, 22], [18, 848, 30]].map(([dx, py, r]) => [dx * BK, by(py), r * BK]);
const STEM_R = 0.21, STEM_TOP = by(880), STEM_BOTTOM = by(908);
// 右半腦的線路：每條是一串折點（封面像素），最後一點是節點；左半腦是鏡像
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
/** 大腦正面在 (x, y) 的表面高度（z）：所有腦葉和腦幹裡最凸的那一個。線路沿著它貼在腦葉上。 */
function brainSurface(x, y) {
  let z = 0;
  for (const side of [1, -1]) {
    for (const [dx, cy, r] of LOBES) {
      const inside = r * r - (x - side * dx) ** 2 - (y - cy) ** 2;
      if (inside > 0) z = Math.max(z, Math.sqrt(inside) * LOBE_FLAT);
    }
  }
  if (y < STEM_TOP && Math.abs(x) < STEM_R) z = Math.max(z, Math.sqrt(STEM_R * STEM_R - x * x));
  return z;
}

/** 輪廓加挖洞的擠出體（車身側面挖出車窗）。前後置中。 */
function extrudeWithHoles(material, outline, holes, depth) {
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new Path(hole.map(([x, y]) => new Vector2(x, y))));
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return new Mesh(geometry, material);
}

/** 沿著一串 3D 點走的圓管（線路、電纜）。 */
function tube(material, points, radius, sides = 6) {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), false, "centripetal");
  return new Mesh(new TubeGeometry(curve, points.length * 3, radius, sides), material);
}

// 地板：黑底、白色格線，從大腦往外放射的紅色線路。格線的透視是空間感的主要來源。
function makeFloorTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#f6f4ee";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 32; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 32, 0);
      ctx.lineTo((i * w) / 32, h);
      ctx.moveTo(0, (i * h) / 32);
      ctx.lineTo(w, (i * h) / 32);
      ctx.stroke();
    }
    // 紅色線路：從中心往八個方向走直角折線，末端一個節點
    ctx.strokeStyle = RED;
    ctx.fillStyle = RED;
    ctx.lineWidth = 7;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r1 = 90 + (i % 3) * 40, r2 = 260 + (i % 4) * 45;
      const x1 = w / 2 + Math.cos(a) * r1, y1 = h / 2 + Math.sin(a) * r1;
      const x2 = w / 2 + Math.cos(a + 0.25) * r2, y2 = h / 2 + Math.sin(a + 0.25) * r2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * 40, h / 2 + Math.sin(a) * 40);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x2, y2, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * 把擺好姿勢的立體人物烘成少數幾個 mesh，但頭另外烘、留成可以轉的關節（四個人各約 80 個 mesh，不烘的話 draw call 會超過預算）。
 * 回傳 Group；userData.head 是頭（繞 y 轉就是轉頭），userData.body 是身體（呼吸時微微縮放）。
 */
function bakePerson(figure) {
  const head = figure.userData.joints.head, neck = figure.userData.joints.neck;
  figure.updateMatrixWorld(true);
  const headAt = new Vector3().setFromMatrixPosition(head.matrixWorld);
  const headTilt = head.rotation.clone();
  neck.remove(head);
  head.rotation.set(0, 0, 0);
  head.position.set(0, 0, 0);
  head.updateMatrixWorld(true);
  const person = new Group();
  const body = bakeFigure(figure);
  const headPivot = new Group();
  headPivot.position.copy(headAt);
  const bakedHead = bakeFigure(head);
  bakedHead.rotation.copy(headTilt);
  headPivot.add(bakedHead);
  person.add(body, headPivot);
  person.userData.head = headPivot;
  person.userData.body = body;
  return person;
}

export default function createCoreSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(BLACK);
  const camera = new PerspectiveCamera(40, 1, 0.05, 300);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.4, 0.85, 0.5]);
  const { strike2, flash } = PACE.grandmother.beats;
  const white = mat.flat(WHITE), red = mat.flat(RED), glow = mat.flat(WHITE, false); // glow：發光的門，不被霧吃掉
  // 大腦的紅光照亮周圍的黑色物件（原作火柴照亮牆角的同一個功能）
  for (const material of [mat.ink, mat.paper]) {
    material.uniforms.uFlamePos.value.copy(BRAIN);
    material.uniforms.uFlameColor.value.set(RED);
    material.uniforms.uFlame.value = 2.4;
  }

  // 霧：大廳深處沉進黑暗。近處（大腦、四個人、保險箱，離鏡頭 3–8）不受影響，遠處的線路柱淡進背景
  addFog(scene, mat, BLACK, 10, 27);
  const floor = ground(WHITE, 40);
  floor.material.map = makeFloorTexture();
  floor.material.needsUpdate = true;
  scene.add(floor);

  /** 地板上的一塊光（黑色地板上交代接觸用）：橢圓。 */
  const lightPool = (material, rx, rz, x, z, y = 0.003) => {
    const pool = new Mesh(new CircleGeometry(1, 40), material);
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(rx, rz, 1);
    pool.position.set(x, y, z);
    return pool;
  };

  // ---- 遠景與空氣：地板線路的末端立起一根根紅色的線路柱（和大腦上的線路同一個圖樣），越遠越沉進霧裡；空中飄著紅色的微粒 ----
  const pylons = new Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.25, r = ((260 + (i % 4) * 45) * 40) / 1024;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // 地板貼圖上的節點做成凸起的圓墊
    pylons.add(cylinder(mat.red, 0.47, 0.5, 0.07, x, 0, z, 20));
    if (z > 5 || (Math.abs(x) < 3.5 && z < 0) || (x > 7 && z > -5)) continue; // 鏡頭這一側、大腦正後方、車庫旁邊不立柱子，免得擋住或混進主體
    const height = 2.2 + ((i * 7) % 5) * 0.9;
    pylons.add(cylinder(red, 0.05, 0.05, height, x, 0.07, z, 8), sphere(mat.red, 0.2, x, height + 0.2, z, 12, 8));
    // 柱子半腰分出一條支線（直角折線加節點）
    const side = i % 2 ? 1 : -1, branchY = height * 0.55;
    pylons.add(box(red, 0.7, 0.07, 0.07, x + side * 0.35, branchY, z), cylinder(red, 0.035, 0.035, 0.6, x + side * 0.7, branchY, z, 6), sphere(mat.red, 0.12, x + side * 0.7, branchY + 0.68, z, 10, 6));
  }
  scene.add(pylons);
  const motes = new Snow({
    count: Math.round(260 * deviceTier.particleScale), box: new Vector3(22, 6, 12), center: new Vector3(1, 3.2, 0.5),
    size: 34, speed: -0.25, wind: 0.1, color: RED,
  });
  scene.add(motes);

  // ---- #53 AI 大腦：壓扁的球疊出兩個半腦；線路是貼著腦葉起伏的紅色圓管加節點球（正反兩面都有）；中間一道發白的縫 ----
  const brain = new Group();
  const brainInk = mat.custom("#141414", BLACK, 0.9); // 大腦自己不吃自己的紅光，只留白色的邊緣光
  for (const side of [1, -1]) {
    for (const [dx, y, r] of LOBES) {
      const lobe = sphere(brainInk, r, side * dx, y, 0, 24, 16);
      lobe.scale.z = LOBE_FLAT;
      brain.add(lobe);
    }
  }
  brain.add(cylinder(brainInk, STEM_R, STEM_R * 0.9, STEM_TOP - STEM_BOTTOM + 0.2, 0, STEM_BOTTOM, 0, 20)); // 腦幹
  const nodes = [];
  const wiring = new Group();
  for (const side of [1, -1]) {
    for (const line of CIRCUITS) {
      // 把折線切細，每一小段都貼到腦葉表面上
      const points = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [x0, y0] = [bx(line[i][0]) * side, by(line[i][1])], [x1, y1] = [bx(line[i + 1][0]) * side, by(line[i + 1][1])];
        const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.05));
        for (let n = i ? 1 : 0; n <= steps; n++) {
          const x = x0 + ((x1 - x0) * n) / steps, y = y0 + ((y1 - y0) * n) / steps;
          points.push([x, y, brainSurface(x, y) + 0.012]);
        }
      }
      wiring.add(tube(red, points, 0.019));
      const end = points.at(-1);
      const node = sphere(mat.red, 0.058, end[0], end[1], end[2] + 0.025, 12, 8);
      nodes.push(node);
      wiring.add(node);
    }
  }
  const wiringBack = wiring.clone();
  wiringBack.scale.z = -1;
  wiringBack.children.forEach((child) => (child as Mesh).isMesh && (child as Mesh).geometry.type === "SphereGeometry" && nodes.push(child));
  brain.add(wiring, wiringBack);
  // 兩個半腦之間的縫：一片發白的薄板夾在中間，前後都看得到
  brain.add(
    box(white, 0.12, by(792) - by(822), 0.5, 0, (by(792) + by(822)) / 2, 0),
    box(white, 0.12, by(820) - by(834), 0.64, 0, (by(820) + by(834)) / 2, 0),
  );
  brain.position.copy(BRAIN);
  register(53, brain);
  // 台座：白色的圓台、紅色的收邊、黑色的支柱；地板上一圈白色的光環交代台座落地的位置
  const pedestalRing = new Mesh(new RingGeometry(0.98, 1.08, 48), white);
  pedestalRing.rotation.x = -Math.PI / 2;
  pedestalRing.position.y = 0.004;
  const trim = new Mesh(new TorusGeometry(0.56, 0.035, 8, 40), mat.red);
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.5;
  scene.add(
    brain, pedestalRing, trim,
    cylinder(mat.paper, 0.55, 0.78, 0.5, 0, 0, 0, 40),
    cylinder(mat.ink, 0.13, 0.17, BRAIN.y + STEM_BOTTOM - 0.4, 0, 0.5, 0, 16),
  );

  // ---- #45 四名黑衣人（第四輪：立體人物）：黑西裝、紅臉；後三人的西裝前襟有兩道紅線（封面上的翻領），
  // 第一個是捲髮、第二個戴眼鏡、第四個留鬍子。四個人都雙手插在口袋裡站著。站在發亮的門前，黑色的人落在白光裡 ----
  // 門前的座標（x 沿著門、z 朝門外）→ 世界座標
  const fromDoor = (x, z, y = 0): [number, number, number] => [DOOR[0] + x * Math.cos(DOOR_TURN) + z * Math.sin(DOOR_TURN), y, DOOR[1] - x * Math.sin(DOOR_TURN) + z * Math.cos(DOOR_TURN)];
  const men = new Group();
  const LOOKS = [
    { hair: "curly", lapels: false, build: 1.08 },
    { hair: "short", lapels: true, glasses: true },
    { hair: "short", lapels: true, belt: true, build: 1.05 },
    { hair: "short", lapels: true, beard: true, build: 1.1 },
  ];
  LOOKS.forEach((look, i) => {
    const figure = makeFigure(mat, { suit: mat.ink, shirt: null, skin: mat.red, hair: look.hair, build: look.build ?? 1, height: 1.82 - (i % 2) * 0.05 });
    const j = figure.userData.joints;
    const b = look.build ?? 1;
    // 翻領：從肩膀斜下到腰的兩道紅線，貼著軀幹正面（軀幹斷面壓成 0.62，正面約在 z = 0.105）
    if (look.lapels) {
      for (const s of [1, -1]) {
        const lapel = box(mat.red, 0.026, 0.36, 0.02, s * 0.065 * b, 0.3, 0.1 * b);
        lapel.rotation.z = s * 0.12;
        lapel.rotation.x = -0.12;
        j.spine.add(lapel);
      }
    }
    if (look.belt) j.spine.add(box(mat.red, 0.2 * b, 0.025, 0.02, 0, 0.04, 0.095 * b)); // 封面上第三人腰上的一道紅
    if (look.glasses) {
      // 眼鏡：兩個黑框加鼻樑，壓在紅臉上很醒目
      for (const s of [1, -1]) {
        const rim = new Mesh(new TorusGeometry(0.03, 0.009, 6, 16), mat.ink);
        rim.position.set(s * 0.042, 0.12, 0.1);
        j.head.add(rim);
      }
      j.head.add(box(mat.ink, 0.03, 0.01, 0.01, 0, 0.125, 0.105), box(mat.ink, 0.2, 0.012, 0.012, 0, 0.13, 0.08));
    }
    if (look.beard) {
      const beard = sphere(mat.ink, 0.085, 0, 0.03, 0.035, 16, 10);
      beard.scale.set(1.05, 0.75, 0.85);
      j.head.add(beard);
    }
    // 雙手插在口袋裡（精修：以前只是手臂往後擺，看起來是垂著的）：
    // 手腕落在胯部前側的褲袋口（骨盆表面略往內），手肘往外、往後撐開，前臂斜斜收進口袋；手掌拿掉，前臂的末端埋進骨盆裡，
    // 從正面和斜側看都是「手插進去了」。左右手的袋口高低差一點，免得太對稱
    figure.userData.pose({ legL: [0, 0, 0.04], legR: [0, 0, -0.04] });
    if (i === 0) figure.userData.pose({ head: [0, 0, 0.06] }); // 第一個人頭微微歪
    figure.updateMatrixWorld(true);
    for (const [side, s] of [["L", 1], ["R", -1]] as [string, number][]) {
      const elbow = j[`elbow${side}`];
      const hand = elbow.children.find((child) => child.isMesh && Math.abs(child.position.y + 0.31) < 0.001);
      elbow.remove(hand);
      // 袋口（hips 的局部座標）：骨盆的橢圓表面在 x≈0.15b、z≈0.04 附近；目標放在表面內 1–2 公分
      const pocket = j.hips.localToWorld(new Vector3(s * 0.135 * b, 0.03 - ((i + (s > 0 ? 0 : 1)) % 2) * 0.02, 0.05 * b));
      solveLimb(j[`shoulder${side}`], elbow, 0.3, 0.29, pocket, new Vector3(s * 1, -0.2, -0.9), -1);
    }
    const person = bakePerson(figure);
    person.position.set(...fromDoor(-1.08 + i * 0.72, 1.0 - (i % 2) * 0.3));
    person.rotation.y = DOOR_TURN + (i - 1.5) * 0.06;
    person.userData.home = person.rotation.y;
    person.userData.phase = i * 1.7;
    men.add(person);
  });
  register(45, men, { count: 4 });
  scene.add(men);
  // 門：黑色的門框（有深度），門洞裡是白光，門框內側和門楣下緣是紅色的反光
  const doorway = new Group();
  const DW = 3.5, DH = 2.5, FRAME = 0.34, DEEP = 0.6;
  doorway.add(
    box(glow, DW, DH, 0.04, 0, DH / 2, 0), // 門洞裡的光
    box(mat.ink, FRAME, DH + FRAME, DEEP, -(DW + FRAME) / 2, (DH + FRAME) / 2, DEEP / 2),
    box(mat.ink, FRAME, DH + FRAME, DEEP, (DW + FRAME) / 2, (DH + FRAME) / 2, DEEP / 2),
    box(mat.ink, DW + FRAME * 2 + 0.3, FRAME, DEEP + 0.12, 0, DH + FRAME / 2, DEEP / 2),
    box(red, 0.03, DH, DEEP, -DW / 2 + 0.015, DH / 2, DEEP / 2), box(red, 0.03, DH, DEEP, DW / 2 - 0.015, DH / 2, DEEP / 2),
    box(red, DW, 0.03, DEEP, 0, DH - 0.015, DEEP / 2),
    box(mat.paper, DW + 0.5, 0.07, DEEP + 0.5, 0, 0.035, DEEP / 2 + 0.2), // 門檻
  );
  doorway.position.set(DOOR[0], 0, DOOR[1]);
  doorway.rotation.y = DOOR_TURN;
  // 門口灑在地板上的光：一塊往鏡頭方向張開的梯形
  const spill = new Mesh(new ShapeGeometry(new Shape([[-DW / 2, -0.4], [DW / 2, -0.4], [DW / 2 + 1.5, -4.6], [-DW / 2 - 1.5, -4.6]].map(([x, y]) => new Vector2(x, y)))), white);
  spill.rotation.x = -Math.PI / 2;
  const spillTurn = new Group();
  spillTurn.add(spill);
  spillTurn.position.set(DOOR[0], 0.003, DOOR[1]);
  spillTurn.rotation.y = DOOR_TURN;
  scene.add(doorway, spillTurn);

  // ---- #46 晶片：有厚度的紅色封裝，四邊各五支往下折的針腳，正反兩面是白框和凸起的晶粒；浮在人群旁邊慢慢轉 ----
  const chips = new Group();
  // 位置照封面：兩枚在四個人的左邊（中間那枚最大），一枚在右邊
  [[-2.75, 1.45, 1.3, 0.4], [-1.95, 1.95, 0.9, 0.54], [2.0, 1.5, 1.2, 0.32]].forEach(([dx, y, dz, size]) => {
    const [x, , z] = fromDoor(dx, dz);
    const chip = new Group();
    chip.add(box(mat.red, size, size, size * 0.2));
    for (const face of [1, -1]) {
      chip.add(box(white, size * 0.62, size * 0.62, size * 0.03, 0, 0, face * size * 0.105));
      chip.add(box(mat.red, size * 0.42, size * 0.42, size * 0.06, 0, 0, face * size * 0.13));
    }
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * size * 0.19, reach = size * 0.59, leg = size * 0.09;
      for (const s of [1, -1]) {
        chip.add(
          box(mat.red, size * 0.2, leg, leg, s * reach, offset, 0), box(mat.red, leg, leg, size * 0.2, s * (reach + size * 0.07), offset, -size * 0.07),
          box(mat.red, leg, size * 0.2, leg, offset, s * reach, 0), box(mat.red, leg, leg, size * 0.2, offset, s * (reach + size * 0.07), -size * 0.07),
        );
      }
    }
    chip.position.set(x, y, z);
    chip.userData.baseY = y;
    chips.add(chip);
  });
  register(46, chips, { count: 3 });
  scene.add(chips);

  // ---- #52 保險箱：厚壁的黑箱，箱內是三排數字；紅色的厚門有門栓、鉸鏈、轉盤和把手，0.445 往外彈開 ----
  const safe = new Group();
  const W = 1.5, H = 1.25, D = 1.1, T = 0.12, LIFT = 0.1, DOOR_T = 0.15;
  const shell = new Group();
  shell.add(
    box(mat.ink, W, T, D, 0, T / 2, 0), box(mat.ink, W, T, D, 0, H - T / 2, 0),
    box(mat.ink, T, H, D, -W / 2 + T / 2, H / 2, 0), box(mat.ink, T, H, D, W / 2 - T / 2, H / 2, 0),
    box(mat.ink, W, H, T, 0, H / 2, -D / 2 + T / 2),
  );
  // 開口內緣一圈紅框（封面上箱內的紅線）
  for (const s of [1, -1]) {
    shell.add(box(red, 0.035, H - T * 2, 0.05, s * (W / 2 - T - 0.017), H / 2, D / 2 - 0.03), box(red, W - T * 2, 0.035, 0.05, 0, H / 2 + s * (H / 2 - T - 0.017), D / 2 - 0.03));
  }
  const inside = box(mat.flat(WHITE), W - T * 2, H - T * 2, 0.01, 0, H / 2, -D / 2 + T + 0.01);
  inside.material = inside.material.clone();
  inside.material.map = canvasTexture(512, 420, (ctx, w, h) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = RED;
    ctx.lineWidth = 8;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.fillStyle = "#f6f4ee";
    ctx.font = "700 84px ui-monospace, Menlo, Consolas, monospace";
    ctx.textAlign = "right";
    binaryDigits.zones["E_保險箱內（灰白色，靠右對齊 3 排）"].rows.forEach((row, i) => ctx.fillText(row.split("").join(" "), w - 44, 150 + i * 105));
  });
  shell.add(inside);
  shell.position.y = LIFT;
  for (const x of [-0.52, 0.52]) for (const z of [0.36, -0.36]) safe.add(box(mat.ink, 0.2, LIFT, 0.2, x, LIFT / 2, z)); // 四隻腳
  // 門：樞紐在左前緣。外側是轉盤（圓環）和一根直的把手，內側凸起一塊嵌進門框的內板，自由邊伸出三根白色門栓
  const door = new Group();
  const DOOR_W = W - 0.02, DOOR_H = H - 0.02;
  door.add(
    box(mat.red, DOOR_W, DOOR_H, DOOR_T, DOOR_W / 2, 0, DOOR_T / 2),
    box(mat.darkRed, W - T * 2 - 0.06, H - T * 2 - 0.06, 0.08, DOOR_W / 2, 0, -0.04),
  );
  for (const y of [-0.34, 0, 0.34]) {
    const bolt = cylinder(mat.paper, 0.045, 0.045, 0.16, 0, 0, 0, 12);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(DOOR_W - T + 0.03, y, -0.04);
    door.add(bolt);
  }
  for (const y of [-0.38, 0.38]) door.add(cylinder(mat.paper, 0.055, 0.055, 0.24, -0.02, y - 0.12, DOOR_T / 2, 12)); // 鉸鏈
  const dial = new Mesh(new TorusGeometry(0.17, 0.04, 8, 28), mat.ink);
  dial.position.set(DOOR_W * 0.52, 0.02, DOOR_T + 0.05);
  const hub = cylinder(mat.ink, 0.07, 0.07, 0.1, 0, 0, 0, 16);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(DOOR_W * 0.52, 0.02, DOOR_T + 0.04);
  door.add(
    dial, hub, box(mat.ink, 0.05, 0.74, 0.05, DOOR_W * 0.52, 0.02, DOOR_T + 0.05),
    sphere(mat.ink, 0.06, DOOR_W * 0.52, 0.41, DOOR_T + 0.05, 10, 8), sphere(mat.ink, 0.06, DOOR_W * 0.52, -0.37, DOOR_T + 0.05, 10, 8),
    sphere(mat.ink, 0.04, DOOR_W * 0.2, 0.44, DOOR_T + 0.01, 8, 6), sphere(mat.ink, 0.04, DOOR_W * 0.2, -0.44, DOOR_T + 0.01, 8, 6), // 門角的鉚釘
  );
  door.position.set(-W / 2, LIFT + H / 2, D / 2);
  safe.add(shell, door);
  safe.position.copy(SAFE);
  safe.rotation.y = -0.35;
  register(52, safe);
  scene.add(safe, lightPool(white, 1.75, 1.3, SAFE.x - 0.1, SAFE.z + 0.3)); // 保險箱腳下一圈探照燈的光

  // ---- #51 機器人：一節一節的方形肢體、白圈關節、爪形的手、尖頭的腳；背上一個紮了口的大麻袋，往左（反方向）跑 ----
  const robot = new Group();
  /** 一節肢體：從樞紐往下垂的方柱，樞紐上是白圈黑心的關節（封面上的畫法） */
  const limb = (length, width) => {
    const pivot = new Group();
    const joint = cylinder(mat.paper, width * 0.72, width * 0.72, width * 1.25, 0, 0, 0, 16), cap = cylinder(mat.ink, width * 0.36, width * 0.36, width * 1.35, 0, 0, 0, 12);
    joint.rotation.x = cap.rotation.x = Math.PI / 2;
    joint.position.set(0, 0, 0);
    cap.position.set(0, 0, 0);
    pivot.add(box(mat.ink, width, length - width * 0.5, width * 0.9, 0, -length / 2 - width * 0.1, 0), joint, cap);
    return pivot;
  };
  const body = new Group(); // 前傾的上半身：軀幹、肩、頭、麻袋
  const torso = box(mat.ink, 0.36, 0.62, 0.36, 0, 1.2, 0);
  torso.rotation.z = 0.35;
  const chest = box(red, 0.02, 0.2, 0.2, -0.26, 1.3, 0); // 胸口一道紅燈
  chest.rotation.z = 0.35;
  const headBox = box(mat.ink, 0.32, 0.26, 0.3, -0.36, 1.64, 0);
  body.add(
    torso, chest, headBox, cylinder(mat.ink, 0.07, 0.07, 0.16, -0.24, 1.44, 0, 10),
    box(white, 0.03, 0.12, 0.22, -0.525, 1.66, 0), // 眼睛：一道白色的面罩
    box(mat.ink, 0.04, 0.12, 0.04, -0.3, 1.82, 0.1), // 天線
  );
  // 麻袋：車床做的袋身，往上收成紮起來的袋口再張開；袋口朝機器人的肩膀
  const sack = new Group();
  sack.add(
    lathe(mat.ink, [
      ...Array.from({ length: 15 }, (_, i) => { const a = -Math.PI / 2 + (i / 14) * 2.35; return [0.62 * Math.cos(a), 0.6 * Math.sin(a)]; }),
      [0.3, 0.56], [0.16, 0.66], [0.1, 0.72], [0.12, 0.78], [0.22, 0.9], [0.2, 0.92], [0, 0.86],
    ], 32),
  );
  const tie = new Mesh(new TorusGeometry(0.115, 0.03, 8, 20), mat.paper);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.72;
  sack.add(tie);
  for (const z of [0.36, -0.36]) { // 袋身上一道弧形的白色反光（封面上有）
    const shine = new Mesh(new TorusGeometry(0.5, 0.014, 6, 20, 1.25), white);
    shine.position.z = z;
    shine.rotation.z = -1.0;
    sack.add(shine);
  }
  sack.position.set(0.52, 1.46, 0);
  sack.rotation.z = 1.05;
  body.add(sack);
  const legs = [0, 1].map((i) => {
    const thigh = limb(0.5, 0.17), shin = limb(0.5, 0.13);
    thigh.position.set(0.1, 0.98, i ? 0.13 : -0.13);
    shin.position.y = -0.5;
    const foot = extrude(mat.ink, [[0.08, 0], [-0.26, 0], [-0.31, 0.035], [-0.02, 0.15], [0.08, 0.13]], 0.14); // 尖頭的腳掌
    foot.position.y = -0.57;
    shin.add(foot, cylinder(mat.paper, 0.05, 0.05, 0.16, 0, -0.5, 0, 10));
    shin.children.at(-1).rotation.x = Math.PI / 2;
    shin.children.at(-1).position.set(0, -0.48, 0);
    thigh.add(shin);
    robot.add(thigh);
    return { thigh, shin };
  });
  const arms = [0, 1].map((i) => {
    const upper = limb(0.38, 0.13), lower = limb(0.36, 0.11);
    upper.position.set(-0.12, 1.46, i ? 0.25 : -0.25);
    lower.position.y = -0.38;
    // 手：手掌加兩根張開的爪
    const hand = new Group();
    const fingerA = box(mat.ink, 0.045, 0.14, 0.09, -0.045, -0.13, 0), fingerB = box(mat.ink, 0.045, 0.12, 0.09, 0.05, -0.12, 0);
    fingerA.rotation.z = -0.3;
    fingerB.rotation.z = 0.35;
    hand.add(box(mat.ink, 0.13, 0.09, 0.12, 0, -0.03, 0), fingerA, fingerB);
    hand.position.y = -0.36;
    lower.add(hand);
    upper.add(lower);
    robot.add(upper);
    return { upper, lower };
  });
  robot.add(body);
  const robotFrom = new Vector3(SAFE.x - 0.4, 0, SAFE.z + 1.2), robotTo = new Vector3(-1.5, 0, 3.7);
  register(51, robot);
  // 追著機器人的探照燈光圈：黑色的機器人落在白色的光裡，影子也看得見
  const spot = lightPool(white, 1.25, 0.8, 0, 0, 0.0035);
  scene.add(robot, spot);

  // ---- #47 54 個 0 和 1：有厚度的小零件（0 是橢圓環、1 是帶勾的立體字），從保險箱噴出來落在地板上；落地的地方亮起一個白色光點 ----
  const digitGroup = new Group();
  const zeros = DIGITS.filter((d) => d.value === 0), ones = DIGITS.filter((d) => d.value === 1);
  const zeroGeometry = new TorusGeometry(0.085, 0.034, 8, 20);
  zeroGeometry.scale(1, 1.4, 1.3);
  const oneGeometry = new ExtrudeGeometry(
    new Shape([[-0.075, -0.15], [0.075, -0.15], [0.075, -0.1], [0.033, -0.1], [0.033, 0.15], [-0.02, 0.15], [-0.08, 0.09], [-0.05, 0.055], [-0.033, 0.07], [-0.033, -0.1], [-0.075, -0.1]].map(([x, y]) => new Vector2(x, y))),
    { depth: 0.08, bevelEnabled: false },
  );
  oneGeometry.translate(0, 0, -0.04);
  const zeroMesh = new InstancedMesh(zeroGeometry, mat.flat(RED), zeros.length);
  const oneMesh = new InstancedMesh(oneGeometry, mat.flat(RED), ones.length);
  const padGeometry = new CircleGeometry(0.23, 20);
  padGeometry.rotateX(-Math.PI / 2);
  const padMesh = new InstancedMesh(padGeometry, white, DIGITS.length);
  zeroMesh.frustumCulled = oneMesh.frustumCulled = padMesh.frustumCulled = false;
  digitGroup.add(padMesh, zeroMesh, oneMesh);
  register(47, digitGroup, { count: 54 });
  scene.add(digitGroup);
  const mouth = new Vector3(SAFE.x - 0.2, 0.75, SAFE.z + 0.7);
  // 離保險箱越近的越早落地
  const ranked = [...DIGITS].sort((a, b) => Math.hypot(a.x - mouth.x, a.z - mouth.z) - Math.hypot(b.x - mouth.x, b.z - mouth.z));
  ranked.forEach((digit, i) => {
    digit.rank = i / (ranked.length - 1);
    digit.yaw = ((i * 37) % 11) / 11 - 0.5; // 落地後各自歪一點
  });
  const matrix = new Matrix4(), position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  const tumbleAxis = new Vector3(1, 0.3, 0.2).normalize(), flatDown = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2), yaw = new Quaternion(), up = new Vector3(0, 1, 0);

  // ---- #48 充電中的紅色皮卡：車身是擠出的楔形側面輪廓，挖出輪拱和車窗；停在白色的充電車位上，背後是亮著的車庫門 ----
  const truck = new Group();
  const rig = new Group(); // 車和充電樁（站在車位的板子上）
  const SLAB = 0.08, BODY_W = 1.04;
  const arch = (c) => [[c - 0.37, 0.26], [c - 0.19, 0.55], [c + 0.19, 0.55], [c + 0.37, 0.26]];
  const bodyOutline = [
    [-1.6, 0.26], ...arch(-0.95), ...arch(0.95), [1.6, 0.26], [1.56, 0.58], [-0.45, 0.94], [-1.25, 0.63], [-1.6, 0.36],
  ];
  const windowHole = [[-0.98, 0.67], [-0.46, 0.87], [0.78, 0.65]];
  rig.add(
    extrudeWithHoles(mat.red, bodyOutline, [windowHole], BODY_W),
    extrude(mat.ink, [[-1.02, 0.65], [-0.46, 0.89], [0.84, 0.64]], BODY_W - 0.12), // 車窗玻璃：比車身窄，縮在窗框裡
    box(mat.ink, 2.9, 0.3, BODY_W - 0.1, 0, 0.42, 0), // 輪拱裡面是黑的
    box(red, 0.03, 0.2, BODY_W + 0.01, -0.33, 0.77, 0), // B 柱
    box(white, 0.03, 0.035, BODY_W - 0.06, -1.6, 0.4, 0), // 車頭的一條燈
    box(red, 0.03, 0.05, BODY_W - 0.1, 1.585, 0.5, 0),
  );
  for (const c of [-0.95, 0.95]) {
    // 輪拱：黑色的梯形飾板，比車身凸出一點
    const [a, b, d, e] = arch(c);
    rig.add(extrude(mat.ink, [[c - 0.47, 0.26], [c - 0.25, 0.63], [c + 0.25, 0.63], [c + 0.47, 0.26], e, d, b, a], BODY_W + 0.05));
    for (const z of [0.4, -0.4]) {
      const wheel = cylinder(mat.ink, 0.26, 0.26, 0.22, 0, 0, 0, 24), cap = cylinder(mat.red, 0.09, 0.09, 0.24, 0, 0, 0, 12);
      wheel.rotation.x = cap.rotation.x = Math.PI / 2;
      wheel.position.set(c, 0.26, z);
      cap.position.set(c, 0.26, z);
      rig.add(wheel, cap);
    }
  }
  // 擋風玻璃：斜面上一片黑玻璃，兩側是凸起的紅色 A 柱，上緣一道車頂橫樑，玻璃陷在中間
  const windscreen = new Group();
  const slope = Math.atan2(0.94 - 0.63, -0.45 + 1.25), slopeLength = Math.hypot(0.31, 0.8);
  windscreen.add(
    box(mat.ink, slopeLength * 0.62, 0.012, BODY_W - 0.2, slopeLength * 0.17, 0.006, 0),
    box(mat.red, slopeLength * 0.7, 0.05, 0.07, slopeLength * 0.15, 0.025, BODY_W / 2 - 0.035), box(mat.red, slopeLength * 0.7, 0.05, 0.07, slopeLength * 0.15, 0.025, -BODY_W / 2 + 0.035),
    box(mat.red, 0.07, 0.05, BODY_W, slopeLength * 0.5 - 0.035, 0.025, 0),
  );
  windscreen.position.set(-0.85, 0.785, 0);
  windscreen.rotation.z = slope;
  rig.add(windscreen);
  // 後斗的蓋板：三道橫向的溝
  for (const t of [0.35, 0.55, 0.75]) {
    const groove = box(mat.ink, 0.03, 0.012, BODY_W - 0.16, -0.45 + 2.01 * t, 0.94 - 0.36 * t + 0.004, 0);
    groove.rotation.z = Math.atan2(-0.36, 2.01);
    rig.add(groove);
  }
  // 充電樁：黑色方柱加頂蓋，正面和朝車的一面各一道白色閃電，側面一條紅色的指示燈
  const CHARGER_X = 2.45;
  rig.add(box(mat.ink, 0.42, 1.2, 0.34, CHARGER_X, 0.6, 0), box(mat.ink, 0.5, 0.07, 0.42, CHARGER_X, 1.235, 0), box(mat.ink, 0.6, 0.06, 0.5, CHARGER_X, 0.03, 0), box(red, 0.3, 0.04, 0.02, CHARGER_X, 1.08, 0.172));
  const boltOutline = [[0.05, 0.22], [-0.1, -0.02], [0.0, -0.02], [-0.05, -0.22], [0.11, 0.04], [0.0, 0.04]];
  const bolt = extrude(white, boltOutline, 0.03);
  bolt.position.set(CHARGER_X, 0.74, 0.175);
  const boltSide = extrude(white, boltOutline, 0.03);
  boltSide.rotation.y = -Math.PI / 2;
  boltSide.position.set(CHARGER_X - 0.215, 0.74, 0);
  rig.add(bolt, boltSide);
  // 電纜：從充電樁側面拱起來再垂到車尾的充電口（一根真的圓管），末端是插頭
  const PORT: [number, number, number] = [1.36, 0.47, BODY_W / 2 + 0.01];
  rig.add(
    tube(mat.ink, [[CHARGER_X - 0.2, 1.0, 0.1], [CHARGER_X - 0.45, 1.3, 0.22], [CHARGER_X - 0.72, 1.12, 0.42], [1.55, 0.72, 0.6], [PORT[0] + 0.03, PORT[1], PORT[2] + 0.12]], 0.035, 8),
    box(mat.ink, 0.12, 0.12, 0.1, CHARGER_X - 0.2, 1.0, 0.1),
  );
  const plug = cylinder(mat.ink, 0.055, 0.055, 0.14, 0, 0, 0, 12);
  plug.rotation.x = Math.PI / 2;
  plug.position.set(PORT[0], PORT[1], PORT[2] + 0.06);
  const port = new Mesh(new RingGeometry(0.06, 0.09, 16), white);
  port.position.set(...PORT);
  rig.add(plug, port);
  rig.position.y = SLAB;
  // 充電車位：白色的板子，邊上兩道紅線；背後的車庫門是一片白光，黑色的輪子、充電樁和電纜都落在亮的背景前
  const garage = new Group();
  const GW = 6.4, GH = 2.15;
  garage.add(
    box(glow, GW, GH, 0.04, 0, GH / 2, 0),
    box(mat.ink, 0.4, GH + 0.4, 0.7, -GW / 2 - 0.2, GH / 2 + 0.2, 0.35), box(mat.ink, 0.4, GH + 0.4, 0.7, GW / 2 + 0.2, GH / 2 + 0.2, 0.35),
    box(mat.ink, GW + 1.1, 0.4, 0.82, 0, GH + 0.2, 0.35),
    box(red, GW, 0.03, 0.7, 0, GH - 0.015, 0.35),
  );
  // 捲門：門洞上緣捲起一半的幾片門板
  for (let i = 0; i < 4; i++) garage.add(box(mat.ink, GW, 0.1, 0.05, 0, GH - 0.08 - i * 0.15, 0.1));
  garage.position.set(0.45, 0, -1.75);
  const bay = new Group(); // 車位和車庫門是佈景，不算在 #48 裡
  truck.add(rig);
  bay.add(
    garage,
    box(mat.paper, 5.0, SLAB, 2.2, 0.45, SLAB / 2, 0),
    box(red, 5.0, 0.012, 0.07, 0.45, SLAB + 0.006, 0.95), box(red, 0.07, 0.012, 2.2, -1.95, SLAB + 0.006, 0), box(red, 0.07, 0.012, 2.2, 2.85, SLAB + 0.006, 0),
  );
  truck.position.copy(TRUCK);
  bay.position.copy(TRUCK);
  truck.rotation.y = bay.rotation.y = -0.12;
  register(48, truck);
  scene.add(truck, bay);

  // ---- 細節（第四輪）：讓黑色大廳裡的每個主體多一層可以落光、落排線的東西 ----
  const details = new Group();
  // 台座：紅色收邊上一圈白色螺栓、圓台側面四道散熱槽、地板上通往台座的三條粗電纜（紅色圓管，每隔一段一個白色的固定夾）
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    details.add(sphere(mat.paper, 0.028, Math.cos(a) * 0.57, 0.5, Math.sin(a) * 0.57, 8, 6));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const slot = box(mat.ink, 0.04, 0.22, 0.24, Math.cos(a) * 0.67, 0.22, Math.sin(a) * 0.67);
    slot.rotation.y = -a;
    details.add(slot);
  }
  for (const [ex, ez] of [[SAFE.x - 0.8, SAFE.z + 0.2], [DOOR[0] + 1.6, DOOR[1] + 0.9], [TRUCK.x - 2.0, TRUCK.z - 0.6]]) {
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, wobble = Math.sin(t * Math.PI * 2 + ex) * 0.25 * Math.sin(t * Math.PI);
      const x = 0.8 * Math.sign(ex) * (1 - t) + ex * t, z = 0.3 * (1 - t) + ez * t;
      pts.push([x + wobble * (ez - 0.3) * 0.1, 0.05, z + wobble]);
    }
    details.add(tube(mat.red, pts, 0.05, 10));
    for (let k = 1; k < 6; k += 2) {
      const [x, , z] = pts[k];
      details.add(box(mat.paper, 0.14, 0.06, 0.14, x, 0.03, z));
    }
  }
  // 保險箱：前框一圈白色鉚釘、頂上一塊銘板（合併成少數幾個 mesh）
  const safeTrim = new Group();
  for (let k = 0; k < 7; k++) {
    const x = -W / 2 + 0.06 + (k / 6) * (W - 0.12);
    for (const y of [LIFT + 0.05, LIFT + H - 0.05]) safeTrim.add(sphere(mat.paper, 0.022, x, y, D / 2 + 0.005, 8, 6));
  }
  for (let k = 1; k < 5; k++) {
    const y = LIFT + (k / 5) * H;
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) safeTrim.add(sphere(mat.paper, 0.022, x, y, D / 2 + 0.005, 8, 6));
  }
  safeTrim.add(box(mat.paper, 0.5, 0.02, 0.22, 0, LIFT + H + 0.01, 0.1));
  safe.add(bakeFigure(inkOutline(safeTrim, { width: 0.006 })));
  // 皮卡：門把、後照鏡、輪轂上的五顆螺帽、車頭燈的燈罩、車斗後緣的尾燈（合併）
  const truckTrim = new Group();
  for (const z of [BODY_W / 2 + 0.01, -BODY_W / 2 - 0.01]) {
    truckTrim.add(box(mat.ink, 0.16, 0.035, 0.03, -0.1, 0.66, z));
    const mirror = box(mat.ink, 0.06, 0.1, 0.12, -0.95, 0.78, z + Math.sign(z) * 0.06);
    truckTrim.add(mirror);
    for (const c of [-0.95, 0.95]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const nut = cylinder(mat.paper, 0.018, 0.018, 0.02, 0, 0, 0, 6);
        nut.rotation.x = Math.PI / 2;
        nut.position.set(c + Math.cos(a) * 0.055, 0.26 + Math.sin(a) * 0.055, z * 0.4 / (BODY_W / 2) + Math.sign(z) * 0.125);
        truckTrim.add(nut);
      }
    }
    truckTrim.add(box(mat.ink, 0.04, 0.09, 0.14, 1.59, 0.5, Math.sign(z) * 0.4));
  }
  rig.add(bakeFigure(truckTrim));
  // 車庫門口地上的排水溝（白色格柵）與門框上的螺栓
  for (let k = 0; k < 12; k++) bay.add(box(mat.paper, 0.06, 0.02, 0.4, -2.45 + k * 0.5 + 0.45, 0.01, -1.3));
  scene.add(bakeFigure(inkOutline(details, { width: 0.008 }))); // 靜止的細節全部合併：每個材質一個 draw call

  // 影子（第四輪）：引擎的投影陰影接手。門口灑進來的光、探照燈的光圈、充電車位都是亮的，
  // 四個人、保險箱、機器人和皮卡的影子落在上面；黑色地板上看不到影子的地方，靠這些光交代接觸。

  // ---- 鏡頭 ----
  // 2026-11-19 第三輪（鏡頭要順）：整章只剩兩次推拉反轉。
  // 從上方降到大腦前 → 0.3 之前繞著大腦往左，轉向四個人 → 往右橫移到保險箱 → 跟著衝出來的機器人，
  // 這一段（-0.3–0.5）和每一站的距離一站比一站近一點，不再每一站推近再退出來；
  // 0.5–0.72 升高、一路退成看數字落地的俯瞰 → 0.72 之後一路推近，降到車庫門口的皮卡。
  const cameraKeys = [
    { t: -0.3, pos: [0, 8.5, 9], at: [0, 1.9, 0], fov: 42 },
    { t: 0.07, pos: [1.2, 2.5, 5.6], at: [0, 2.2, 0], fov: 40 }, // 落到大腦前
    { t: 0.15, pos: [-0.5, 2.4, 5.55], at: [0, 2.2, 0], fov: 40 }, // 繞著大腦往左
    { t: 0.21, pos: [-1.9, 2.0, 5.1], at: [-0.5, 2.0, 0], fov: 40 },
    { t: 0.27, pos: [-1.4, 1.4, 5.4], at: [-4.4, 1.2, 1.2], fov: 40 }, // 四個人與晶片
    { t: 0.32, pos: [-1.6, 1.3, 5.1], at: [-4.6, 1.2, 1.0], fov: 40 },
    { t: 0.425, pos: [1.6, 1.35, 4.9], at: [SAFE.x - 0.1, 0.8, SAFE.z], fov: 40 }, // 往右橫移到保險箱：轉盤轉、門彈開
    { t: strike2, pos: [1.8, 1.25, 4.6], at: [SAFE.x - 0.2, 0.8, SAFE.z], fov: 40 },
    { t: 0.5, pos: [1.5, 1.35, 6.0], at: [0.9, 0.95, 2.2], fov: 40 }, // 機器人衝出來，鏡頭跟著橫移
    { t: 0.6, pos: [-0.2, 3.2, 8.2], at: [-1.2, 0.6, 3.2], fov: 40 }, // 一邊跟著它，一邊升高
    { t: 0.72, pos: [0.4, 6.0, 7.4], at: [0.2, 0, 1.6], fov: 42 }, // 俯瞰：數字落了一地
    { t: 0.8, pos: [1.4, 5.6, 7.0], at: [0.6, 0, 1.6], fov: 42 },
    { t: 0.895, pos: [4.9, 1.7, 8.1], at: [TRUCK.x + 0.75, 0.8, TRUCK.z], fov: 38 }, // 車庫門口的皮卡
    { t: 1.0, pos: [5.6, 1.35, 7.3], at: [TRUCK.x + 0.8, 0.75, TRUCK.z], fov: 36 },
    { t: 1.3, pos: [5.9, 1.25, 7.0], at: [TRUCK.x + 0.85, 0.75, TRUCK.z], fov: 36 },
  ];
  const track = makeCameraTrack(cameraKeys);
  // 從一站轉向下一站時，注視點是兩站之間的直線內插，和鏡頭的距離會在半路先縮短再變長（畫面上看不出來，但量測會當成一推一拉）。
  // 所以另外把「到注視點的距離」取對數、單獨做一條單調的曲線，再把注視點放回視線上的這個距離：視線方向完全不變。
  const keyDistance = (key) => Math.hypot(key.pos[0] - key.at[0], key.pos[1] - key.at[1], key.pos[2] - key.at[2]);
  const focusTrack = makeCameraTrack(cameraKeys.map((key) => ({ t: key.t, pos: [0, 0, 1], at: [0, 0, 0], fov: Math.log(keyDistance(key)) })));

  const pullBack = new Vector3();

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.35, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList(pacedCues("grandmother", ["power", "safeDoor"]), [{ at: 0.335, cue: "dial" }, { at: 0.47, cue: "robotRun" }, { at: 0.55, cue: "digits" }, { at: 0.6, cue: "whisperCue" }, { at: 0.82, cue: "zap" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const shot = track(p);
      shot.at.sub(shot.pos).setLength(Math.exp(focusTrack(p).fov)).add(shot.pos);
      // 直式螢幕：皮卡加充電樁太寬，最後一段把鏡頭沿視線往後拉。
      // 往後拉的量放在 0.5–0.72 那段本來就在升高、退後的時候平均地加上去，之後維持不變；
      // 如果在推向皮卡的路上才加，直式螢幕上就會變成推近的途中又退一下
      const back = linearstep(p, 0.5, 0.72) * clamp((1 - frame.aspect) * 1.2, 0, 0.6);
      if (back > 0) shot.pos.add(pullBack.subVectors(shot.pos, shot.at).multiplyScalar(back));
      applyCameraShot(camera, shot, frame.aspect, frame.pointer, 0.05);
      const time = frame.time;
      motes.update(time);

      // 大腦緩慢轉動並起伏；紅光跟著呼吸，節點一個接一個亮（脹大）
      brain.rotation.y = Math.sin(time * 0.35) * 0.3;
      brain.position.y = BRAIN.y + Math.sin(time * 1.4) * 0.03;
      mat.ink.uniforms.uFlame.value = mat.paper.uniforms.uFlame.value = 2.2 + 0.5 * Math.sin(time * 1.4);
      nodes.forEach((node, i) => node.scale.setScalar(1 + 0.3 * Math.max(0, Math.sin(time * 2.4 - i * 0.9))));

      // 四個人：呼吸（胸口起伏）、偶爾換腳重心；頭先看著大腦，機器人衝出來之後一起轉頭看它跑走
      const watch = smooth(linearstep(p, strike2, strike2 + 0.06));
      men.children.forEach((man, i) => {
        const breath = Math.sin(time * 1.6 + man.userData.phase);
        man.userData.body.scale.set(1 + breath * 0.006, 1 + breath * 0.004, 1 + breath * 0.012);
        man.rotation.z = Math.sin(time * 0.4 + man.userData.phase) * 0.012;
        const toBrain = Math.atan2(BRAIN.x - man.position.x, BRAIN.z - man.position.z) - man.userData.home;
        const toRobot = Math.atan2(robot.position.x - man.position.x, robot.position.z - man.position.z) - man.userData.home;
        const yaw = clamp(toBrain * 0.35 * (1 - watch) + toRobot * watch * 0.8, -0.9, 0.9) + Math.sin(time * 0.5 + i) * 0.04;
        man.userData.head.rotation.set(-0.05 * watch, yaw, 0);
      });
      chips.children.forEach((chip, i) => {
        chip.rotation.y = time * (0.5 + i * 0.2);
        chip.rotation.x = 0.25 * Math.sin(time * 0.7 + i);
        chip.position.y = chip.userData.baseY + Math.sin(time * 1.3 + i * 2) * 0.08;
      });

      // 保險箱的門：第二次觸發（0.445）前的一小段時間彈開；轉盤先轉幾圈
      door.rotation.y = -1.9 * smooth(linearstep(p, strike2 - 0.06, strike2));
      dial.rotation.z = linearstep(p, strike2 - 0.11, strike2 - 0.05) * Math.PI * 3;

      // 機器人：0.445 衝出來，在原作白場的時間（到 0.57 之後一點）跑到定位；四肢依跑過的距離擺動
      const run = smooth(linearstep(p, strike2, flash[1] + 0.05));
      robot.position.lerpVectors(robotFrom, robotTo, run);
      robot.visible = spot.visible = p > strike2 - 0.01;
      const stride = robot.position.distanceTo(robotFrom) * 3.2;
      const moving = run > 0 && run < 1 ? 1 : 0.25;
      legs.forEach(({ thigh, shin }, i) => {
        const swing = Math.sin(stride + i * Math.PI) * moving;
        thigh.rotation.z = 0.2 - swing * 0.95;
        shin.rotation.z = 0.5 + Math.max(0, swing) * 0.9;
      });
      arms.forEach(({ upper, lower }, i) => {
        const swing = Math.sin(stride + (1 - i) * Math.PI) * moving;
        upper.rotation.z = swing * 0.9;
        lower.rotation.z = -0.9;
      });
      robot.position.y = 0.03 + Math.abs(Math.sin(stride)) * 0.06 * moving;
      body.rotation.z = 0.04 * Math.sin(stride * 2) * moving; // 上半身和麻袋跟著步伐晃
      sack.rotation.z = 1.05 + 0.07 * Math.sin(stride * 2 + 1) * moving;
      spot.position.set(robot.position.x + 0.15, 0.0035, robot.position.z + 0.05);

      // 數字：跟在機器人後面從保險箱噴出來，沿拋物線落到地板上，落地後彈一下、平躺；落點亮起一個光點
      let zi = 0, oi = 0, pi = 0;
      for (const digit of DIGITS) {
        const start = strike2 + 0.03 + digit.rank * 0.2;
        const fly = linearstep(p, start, start + 0.09);
        const eased = smooth(fly);
        const landing = linearstep(p, start + 0.09, start + 0.13);
        const bounce = fly >= 1 ? Math.sin(landing * Math.PI) * 0.12 : 0;
        position.set(mouth.x + (digit.x - mouth.x) * eased, mouth.y * (1 - eased) + Math.sin(fly * Math.PI) * 1.3 + 0.05 + bounce, mouth.z + (digit.z - mouth.z) * eased);
        if (fly >= 1) rotation.copy(yaw.setFromAxisAngle(up, digit.yaw)).multiply(flatDown);
        else rotation.setFromAxisAngle(tumbleAxis, (1 - eased) * 7 + digit.rank * 3);
        scale.setScalar(fly > 0 ? 1 : 0.0001);
        matrix.compose(position, rotation, scale);
        if (digit.value === 0) zeroMesh.setMatrixAt(zi++, matrix);
        else oneMesh.setMatrixAt(oi++, matrix);
        if (fly >= 1) position.set(digit.x, 0.0045, digit.z); // 還沒落地的光點縮在數字裡，不露出來
        scale.setScalar(fly >= 1 ? 0.3 + 0.7 * smooth(landing) : 0.0001);
        matrix.compose(position, rotation.identity(), scale);
        padMesh.setMatrixAt(pi++, matrix);
      }
      for (const mesh of [zeroMesh, oneMesh, padMesh]) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox(); // 標註層靠外框找到這群數字；外框要跟著飛行更新
      }

    },
  };
}
