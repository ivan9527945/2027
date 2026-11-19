// watch 的 3D 場景：看板前的人（PRD-3D 6.8）。
// 照封面的構圖：一塊黑色的斜坡（靠看板那一頭高、靠鏡頭這一頭低，右前方斜切一刀），四十個空心的人
// 排成 11／11／8／6／4 的楔形站在坡上，全部背對鏡頭看著看板；看板立在坡後面的兩根柱子上，
// 四周是松樹（左後方的土丘上兩棵、左邊一棵、右邊兩棵），右邊一根高桿，頂上一台紅色的監視攝影機來回掃視。
// 人和看板完全不動，整章只有攝影機、松樹的枝葉和鏡頭在動。
//
// 節奏範本 matches（安靜的特寫）。節拍對應：
//   approach -0.4–0.30   從人群背後、貼著最前面那一排的肩膀慢慢靠近看板
//   tilt 0.30–0.50       鏡頭升高並往右上搖，離開人群，找到高桿上的攝影機
//   pushIn 0.45–0.78     升到攝影機的高度並推近它（它還在來回掃視）
//   cutToDetail 0.78     原本是硬切到攝影機自己的視角；現在改成連續的移動：0.72 到了它背後的上方，0.83 越過它的頭頂，
//                        0.94 落在它的視角：從看板那一側往下看，一張張空心的臉朝著它
import { Color, ConeGeometry, CylinderGeometry, Euler, ExtrudeGeometry, Group, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry, Quaternion, Scene, Shape, Vector2, Vector3 } from "three";
import type { InstancedMesh } from "three";
import type { ShaderMaterial } from "three";
import { Snow, canvasTexture, clamp, deviceTier, linearstep, seededRandom, smooth, toonMaterial } from "../core";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cardFromSprite, cylinder, lathe, makePalette, sphere } from "../shared/set/model";
import { bakeFigure, instancedCrowd, makeFigure } from "../shared/set/figure";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：沉默的人群：只有看板的電流聲、靜電、心跳和耳語；監視攝影機轉頭（0.35、0.52、0.68）；落到它的視角時快門一響，接著驚悚的一記（0.94）。
const soundScript = soundTrack([[0, { hum: 0.15, static: 0.15, heartbeat: 0.18, whisper: 0.12, dread: 0.15 }], [0.45, { hum: 0.2, static: 0.2, heartbeat: 0.2, dread: 0.2 }], [0.9, { hum: 0.2, static: 0.25, heartbeat: 0.25, dread: 0.25 }]]);

const BOARD = { size: 4.6, bottom: 2.9, z: -3.4 }; // 看板：邊長、下緣高度、深度
const POLE = new Vector3(4.3, 0, -2.9); // 高桿的位置：看板的右邊（封面上的位置）
const POLE_H = 7;
// 人群：封面上每一排的人數（最靠近看板的那一排排第一），和黑色斜坡的範圍
const ROW_SIZES = [11, 11, 8, 6, 4];
const SPREAD = 0.064; // 封面 1 像素的間距對應幾個世界單位
const PERSON_HEIGHT = 1.38; // 以前紙偶的高度（封面上一個人約 31 像素）
const ROW_Z0 = 0.2, ROW_GAP = 0.92;
const BANK = { back: -0.8, front: 5.0, rise: 1.5, lip: 0.12 };
/** 斜坡在深度 z 的高度：靠看板那一頭高 */
const bankHeight = (z) => BANK.lip + BANK.rise * clamp((BANK.front - z) / (BANK.front - BANK.back), 0, 1);
const CROWD_CENTER = new Vector3(-0.5, 1.5, 1.9);
const FACING = [1.7, -3.0]; // 人群朝著的那一點（x, z）：看板的右半邊

/** 只取平面版某張圖的一部分做成站立的卡片。crop 是 [u0, v0, u1, v1]（貼圖座標，v 向上）。原點在底邊中央。 */
function cropCard(sprite, scale, [u0, v0, u1, v1]) {
  const card = cardFromSprite(sprite, scale);
  const [fullW, fullH] = card.userData.size;
  const w = fullW * (u1 - u0), h = fullH * (v1 - v0);
  const geometry = new PlaneGeometry(w, h);
  geometry.translate(0, h / 2, 0);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i));
  card.geometry = geometry;
  card.userData.size = [w, h];
  return card;
}

