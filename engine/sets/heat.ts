// heat 的 3D 場景：燒起來的山坡（PRD-3D 6.11）。
// 一座長滿松樹的黑色山丘（真的地形），火在稜線後面一層層燒上來，雄鹿站在坡頂。
// 山腳是乾裂的農地：農民、兩頭牛、松樹和草叢。溫度計插在右前方的地上，更遠的山脊上有兩座風機，再遠一層山淡在霧裡。
// 黑色的松樹長在黑色的山坡上，所以每一棵背後都墊一圈紅色的火光（火起來之後才亮）；
// 結尾火線燒到山腳，鏡頭壓低：牛的背後是一排火牆（黑色剪影落在紅色前面，和封面上雄鹿的畫法一樣），農民的背後是白色的天。
//
// 節奏範本 stove，節拍對應：
//   strike   0.05          溫度計的紅柱一口氣衝過管口（音效 boom），頂端彈出三道放射線、濺出三滴
//   flash    [0.05, 0.14]  放射線彈開後輪流閃；鏡頭往後帶到溫度計和遠處山脊上的兩座風機
//   appear   [0.28, 0.42]  鏡頭往上搖，火舌從稜線後面竄起來，火星開始往上飄，火光照紅山坡
//   pullBack [0.30, 0.46]  升高、退後，看到整片燒著的山坡和坡頂的雄鹿
//   act      [0.60, 0.70]  推近雄鹿，牠驚跳一下
//   out      0.74          雄鹿再縮一下、站穩（音效 flip）；封面上牠一直都在，所以不消失
//   back     [0.76, 0.86]  鏡頭越過山坡降到山腳的農地、壓到接近地面：火線燒到山腳，牛走進來、低下頭，農民雙手插腰站著
import {
  BackSide, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, FrontSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene,
  ShaderMaterial, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";
import { Snow, canvasTexture, clamp, deviceTier, linearstep, seededRandom, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cardFromSprite, cylinder, extrude, faceCamera, lathe, makePalette, place, sphere } from "../shared/set/model";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";
import { bakeFigure, inkOutline, makeFigure } from "../shared/set/figure";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// 聲音（2026-11-19，陰森版）：溫度計衝破（0.05）；火從稜線竄起（0.3）燒成一片，底下是低鳴和低沉的合唱；雄鹿驚跳時驚悚的一記（0.62）、再縮一下（0.74）；山腳的牛叫（0.84）。
const soundScript = soundTrack([[0, { wind: 0.2, dread: 0.15 }], [0.28, { wind: 0.2, fire: 0.1, dread: 0.18 }], [0.4, { fire: 0.4, wind: 0.15, dread: 0.22, choir: 0.1 }], [0.76, { fire: 0.45, wind: 0.12, dread: 0.2, choir: 0.15 }]]);

const THERMO: [number, number, number] = [5, 0, 5];
const RIDGE = [19, -27]; // 遠處的山脊
const STAG = [-1.2, -6.9];
const HILL_CENTER = [-1.5, -7];

/** 山丘的高度：一個拉長的鐘形，加一點起伏；到農地前收成平地。 */
function hillHeight(x, z) {
  const g = Math.exp(-(((x - HILL_CENTER[0]) ** 2) / 50 + ((z - HILL_CENTER[1]) ** 2) / 16));
  const bumps = 1 + 0.07 * Math.sin(x * 1.3 + 1) * Math.cos(z * 0.9);
  return Math.max(0, 4.4 * g * bumps - 0.12);
}

/** 頂面斜切的圓柱（衝出管口的紅柱）。原點在底面中心，高度 1，用 scale.y 拉長。 */
function slantColumn(material, radius, slant) {
  const geometry = new CylinderGeometry(radius, radius, 1, 20);
  geometry.translate(0, 0.5, 0);
  const mesh = new Mesh(geometry, material);
  // 斜的頂蓋另外做，才不會跟著 scale.y 被拉長
  const capGeometry = new CylinderGeometry(radius, radius, slant * 2, 20);
  const position = capGeometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) position.setY(i, (position.getX(i) / radius) * slant);
    else position.setY(i, -slant);
  }
  capGeometry.computeVertexNormals();
  const cap = new Mesh(capGeometry, material);
  return { mesh, cap };
}

// 乾裂的農地：白底上一塊不規則的龜裂紋（錯開的磚形格子，頂點各自偏移）
function makeCrackTexture() {
  return canvasTexture(1536, 768, (ctx, w, h) => {
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, w, h);
    const random = seededRandom(93);
    const cols = 30, rows = 15, cw = w / cols, ch = h / rows;
    const vertex = [];
    for (let r = 0; r <= rows; r++) {
      vertex.push([]);
      for (let c = 0; c <= cols; c++) vertex[r].push([(c + (r % 2) * 0.5 + (random() - 0.5) * 0.55) * cw, (r + (random() - 0.5) * 0.6) * ch]);
    }
    // 只在一塊邊緣參差的橢圓裡畫，四周留白
    const inside = ([x, y]) => ((x / w - 0.42) / 0.4) ** 2 + ((y / h - 0.56) / 0.36) ** 2 < 0.75 + 0.35 * Math.sin(x * 0.021) * Math.cos(y * 0.033);
    ctx.strokeStyle = BLACK;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const crack = (a, b) => {
      if (!inside(a) || !inside(b) || random() < 0.08) return;
      ctx.lineWidth = 2.2 + random() * 3.6;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo((a[0] + b[0]) / 2 + (random() - 0.5) * 9, (a[1] + b[1]) / 2 + (random() - 0.5) * 9);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    };
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        if (c < cols) crack(vertex[r][c], vertex[r][c + 1]);
        if (r < rows && (r + c) % 2 === 0) crack(vertex[r][c], vertex[r + 1][c]);
      }
    }
  });
}

// ---- 第四輪：動物、樹、草叢改成模型（幾何體拼、關節是 Group、外面描墨線），參考 gulf.js 的駱駝 ----

/**
 * 合併每個關節（Group）底下直接掛的 mesh：同材質的併成一個（描邊也一起併），關節本身留著可以轉。
 * 一頭牛原本約 45 個 mesh（加描邊 90 個），併完只剩每個關節「材質數 × 2」個。
 */
