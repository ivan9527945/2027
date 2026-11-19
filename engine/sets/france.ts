// france 的 3D 場景：共和廣場（PRD-3D 6.7）。
// 奧斯曼建築圍出一座廣場，中央是立在圓柱基座上的瑪麗安娜像，四排群眾站在雕像前，中間留一條走道給鏡頭穿過去；
// 廣場右邊橫著一條斷管：照封面的位置關係，左半段躺在一棟奧斯曼建築的屋頂上，右半段的末端落在松樹的樹梢上，
// 斷口懸在投票箱的上方。軍靴從鏡頭這一側的上方踩下來，停在票箱旁邊。
//
// 節奏範本 goose。節拍對應：
//   strike 0.05        € 標語從人群裡舉起來、舉手的人開始跳（音效 flip）
//   reveal 0.08–0.30   鏡頭從群眾後方貼著頭的高度穿過走道往雕像推；有人爬上基座（0.14–0.27）
//   pushIn 0.12–0.46   出了人群後繞著雕像升高，到屋頂的高度回頭看整座廣場
//   rise 0.46–0.49     軍靴在右邊空地的上空出現；鏡頭開始往右邊橫移
//   jump 0.515–0.575   軍靴朝票箱那一側踩下來（鏡頭從高處往下看，靴子一路襯在白色的地面上，不會疊到管線）
//   land 0.575–0.64    停在票箱旁邊（沒有碰到），頓一下
//   walk 0.60–0.79     鏡頭看斷口：黑油拉長、小的那一滴往下掉（跟著捲動進度）；紅手拿著選票移到票箱上方
//   out 0.80           選票投進票箱（音效 click），close 0.795–0.835 紅色動感線閃出來
//   back 0.80–0.98     鏡頭退後：管線、軍靴、票箱、松樹同框
import {
  BackSide, Color, ConeGeometry, CylinderGeometry, DoubleSide, Euler, Group, Matrix4, Mesh, Quaternion, SphereGeometry, LatheGeometry, Vector2, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RepeatWrapping,
  Scene, ShaderMaterial, TorusGeometry, Vector3,
} from "three";
import type { InstancedMesh } from "three";
import { Snow, canvasTexture, clamp, deviceTier, envelope, linearstep, seededRandom, smooth, toonMaterial } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cardFromSprite, cylinder, extrude, faceCamera, lathe, makePalette, sphere } from "../shared/set/model";
import { bakeFigure, inkOutline, instancedCrowd, makeFigure } from "../shared/set/figure";
import type { FigureOptions } from "../shared/set/figure";
import { CROWD_ROWS } from "../chapters/france";
import { BLACK, DARK_RED, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：廣場的群眾漸漸安靜，只剩心跳和低鳴；標語舉起時一陣歡呼（0.05）；軍靴出現時倒放的鈸（0.47），踩下時一記重擊（0.575）；斷管的油滴（0.68）；選票投進票箱（0.8）。
const soundScript = soundTrack([[0, { crowd: 0.3, dread: 0.12 }], [0.45, { crowd: 0.12, dread: 0.25, heartbeat: 0.1 }], [0.8, { crowd: 0.08, dread: 0.2, whisper: 0.1 }]]);

const WALL_H = 3.0, ROOF_H = 0.85, BLOCK_D = 1.8; // 奧斯曼建築的牆高、屋頂高、進深
// 管線：半徑、高度（剛好躺在屋頂上）、深度、斷口位置、左右兩半的長度
const PIPE = { r: 0.42, y: WALL_H + ROOF_H + 0.42, z: -0.6, breakX: 14.85, left: 7.6, right: 3.4 };
const BOX = new Vector3(15.7, 0, 1.6); // 投票箱
const BOX_SIZE = [1.7, 1.15, 1.3];
const BOOT_REST = new Vector3(13.5, 1.55, 1.9); // 軍靴停下來的位置（鞋底中心）
const BOOT_DOWN = new Vector3(0.7, -0.5, 0.5).normalize(); // 鞋底朝的方向：往右（票箱那一側）、往下、稍微朝鏡頭
const BOOT_RAISE = new Vector3(-0.3, 2.5, 1.0); // 踩下來之前抬在哪裡（相對於停下來的位置）：比管線低、在管線的前面
const FOG: [number, number] = [16, 56]; // 霧的起點與終點（離鏡頭的距離）

// 奧斯曼建築的立面：照封面的畫法，黑牆上三道白色的檐口／陽台線，每道線底下掛一排兩條直線的長窗。一張圖是一個開間。
function makeFacadeTexture() {
  const texture = canvasTexture(128, 480, (ctx, w, h) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 10, w, 7);
    ctx.fillRect(0, 24, w, 3);
    for (let floor = 0; floor < 3; floor++) {
      const top = 44 + floor * 146;
      if (floor > 0) ctx.fillRect(0, top - 12, w, 5);
      for (const x of [46, 74]) ctx.fillRect(x, top + 10, 7, 100);
    }
  });
  texture.wrapS = RepeatWrapping;
  return texture;
}

// 廣場的鋪面：以雕像為圓心的同心圓和放射線。線條在透視下往雕像收攏，地面才看得出往遠處延伸。
function makePlazaTexture(size) {
  const px = 2048;
  const texture = canvasTexture(px, px, (ctx, w) => {
    const k = w / size; // 每個世界單位幾個像素
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 3;
    for (let r = 1.6; r < size * 0.72; r += 1.6) {
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, from = i % 3 ? 4.8 : 1.6;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * from * k, w / 2 + Math.sin(a) * from * k);
      ctx.lineTo(w / 2 + Math.cos(a) * size * k, w / 2 + Math.sin(a) * size * k);
      ctx.stroke();
    }
  });
  texture.anisotropy = 8;
  return texture;
}

const PAPER_LINE = "#f2efe6"; // 黑色的人物疊在黑色的建築、基座前時，用白色的描邊分開（封面上也是靠白邊）

/** 剪影的臉不要五官：拿掉鼻子（黑色鼻子的邊緣光和白色描邊，在黑色的臉上會變成一個圈） */
function plainFace(figure) {
  const head = figure.userData.joints.head;
  for (const o of [...head.children]) if (o.geometry?.parameters?.radius === 0.022) head.remove(o);
  return figure;
}

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

/** 把幾個 mesh 掛到人物的某個關節上，並替它們加上和人物一樣的描邊 */
function attach(joint, width, color, ...meshes) {
  for (const mesh of meshes) {
    inkOutline(mesh, { width, color });
    joint.add(mesh);
  }
}