// 地面：一格一格的伸縮縫。格線在透視下往遠處收攏，空曠才看得出來。
function makeConcreteTexture(size, cell) {
  const texture = canvasTexture(2048, 2048, (ctx, w) => {
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = BLACK;
    const k = w / size;
    for (let d = cell / 2; d < size / 2; d += cell) {
      for (const s of [1, -1]) {
        ctx.fillRect(w / 2 + s * d * k - 1, 0, 2, w);
        ctx.fillRect(0, w / 2 + s * d * k - 1, w, 2);
      }
    }
  });
  texture.anisotropy = 8;
  return texture;
}

/**
 * 松樹的模型：一根樹幹加上幾層往下張開的圓錐，每一層的下緣是鋸齒（一長一短），從哪個方向看輪廓都和封面上的松樹一樣。
 * 原點在樹腳。
 */
function pineModel(material, height, random) {
  const pine = new Group();
  const tiers = Math.max(4, Math.round(height / 0.62));
  const width = height * 0.54;
  pine.add(cylinder(material, height * 0.022, height * 0.03, height * 0.24, 0, 0, 0, 6));
  for (let i = 0; i < tiers; i++) {
    const top = height * (1 - (i / tiers) * 0.8);
    const tierHeight = ((height * 0.8) / tiers) * 1.55;
    const radius = (width / 2) * (0.3 + 0.7 * ((i + 1) / tiers));
    const geometry = new ConeGeometry(radius, tierHeight, 14, 1);
    const position = geometry.attributes.position;
    for (let v = 0; v < position.count; v++) {
      const x = position.getX(v), z = position.getZ(v);
      if (position.getY(v) > 0 || x * x + z * z < 1e-6) continue; // 尖端和底面的圓心不動
      const point = Math.round((Math.atan2(z, x) / (Math.PI * 2)) * 14 + 14) % 2;
      if (point) position.setXYZ(v, x * 0.6, position.getY(v) + tierHeight * 0.13, z * 0.6); // 短的那幾個往內縮、往上提
      else position.setY(v, position.getY(v) - tierHeight * 0.05);
    }
    geometry.computeVertexNormals();
    const tier = new Mesh(geometry, material);
    tier.position.y = top - tierHeight / 2;
    tier.rotation.y = random() * Math.PI;
    pine.add(tier);
  }
  return pine;
}