function mergeByJoint(root) {
  const groups = [];
  root.traverse((o) => !o.isMesh && groups.push(o));
  for (const group of groups) {
    const meshes = group.children.filter((c) => c.isMesh && !c.userData.isOutline);
    if (meshes.length < 2) continue;
    const byMaterial = new Map();
    const push = (material, geometry, matrix) => {
      const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
      g.applyMatrix4(matrix);
      if (!byMaterial.has(material)) byMaterial.set(material, []);
      byMaterial.get(material).push(g);
    };
    for (const mesh of meshes) {
      mesh.updateMatrix();
      push(mesh.material, mesh.geometry, mesh.matrix);
      for (const child of mesh.children) if (child.isMesh && child.userData.isOutline) push(child.material, child.geometry, mesh.matrix);
      group.remove(mesh);
    }
    for (const [material, geometries] of byMaterial) {
      const merged = new Mesh(mergeGeometries(geometries), material);
      if (material.side === BackSide && material.uniforms?.uWidth) merged.userData.isOutline = merged.userData.noShadow = true;
      group.add(merged);
    }
  }
  return root;
}

/** 沿著一串點走的圓管（脖子、尾巴、鹿角）。點是 [x, y, z]。 */
function tube(material, points, radius, radialSegments = 8) {
  const curve = new CatmullRomCurve3(points.map(([x, y, z = 0]) => new Vector3(x, y, z)));
  return new Mesh(new TubeGeometry(curve, Math.max(8, points.length * 6), radius, radialSegments, false), material);
}
/** 壓扁的球（身體、頭）。 */
function ellipsoid(material, rx, ry, rz, x = 0, y = 0, z = 0) {
  const m = sphere(material, 1, x, y, z, 22, 14);
  m.scale.set(rx, ry, rz);
  return m;
}
/** 一條四足動物的腿：髖關節（Group）→ 大腿 → 膝關節（Group）→ 小腿 → 蹄。回傳髖關節，userData.knee 是膝。 */
function animalLeg(material, x, y, z, upper, lower, r0, r1) {
  const hip = new Group();
  hip.position.set(x, y, z);
  hip.add(cylinder(material, r0, r0 * 0.75, upper, 0, -upper, 0, 10), sphere(material, r0, 0, 0, 0, 10, 8));
  const knee = new Group();
  knee.position.y = -upper;
  knee.add(sphere(material, r0 * 0.72, 0, 0, 0, 10, 8), cylinder(material, r1, r1 * 0.85, lower, 0, -lower, 0, 10));
  const hoof = ellipsoid(material, r1 * 1.3, r1 * 0.7, r1 * 1.2, -r1 * 0.3, -lower, 0);
  knee.add(hoof);
  hip.add(knee);
  hip.userData.knee = knee;
  return hip;
}

/**
 * 牛和雄鹿用的黑：mat.ink 的複本，邊緣光關掉、改用刮版畫的白線交代體積。
 * mat.ink 的邊緣光（0.9）會在身體、脖子、腿這些互相插在一起的球和圓柱的交界處各畫一圈白邊，
 * 看起來像一條條白色的光帶；關掉之後內部的交界全黑，輪廓交給外圈的墨線，受光面的白線讓牠們仍有圓的體積。
 * 每個調色盤只做一份（加進 mat.all，霧也會套到它）。
 */
const beastInks = new WeakMap();
function beastInk(mat) {
  if (!beastInks.has(mat)) {
    const material = mat.ink.clone();
    material.uniforms.uRim.value = 0;
    material.uniforms.uScratch.value = 0.85;
    material.uniforms.uHatch.value = 0.03;
    mat.all.push(material);
    beastInks.set(mat, material);
  }
  return beastInks.get(mat);
}

/**
 * 牛（封面 #105）：全黑的側影，臉朝 +x；厚實的方身、短腿、短角朝上彎、兩隻橫著的耳朵、細尾巴末端一撮毛。
 * 原點在四隻腳中間的地面。userData：neck（低頭繞 z 轉）、legs（[髖, 相位]）、tail。
 */
function buildCow(mat) {
  const g = new Group();
  const black = beastInk(mat);
  g.add(ellipsoid(black, 0.78, 0.36, 0.33, 0, 1.0, 0)); // 身體
  g.add(ellipsoid(black, 0.36, 0.38, 0.32, -0.42, 1.02, 0)); // 圓圓的屁股
  g.add(ellipsoid(black, 0.4, 0.42, 0.34, 0.42, 1.04, 0)); // 前胸
  g.add(ellipsoid(black, 0.32, 0.22, 0.26, 0.15, 0.72, 0)); // 下垂的肚子
  g.add(box(black, 0.6, 0.06, 0.3, 0.05, 1.33, 0)); // 背脊的稜線
  // 脖子與頭：頸根在前胸上方，低頭時整組繞 z 轉
  const neck = new Group();
  neck.position.set(0.68, 1.12, 0);
  neck.add(ellipsoid(black, 0.26, 0.24, 0.22, 0.12, 0.02, 0));
  const head = new Group();
  head.position.set(0.36, 0.08, 0);
  head.add(ellipsoid(black, 0.17, 0.2, 0.16, 0, 0, 0)); // 頭頂
  head.add(ellipsoid(black, 0.12, 0.14, 0.13, 0.13, -0.15, 0)); // 口鼻
  for (const z of [0.1, -0.1]) {
    head.add(tube(black, [[-0.02, 0.15, z * 0.8], [0.0, 0.25, z * 1.4], [0.08, 0.33, z * 1.5]], 0.025, 6)); // 短角往上彎
    const ear = ellipsoid(black, 0.1, 0.035, 0.05, -0.06, 0.06, z * 2.1);
    ear.rotation.z = -0.3;
    head.add(ear);
    head.add(sphere(mat.paper, 0.018, 0.07, 0.04, z * 1.35, 8, 6)); // 眼睛的一點白光
  }
  neck.add(head);
  g.add(neck);
  // 尾巴：從屁股垂下，末端一撮毛
  const tail = new Group();
  tail.position.set(-0.76, 1.2, 0);
  tail.add(tube(black, [[0, 0], [-0.1, -0.15], [-0.12, -0.4], [-0.1, -0.6]], 0.022, 6), ellipsoid(black, 0.05, 0.1, 0.05, -0.1, -0.64, 0));
  g.add(tail);
  const legs = [];
  for (const [x, z, phase] of [[0.5, 0.17, 0], [0.5, -0.17, Math.PI], [-0.5, 0.17, Math.PI], [-0.5, -0.17, 0]]) {
    const leg = animalLeg(black, x, 0.86, z, 0.42, 0.42, 0.1, 0.065);
    g.add(leg);
    legs.push([leg, phase]);
  }
  inkOutline(g, { width: 0.012 });
  mergeByJoint(g);
  g.userData = { neck, legs, tail };
  return g;
}

/**
 * 雄鹿（封面 #77）：全黑的側影，臉朝 -x（封面上朝左），長腿、細腰、脖子往前上方伸，頭上一對分叉的大角。
 * 原點在四隻腳中間的地面。userData：neck、legs、tail、head。
 */