// 白色的外框：把模型沿法線往外推一點、只畫背面。黑色的模型疊在黑色的東西前面時靠這一圈白邊分開；襯在白色背景前時看不到。
const hullMaterial = new ShaderMaterial({
  side: BackSide,
  uniforms: { uWidth: { value: 0.04 }, uColor: { value: new Color(WHITE) } },
  vertexShader: "uniform float uWidth; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normalize(normal) * uWidth, 1.0); }",
  fragmentShader: "uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0);\n#include <colorspace_fragment>\n}",
});
function addHull(...meshes) {
  for (const mesh of meshes) {
    const hull = new Mesh(mesh.geometry, hullMaterial);
    hull.userData.noShadow = true;
    mesh.add(hull);
  }
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

/** 不會動的群組（建築、雕像、樹林）烘成每個材質一個 mesh，省 draw call（第四輪：人物變成模型之後 draw call 變多） */
function bakeStatic(group) {
  const baked = bakeFigure(group);
  baked.position.copy(group.position);
  baked.quaternion.copy(group.quaternion);
  baked.scale.copy(group.scale);
  return baked;
}

export default function createFranceSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(40, 1, 0.05, 400);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.45, 0.8, 0.5]);
  addFog(scene, mat, WHITE, ...FOG); // 遠處的街廓淡進白色的天空
  const { strike, rise, jump, land, walk, out, close } = PACE.goose.beats;
  const random = seededRandom(67);

  // ---- 環境：白色的地面，上面是廣場的鋪面 ----
  scene.add(ground(WHITE, 400, -0.01));
  const plaza = ground(WHITE, 46, 0) as unknown as Mesh<PlaneGeometry, ShaderMaterial>; // 材質下一行換成 toonMaterial
  // 第四輪：鋪面改成卡通材質（永遠受光，只顯示投影陰影的排線），貼圖照舊；純色貼圖的 MeshBasicMaterial 接收不到陰影
  plaza.material = toonMaterial({ color: WHITE, shade: "#141414", threshold: -2, rim: 0, light: mat.light, map: makePlazaTexture(46) });
  plaza.material.uniforms.uFogColor.value.set(WHITE);
  [plaza.material.uniforms.uFogNear.value, plaza.material.uniforms.uFogFar.value] = FOG;
  plaza.position.x = 4;
  scene.add(plaza);

  // ---- #69 奧斯曼建築：黑色的方塊貼上立面，上面是真的斜屋頂、老虎窗和煙囪。左右各一棟 L 形的街廓圍住廣場 ----
  const facadeTexture = makeFacadeTexture();
  /** 一段街廓：長 length，立面朝本地的 +z，原點在底面中央 */
  function haussmannBlock(length, { chimneys = true } = {}) {
    const block = new Group();
    block.add(box(mat.ink, length, WALL_H, BLOCK_D, 0, WALL_H / 2, 0));
    const map = facadeTexture.clone();
    map.repeat.set(Math.round(length / 0.8), 1);
    map.needsUpdate = true;
    const facade = new Mesh(new PlaneGeometry(length, WALL_H), mat.flat(WHITE));
    facade.material.map = map;
    facade.position.set(0, WALL_H / 2, BLOCK_D / 2 + 0.01);
    facade.userData.noShadow = true;
    const rear = facade.clone(); // 背面也有立面：鏡頭繞到街廓後面時不會只看到一塊黑
    rear.position.z = -BLOCK_D / 2 - 0.01;
    rear.rotation.y = Math.PI;
    block.add(facade, rear);
    // 斜屋頂：梯形截面沿著街廓擠出
    const roof = extrude(mat.ink, [[-BLOCK_D / 2, 0], [BLOCK_D / 2, 0], [BLOCK_D / 2 - 0.45, ROOF_H], [-BLOCK_D / 2 + 0.45, ROOF_H]], length);
    roof.rotation.y = Math.PI / 2;
    roof.position.y = WALL_H;
    block.add(roof);
    // 第四輪：立面上真的陽台（白色的石板凸出牆面，底下一道黑色的托架線），對齊貼圖上兩道樓層線；牆腳一圈白色的勒腳
    for (const side of [1, -1]) {
      for (const y of [1.86, 0.95]) {
        const balcony = box(mat.paper, length - 0.1, 0.06, 0.16, 0, y, side * (BLOCK_D / 2 + 0.08));
        const rail = box(mat.ink, length - 0.1, 0.012, 0.012, 0, y + 0.22, side * (BLOCK_D / 2 + 0.15));
        rail.userData.noShadow = true;
        block.add(balcony, rail);
      }
      block.add(box(mat.paper, length + 0.02, 0.16, 0.05, 0, 0.08, side * (BLOCK_D / 2 + 0.025)));
    }
    // 凸出來的檐口（白）、老虎窗（白）與煙囪（黑）
    const cornice = box(mat.flat(WHITE), length + 0.06, 0.07, BLOCK_D + 0.14, 0, WALL_H - 0.02, 0);
    cornice.userData.noShadow = true;
    block.add(cornice);
    const bays = Math.round(length / 0.8);
    for (let i = 0; i < bays; i++) {
      const x = (i + 0.5 - bays / 2) * (length / bays);
      for (const side of [1, -1]) {
        const dormer = box(mat.flat(WHITE), 0.2, 0.32, 0.3, x, WALL_H + 0.36, side * (BLOCK_D / 2 - 0.27));
        const hood = box(mat.ink, 0.3, 0.1, 0.36, x, WALL_H + 0.56, side * (BLOCK_D / 2 - 0.27));
        dormer.userData.noShadow = hood.userData.noShadow = true;
        block.add(dormer, hood);
      }
      if (chimneys && i % 3 === 1) block.add(box(mat.ink, 0.24, 0.6, 0.3, x + 0.3, WALL_H + ROOF_H + 0.25, 0), box(mat.ink, 0.14, 0.4, 0.2, x + 0.56, WALL_H + ROOF_H + 0.15, 0));
    }
    return block;
  }
  const buildings = new Group();
  const leftBuilding = new Group(), rightBuilding = new Group();
  const backLeft = haussmannBlock(6.4), leftWing = haussmannBlock(13.6), backRight = haussmannBlock(5.6), rightWing = haussmannBlock(3.2);
  backLeft.position.set(-5.3, 0, -6.6); // 雕像背後留一條街，讓雕像襯在白色的天空前
  leftWing.position.set(-7.6, 0, 0.2);
  leftWing.rotation.y = Math.PI / 2;
  backRight.position.set(4.9, 0, -6.6);
  rightWing.position.set(6.8, 0, -4.9);
  rightWing.rotation.y = -Math.PI / 2;
  // 右邊那一棟往廣場外延伸的一段：封面上管線的左端就在右邊這棟建築的正上方，所以讓管線躺在它的屋頂上（屋脊上不放煙囪）
  const pipeBlock = haussmannBlock(3.6, { chimneys: false });
  pipeBlock.position.set(PIPE.breakX - 0.24 - PIPE.left + 1.5, 0, PIPE.z);
  leftBuilding.add(backLeft, leftWing);
  rightBuilding.add(backRight, rightWing, pipeBlock);
  buildings.add(leftBuilding, rightBuilding);
  const bakedBuildings = bakeStatic(buildings);
  register(69, bakedBuildings, { count: 2 });
  scene.add(bakedBuildings);
  // 遠處的街廓（同樣的奧斯曼建築，不另外登記）：淡進霧裡，交代廣場外面還有城市。雕像正後方那條街留空
  const city = new Group();
  for (const [x, z, turn, length] of [[-17, -16, 0.15, 11], [5, -23, -0.1, 10], [27, -13, -0.5, 9], [-29, -8, 1.2, 10], [32, -27, 0, 12], [37, -37, 0.1, 14], [-14, -32, 0, 12], [-36, -24, 0.6, 12]]) {
    const block = haussmannBlock(length);
    block.position.set(x, 0, z);
    block.rotation.y = turn;
    city.add(block);
  }
  scene.add(bakeStatic(city));

  // ---- #67 瑪麗安娜像：真的圓柱基座，上面的人像是多層厚紙板（平面版的圖，只取基座以上的部分），舉起的手臂和橄欖枝另外一疊、比身體靠前 ----
  const statue = new Group();
  const STEP = 0.3, DRUM_R = 0.56, DRUM_H = 1.25, NECK_R = 0.43, NECK_H = 0.5;
  const drumRadius = (y) => DRUM_R + 0.03 * (1 - clamp((y - STEP) / DRUM_H, 0, 1)); // 圓柱身往上微微收
  const RING_OUT = 0.08, CORNICE_OUT = 0.1; // 環、簷口凸出圓柱身多少
  const DRUM_RINGS = [STEP + 0.32, STEP + 0.64, STEP + 0.96]; // 圓柱身上三道環的上緣
  const NECK_RING = STEP + DRUM_H + 0.3; // 台座上那道環的上緣
  // 手腳的著力點：台階、三道環、簷口、台座的環；HOLD_R 是著力點離軸多遠（環的外緣；台階是站著時腳的位置）
  const HOLDS = [STEP, ...DRUM_RINGS, STEP + DRUM_H, NECK_RING];
  const HOLD_R = [0.8, ...DRUM_RINGS.map((y) => drumRadius(y) + RING_OUT), DRUM_R + CORNICE_OUT, NECK_R + RING_OUT * 0.8];
  const CLIMB_AZ = [0.96, -1.0]; // 兩個爬的人繞圓柱的方位角
  const FIGURE_Y = STEP + DRUM_H + NECK_H;
  const drum = cylinder(mat.ink, DRUM_R, DRUM_R + 0.03, DRUM_H, 0, STEP, 0, 32);
  const neck = cylinder(mat.ink, NECK_R, NECK_R, NECK_H, 0, STEP + DRUM_H, 0, 32);
  addHull(drum, neck); // 白邊：基座疊在後面黑色的建築前也分得出來
  statue.add(
    cylinder(mat.paper, 1.3, 1.36, STEP, 0, 0, 0, 40),
    cylinder(mat.ink, 1.32, 1.32, 0.04, 0, STEP - 0.02, 0, 40),
    drum, neck,
    cylinder(mat.ink, DRUM_R + 0.07, DRUM_R + 0.07, 0.09, 0, STEP, 0, 32), // 基座底下的一圈
    cylinder(mat.ink, NECK_R + 0.06, NECK_R + 0.06, 0.07, 0, FIGURE_Y - 0.07, 0, 32), // 人像腳下的一圈
    // 基座上的白色環線
    cylinder(mat.flat(WHITE), DRUM_R + 0.012, DRUM_R + 0.012, 0.04, 0, STEP + DRUM_H - 0.12, 0, 32),
    cylinder(mat.flat(WHITE), NECK_R + 0.012, NECK_R + 0.012, 0.04, 0, STEP + DRUM_H + NECK_H - 0.16, 0, 32),
  );
  // 基座的直線（封面上是拱門和幾道直線）：繞一圈的白色細條
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const line = box(mat.flat(WHITE), 0.028, DRUM_H * 0.62, 0.012, Math.sin(a) * (DRUM_R + 0.022), STEP + DRUM_H * 0.42, Math.cos(a) * (DRUM_R + 0.022));
    line.rotation.y = a;
    line.userData.noShadow = true;
    statue.add(line);
  }
  // 第五輪：基座刻出幾道凸出的線腳（moulding）當手腳的著力點：圓柱身上三道環、頂上一圈比較寬的簷口、簷口下一排齒狀的小方塊，
  // 上面那節（人像的台座）再一道環。每道環的上緣一條白線（封面上基座就是幾道白色的環線），黑色的環疊在黑色的基座上也看得出來。
  // 爬的人的手、腳就踩、抓在這些環上（HOLDS 是每道環的上緣高度、HOLD_R 是那個高度的著力點半徑）
  const ring = (r, h, top, line = true) => {
    statue.add(cylinder(mat.ink, r, r + 0.008, h, 0, top - h, 0, 40));
    if (line) {
      const edge = cylinder(mat.flat(WHITE), r + 0.004, r + 0.004, 0.014, 0, top - 0.016, 0, 40);
      edge.userData.noShadow = true;
      statue.add(edge);
    }
  };
  for (const top of DRUM_RINGS) ring(drumRadius(top) + RING_OUT, 0.07, top);
  ring(DRUM_R + CORNICE_OUT, 0.08, STEP + DRUM_H); // 簷口
  ring(NECK_R + RING_OUT * 0.8, 0.06, NECK_RING); // 台座上的環
  // 簷口下的齒狀方塊（dentil）：一圈 28 個
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const r = DRUM_R + 0.035;
    const dentil = box(mat.ink, 0.055, 0.06, 0.05, Math.sin(a) * r, STEP + DRUM_H - 0.11, Math.cos(a) * r);
    dentil.rotation.y = a;
    statue.add(dentil);
  }
  // 環與環之間的浮雕方塊：白框黑心的小石板，錯開直線、避開兩個爬的人的位置
  for (let band = 0; band < DRUM_RINGS.length; band++) {
    const y0 = band === 0 ? STEP + 0.09 : DRUM_RINGS[band - 1];
    const y1 = DRUM_RINGS[band] - 0.07;
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const world = a + 0.12; // 雕像整座轉了 0.12
      if (CLIMB_AZ.some((az) => Math.abs(Math.atan2(Math.sin(world - az), Math.cos(world - az))) < 0.55)) continue;
      if ((i + band) % 2) continue;
      const y = (y0 + y1) / 2, hgt = (y1 - y0) * 0.62, r = drumRadius(y);
      const frame = box(mat.flat(WHITE), 0.15, hgt + 0.03, 0.01, Math.sin(a) * (r + 0.006), y, Math.cos(a) * (r + 0.006));
      const slab = box(mat.ink, 0.12, hgt, 0.045, Math.sin(a) * (r + 0.012), y, Math.cos(a) * (r + 0.012));
      frame.rotation.y = slab.rotation.y = a;
      frame.userData.noShadow = true;
      statue.add(frame, slab);
    }
  }
  // 第四輪：人像改成立體人物。黑色的長袍從腰垂到腳（車床做的喇叭形，正面幾道白色的衣褶，胸前一條斜的白色披帶），
  // 頭上一圈月桂冠；右手（畫面左邊）高舉橄欖枝，左手在身側抱著一塊石板。外面一圈白色描邊，疊在黑色的建築前也分得出來
  const MARIANNE_H = 2.45, statueLine = (0.02 * 1.75) / MARIANNE_H;
  const marianne = makeFigure(mat, { suit: mat.ink, skin: mat.ink, hair: "bob", shirt: null, build: 1.12, height: MARIANNE_H, outline: PAPER_LINE, outlineWidth: 0.02 });
  plainFace(marianne);
  const mj = marianne.userData.joints;
  const gownProfile = [[0.15, 0.08], [0.17, -0.1], [0.2, -0.35], [0.25, -0.62], [0.31, -0.88], [0.33, -0.95], [0.0, -0.96]];
  const gown = new Mesh(new LatheGeometry(gownProfile.map(([r, y]) => new Vector2(r, y)), 28), mat.ink);
  gown.scale.z = 0.78;
  attach(mj.hips, statueLine, PAPER_LINE, gown);
  // 衣褶：從腰往下散開的白色細條，貼在長袍的表面上
  const radiusAt = (y) => { for (let k = 1; k < gownProfile.length; k++) { const [r0, y0] = gownProfile[k - 1], [r1, y1] = gownProfile[k]; if (y <= y0 && y >= y1) return r0 + ((y - y0) / (y1 - y0)) * (r1 - r0); } return 0.3; };
  for (const [angle, top, bottom] of [[-0.75, -0.2, -0.9], [-0.35, -0.05, -0.8], [0.05, -0.3, -0.93], [0.42, -0.12, -0.86], [0.8, -0.25, -0.9], [2.4, -0.2, -0.88], [3.1, -0.1, -0.9]]) {
    const a = new Vector3(Math.sin(angle) * (radiusAt(top) + 0.006), top, Math.cos(angle) * (radiusAt(top) + 0.006) * 0.78);
    const b = new Vector3(Math.sin(angle * 1.08) * (radiusAt(bottom) + 0.006), bottom, Math.cos(angle * 1.08) * (radiusAt(bottom) + 0.006) * 0.78);
    const fold = new Mesh(new CylinderGeometry(0.008, 0.012, a.distanceTo(b), 5), mat.paper);
    fold.position.copy(a).add(b).multiplyScalar(0.5);
    fold.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
    fold.userData.noOutline = true;
    mj.hips.add(fold);
  }
  const sash = box(mat.paper, 0.035, 0.6, 0.02, 0.0, 0.3, 0.112);
  sash.rotation.z = 0.62;
  sash.userData.noOutline = true;
  mj.spine.add(sash);
  const laurel = new Mesh(new TorusGeometry(0.105, 0.018, 6, 22), mat.ink);
  laurel.rotation.x = Math.PI / 2 - 0.15;
  laurel.position.set(0, 0.17, 0);
  attach(mj.head, statueLine, PAPER_LINE, laurel);
  for (let k = 0; k < 8; k++) { // 冠上的葉子
    const leaf = sphere(mat.ink, 0.03, Math.cos(k * 0.785) * 0.11, 0.2, Math.sin(k * 0.785) * 0.1, 8, 6);
    leaf.scale.set(0.6, 1.4, 0.6);
    mj.head.add(leaf);
  }
  // 橄欖枝：握在高舉的右手裡，一根枝條往上伸，兩側交錯長著葉子
  const branch = new Group();
  branch.add(cylinder(mat.ink, 0.012, 0.016, 0.42, 0, 0, 0, 6));
  for (let k = 0; k < 9; k++) {
    const leaf = sphere(mat.ink, 0.04, (k % 2 ? 1 : -1) * 0.045, 0.08 + k * 0.038, 0, 8, 6);
    leaf.scale.set(1.5, 0.55, 0.5);
    leaf.rotation.z = (k % 2 ? -1 : 1) * 0.6;
    branch.add(leaf);
  }
  branch.rotation.x = Math.PI; // 手臂舉起來之後，前臂的 -y 是朝上的
  branch.position.y = -0.3;
  attach(mj.elbowR, statueLine, PAPER_LINE, branch);
  const tablet = box(mat.ink, 0.04, 0.32, 0.24, 0.05, -0.22, 0.05);
  attach(mj.elbowL, statueLine, PAPER_LINE, tablet);
  marianne.userData.pose({ armR: [0.1, 0, -2.78], elbowR: [-0.25, 0, 0], armL: [-0.35, 0, 0.18], elbowL: [-1.1, 0, 0], head: [-0.08, 0.1, 0] });
  marianne.position.set(0.02, FIGURE_Y, 0);
  statue.add(marianne);
  statue.rotation.y = 0.12;
  const bakedStatue = bakeStatic(statue); // 雕像整座不動：烘成幾個 mesh
  register(67, bakedStatue);
  // 雕像周圍一圈白色的石砌圍邊（共和廣場的基座外圍），給地面一點起伏
  const kerb = new Mesh(new TorusGeometry(1.95, 0.1, 6, 48), mat.paper);
  kerb.rotation.x = Math.PI / 2;
  kerb.scale.z = 0.6;
  kerb.position.y = 0.03;
  scene.add(kerb);
  scene.add(bakedStatue);

  // ---- #68 攀上雕像的人：兩個有厚度的紙偶。右邊那個爬到圓柱頂上舉著手，左邊那個攀在基座上 ----
  const climbers = new Group();
  // 第五輪：真的一步一步爬。基座上的環是著力點（HOLDS 的索引），四肢照「右手、左腳、左手、右腳」的順序輪流往上換一格，
  // 每次只動一隻；手腳在世界座標裡落在環的上緣，身體（髖關節的高度）跟著四肢現在的位置算，換手腳的後半段才把身體撐上去。
  // 膝蓋大致朝著圓柱、只往外張一點；腳抬得高的時候身體往後讓一點，膝蓋才不會頂進基座。
  // az：方位角；start：開始爬的進度；moves：每一步 [肢體, 換到第幾個著力點]；slot：每一步佔多少進度；
  // final：爬完後站的位置（只有上面那個，翻上簷口站起來揮手）
  const START = { LH: 3, RH: 3, LF: 0, RF: 0 }; // 站在台階上，兩手扶著第三道環
  const CLIMB_MOVES = [["RH", 4], ["LF", 1], ["LH", 4], ["RF", 2], ["RH", 5], ["LF", 3], ["LH", 5], ["RF", 4]];
  const climbPaths = [
    { az: CLIMB_AZ[0], start: 0.14, slot: 0.0125, moves: CLIMB_MOVES, final: [0.43, STEP + DRUM_H, 0.3] }, // 爬到簷口上
    { az: CLIMB_AZ[1], start: 0.16, slot: 0.022, moves: CLIMB_MOVES.slice(0, 5), final: null }, // 爬到一半抱住
  ];
  const LIMB_AZ = { LH: -0.27, RH: 0.27, LF: -0.15, RF: 0.15 }; // 手腳離身體中線的方位角（臉朝圓柱，左邊是方位角減少的那一側）
  const climbHolds = (path, step) => {
    const h = { ...START };
    for (let n = 0; n < step; n++) h[path.moves[n][0]] = path.moves[n][1];
    return h;
  };
  // 四肢在某個著力點時，髖關節該在多高：膝蓋微彎地踩著、高的那隻腳不會壓到底，手也搆得到
  const hipsFor = (h) => {
    const lf = HOLDS[h.LF], rf = HOLDS[h.RF], hand = Math.max(HOLDS[h.LH], HOLDS[h.RH]);
    return Math.min(Math.max((lf + rf) / 2 + 0.58, Math.max(lf, rf) + 0.3, hand - 0.96), Math.min(lf, rf) + 0.76);
  };
  // 第四輪：兩個立體人物（黑衣、白色描邊）。爬的時候兩手輪流往上抓、腿一蹬一蹬；爬到位之後，上面那個舉手揮動，下面那個抱著基座
  for (const [k, look] of [[0, { hair: "short" }], [1, { hair: "cap" }]] as [number, FigureOptions][]) {
    const climber = makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: null, height: 1.5, outline: PAPER_LINE, outlineWidth: 0.02, ...look });
    plainFace(climber);
    climber.userData.side = k;
    climbers.add(climber);
  }
  register(68, climbers);
  scene.add(climbers);

  // ---- #70 群眾（第四輪：立體人物）：四十個黑衣人排四排，面向雕像（鏡頭從背後穿過走道），白色描邊。
  //      照平面版每個人舉哪隻手（沒舉、左、右、雙手）分成幾種姿勢，每種先擺好姿勢烘成一個 mesh，再用 InstancedMesh 複製；
  //      每一幀只更新每個人的位置（舉手的人在跳）。每個人的前後位置和高矮都差一點；中間留一條走道給鏡頭穿過去 ----
  const crowd = new Group();
  const rowSizes = [11, 10, 8, 11], rowZ = [2.5, 3.4, 4.3, 5.3];
  const crowdLine = 0.022;
  const crowdVariants: Record<string, { baked: Group; members: any[]; group?: Group }> = {};
  const variantOf = (arms, n) => {
    const key = arms + (arms === "" ? n % 3 : "");
    if (!crowdVariants[key]) {
      const hair = ["short", "long", "curly", "cap"][(n + arms.length) % 4];
      const person = makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: null, hair, build: 1 + (n % 2) * 0.1, coat: n % 3 === 1 ? mat.ink : undefined, outline: PAPER_LINE, outlineWidth: crowdLine });
      const up = (side) => (side === "L" ? { armL: [-0.15, 0, 2.7], elbowL: -0.2 } : { armR: [-0.15, 0, -2.7], elbowR: -0.2 });
      person.userData.pose({ armL: [0.05, 0, 0.12], armR: [0.05, 0, -0.12], ...(arms.includes("L") ? up("L") : {}), ...(arms.includes("R") ? up("R") : {}), head: [arms ? -0.25 : -0.05, 0, 0] });
      crowdVariants[key] = { baked: bakeFigure(plainFace(person)), members: [] };
    }
    return crowdVariants[key];
  };
  const crowdPeople = [];
  let personIndex = 0;
  rowSizes.forEach((size, row) => {
    for (let i = 0; i < size; i++) {
      const arms = CROWD_ROWS[row].people[i][2];
      const variant = variantOf(arms, personIndex);
      let x = (i - (size - 1) / 2) * 0.6;
      x += (x === 0 ? (row % 2 ? 1 : -1) : Math.sign(x)) * 0.45; // 讓出走道
      const sprite = flat.parts.crowd.children[personIndex++];
      const person: { x: number; z: number; scale: number; raised: boolean; phase: number; variant: any; slot: number; turn?: number } = {
        x: x + (random() - 0.5) * 0.16, z: rowZ[row] + (random() - 0.5) * 0.62, scale: (1.2 / 1.75) * (0.94 + 0.16 * random()),
        raised: arms !== "", phase: sprite.userData.phase, variant, slot: variant.members.length,
      };
      person.turn = Math.atan2(-person.x, -person.z) + (random() - 0.5) * 0.3; // 面向雕像
      variant.members.push(person);
      crowdPeople.push(person);
    }
  });
  const crowdMatrix = new Matrix4(), crowdQuat = new Quaternion(), crowdEuler = new Euler(), crowdPos = new Vector3(), crowdScale = new Vector3();
  const placePerson = (person, lift, squash, sway) => {
    crowdPos.set(person.x, lift, person.z);
    crowdQuat.setFromEuler(crowdEuler.set(0, person.turn + sway, 0));
    crowdScale.set(person.scale, person.scale * squash, person.scale);
    return crowdMatrix.compose(crowdPos, crowdQuat, crowdScale);
  };
  for (const variant of Object.values(crowdVariants)) {
    variant.group = instancedCrowd(variant.baked, variant.members.map((person) => placePerson(person, 0, 1, 0).clone()));
    crowd.add(variant.group);
  }
  register(70, crowd, { count: 40 });
  scene.add(crowd);

  // ---- #71 裂開的 € 標語：一塊有厚度的牌子（黑色的厚板，正面貼平面版的圖），兩根長桿把它舉到人群的頭上 ----
  const BANNER_SCALE = 4.2;
  const banner = new Group();
  const bannerFace = cardFromSprite(flat.parts.banner, BANNER_SCALE);
  const signOutline = [[777, 885], [810, 879], [817, 909], [783, 914.5]].map(([px, py]) => [((px - 797) / 100) * BANNER_SCALE, ((918 - py) / 100) * BANNER_SCALE]);
  const signCenter = [0, 1, 2, 3].reduce(([cx, cy], i) => [cx + signOutline[i][0] / 4, cy + signOutline[i][1] / 4], [0, 0]);
  const slab = extrude(mat.ink, signOutline.map(([x, y]) => [signCenter[0] + (x - signCenter[0]) * 1.08, signCenter[1] + (y - signCenter[1]) * 1.08]), 0.1);
  bannerFace.position.z = 0.056;
  bannerFace.userData.noShadow = true;
  banner.add(slab, bannerFace);
  for (const x of [-0.5, 0.62]) banner.add(cylinder(mat.ink, 0.03, 0.03, 2.9, x, -2.5, -0.02, 8));
  const BANNER_AT = [1.75, 2.3, 4.75];
  banner.rotation.y = -0.3;
  register(71, banner);
  scene.add(banner);

  // ---- #72 斷裂的管線：兩段真的圓柱，斷口兩側是法蘭；上半受光是紅的、下半是黑的。兩滴黑油 ----
  // 管線專用的材質：光從正上方來，所以從側面看只有上緣一條是紅的（封面上的畫法）
  const pipeMaterial = toonMaterial({ color: RED, shade: BLACK, light: new Vector3(0, 1, -0.15), rim: 0, threshold: 0.15, side: DoubleSide });
  pipeMaterial.uniforms.uFogColor.value.set(WHITE);
  pipeMaterial.uniforms.uFogNear.value = FOG[0];
  pipeMaterial.uniforms.uFogFar.value = FOG[1];
  const pipeline = new Group();
  function pipeHalf(length) {
    // 本地座標：斷口在 x = 0，管身往 -x 延伸
    const half = new Group();
    const body = new CylinderGeometry(PIPE.r, PIPE.r, length, 28, 1, true);
    const position = body.attributes.position;
    for (let i = 0; i < position.count; i++) if (position.getY(i) < 0) position.setY(i, position.getY(i) + 0.05 + random() * 0.34); // 斷口：參差不齊的邊
    body.rotateZ(Math.PI / 2);
    body.translate(-length / 2, 0, 0);
    body.computeVertexNormals();
    half.add(new Mesh(body, pipeMaterial));
    half.add(sphere(pipeMaterial, PIPE.r, -length, 0, 0, 24, 16)); // 圓頭的末端
    // 管子裡面是黑的
    const inside = new Mesh(new CylinderGeometry(PIPE.r * 0.96, PIPE.r * 0.96, 0.02, 24), mat.flat(BLACK));
    inside.rotation.z = Math.PI / 2;
    inside.position.x = -0.42;
    half.add(inside);
    // 法蘭：比管身粗的一圈，上面兩道紅色的箍，周圍一圈螺栓
    const flange = new Mesh(new CylinderGeometry(PIPE.r + 0.13, PIPE.r + 0.13, 0.52, 28), mat.flat(BLACK));
    flange.rotation.z = Math.PI / 2;
    flange.position.x = -0.72;
    half.add(flange);
    for (const x of [-0.6, -0.84]) {
      const ring = new Mesh(new TorusGeometry(PIPE.r + 0.13, 0.035, 8, 32), mat.flat(RED));
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      half.add(ring);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bolt = box(mat.flat(BLACK), 0.1, 0.07, 0.07, -1.0, Math.cos(a) * (PIPE.r + 0.07), Math.sin(a) * (PIPE.r + 0.07));
      bolt.userData.noShadow = true;
      half.add(bolt);
    }
    return half;
  }
  const leftPipe = pipeHalf(PIPE.left), rightPipe = pipeHalf(PIPE.right);
  leftPipe.position.set(PIPE.breakX - 0.24, PIPE.y, PIPE.z);
  rightPipe.position.set(PIPE.breakX + 0.24, PIPE.y, PIPE.z);
  rightPipe.scale.x = -1;
  // 還連在斷口上的那一道：一條細流，底下垂著一大滴（車床做的水滴）。隨進度拉長
  const dropProfile = (r) => [[0, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.78, r * 0.75], [r * 0.34, r * 1.7], [0.012, r * 2.7]];
  const longDrip = new Group();
  const stream = cylinder(mat.flat(BLACK), 0.05, 0.075, 1, 0, -1, 0, 10); // 原點在頂端，往下 1 單位；用 scale.y 拉長
  const bigDrop = lathe(mat.flat(BLACK), dropProfile(0.16), 16);
  longDrip.add(stream, bigDrop, sphere(mat.flat(BLACK), 0.11, 0, 0.02, 0, 12, 8));
  longDrip.position.set(PIPE.breakX + 0.44, PIPE.y - PIPE.r + 0.06, PIPE.z + 0.05);
  // 小的那一滴：從左邊的斷口往下掉。位置完全由捲動進度決定
  const smallDrop = lathe(mat.flat(BLACK), dropProfile(0.1), 14);
  const smallDropTop = PIPE.y - PIPE.r - 0.1;
  smallDrop.position.set(PIPE.breakX - 0.36, smallDropTop, PIPE.z + 0.1);
  pipeline.add(leftPipe, rightPipe, longDrip, smallDrop);
  register(72, pipeline);
  scene.add(pipeline);

  // ---- #73 軍靴：真的模型（鞋底、紅色鞋底紋、鞋面、靴筒、紅鞋帶、提環）。鞋底朝著票箱那一側 ----
  const boot = new Group(); // 本地座標：+x 是鞋尖、+y 是靴筒、原點在鞋底中心
  const soleOutline = [[-0.76, -0.2], [-0.82, 0], [-0.76, 0.2], [-0.5, 0.26], [-0.2, 0.2], [0.15, 0.3], [0.5, 0.33], [0.75, 0.22], [0.82, 0], [0.75, -0.22], [0.5, -0.33], [0.15, -0.3], [-0.2, -0.2], [-0.5, -0.26]];
  const sole = extrude(mat.flat(BLACK), soleOutline, 0.16);
  sole.rotation.x = -Math.PI / 2;
  sole.position.y = 0.08;
  const welt = extrude(mat.flat(RED), soleOutline.map(([x, y]) => [x * 1.03, y * 1.05]), 0.035); // 鞋面與鞋底之間的紅色縫線
  welt.rotation.x = -Math.PI / 2;
  welt.position.y = 0.178;
  const vamp = sphere(mat.ink, 1, 0.2, 0.3, 0, 20, 14);
  vamp.scale.set(0.64, 0.32, 0.3);
  const loop = new Mesh(new TorusGeometry(0.08, 0.026, 8, 16), mat.flat(BLACK));
  loop.position.set(-0.77, 1.27, 0);
  const shaft = [cylinder(mat.ink, 0.27, 0.3, 0.5, -0.45, 0.15, 0, 18), cylinder(mat.ink, 0.26, 0.27, 0.78, -0.47, 0.6, 0, 18), cylinder(mat.ink, 0.285, 0.285, 0.07, -0.47, 1.34, 0, 18)];
  addHull(sole, loop, ...shaft); // 白邊：靴子經過黑色的建築或管線前面時輪廓還在
  boot.add(sole, welt, vamp, loop, ...shaft);
  // 鞋帶：靴筒正面四道紅色橫條
  for (const [x, y, tilt] of [[-0.21, 1.2, 0], [-0.2, 1.0, 0], [-0.17, 0.8, -0.2], [-0.03, 0.62, -0.7]]) {
    const lace = box(mat.flat(RED), 0.05, 0.055, 0.3, x, y, 0);
    lace.rotation.z = tilt;
    boot.add(lace);
  }
  // 鞋底紋：前掌五塊、後跟兩塊（封面上是七塊紅色的方塊）
  for (const [x, z] of [[0.62, 0.12], [0.62, -0.12], [0.4, 0.17], [0.4, -0.17], [0.17, 0], [-0.46, 0], [-0.66, 0]]) boot.add(box(mat.flat(RED), 0.15, 0.07, 0.2, x, -0.03, z));
  {
    // 擺成封面上的姿勢：靴筒在左上，鞋尖朝右上，鞋底朝右下（票箱那一側）並稍微朝鏡頭
    const yAxis = BOOT_DOWN.clone().negate();
    const xAxis = new Vector3(0.5, 0.8, -0.05);
    xAxis.addScaledVector(yAxis, -xAxis.dot(yAxis)).normalize();
    boot.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xAxis, yAxis, new Vector3().crossVectors(xAxis, yAxis)));
  }
  register(73, boot);
  scene.add(boot);

  // ---- #74 投票箱：真的箱子，紅色的頂面上一道投票口；紅手是有厚度的模型（袖子、手掌、選票各自擠出，正反兩面貼平面版的圖） ----
  const ballot = new Group();
  const [boxW, boxH, boxD] = BOX_SIZE;
  const ballotBox = new Group();
  ballotBox.add(
    box(mat.ink, boxW, boxH, boxD, 0, boxH / 2, 0),
    box(mat.flat(RED), boxW, 0.05, boxD, 0, boxH + 0.025, 0),
    box(mat.flat(BLACK), boxW * 0.5, 0.02, 0.2, 0, boxH + 0.055, 0), // 投票口
    // 側面的紅色飾線
    box(mat.flat(RED), boxW * 0.62, 0.045, 0.02, 0.12, boxH * 0.8, boxD / 2 + 0.006),
    box(mat.flat(RED), 0.045, boxH * 0.56, 0.02, boxW * 0.37, boxH * 0.54, boxD / 2 + 0.006),
    box(mat.flat(RED), 0.045, boxH * 0.7, 0.02, -boxW * 0.4, boxH * 0.45, boxD / 2 + 0.006),
    box(mat.flat(RED), 0.02, 0.045, boxD * 0.5, -boxW / 2 - 0.006, boxH * 0.8, -0.1),
    box(mat.flat(RED), 0.02, boxH * 0.6, 0.045, -boxW / 2 - 0.006, boxH * 0.5, boxD * 0.3),
  );
  ballotBox.position.copy(BOX);
  ballotBox.rotation.y = 0.3;
  // 紅手：以投票口為軸轉向鏡頭，選票的下緣一直對著投票口。本地座標的原點是選票下緣（封面 927.5, 889.5）
  const HAND_SCALE = 2.2;
  const fromCover = ([px, py]): [number, number] => [((px - 927.5) / 100) * HAND_SCALE, ((889.5 - py) / 100) * HAND_SCALE];
  const handPivot = new Group();
  const hand = new Group();
  const sleeveCorners = [[-10.5, -11], [10.5, -11], [10.5, 11], [-10.5, 11]].map(([x, y]) => [968.5 + x * Math.cos(-0.33) - y * Math.sin(-0.33), 859 + x * Math.sin(-0.33) + y * Math.cos(-0.33)]);
  const palm = extrude(mat.red, [[959, 855], [962, 869], [951, 874], [942, 880], [936, 882], [929, 876], [927, 868], [934, 860], [946, 856]].map(fromCover), 0.24, { bevel: 0.03 });
  const sleeve = extrude(mat.ink, sleeveCorners.map(fromCover), 0.3);
  const cuff = extrude(mat.flat(RED), [[957.2, 853.2], [959.6, 852.6], [963.6, 871], [961.2, 871.6]].map(fromCover), 0.33);
  const slip = extrude(mat.red, [[925, 871], [941, 876.5], [935.5, 893.5], [919.5, 890]].map(fromCover), 0.05);
  hand.add(sleeve, cuff, palm, slip);
  for (const side of [1, -1]) {
    const face = cardFromSprite(flat.parts.hand, HAND_SCALE); // 正反兩面貼上畫好的圖：拇指、選票上的 X、袖口的紅線
    face.position.set(...fromCover([950.5, 898]), side * 0.166);
    face.userData.noShadow = true;
    hand.add(face);
  }
  // 動感線：三根紅色的短棒，以它們的中心（封面 903, 870）為原點放大
  const motionLines = new Group();
  const [linesX, linesY] = fromCover([903, 870]);
  for (const [[x0, y0], [x1, y1]] of [[[905.5, 858], [911, 872]], [[900, 868], [905.5, 874]], [[894, 877.6], [907, 880]]].map((stroke) => stroke.map(fromCover))) {
    const bar = box(mat.flat(RED), Math.hypot(x1 - x0, y1 - y0), 0.05, 0.05, (x0 + x1) / 2 - linesX, (y0 + y1) / 2 - linesY, 0);
    bar.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    motionLines.add(bar);
  }
  motionLines.position.set(linesX, linesY, 0);
  handPivot.add(hand, motionLines);
  handPivot.position.set(BOX.x, boxH + 0.06, BOX.z);
  ballot.add(ballotBox, handPivot);
  register(74, ballot);
  scene.add(ballot);

  // ---- #75 兩棵松樹：真的模型（樹幹加一層層鋸齒邊的圓錐）。後面那一棵的樹梢頂著管線的右端（封面上它就在管線右端的正下方），前面那一棵比較大 ----
  const pines = new Group();
  for (const [x, z, height] of [[PIPE.breakX + 0.24 + PIPE.right - 0.5, PIPE.z, PIPE.y - PIPE.r + 0.14], [20.6, 0.9, 3.7]]) {
    const pine = pineModel(mat.ink, height, random);
    pine.position.set(x, 0, z);
    pines.add(pine);
  }
  register(75, pines, { count: 2 });
  scene.add(pines);

  // ---- 空氣：廣場上被風帶著走的塵土 ----
  const dust = new Snow({ count: Math.round(200 * deviceTier.particleScale), box: new Vector3(34, 7, 18), center: new Vector3(7, 3.6, 2), size: 36, speed: 0.08, wind: 0.8, color: BLACK });
  scene.add(dust);


  // ---- 鏡頭 ----
  // 2026-11-19 第三輪（鏡頭要順）：整章只剩兩次推拉反轉（約 0.5、0.83）。
  // 0.27 之前：貼著頭的高度穿過走道，視線從群眾的背影慢慢抬到雕像上，和注視點的距離幾乎不變（不再一路推到雕像腳下）；
  // 0.27–0.52：繞過雕像、一路升高並往右後方退，橫越廣場，停在右邊空地的高處（軍靴在這裡出現、踩下來）；
  // 0.5–0.82：一路降下來推近：軍靴落地 → 斷口與黑油 → 票箱與紅手；0.82 之後一路退後，四樣東西同框。
  const track = makeCameraTrack([
    { t: -0.3, pos: [0.5, 1.0, 10.6], at: [0.2, 1.9, 6.4], fov: 44 }, // 群眾的後方，低角度看著人群
    { t: strike, pos: [0.25, 1.15, 8.9], at: [0.1, 2.2, 4.6], fov: 44 }, // € 標語舉起來
    { t: 0.14, pos: [0.05, 1.25, 7.0], at: [0, 2.5, 2.7], fov: 44 }, // 走進走道
    { t: 0.21, pos: [0, 1.3, 5.6], at: [0, 2.9, 1.0], fov: 44 }, // 走道裡，兩邊是頭和舉起的手，視線抬向雕像
    { t: 0.27, pos: [0.2, 1.4, 4.4], at: [0, 3.5, -0.6], fov: 44 }, // 出了人群，仰看雕像和爬上去的人
    { t: 0.34, pos: [1.6, 3.4, 3.6], at: [0.4, 3.4, -2.0], fov: 44 }, // 繞著雕像升高（從標語的內側上去，不穿過它）
    { t: 0.41, pos: [4.2, 4.6, 6.6], at: [3.8, 3.2, -0.4], fov: 44 }, // 一邊往右後方退，一邊轉向右邊的空地
    { t: 0.47, pos: [7.4, 5.8, 10.0], at: [10.4, 2.9, 1.0], fov: 43 },
    { t: 0.54, pos: [10.4, 6.4, 11.6], at: [13.8, 2.6, 1.6], fov: 42 }, // 右邊空地的高處：軍靴從上空踩下來
    { t: 0.6, pos: [12.6, 4.8, 10.2], at: [14.2, 2.0, 1.5], fov: 40 }, // 軍靴落地，停在票箱旁邊
    { t: 0.67, pos: [14.0, 3.6, 7.4], at: [PIPE.breakX, 3.35, PIPE.z], fov: 38 }, // 斷口與黑油
    { t: 0.76, pos: [16.1, 2.0, 6.6], at: [BOX.x + 0.1, 1.45, BOX.z], fov: 36 }, // 票箱與紅手
    { t: 0.82, pos: [16.0, 1.95, 6.4], at: [BOX.x + 0.1, 1.4, BOX.z], fov: 36 },
    { t: 1.0, pos: [15.0, 2.4, 11.6], at: [15.0, 2.4, 0.4], fov: 40 }, // 退後：四樣東西同框
    { t: 1.3, pos: [15.0, 2.6, 12.4], at: [15.0, 2.4, 0.4], fov: 40 },
  ]);
  const bootPosition = new Vector3();

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList(pacedCues("goose", ["crowdRoar", "ballot"]), [{ at: 0.47, cue: "reverseSwell" }, { at: 0.575, cue: "stomp" }, { at: 0.58, cue: "lowHit" }, { at: 0.68, cue: "drip" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.04);
      dust.update(frame.time);

      // 觸發（0.05）：標語從人群裡舉起來，之後跟著口號上下晃
      const lifted = smooth(linearstep(p, strike, strike + 0.07));
      banner.position.set(BANNER_AT[0], BANNER_AT[1] - 1.3 * (1 - lifted) + lifted * Math.sin(frame.time * 3.1) * 0.03, BANNER_AT[2]);
      banner.rotation.z = lifted * Math.sin(frame.time * 2.3) * 0.04;

      // 群眾：舉手的人在跳，其他人只微微晃。軍靴踩下來的那一下（land）全體往下一縮
      const shouting = linearstep(p, strike, strike + 0.05);
      const cower = envelope(p, land[0], land[0] + 0.02, land[1], land[1] + 0.06);
      for (const person of crowdPeople) {
        const { raised, phase } = person;
        const hop = raised ? Math.abs(Math.sin(frame.time * 5.2 + phase)) * 0.09 : Math.max(0, Math.sin(frame.time * 2.2 + phase)) * 0.02;
        const sway = Math.sin(frame.time * 1.3 + phase) * 0.06 * (raised ? 1.5 : 1);
        const matrix = placePerson(person, shouting * hop * (1 - 0.8 * cower), 1 - 0.06 * cower - (raised ? 0.03 * shouting * Math.max(0, -Math.sin(frame.time * 5.2 + phase)) : 0), sway);
        for (const mesh of person.variant.group.children) mesh.setMatrixAt(person.slot, matrix);
      }
      for (const variant of Object.values(crowdVariants)) for (const mesh of variant.group.children) (mesh as InstancedMesh).instanceMatrix.needsUpdate = true;

      // 爬雕像的人：reveal 的時間裡爬上去，到位後跟著晃
      climbers.children.forEach((climber, i) => {
        const path = climbPaths[i];
        const j = climber.userData.joints;
        const k = 1.5 / 1.75; // 身高 1.5 的縮放
        // 現在在第幾步、這一步走了多少（m：換手腳的進度，lift：身體跟著撐上去的進度）
        const total = path.moves.length;
        const u = clamp((p - path.start) / path.slot, 0, total);
        const step = Math.min(Math.floor(u), total - 1);
        const f = u >= total ? 1 : u - step;
        const before = climbHolds(path, step), after = climbHolds(path, step + 1);
        const [moving] = path.moves[step];
        const m = smooth(linearstep(f, 0.05, 0.6));
        // 換腳時身體在腳抬起來的同時就開始往上撐（不會整個人蹲坐在抬高的那隻腳上）；換手時等手抓穩了才往上
        const lift = moving[1] === "F" ? smooth(linearstep(f, 0.15, 0.95)) : smooth(linearstep(f, 0.4, 1));
        const hipsY = hipsFor(before) + (hipsFor(after) - hipsFor(before)) * lift;
        // 上面那個爬完之後翻上簷口、轉身揮手；下面那個一直攀著
        const done = path.final ? smooth(linearstep(p, path.start + path.slot * total, 0.272)) : 0;
        const rootY = hipsY - 0.95 * k;
        // 腳抬得愈高（髖關節離腳愈近），身體離基座愈遠一點；平常貼著環的外緣
        const footY = (side) => HOLDS[before[side]] + (HOLDS[after[side]] - HOLDS[before[side]]) * (moving === side ? m : 0);
        const crouch = clamp((0.62 - (hipsY - Math.max(footY("LF"), footY("RF")))) / 0.45, 0, 1);
        const hug = DRUM_R + 0.1 + 0.12 * crouch;
        const ux = Math.sin(path.az), uz = Math.cos(path.az);
        climber.position.set(ux * hug, rootY, uz * hug);
        climber.rotation.set(0, path.az + Math.PI, 0); // 臉朝圓柱的軸
        // 換手的時候身體往那一側側一點、頭抬起來看上面的環
        const reach = moving[1] === "H" ? Math.sin(Math.PI * m) * (moving[0] === "L" ? 1 : -1) : 0;
        climber.userData.pose({ spine: [0.24 + 0.22 * crouch, 0, 0.06 * reach], neck: [-0.3, 0, 0], head: [-0.2 - 0.15 * Math.abs(reach), 0, 0], hips: [0, 0, 0] });
        climber.updateMatrixWorld(true);
        // 一隻手或腳的位置（世界座標）：在換的那一隻，從舊的環沿著往外鼓的弧線移到新的環
        const limbTarget = (side, yOffset, rOffset) => {
          const from = before[side], to = after[side];
          const t = moving === side ? m : 0;
          const y = HOLDS[from] + (HOLDS[to] - HOLDS[from]) * t + yOffset;
          let r = HOLD_R[from] + (HOLD_R[to] - HOLD_R[from]) * t + rOffset + 0.12 * Math.sin(Math.PI * t);
          const a = path.az + LIMB_AZ[side];
          return new Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
        };
        for (const [side, s] of [["L", 1], ["R", -1]] as [string, number][]) {
          // 手：抓在環的上緣，手肘朝下（往後一點、只往外一點，不會像翅膀一樣往旁邊撐開）
          solveLimb(j[`shoulder${side}`], j[`elbow${side}`], 0.3, 0.31, limbTarget(`${side}H`, 0.03, 0.01), new Vector3(s * 0.25, -1, -0.5), -1);
          // 腳：鞋底踩在環上；膝蓋朝圓柱和上方（腳抬到髖關節的高度時膝蓋往上頂，不會往旁邊撇），只往外張一點
          solveLimb(j[`hip${side}`], j[`knee${side}`], 0.45, 0.47, limbTarget(`${side}F`, 0.035, 0.0), new Vector3(s * 0.35, 0.8, 0.9), 1);
        }
        if (done > 0) {
          // 翻上頂面：從貼著圓柱的姿勢慢慢換成站著揮手，身體移到頂面的平台上、轉向鏡頭
          const wave = Math.sin(frame.time * 4 + i * 2) * 0.35;
          const names = ["shoulderL", "elbowL", "shoulderR", "elbowR", "hipL", "kneeL", "hipR", "kneeR", "spine", "neck", "head"];
          const from = names.map((name) => j[name].quaternion.clone());
          climber.userData.pose({
            armL: [0, 0, 2.75 + wave * 0.4], elbowL: [-0.25 + wave * 0.3, 0, 0], armR: [-0.2, 0, -0.2], elbowR: [-0.3, 0, 0],
            hipL: [0, 0, 0], kneeL: [0, 0, 0], hipR: [-0.1, 0, 0], kneeR: [0.15, 0, 0], spine: [0, 0, 0], neck: [0, 0, 0], head: [0.1, 0, 0],
          });
          names.forEach((name, n) => j[name].quaternion.slerpQuaternions(from[n], j[name].quaternion.clone(), done));
          const [fx, fy, fz] = path.final;
          climber.position.set(climber.position.x + (fx - climber.position.x) * done, rootY + (fy - rootY) * done, climber.position.z + (fz - climber.position.z) * done);
          const inward = climber.rotation.y;
          faceCamera(climber, camera, 0.6, 0);
          let turn = climber.rotation.y - inward;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          climber.rotation.set(0, inward + turn * done, done * Math.sin(frame.time * 3 + i * 2) * 0.04);
        }
      });

      // 軍靴：rise 時從鏡頭這一側的上方進來，jump 朝票箱那一側踩下來，land 停在票箱旁邊頓一下（不碰到票箱）。
      // 抬起來的位置比管線低、在管線前面，鏡頭又在高處，所以整段都襯在白色的地面上
      const raisedUp = 1 - smooth(linearstep(p, jump[0], jump[1]));
      const shown = smooth(linearstep(p, rise[0] - 0.02, rise[1]));
      const thud = envelope(p, jump[1], land[0] + 0.012, land[0] + 0.02, land[1]);
      bootPosition.copy(BOOT_REST).addScaledVector(BOOT_RAISE, raisedUp).addScaledVector(BOOT_DOWN, 0.14 * thud);
      bootPosition.y += 3.0 * (1 - shown);
      bootPosition.z += 5.0 * (1 - shown);
      boot.position.copy(bootPosition);
      boot.visible = shown > 0;

      // 黑油：連在斷口上的那一道隨進度拉長；小的那一滴跟著進度一滴一滴往下掉（倒著捲就倒著飛回去）
      const stretch = 0.4 + 1.0 * smooth(linearstep(p, walk[0], walk[0] + 0.14));
      stream.scale.y = stretch;
      stream.position.y = -stretch / 2;
      bigDrop.position.y = -stretch - 0.1;
      const drips = Math.max(0, p - rise[0]) * 7.5;
      const fall = drips - Math.floor(drips);
      smallDrop.position.y = smallDropTop - (smallDropTop - 0.12) * fall * fall;
      smallDrop.scale.setScalar(Math.min(1, 0.25 + fall * 5) * (1 - linearstep(fall, 0.93, 1)));

      // 紅手：walk 的後半段把選票移到票箱上方，out（0.80）投進去；動感線在 close 那一段閃出來
      const cast = smooth(linearstep(p, walk[1] - 0.07, out));
      hand.position.set(0.3 * (1 - cast), 0.55 * (1 - cast), 0);
      faceCamera(handPivot, camera);
      const flash = linearstep(p, close[0], close[1]);
      motionLines.visible = flash > 0;
      motionLines.scale.setScalar(0.6 + 0.4 * smooth(flash) + 0.12 * envelope(p, close[0], close[0] + 0.015, close[1] - 0.01, close[1] + 0.02));

      // 松樹隨風微微擺動
      pines.children.forEach((pine, i) => (pine.rotation.z = Math.sin(frame.time * 0.9 + i * 1.7) * 0.012));
    },
  };
}