/** 黑色的斜坡：plan 是平面上的輪廓 [x, z]，頂面的高度由 heightAt(z) 決定，側面垂直落到地面。 */
function makeBank(material, plan, heightAt) {
  const geometry = new ExtrudeGeometry(new Shape(plan.map(([x, z]) => new Vector2(x, -z))), { depth: 1, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) if (position.getY(i) > 0.5) position.setY(i, heightAt(position.getZ(i)));
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}

export default function createWatchSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(40, 1, 0.05, 400);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.5, 0.8, 0.45]);
  addFog(scene, mat, WHITE, 24, 62); // 遠處的松樹淡進白色的天空
  const random = seededRandom(44);

  // ---- 環境：白色的地面（有伸縮縫的格線）、人群腳下那塊黑色的斜坡 ----
  scene.add(ground(WHITE, 400, -0.01));
  const concrete = ground(WHITE, 72, 0) as unknown as Mesh<PlaneGeometry, ShaderMaterial>; // 材質下一行換成 toonMaterial
  // 第四輪：地面改成卡通材質（永遠受光，只顯示投影陰影的排線），伸縮縫的貼圖照舊；純色貼圖的 MeshBasicMaterial 接收不到陰影
  concrete.material = toonMaterial({ color: WHITE, shade: "#141414", threshold: -2, rim: 0, light: mat.light, map: makeConcreteTexture(72, 2.6) });
  concrete.material.uniforms.uFogColor.value.set(WHITE);
  concrete.material.uniforms.uFogNear.value = 24;
  concrete.material.uniforms.uFogFar.value = 62;
  scene.add(concrete);
  // 封面上人群站的那塊黑色地面：左邊是直的，右前方斜切，所以前面幾排越來越短
  const bank = makeBank(mat.flat(BLACK), [[-4.6, BANK.back], [4.9, BANK.back], [4.9, 0.5], [1.0, BANK.front], [-4.6, BANK.front]], bankHeight);
  scene.add(bank);

  // ---- #42 國旗看板：真的厚板立在兩根柱子上，正面貼平面版畫好的國旗（只取畫框的部分，柱子是模型） ----
  const billboard = new Group();
  // 平面版的圖涵蓋封面 x 138–198、y 660–730；畫框連四角的固定點是 x 141–195、y 663–717
  const flag = cropCard(flat.object(42), BOARD.size / 0.54, [3 / 60, 1 - 57 / 70, 57 / 60, 1 - 3 / 70]);
  flag.position.set(0, BOARD.bottom, 0.012);
  flag.userData.noShadow = true;
  const panelY = BOARD.bottom + BOARD.size / 2, inset = BOARD.size * (3.5 / 54); // 畫框外緣比圖的邊界往內一點
  const panel = BOARD.size - inset * 2;
  billboard.add(flag, box(mat.ink, panel, panel, 0.34, 0, panelY, -0.17));
  // 畫框：四根凸出來的黑邊條，紅色的旗面凹在裡面
  const bar = BOARD.size * (4 / 54), inner = BOARD.size * (41 / 54);
  for (const s of [1, -1]) {
    billboard.add(box(mat.ink, bar, panel, 0.2, s * (inner + bar) / 2, panelY, 0.05), box(mat.ink, panel, bar, 0.2, 0, panelY + s * (inner + bar) / 2, 0.05));
  }
  const postX = BOARD.size * (21.1 / 54), postH = BOARD.bottom + inset;
  for (const sx of [1, -1]) {
    billboard.add(box(mat.ink, 0.26, postH, 0.26, sx * postX, postH / 2, -0.17)); // 柱子
    billboard.add(box(mat.ink, 0.62, 0.1, 0.62, sx * postX, 0.05, -0.17)); // 柱腳
    for (const sy of [1, -1]) billboard.add(sphere(mat.ink, BOARD.size * (3.3 / 54), sx * (BOARD.size / 2 - inset), panelY + sy * (BOARD.size / 2 - inset), -0.1, 14, 10)); // 四角的固定點
    // 背面的斜撐
    const brace = box(mat.ink, 0.14, 5.2, 0.14, sx * postX, 2.1, -1.9);
    brace.rotation.x = -0.72;
    billboard.add(brace);
  }
  for (const y of [-0.3, 0, 0.3]) billboard.add(box(mat.ink, panel * 0.94, 0.12, 0.1, 0, panelY + y * BOARD.size, -0.39)); // 背面的橫木
  billboard.position.z = BOARD.z;
  register(42, billboard);
  scene.add(billboard);

  // ---- #43 監視攝影機：真的模型，裝在高桿頂上。機身上半紅、下半黑，前端是黑色的鏡頭罩；會左右掃視 ----
  const surveillance = new Group();
  surveillance.add(
    cylinder(mat.ink, 0.07, 0.09, POLE_H, 0, 0, 0, 12),
    cylinder(mat.ink, 0.34, 0.4, 0.1, 0, 0, 0, 16),
    cylinder(mat.ink, 0.13, 0.13, 0.16, 0, POLE_H, 0, 12),
    box(mat.ink, 0.24, 0.42, 0.16, 0, 1.5, 0.12), // 桿子上的接線盒
    cylinder(mat.ink, 0.1, 0.1, 0.05, 0, POLE_H * 0.62, 0, 12), // 桿身的接頭
  );
  const head = new Group(); // 左右轉的軸
  head.position.y = POLE_H + 0.16;
  const tilt = new Group(); // 俯角：鏡頭口朝下對著人群。機身沿本地的 +z
  tilt.rotation.x = 0.6;
  const light = sphere(mat.flat(WHITE, false), 0.035, 0, 0.19, 1.02, 8, 6); // 鏡頭口的燈
  const lensRing = cylinder(mat.flat(WHITE), 0.13, 0.13, 0.02, 0, 0, 0, 20);
  const lensHole = cylinder(mat.flat(BLACK), 0.1, 0.1, 0.03, 0, 0, 0, 20);
  for (const disc of [lensRing, lensHole]) {
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 0.19, disc === lensRing ? 0.992 : 0.996);
  }
  tilt.add(
    box(mat.flat(BLACK), 0.42, 0.17, 1.2, 0, 0.085, 0.25), // 機身下半
    box(mat.red, 0.42, 0.24, 1.2, 0, 0.29, 0.25), // 機身上半
    box(mat.red, 0.5, 0.04, 1.34, 0, 0.43, 0.3), // 遮陽板
    box(mat.ink, 0.48, 0.46, 0.3, 0, 0.2, 0.83), // 鏡頭罩
    box(mat.flat(BLACK), 0.3, 0.2, 0.06, 0, 0.2, -0.37), // 機身後面的接線座
    lensRing, lensHole, light,
  );
  head.add(tilt, sphere(mat.ink, 0.13, 0, 0, 0, 12, 8));
  surveillance.add(head);
  // 第四輪：桿子的細節。一條電線從接線盒沿著桿子往上到機身（每隔一段一個束環），桿子中段一排腳踏釘，桿腳四顆螺栓
  const conduit = cylinder(mat.ink, 0.025, 0.025, POLE_H - 1.7, 0.1, 1.7, 0.06, 6);
  surveillance.add(conduit);
  for (let k = 0; k < 7; k++) surveillance.add(cylinder(mat.ink, 0.1, 0.1, 0.03, 0, 2.2 + k * 0.7, 0, 10));
  for (let k = 0; k < 8; k++) {
    const peg = new Mesh(new CylinderGeometry(0.018, 0.018, 0.22, 6), mat.ink);
    peg.rotation.z = Math.PI / 2;
    peg.position.set(k % 2 ? 0.12 : -0.12, 2.6 + k * 0.42, 0);
    surveillance.add(peg);
  }
  for (let k = 0; k < 4; k++) surveillance.add(sphere(mat.paper, 0.03, Math.cos(k * 1.571 + 0.785) * 0.3, 0.1, Math.sin(k * 1.571 + 0.785) * 0.3, 6, 4));
  surveillance.position.copy(POLE);
  register(43, surveillance);
  scene.add(surveillance);
  const headWorld = new Vector3(POLE.x, POLE_H + 0.3, POLE.z);
  const aimYaw = Math.atan2(CROWD_CENTER.x - headWorld.x, CROWD_CENTER.z - headWorld.z); // 對著人群中央的方向

  // ---- #44 空心的人（第四輪：立體人物）：四十個黑色的人、外面一圈白色描邊（封面上黑底白線的「空心」人），
  // 照封面排成 11／11／8／6／4 的楔形站在斜坡上，全部面向看板（背對一開始的鏡頭），微微仰頭看著它。
  // 四種體型與髮型各擺好姿勢烘成一個 mesh，用 InstancedMesh 複製（每種兩個 draw call）；整章站著不動，只有很輕的呼吸起伏 ----
  const crowd = new Group();
  const sprites = flat.parts.crowd.children;
  const xs = sprites.map((sprite) => sprite.position.x);
  const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
  const looks = [{ hair: "short" }, { hair: "long", build: 0.95 }, { hair: "short", build: 1.12 }, { hair: "bob" }];
  const variants = looks.map((look, k) => {
    const person = makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: null, height: PERSON_HEIGHT, outline: "#f2efe6", outlineWidth: 0.026, detail: 0.5, ...look }); // 遠景群眾：面數約剩四分之一
    const head = person.userData.joints.head;
    for (const o of [...head.children]) if (o.geometry?.parameters?.radius === 0.022) head.remove(o); // 剪影的臉不要五官（黑鼻子的邊緣光會變成一個圈）
    person.userData.pose({ head: [-0.22 - k * 0.03, (k - 1.5) * 0.06, 0], armL: [0.04, 0, 0.1], armR: [0.04, 0, -0.1], spine: [-0.04, 0, 0] });
    return { baked: bakeFigure(person), members: [], group: null as Group | null };
  });
  const watchers = [];
  let index = 0;
  ROW_SIZES.forEach((size, row) => {
    for (let i = 0; i < size; i++, index++) {
      const sprite = sprites[index];
      const x = (sprite.position.x - middle) * 100 * SPREAD + (random() - 0.5) * 0.1;
      const z = ROW_Z0 + row * ROW_GAP + (random() - 0.5) * 0.3;
      const variant = variants[Math.floor(random() * variants.length)];
      // 朝著看板，稍微偏向右邊（高桿那一側）；每個人差一點點。整章固定不變
      const watcher = { x, y: bankHeight(z), z, turn: Math.atan2(FACING[0] - x, FACING[1] - z) + (random() - 0.5) * 0.14, scale: 0.94 + random() * 0.12, phase: random() * 6.28, variant, slot: variant.members.length };
      variant.members.push(watcher);
      watchers.push(watcher);
    }
  });
  const crowdMatrix = new Matrix4(), crowdQuat = new Quaternion(), crowdEuler = new Euler(), crowdPos = new Vector3(), crowdScale = new Vector3();
  const placeWatcher = (w, breath) => crowdMatrix.compose(crowdPos.set(w.x, w.y, w.z), crowdQuat.setFromEuler(crowdEuler.set(0, w.turn, 0)), crowdScale.set(w.scale, w.scale * (1 + breath), w.scale));
  for (const variant of variants) {
    variant.group = instancedCrowd(variant.baked, variant.members.map((w) => placeWatcher(w, 0).clone()));
    crowd.add(variant.group);
  }
  register(44, crowd, { count: 40 });
  scene.add(crowd);

  // ---- 封面上看板四周的松樹：左後方的土丘上兩棵、左邊一棵、右邊一大一小；更遠的地方還有幾棵淡進霧裡 ----
  const pines = new Group();
  const mound = lathe(mat.flat(BLACK), [[5.2, 0], [4.6, 0.9], [3.4, 2.0], [1.9, 2.9], [0.6, 3.3], [0, 3.36]], 28);
  mound.scale.z = 0.7;
  mound.position.set(-4.4, 0, -9.2);
  scene.add(mound);
  const pineSpots = [
    [-4.9, 3.1, -8.9, 3.5], [-3.0, 2.75, -9.5, 2.7], // 土丘上的兩棵
    [-4.5, 0, -2.3, 3.1], // 左邊
    [3.0, 0, -4.9, 1.6], [5.9, 0, -4.3, 3.0], // 右邊，一小一大
    [-13, 0, -15, 4.2], [-9.5, 0, -21, 3.6], [-18, 0, -27, 4.6], [9, 0, -13, 3.8], [13.5, 0, -19, 4.4], [7.5, 0, -25, 3.4], [19, 0, -30, 4.8], [-25, 0, -38, 5], [2, 0, -36, 4.4], [26, 0, -42, 5],
  ];
  for (const [x, y, z, height] of pineSpots) {
    const pine = pineModel(mat.ink, height, random);
    pine.position.set(x, y, z);
    pines.add(pine);
  }
  scene.add(pines);

  // ---- 空氣：低低飄過的灰塵 ----
  const dust = new Snow({ count: Math.round(170 * deviceTier.particleScale), box: new Vector3(26, 6, 22), center: new Vector3(0, 3, 2), size: 34, speed: 0.06, wind: 0.7, color: BLACK });
  scene.add(dust);


  // ---- 鏡頭：整章一個連續的長鏡頭（2026-11-19 第三輪：原本 0.78 硬切到攝影機的視角，改成連續地移進去） ----
  // 人群背後一路靠近看板 → 0.3 起升高、往右繞著高桿轉半圈並推近攝影機（從正前方慢慢繞到它的側面、再到它的背後）
  // → 0.72 從它背後的上方越過它的頭頂，順著它鏡頭口對著人群的那條線往下滑，0.94 落在它的視角：往下看一張張空心的臉。
  // 推拉反轉只有兩次：越過攝影機時視野打開（約 0.75）、到了它的視角後慢慢推近人群（約 0.95）。
  const frontRow = ROW_Z0 + (ROW_SIZES.length - 1) * ROW_GAP;
  const flagCenter = [0, BOARD.bottom + BOARD.size / 2, BOARD.z];
  const H = headWorld.toArray();
  // 繞著攝影機的水平圓：deg 0 是它鏡頭口朝的方向（人群那邊），90 是它的右側（高桿右邊的空地），180 是它的背後
  const around = (deg, radius, y) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a) * radius, s = Math.sin(a) * radius;
    return [H[0] + c * Math.sin(aimYaw) + s * Math.cos(aimYaw), y, H[2] + c * Math.cos(aimYaw) - s * Math.sin(aimYaw)];
  };
  // 攝影機自己的視角：沿著鏡頭口對著人群的那條線往前推到人群上方不遠的地方（不然人會小得看不清），慢慢橫掃過去
  const eye = headWorld.clone().lerp(CROWD_CENTER, 0.36);
  eye.y -= 1.0; // 比鏡頭口低一點，才看得到臉而不是頭頂
  const track = makeCameraTrack([
    { t: -0.3, pos: [0.9, 1.5, frontRow + 10], at: [1.1, 3.5, 0], fov: 40 }, // 人群的背後，遠遠看著斜坡和看板
    { t: 0.05, pos: [0.5, 1.55, frontRow + 6.4], at: [1.0, 3.7, -1], fov: 40 },
    { t: 0.3, pos: [-1.3, 1.8, frontRow + 2.3], at: [0, flagCenter[1] - 1.0, BOARD.z], fov: 42 }, // 貼著最前面那一排的肩膀
    { t: 0.42, pos: around(45, 9.5, 4.2), at: [3.4, 6.0, -2.6], fov: 40 }, // 升高，往右搖向高桿
    { t: 0.51, pos: around(80, 7.4, 5.8), at: [H[0], H[1] - 0.3, H[2]], fov: 38 },
    { t: 0.59, pos: around(112, 5.8, 6.9), at: H, fov: 36 }, // 攝影機的高度，從它的右側看它來回掃視
    { t: 0.66, pos: around(138, 4.4, 8.2), at: H, fov: 36 },
    { t: 0.72, pos: around(160, 3.1, 8.9), at: H, fov: 36 }, // 到了它的背後上方：紅色的機身在前景，人群在它前方的下面
    { t: 0.83, pos: [H[0] + 0.9, H[1] + 1.3, H[2] - 0.1], at: [1.6, 4.2, 0.2], fov: 38 }, // 越過它的頭頂，視線順著它的鏡頭口往下
    { t: 0.94, pos: eye.toArray(), at: [CROWD_CENTER.x - 0.7, CROWD_CENTER.y, CROWD_CENTER.z + 1.0], fov: 52 }, // 它的視角
    { t: 1.04, pos: eye.toArray(), at: [CROWD_CENTER.x + 0.5, CROWD_CENTER.y, CROWD_CENTER.z + 0.7], fov: 50 },
    { t: 1.3, pos: eye.toArray(), at: [CROWD_CENTER.x + 0.9, CROWD_CENTER.y, CROWD_CENTER.z + 0.6], fov: 49 },
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.3, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList([], [{ at: 0.35, cue: "servo" }, { at: 0.52, cue: "servo" }, { at: 0.68, cue: "servo" }, { at: 0.94, cue: "shutter" }, { at: 0.95, cue: "stinger" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      // 滑進攝影機的視角之後，滑鼠視差跟著變小（0.04 → 0.01），不在某一格突然改變
      const pov = smooth(linearstep(p, 0.83, 0.94));
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.04 - 0.03 * pov);
      dust.update(frame.time);

      // 人群站著不動，朝向也固定（不會突然轉向鏡頭）；只有很輕的呼吸起伏，每個人的節奏不一樣
      for (const w of watchers) {
        const matrix = placeWatcher(w, Math.sin(frame.time * 1.1 + w.phase) * 0.006);
        for (const mesh of w.variant.group.children) mesh.setMatrixAt(w.slot, matrix);
      }
      for (const variant of variants) for (const mesh of variant.group.children) (mesh as InstancedMesh).instanceMatrix.needsUpdate = true;
      // 攝影機來回掃視，鏡頭口的燈一明一滅。鏡頭是從它的頭頂越過去、落在它前下方，到了它的視角時它在鏡頭背後，
      // 所以不用再藏起來（以前硬切時要藏，是因為鏡頭就在它裡面）
      head.rotation.y = aimYaw + Math.sin(frame.time * 0.7) * 0.42;
      light.visible = Math.sin(frame.time * 4) > -0.3;
      // 松樹隨風微微擺動
      pines.children.forEach((pine, i) => (pine.rotation.z = Math.sin(frame.time * 0.8 + i * 1.9) * 0.014));
    },
  };
}