function buildStag(mat) {
  const g = new Group();
  // 第五輪：雄鹿有自己的一份黑（beastInk 的複本），uLight 每一幀改成從鏡頭那一側、偏上偏左照過來（stagLight），
  // 這樣朝鏡頭的身體、脖子、腿、鹿角上才刻得出白線，看得出圓的體積；只改這一份材質的明暗，不影響場景的投影方向
  const black = beastInk(mat).clone();
  black.uniforms.uLight.value = new Vector3(0, 1, 0);
  black.uniforms.uRim.value = 0;
  black.uniforms.uScratch.value = 0.8; // 白線略淡，整體仍是黑色剪影
  black.uniforms.uHatch.value = 0.085; // 線距寬一點，近景時每條白線才有一兩個像素寬
  mat.all.push(black);
  g.add(ellipsoid(black, 0.52, 0.3, 0.25, 0, 0.9, 0));
  g.add(ellipsoid(black, 0.3, 0.33, 0.26, -0.3, 0.94, 0)); // 前胸
  g.add(ellipsoid(black, 0.27, 0.31, 0.25, 0.32, 0.94, 0)); // 後臀
  const neck = new Group();
  neck.position.set(-0.4, 1.04, 0);
  neck.add(tube(black, [[0, 0], [-0.12, 0.22], [-0.2, 0.46]], 0.13, 10));
  neck.add(ellipsoid(black, 0.12, 0.08, 0.12, -0.08, 0.3, 0)); // 喉下的鬃毛
  const head = new Group();
  head.position.set(-0.22, 0.52, 0);
  head.add(ellipsoid(black, 0.13, 0.1, 0.09, 0, 0, 0), ellipsoid(black, 0.12, 0.065, 0.06, -0.13, -0.04, 0));
  for (const z of [0.07, -0.07]) {
    const ear = ellipsoid(black, 0.03, 0.08, 0.025, 0.08, 0.08, z * 1.4);
    ear.rotation.z = -0.6;
    head.add(ear);
    // 鹿角：一根主幹往上、往後彎，沿途分出三根叉
    // 兩支角往左右張開成 V 字（封面上兩支角都看得到）
    const beam = [[0.04, 0.08, z], [0.04, 0.3, z * 3], [0.12, 0.55, z * 5], [0.22, 0.78, z * 6.2], [0.3, 0.95, z * 6.6]];
    head.add(tube(black, beam, 0.026, 6));
    for (const [from, to] of [[[0.04, 0.24, z * 2.6], [-0.16, 0.42, z * 3.2]], [[0.1, 0.48, z * 4.6], [-0.06, 0.74, z * 5.2]], [[0.2, 0.72, z * 6], [0.12, 0.98, z * 6.4]], [[0.26, 0.86, z * 6.5], [0.42, 1.02, z * 7.2]]]) {
      head.add(tube(black, [from, [(from[0] + to[0]) / 2 - 0.02, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2], to], 0.018, 6));
    }
  }
  neck.add(head);
  g.add(neck);
  const tail = new Group();
  tail.position.set(0.56, 1.02, 0);
  tail.add(ellipsoid(black, 0.07, 0.1, 0.05, 0.03, -0.06, 0));
  g.add(tail);
  const legs = [];
  for (const [x, z, phase] of [[-0.34, 0.1, 0], [-0.34, -0.1, Math.PI], [0.36, 0.1, Math.PI], [0.36, -0.1, 0]]) {
    const leg = animalLeg(black, x, 0.76, z * 1.4, 0.38, 0.38, 0.075, 0.04);
    g.add(leg);
    legs.push([leg, phase]);
  }
  inkOutline(g, { width: 0.012 });
  mergeByJoint(g);
  // 背後火光的邊：每個 mesh 加一層沿法線外擴、再往鏡頭的反方向推後的暖色殼（stagGlow）。
  // 殼整個在黑色身體的後面，只有超出外輪廓的那一細圈看得到；腿疊在身體前、脖子插進胸口這些內部交界都被黑色的身體蓋住，不會再出現白色的光帶
  const glow = stagGlow();
  const bodies = [];
  g.traverse((o) => (o as Mesh).isMesh && !o.userData.isOutline && bodies.push(o));
  for (const mesh of bodies) {
    const shell = new Mesh(mesh.geometry, glow);
    shell.userData.noShadow = shell.userData.isOutline = true;
    shell.raycast = () => {};
    mesh.add(shell);
  }
  g.userData = { neck, legs, tail, head, ink: black, glow };
  return g;
}

/** 雄鹿外輪廓的暖色光邊：沿法線外擴 uWidth、在觀察空間往後推 uPush（推到身體後面，內部交界不會亮），平塗一個顏色 */
function stagGlow() {
  return new ShaderMaterial({
    side: FrontSide,
    uniforms: { uWidth: { value: 0.02 }, uPush: { value: 0.35 }, uColor: { value: new Color("#ffb070") } },
    vertexShader: `
      uniform float uWidth, uPush;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position + normalize(normal) * uWidth, 1.0);
        gl_Position = projectionMatrix * mv;
        // 只把深度往後推（畫面上的位置不變），光邊的寬度不會因為推遠而縮小
        vec4 back = projectionMatrix * vec4(mv.xyz + normalize(mv.xyz) * uPush, 1.0);
        gl_Position.z = back.z / back.w * gl_Position.w;
      }`,
    fragmentShader: "uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0);\n#include <colorspace_fragment>\n}",
  });
}

/**
 * 松樹（封面 #115，和火場裡的松林同一種畫法）：細樹幹加五層往上收的鋸齒圓錐（每層邊緣是一圈尖角），烘成少數 mesh。
 * outline：墨線顏色（山坡上的松樹用紅色，當作背後的火光把黑色的樹勾出來）。
 */
function buildPine(mat, outline = "#050505", outlineWidth = 0.02) {
  const g = new Group();
  g.add(cylinder(mat.ink, 0.06, 0.09, 0.5, 0, 0, 0, 8));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 0.46 - t * 0.32, h = 0.72 - t * 0.2, y = 0.35 + i * 0.42;
    const cone = new Mesh(new ConeGeometry(r, h, 9, 1), mat.ink);
    // 每層的下緣做成鋸齒：奇數的頂點往外推（封面上松樹一層層的尖角）
    const position = cone.geometry.attributes.position;
    for (let v = 0; v < position.count; v++) {
      if (position.getY(v) < -h / 2 + 0.01) {
        const a = Math.atan2(position.getZ(v), position.getX(v));
        const k = 1 + 0.22 * Math.cos(a * 9);
        position.setX(v, position.getX(v) * k);
        position.setZ(v, position.getZ(v) * k);
        position.setY(v, position.getY(v) - 0.06 * Math.max(0, Math.cos(a * 9)));
      }
    }
    cone.geometry.computeVertexNormals();
    cone.position.y = y + h / 2;
    cone.rotation.y = i * 0.7;
    g.add(cone);
  }
  inkOutline(g, { width: outlineWidth, color: outline });
  return bakeFigure(g);
}

/** 草叢（封面 #116）：一撮從地面放射出去的尖葉，烘成一個 mesh。 */
function buildTuft(mat, seed) {
  const g = new Group();
  const random = seededRandom(seed);
  const blades = 11;
  for (let i = 0; i < blades; i++) {
    const t = i / (blades - 1) - 0.5;
    const h = 0.32 + (1 - Math.abs(t) * 1.6) * 0.3 + random() * 0.1;
    const blade = new Mesh(new ConeGeometry(0.035, h, 4, 1), mat.ink);
    blade.geometry.translate(0, h / 2, 0);
    blade.rotation.z = -t * 1.9;
    blade.rotation.x = (random() - 0.5) * 0.7;
    blade.position.set(t * 0.3, 0, (random() - 0.5) * 0.18);
    g.add(blade);
  }
  g.add(ellipsoid(mat.ink, 0.22, 0.05, 0.12, 0, 0.01, 0));
  inkOutline(g, { width: 0.01 });
  return bakeFigure(g);
}

/**
 * 用「注視點、方位角、仰角、距離」寫的鏡頭軌道（2026-11-19 第三輪）。
 * 方位角 yaw（度）：0 是鏡頭在注視點的 +z 方向往 −z 看，正值是鏡頭在注視點右邊（+x）往左看；仰角 pitch（度）正值是鏡頭比注視點高。
 * 注視點和 fov 交給 makeCameraTrack，方位角、仰角、距離（取對數）另外交給一條 makeCameraTrack 各自單調內插，
 * 所以兩格之間只要距離是單調的，鏡頭就不會因為轉方向（走弦線）而先近後遠。回傳 (time) => { pos, at, fov, roll }。
 */
function orbitTrack(keys) {
  const aim = makeCameraTrack(keys.map((k) => ({ t: k.t, at: k.at, pos: [k.at[0], k.at[1], k.at[2] + 1], fov: k.fov })));
  const polar = makeCameraTrack(keys.map((k) => ({ t: k.t, at: [k.yaw, k.pitch, Math.log(k.dist)], pos: [k.yaw, k.pitch, Math.log(k.dist) + 1], fov: 0 })));
  const shot = { pos: new Vector3(), at: new Vector3(), fov: 36, roll: 0 };
  return (time) => {
    const a = aim(time), [yaw, pitch, logDist] = polar(time).at.toArray();
    const y = (yaw * Math.PI) / 180, x = (pitch * Math.PI) / 180, dist = Math.exp(logDist);
    shot.at.copy(a.at);
    shot.pos.set(a.at.x + dist * Math.cos(x) * Math.sin(y), a.at.y + dist * Math.sin(x), a.at.z + dist * Math.cos(x) * Math.cos(y));
    shot.fov = a.fov;
    return shot;
  };
}

export default function createHeatSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(36, 1, 0.05, 400);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([-0.5, 0.8, 0.45]);
  const { strike, flash, appear, act, vanish, back } = PACE.stove.beats;
  const black = mat.flat(BLACK);

  // ---- 環境：白色的地、乾裂的農地、黑色的山丘（地形）、遠處的山脊 ----
  // 霧：山坡、火場、農地（離鏡頭 25 以內）和風機那道山脊（40 左右）都不受影響；最遠那一層山淡進白色的天
  addFog(scene, mat, WHITE, 44, 135);
  scene.add(ground(WHITE));
  const farmland = new Mesh(new PlaneGeometry(28, 14), new MeshBasicMaterial({ map: makeCrackTexture() }));
  farmland.rotation.x = -Math.PI / 2;
  farmland.position.set(-0.5, 0.004, 5.4);
  scene.add(farmland);

  const hillGeometry = new PlaneGeometry(46, 30, 115, 75);
  hillGeometry.rotateX(-Math.PI / 2);
  const HILL_AT = [-1.5, -9];
  const hillPosition = hillGeometry.attributes.position;
  for (let i = 0; i < hillPosition.count; i++) {
    hillPosition.setY(i, hillHeight(hillPosition.getX(i) + HILL_AT[0], hillPosition.getZ(i) + HILL_AT[1]) - 0.02);
  }
  hillGeometry.computeVertexNormals();
  // 山丘是黑的，只被火光照紅（卡通材質的點光源）
  const hillMaterial = mat.custom(BLACK, BLACK, 0);
  hillMaterial.uniforms.uFlamePos.value.set(-1.5, 6.2, -8.0); // 光源在稜線後面：只有坡頂朝後的面被照紅
  hillMaterial.uniforms.uFlameColor.value.set(RED);
  const hill = new Mesh(hillGeometry, hillMaterial);
  hill.position.set(HILL_AT[0], 0, HILL_AT[1]);
  scene.add(hill);
  const onHill = (object, x, z, sink = 0) => place(object, x, hillHeight(x, z) - sink, z);

  const ridge = sphere(black, 1, RIDGE[0], -0.4, RIDGE[1], 28, 14);
  ridge.scale.set(11, 2.2, 3.5);
  scene.add(ridge);
  // 更遠的一層山（淡在霧裡）
  for (const [x, z, w, h] of [[30, -86, 46, 6.5], [-48, -92, 38, 5], [78, -70, 30, 4.5]]) {
    const far = sphere(black, 1, x, -0.5, z, 24, 10);
    far.scale.set(w, h, 5);
    scene.add(far);
  }
  // 山腳的邊緣：一團團矮的黑色土丘沿著山腳排開，把地形和白色地面相交的那條硬邊打散（封面上黑色地塊的邊緣就是這種一朵一朵的形狀）
  const random = seededRandom(76);
  for (let i = 0; i < 34; i++) {
    const phi = 0.1 + (i / 33) * (Math.PI - 0.2) + (random() - 0.5) * 0.05;
    const r = 0.45 + random() * 0.75, out = 0.96 + random() * 0.07;
    const mound = sphere(black, 1, HILL_CENTER[0] + 13.4 * Math.cos(phi) * out, 0, HILL_CENTER[1] + 7.59 * Math.sin(phi) * out, 14, 8);
    mound.scale.set(r * 1.5, r * (0.3 + random() * 0.25), r);
    scene.add(mound);
  }

  // ---- #76 森林大火：前後錯開的幾層火焰紙板（平面版畫好的那片火），加上黑色的松林和往上飄的火星 ----
  const fire = new Group();
  const slices = flat.parts.flames;
  // 一個火焰單位 = 四條並排，拼回封面上那一整片火的輪廓（切條的直邊互相接起來，不外露）
  const sliceWidths = slices.map((slice) => slice.geometry.parameters.width);
  const fireWidth = sliceWidths.reduce((sum, width) => sum + width, 0);
  const makeFireUnit = (scale) => {
    const unit = new Group();
    let x = (-fireWidth * scale) / 2;
    slices.forEach((slice, i) => {
      const card = cardFromSprite(slice, scale);
      card.position.x = x + (sliceWidths[i] * scale) / 2;
      x += sliceWidths[i] * scale;
      unit.add(card);
    });
    unit.userData.height = slices[0].geometry.parameters.height * scale;
    return unit;
  };
  // [x, z, 放大倍率, 是否左右翻轉]；底下四成埋進地裡，只露出火舌
  const FLAMES = [
    [-3.2, -9.7, 8.2, false], [3.6, -9.5, 6.4, true], // 稜線後面最高的一層
    [-6.4, -8.3, 5.0, true], [0.9, -8.2, 5.4, false], [5.6, -8.0, 4.0, false], // 中間一層
    [-6.3, -6.1, 2.6, false], [3.3, -6.2, 2.4, true], [-10.2, -7.4, 3.2, true], [7.8, -7.6, 3.0, false], // 稜線前和兩側
    [-3.8, -3.6, 1.6, false], [0.9, -3.2, 1.4, true], [-6.4, -4.0, 1.4, true], [3.0, -4.2, 1.5, false], [-1.5, -2.2, 1.2, false], // 已經燒到正面山坡上的幾簇小火
  ];
  const addFlame = ([x, z, scale, mirror], i) => {
    const unit = makeFireUnit(scale);
    const half = (fireWidth * scale) / 2;
    const groundY = Math.min(hillHeight(x, z), hillHeight(x - half, z), hillHeight(x + half, z));
    unit.position.set(x, groundY - unit.userData.height * 0.4, z);
    unit.userData.mirror = mirror ? -1 : 1;
    unit.userData.phase = i * 1.7;
    fire.add(unit);
    return unit;
  };
  const flames = FLAMES.map(addFlame);
  // 結尾才燒起來的火線：沿著山腳、在農地後面排成一道火牆（兩層錯開），牛的黑色剪影就落在它前面
  const footFlames = ([
    [-9.6, 0.5, 1.9, false], [-6.6, 1.0, 2.4, true], [-3.4, 1.5, 2.7, false], [-0.2, 1.5, 2.5, true], [2.9, 1.0, 2.2, false], [5.6, 0.2, 1.8, true],
    [-8.0, -0.3, 2.7, true], [-4.9, 0.2, 3.2, false], [-1.6, 0.4, 3.4, true], [1.5, 0.1, 3.0, false],
  ] as [number, number, number, boolean][]).map((flame, i) => addFlame(flame, i + 20));
  // 黑色的松林（第四輪：立體松樹），散在山坡上。黑樹站在黑色山坡上，靠紅色的墨線把輪廓勾出來（火起來之後才亮，等於背後的火光）
  const FOREST = [
    [-5.6, -6.9, 0, 3.4], [-3.6, -6.6, 2, 3.2], [-4.5, -5.9, 1, 3.6], [0.9, -6.7, 2, 3.0], [2.4, -6.3, 0, 2.6], [3.3, -5.6, 1, 3.4],
    [-7.4, -5.6, 2, 3.0], [4.9, -6.4, 2, 2.6],
    [-3.7, -3.1, 2, 2.6], [0.8, -2.7, 1, 2.6], [-6.2, -3.5, 2, 2.2], [3.0, -3.7, 1, 2.4], [-1.4, -1.8, 2, 2.0],
  ];
  const hillPine = buildPine(mat, RED, 0.035);
  const glows = []; // 每棵樹的紅色墨線（火起來之後才亮）
  const forest = FOREST.map(([x, z, which, scale]) => {
    const pine = onHill(hillPine.clone(), x, z, 0.1);
    pine.scale.setScalar(scale * 0.27 * (1 + which * 0.05));
    pine.rotation.y = x * 1.3;
    pine.children.forEach((mesh) => mesh.userData.isOutline && glows.push(mesh));
    fire.add(pine);
    return pine;
  });
  const embers = new Snow({
    count: Math.round(700 * deviceTier.particleScale), box: new Vector3(18, 9, 6), center: new Vector3(-1.5, 8, -7.8),
    size: 150, speed: -1.7, wind: 0.5, color: RED,
  });
  fire.add(embers);
  register(76, fire);
  scene.add(fire);

  // ---- #77 雄鹿（第四輪：模型）：站在坡頂、火的前面，臉朝左（封面的方向），黑色的身體落在紅色的火前 ----
  const stag = buildStag(mat);
  stag.scale.setScalar(1.3);
  const stagY = hillHeight(STAG[0], STAG[1]);
  stag.position.set(STAG[0], stagY - 0.05, STAG[1]);
  stag.rotation.y = 0.25; // 身體微微斜向鏡頭，看得到另一側的腿和鹿角的分叉
  const stagRest = { neck: 0.12 };
  stag.userData.neck.rotation.z = stagRest.neck;
  register(77, stag);
  scene.add(stag);
  const stagLight = new Vector3();

  // ---- #91 兩座風機：錐形塔柱、機艙、輪轂，三片葉片是擠出的薄板，繞著輪轂轉 ----
  const turbines = new Group();
  const rotors = [[-2.2, 1.55, 4.0, 2.0], [1.5, 1.2, 4.9, 2.4]].map(([dx, baseY, towerHeight, bladeLength]) => {
    const turbine = new Group();
    turbine.add(cylinder(black, 0.07, 0.15, towerHeight, 0, 0, 0, 12), box(black, 0.3, 0.26, 0.6, 0, towerHeight, 0.05));
    const rotor = new Group();
    rotor.add(sphere(black, 0.17, 0, 0, 0, 12, 8));
    for (let i = 0; i < 3; i++) {
      const blade = extrude(black, [[-0.06, 0], [-0.16, bladeLength * 0.2], [-0.04, bladeLength], [0.03, bladeLength], [0.1, bladeLength * 0.2], [0.06, 0]], 0.05);
      blade.rotation.z = (i * Math.PI * 2) / 3;
      rotor.add(blade);
    }
    rotor.position.set(0, towerHeight, 0.4);
    turbine.add(rotor);
    turbine.position.set(RIDGE[0] + dx, baseY, RIDGE[1] + 0.4);
    turbine.rotation.y = -0.3;
    turbines.add(turbine);
    return rotor;
  });
  register(91, turbines, { count: 2 });
  scene.add(turbines);

  // ---- #93 溫度計：車床做的玻璃管（白色內壁加紅色外框），裡面是紅色球泡與紅柱，六道黑色刻度 ----
  const thermometer = new Group();
  const BULB_R = 0.22, BULB_Y = 0.24, TUBE_R = 0.085, TUBE_TOP = 1.5, COLUMN_BASE = 0.3;
  const glassProfile = (grow) => {
    const R = BULB_R + grow, r = TUBE_R + grow, join = Math.acos(r / R), points = [];
    for (let i = 0; i <= 14; i++) {
      const a = -Math.PI / 2 + (i / 14) * (join + Math.PI / 2);
      points.push(new Vector2(Math.max(0.0001, R * Math.cos(a)), BULB_Y + R * Math.sin(a)));
    }
    points.push(new Vector2(r, TUBE_TOP));
    return points;
  };
  // 玻璃：只畫背面。內層白色當作透明的管壁，外層紅色大一圈，從旁邊露出來成為外框
  thermometer.add(
    new Mesh(new LatheGeometry(glassProfile(0.024), 28), new MeshBasicMaterial({ color: RED, side: BackSide })),
    new Mesh(new LatheGeometry(glassProfile(0), 28), new MeshBasicMaterial({ color: WHITE, side: BackSide })),
    sphere(mat.red, 0.165, 0, BULB_Y, 0, 20, 14),
  );
  // 球泡裡一道弧形的白色反光（封面上有）
  const glint = new Mesh(new TorusGeometry(0.105, 0.014, 6, 16, 1.5), new MeshBasicMaterial({ color: WHITE }));
  glint.position.set(0, BULB_Y, 0.135);
  glint.rotation.z = 2.5;
  thermometer.add(glint);
  const mercury = slantColumn(mat.red, 0.055, 0.045);
  mercury.mesh.position.y = COLUMN_BASE;
  thermometer.add(mercury.mesh, mercury.cap);
  for (let i = 0; i < 6; i++) thermometer.add(box(black, 0.075, 0.026, 0.012, 0.012, TUBE_TOP - (0.28 + i * 0.11) * (TUBE_TOP - 0.42), 0.058));
  // 頂端的三道放射線（封面上的樣子）與濺出來的三滴
  const rays = [-0.85, 0.02, 0.6].map((angle) => {
    const ray = new Group();
    ray.add(box(mat.flat(RED), 0.045, 0.2, 0.03, 0, 0.1, 0));
    ray.rotation.z = -angle;
    ray.userData.angle = angle;
    thermometer.add(ray);
    return ray;
  });
  const spurts = [0, 1, 2].map(() => {
    const drop = sphere(mat.red, 0.04, 0, 0, 0, 10, 8);
    thermometer.add(drop);
    return drop;
  });
  thermometer.position.set(...THERMO);
  register(93, thermometer);
  scene.add(thermometer);

  // ---- #104 農民（第四輪：立體人物）：全黑的側影、牛仔帽，雙手插腰站在農地上 ----
  const farmer = makeFigure(mat, { suit: mat.ink, skin: mat.ink, shirt: null, hair: "cowboy", height: 1.8, build: 1.08 });
  const FARMER_POSE = { armL: [0, 0, 0.75], elbowL: [0, 0, -1.75], armR: [0, 0, -0.75], elbowR: [0, 0, 1.75], legL: [0, 0, 0.05], legR: [0, 0, -0.05] };
  farmer.userData.pose(FARMER_POSE);
  // 腰帶與皮帶扣（白），讓全黑的身體上有一道腰線
  farmer.userData.joints.hips.add(box(mat.ink, 0.34, 0.05, 0.24, 0, 0.07, 0), box(mat.paper, 0.05, 0.035, 0.02, 0, 0.07, 0.115));
  mergeByJoint(farmer);
  farmer.position.set(-5.2, 0, 5.1);
  farmer.rotation.y = 0.75; // 正面朝結尾鏡頭的方向
  register(104, farmer);
  scene.add(farmer);

  // ---- #105 兩頭牛（第四輪：模型）：臉朝右（+x），走進來時四條腿對角交替，站定後低頭 ----
  const cows = new Group();
  const cowParts = [[-0.8, 0, 2.8], [-2.3, 0, 5.1]].map((rest, i) => {
    const cow = buildCow(mat);
    cow.scale.setScalar(i ? 0.85 : 0.9);
    cow.userData.rest = new Vector3(...rest);
    cows.add(cow);
    return { cow, head: cow.userData.neck };
  });
  register(105, cows, { count: 2 });
  scene.add(cows);

  // ---- #115 松樹 5 棵、#116 草叢 6 叢（第四輪：模型），圍著農地 ----
  const pines = new Group();
  const farmPine = buildPine(mat);
  // 位置避開結尾鏡頭裡牛和農民的正後方（黑色的樹不疊在黑色的人和牛上）
  [[-11.7, 3.2], [-10.9, 5.4], [-7.3, 5.9], [2.4, 2.6], [-4.4, 7.4]].forEach(([x, z], i) => {
    const pine = place(farmPine.clone(), x, 0, z);
    pine.scale.setScalar(0.9 + ((i * 3) % 4) * 0.1);
    pine.rotation.y = i * 1.1;
    pines.add(pine);
  });
  register(115, pines, { count: 5 });
  const tufts = new Group();
  // 同樣避開結尾鏡頭裡人和牛的腳邊
  [[-3.0, 7.6], [-8.7, 5.1], [-8.6, 1.8], [-8.6, 6.6], [2.05, 6.3], [-6.6, 8.2]].forEach(([x, z], i) => {
    const tuft = place(buildTuft(mat, 11 + i), x, 0, z);
    tuft.scale.setScalar(1.1 + (i % 3) * 0.2);
    tuft.rotation.y = 0.6 + i * 0.4;
    tufts.add(tuft);
  });
  register(116, tufts, { count: 6 });
  scene.add(pines, tufts);

  // ---- 細節（第四輪）：農地上的車轍、碎石、乾枯的小草；溫度計插在地上的一圈土 ----
  const details = new Group();
  const rand = seededRandom(104);
  for (let i = 0; i < 26; i++) {
    const x = -10 + rand() * 13, z = 1.6 + rand() * 7.5;
    if (Math.hypot(x + 5.2, z - 5.1) < 0.9) continue;
    const pebble = ellipsoid(mat.ink, 0.06 + rand() * 0.07, 0.035 + rand() * 0.03, 0.05 + rand() * 0.06, x, 0.01, z);
    pebble.rotation.y = rand() * 3;
    details.add(pebble);
  }
  for (const dz of [-0.35, 0.35]) {
    for (let k = 0; k < 9; k++) details.add(box(mat.ink, 1.05, 0.012, 0.06, -9.5 + k * 1.2, 0.006, 7.9 + dz + Math.sin(k * 0.8) * 0.12)); // 一條斷斷續續的車轍
  }
  details.add(place(lathe(mat.ink, [[0, 0], [0.38, 0], [0.3, 0.07], [0.12, 0.1], [0, 0.1]], 18), THERMO[0], 0, THERMO[2]));
  scene.add(bakeFigure(details));

  // ---- 鏡頭：從溫度計的特寫開始，升高搖向火場和雄鹿，最後降到農地 ----
  // 2026-11-19 第三輪：整章只有三段推拉方向——
  // 溫度計炸開後就一路慢慢往後帶（溫度計 → 風機 → 火場 → 整片山坡，0.05–0.46 連續拉遠，沒有停在半路再衝）；
  // 接著一路推近坡頂的雄鹿（0.46–0.755，用長焦慢慢收，牠驚跳時已經在畫面中央）；
  // 最後越過山坡降到農地，距離只微微放大，結尾停穩。
  // 關鍵格用「注視點 + 方位角 + 仰角 + 距離」寫（見 orbitTrack），距離取對數內插，推拉的速度在畫面上是均勻的。
  // 溫度計到山坡這幾格的注視點放在視線上、離鏡頭和主體差不多遠的地方（取景和舊版一樣），量到的推拉才對得上畫面。
  const stagEye = [STAG[0], stagY + 1.1, STAG[1]];
  const track = orbitTrack([
    { t: -0.3, at: [5.05, 0.85, 5], yaw: -14.4, pitch: 0, dist: 3.55, fov: 32 }, // 溫度計
    { t: strike, at: [5.08, 1.15, 5], yaw: -12.6, pitch: -1.6, dist: 3.6, fov: 32 },
    { t: flash[1], at: [5.1, 1.3, 5], yaw: -14, pitch: -1, dist: 5.0, fov: 33 }, // 放射線閃的時候已經慢慢往後帶
    { t: 0.24, at: [5.56, 2.0, 3.94], yaw: -20.1, pitch: -4.2, dist: 6.9, fov: 36 }, // 溫度計和山脊上的風機
    { t: 0.37, at: [0.09, 3.96, -1.87], yaw: 12, pitch: -7, dist: 11.2, fov: 38 }, // 往上搖向火場
    { t: 0.46, at: [-0.36, 3.8, -2.63], yaw: 12.2, pitch: 3.8, dist: 15, fov: 40 }, // 升高退後，整片山坡
    { t: 0.53, at: [-0.8, 4.4, -4.6], yaw: 9, pitch: 1, dist: 14.8, fov: 32 }, // 開始用長焦收向坡頂
    { t: 0.62, at: stagEye, yaw: 5.5, pitch: -2.4, dist: 12.7, fov: 22 }, // 雄鹿
    { t: 0.7, at: stagEye, yaw: 4, pitch: -2.4, dist: 10.9, fov: 22 },
    { t: vanish[1] - 0.01, at: [stagEye[0], stagEye[1] - 0.05, stagEye[2]], yaw: 3, pitch: -3, dist: 10.4, fov: 22 },
    // 降到農地並壓到接近地面：牛的背後是山腳的火牆，農民的背後是白色的天，燒著的山壓在他們上方
    { t: 0.88, at: [-2.6, 1.4, 4.0], yaw: 45, pitch: 6, dist: 7.8, fov: 36 },
    { t: 1.0, at: [-2.8, 1.75, 4.0], yaw: 46, pitch: -6.4, dist: 8.1, fov: 36 },
    { t: 1.3, at: [-2.8, 1.8, 4.0], yaw: 46.5, pitch: -7, dist: 8.2, fov: 36 },
  ]);


  const pullBack = new Vector3();

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList(pacedCues("stove", ["crack", "flip"]), [{ at: 0.3, cue: "fireWhoosh" }, { at: 0.62, cue: "stinger" }, { at: 0.84, cue: "moo" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const shot = track(p);
      // 直式螢幕：結尾農民加兩頭牛太寬，把鏡頭沿視線往後拉
      const widen = linearstep(p, 0.78, 0.86) * clamp((1 - frame.aspect) * 1.3, 0, 0.65);
      if (widen > 0) shot.pos.add(pullBack.subVectors(shot.pos, shot.at).multiplyScalar(widen));
      applyCameraShot(camera, shot, frame.aspect, frame.pointer, 0.05);
      const time = frame.time;

      // 溫度計：紅柱先慢慢爬，0.05 一口氣衝過管口；之後微微顫動。整支轉向鏡頭（刻度在正面）
      faceCamera(thermometer, camera);
      const creep = 0.42 + 0.2 * linearstep(p, -0.3, strike);
      const surge = linearstep(p, strike, strike + 0.025);
      const settle = Math.sin(linearstep(p, strike + 0.025, flash[1]) * Math.PI) * 0.05;
      const level = creep + (1.13 - creep) * (1 - (1 - surge) * (1 - surge)) + settle + (surge >= 1 ? 0.008 * Math.sin(time * 9) : 0);
      const columnHeight = level * (TUBE_TOP - COLUMN_BASE);
      mercury.mesh.scale.y = columnHeight;
      mercury.cap.position.y = COLUMN_BASE + columnHeight + 0.045;
      // 放射線：衝頂的同時從管口彈出去，之後輪流閃
      const burst = linearstep(p, strike + 0.01, flash[1]);
      const pop = burst <= 0 ? 0 : 1 + 0.6 * Math.sin(Math.min(1, burst * 1.6) * Math.PI) * (1 - burst);
      rays.forEach((ray, i) => {
        const out = 0.17 + 0.1 * Math.min(1, burst * 2.2) * pop;
        ray.visible = burst > 0;
        ray.position.set(Math.sin(ray.userData.angle) * out, TUBE_TOP + 0.2 + Math.cos(ray.userData.angle) * out, 0);
        ray.scale.setScalar(pop * (1 + 0.12 * Math.sin(time * 6 + i * 2.1)));
      });
      spurts.forEach((drop, i) => {
        const t = linearstep(p, strike + 0.005 + i * 0.012, strike + 0.075 + i * 0.012);
        drop.visible = t > 0 && t < 1;
        drop.position.set([-0.55, 0.5, 0.2][i] * t, TUBE_TOP + 0.15 + 1.1 * t - 1.9 * t * t, 0.05);
      });

      // 風機：兩座轉速不同
      rotors.forEach((rotor, i) => (rotor.rotation.z = -time * (0.9 - i * 0.25)));

      // 野火：appear 之前只冒出一點火苗，appear 時整排竄起來；之後每一層各自跳動、左右搖
      const rise = linearstep(p, appear[0] + 0.02, appear[1]);
      const grown = 0.56 + 0.44 * (1 - (1 - rise) * (1 - rise)) * (1 + 0.08 * Math.sin(rise * Math.PI));
      flames.forEach((unit) => {
        const { phase, mirror } = unit.userData;
        const flicker = 1 + 0.03 * Math.sin(time * 6.3 + phase) + 0.018 * Math.sin(time * 11.7 + phase * 2.3);
        unit.scale.set(mirror * (1 + 0.02 * Math.sin(time * 4.1 + phase)), grown * flicker, 1);
        unit.rotation.z = 0.012 * Math.sin(time * 2.6 + phase);
      });
      embers.update(time);
      embers.material.uniforms.uSize.value = 150 * rise; // 火星跟著火勢變大（不用半透明，免得出現灰色）
      hillMaterial.uniforms.uFlame.value = rise * (16 + 2.5 * Math.sin(time * 5.1) + 1.5 * Math.sin(time * 12.3));
      forest.forEach((pine, i) => (pine.rotation.z = 0.012 * Math.sin(time * 1.3 + i * 1.9)));
      glows.forEach((glow) => (glow.visible = rise > 0.25)); // 樹的紅色輪廓（火光）
      // 山腳的火線：back 節拍前後才燒起來
      const spread = linearstep(p, back[0] - 0.03, back[0] + 0.06);
      const footGrown = (1 - (1 - spread) * (1 - spread)) * (1 + 0.1 * Math.sin(spread * Math.PI));
      footFlames.forEach((unit) => {
        const { phase, mirror } = unit.userData;
        const flicker = 1 + 0.035 * Math.sin(time * 6.3 + phase) + 0.02 * Math.sin(time * 11.7 + phase * 2.3);
        unit.visible = spread > 0.01;
        unit.scale.set(mirror * (1 + 0.02 * Math.sin(time * 4.1 + phase)), Math.max(0.001, footGrown * flicker), 1);
        unit.rotation.z = 0.012 * Math.sin(time * 2.6 + phase);
      });

      // 雄鹿：平常低頭、尾巴輕甩、呼吸；火竄起來時抬起頭；act 時驚跳（後腿一蹬、前腳離地）；0.74（範本的「消失」）再縮一下，但留在原地
      const startle = Math.sin(linearstep(p, act[0], act[0] + 0.045) * Math.PI);
      const flinch = Math.sin(linearstep(p, vanish[0] - 0.005, vanish[1] + 0.02) * Math.PI);
      const alert = smooth(linearstep(p, appear[0], appear[1]));
      stag.position.y = stagY - 0.05 + 0.22 * startle + 0.1 * flinch;
      stag.rotation.z = -0.22 * startle + 0.06 * flinch; // 身體往後仰（頭在 -x）
      stag.userData.neck.rotation.z = stagRest.neck * (1 - alert) - 0.18 * alert - 0.15 * startle + 0.1 * flinch + Math.sin(time * 0.8) * 0.03;
      stag.userData.head.rotation.y = Math.sin(time * 0.6) * 0.2 * alert;
      stag.userData.tail.rotation.z = Math.sin(time * 3.1) * 0.25;
      stag.userData.legs.forEach(([leg], i) => {
        const front = i < 2;
        leg.rotation.z = front ? -0.5 * startle - 0.2 * flinch : 0.35 * startle;
        leg.userData.knee.rotation.z = front ? 0.9 * startle + 0.3 * flinch : -0.2 * startle;
      });
      stag.scale.set(1.3, 1.3 * (1 + 0.008 * Math.sin(time * 1.7)), 1.3);
      // 雄鹿的受光方向：從雄鹿指向鏡頭，再往上抬、往畫面左邊（牠臉朝的那一側）偏，正對鏡頭的面刻白線、右後方留黑
      stagLight.subVectors(camera.position, stag.position).setY(0).normalize();
      stagLight.set(stagLight.x * 0.3 - stagLight.z * 0.95, 1.3, stagLight.z * 0.3 + stagLight.x * 0.95).normalize();
      stag.userData.ink.uniforms.uLight.value.copy(stagLight);

      // 農民：雙手插腰站著；呼吸、換腳重心，火燒到山腳時轉頭看火
      const fj = farmer.userData.joints;
      const look = smooth(linearstep(p, back[0], back[0] + 0.08));
      fj.spine.rotation.x = 0.01 * Math.sin(time * 1.5);
      fj.hips.position.x = 0.02 * Math.sin(time * 0.5);
      fj.head.rotation.y = -0.9 * look + Math.sin(time * 0.4) * 0.05;
      fj.neck.rotation.x = -0.05 * look;

      // 牛：鏡頭降下來時從左邊走進來（back），四條腿對角交替；站定後低下頭、尾巴甩
      cowParts.forEach(({ cow, head }, i) => {
        const walk = smooth(linearstep(p, back[0] + i * 0.012, back[0] + 0.07 + i * 0.012));
        const stepping = walk > 0 && walk < 1 ? 1 : 0;
        const { rest } = cow.userData;
        // 臉朝右前方：側面對著結尾的鏡頭（鏡頭在右前方 46°），封面上牛就是側面。沿著自己面朝的方向走進來
        const heading = 0.72 - i * 0.18;
        cow.rotation.y = heading;
        cow.position.set(rest.x - 1.7 * (1 - walk) * Math.cos(heading), stepping * Math.abs(Math.sin(walk * Math.PI * 5)) * 0.03, rest.z + 1.7 * (1 - walk) * Math.sin(heading));
        const stride = walk * Math.PI * 5;
        cow.userData.legs.forEach(([leg, phase]) => {
          leg.rotation.z = 0.32 * Math.sin(stride + phase) * stepping;
          leg.userData.knee.rotation.z = -0.35 * Math.max(0, Math.sin(stride + phase + 1)) * stepping;
        });
        const lower = smooth(linearstep(p, back[0] + 0.075 + i * 0.015, back[0] + 0.12 + i * 0.015));
        head.rotation.z = 0.15 * (1 - lower) - 0.62 * lower + 0.04 * Math.sin(time * 1.2 + i) * lower; // 低頭吃草時頭一點一點
        cow.userData.tail.rotation.z = 0.2 * Math.sin(time * 2.2 + i * 1.7);
      });

      // 松樹和草叢被風吹得微微晃
      pines.children.forEach((pine, i) => (pine.rotation.z = 0.012 * Math.sin(time * 1.1 + i * 1.7)));
      tufts.children.forEach((tuft, i) => (tuft.rotation.z = 0.05 * Math.sin(time * 1.6 + i * 2.3)));
    },
  };
}
