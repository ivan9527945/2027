// reboot 的 3D 場景：放映室（PRD-3D 6.13）。
// 一間全黑的放映室：放映機擺在白色桌面上，鏡頭朝 +x；光束是一個由一道道光條組成的錐體，打在遠端一塊立著的銀幕上，
// 光束裡飄著灰塵。兩個紅色片盤是真的在轉；紅色蜘蛛網用細線搭在鏡頭下方、機身與桌面之間。
// 放映機是黑的：從後面看襯著白色銀幕，從側面看襯著牆上一圈燈光，腳下是白色桌面（影子投在桌面上）。
//
// 第二輪：每道光條是白的、兩側鑲黑邊，灰塵是白點加黑圈：在黑色的房間裡看到的是白光，疊在白色銀幕上看到的是
// 一條條從鏡頭射出去的黑線，所以從正後方看光束也還在。封面上沒有的座椅和紅布幕拿掉了，只留銀幕（立在腳架上）、
// 桌子和牆上的燈光；多出來的細節都在放映機本身（膠卷、散熱槽、旋鈕）和蜘蛛網（幾條鬆脫的絲）。遠處的地板淡進黑霧。
//
// 節奏範本 matches 的對應：
//   approach [-0.4, 0.3]  從放映機後方慢慢靠近，順著光束看到銀幕；片盤在轉
//   tilt     [0.3, 0.5]   繞到側面（封面上的那個角度）並稍微升高看兩個片盤；蜘蛛網的主絲拉出來
//   pushIn   [0.45, 0.78] 往機身右下推近，輻絲與三圈橫絲由內往外張開，片盤越轉越慢、停住
//   cutToDetail 0.78      （第三輪）不再硬切：0.72–0.86 連續推進到網心的大特寫
import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, CircleGeometry, Color, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, LatheGeometry, Mesh,
  MeshBasicMaterial, Path, PerspectiveCamera, Points, RepeatWrapping, Scene, ShaderMaterial, Shape, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";
import { Snow, canvasTexture, clamp, deviceTier, linearstep, seededRandom, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog, ground } from "../shared/set/env";
import { box, cylinder, makePalette, sphere } from "../shared/set/model";
import { bakeFigure, inkOutline } from "../shared/set/figure";
import { BLACK, DARK_RED, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：放映機啟動（0.02），喀喀聲裡夾著走音的音樂盒；片盤越轉越慢、停住（0.64），只剩耳語；推到蜘蛛網中心時驚悚的一記（0.86）。
const soundScript = soundTrack([[0, { projector: 0.35, musicbox: 0.15, dread: 0.15 }], [0.6, { projector: 0.28, musicbox: 0.1, dread: 0.18 }], [0.76, { hum: 0.08, whisper: 0.15, dread: 0.22 }]]);

const S = 0.06; // 封面 1 像素在這個場景裡的大小：放映機約 3.5 單位寬
// 封面像素 → 放映機的座標（x 往右、y 往上，底座的底面在 y = 0）
const px = (x) => (x - 345) * S;
const py = (y) => (1192.5 - y) * S;
const FLOOR = -2.2;
const SCREEN_X = 10.5;
const LENS = new Vector3(px(376) + 0.02, py(1160), 0); // 鏡頭前端，光束的頂點
const SCREEN = { y: 2.9, halfH: 2.5, halfW: 4.2 };

// 片盤：[中心 x, 中心 y]（封面像素），半徑 15。左邊那個較低，右邊那個較高
const REELS = [[317, 1140], [350, 1126]];
const REEL_R = 15 * S;

// 蜘蛛網（數值和平面版相同）：掛在右片盤右下緣（TOP）、機身右側和右下方的桌面（FAR）之間，網心在 HUB
const HUB = [371, 1169];
const WEB_TOP = [364, 1139];
const WEB_FAR = [403, 1187];
const SPOKES = [[365, 1146], [377.6, 1155.8], [387.4, 1167.8], [396, 1178.4], [388, 1181.6], [377, 1180], [365, 1178.5], [363.5, 1164]];
const RINGS = [0.34, 0.6, 0.86];
const WEB_Z = 0.52;
// 網不是一片平的：越往右越朝鏡頭這邊斜出來
const webPoint = ([x, y]: number[]) => new Vector3(px(x), py(y), WEB_Z + Math.max(0, px(x) - 1.1) * 0.24);

/** 沿 X 軸躺著的圓柱，中心在 (x, y, z)。 */
function barX(material, radius, length, x, y, z, segments = 20) {
  const mesh = cylinder(material, radius, radius, length, 0, 0, 0, segments);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

/** 面向 +z 的圓盤（軸沿 Z），中心在 (x, y, z)。 */
function discZ(material, radius, thickness, x, y, z, segments = 28) {
  const mesh = cylinder(material, radius, radius, thickness, 0, 0, 0, segments);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

// 片盤：兩片有六個圓孔的紅色盤面夾著一卷黑色的底片，中間一顆黑色的軸心
function makeReel(mat) {
  const reel = new Group();
  const shape = new Shape().absarc(0, 0, REEL_R, 0, Math.PI * 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    shape.holes.push(new Path().absarc(Math.cos(a) * REEL_R * 0.58, Math.sin(a) * REEL_R * 0.58, REEL_R * 0.21, 0, Math.PI * 2));
  }
  const flange = new ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false, curveSegments: 20 });
  for (const z of [-0.1, 0.06]) {
    const side = new Mesh(flange, mat.red);
    side.position.z = z;
    reel.add(side);
  }
  reel.add(discZ(mat.flat(BLACK), REEL_R * 0.72, 0.12, 0, 0, 0), discZ(mat.flat(BLACK), REEL_R * 0.17, 0.26, 0, 0, 0, 16));
  // 細節：盤面外緣一圈捲起的暗紅邊、每片盤面三顆固定螺絲（紙白）、軸心上的方孔、捲著的底片一圈圈的紋路（紙白細環）
  for (const z of [-0.06, 0.1]) {
    const lip = new Mesh(new TorusGeometry(REEL_R - 0.012, 0.016, 6, 40), mat.darkRed);
    lip.position.z = z;
    reel.add(lip);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.82;
      const bolt = discZ(mat.paper, 0.022, 0.02, Math.cos(a) * REEL_R * 0.3, Math.sin(a) * REEL_R * 0.3, z + (z > 0 ? 0.012 : -0.012), 8);
      reel.add(bolt);
    }
  }
  reel.add(box(mat.paper, 0.05, 0.05, 0.28, 0, 0, 0));
  for (const k of [0.34, 0.47, 0.6]) {
    const coil = new Mesh(new TorusGeometry(REEL_R * k, 0.004, 4, 36), mat.paper);
    coil.scale.z = 30; // 拉成貼在底片側面的細環（厚度方向）
    reel.add(coil);
  }
  return reel;
}

/** 底片的貼圖：黑色的片基，兩側一排白色的齒孔，中間一格格淡淡的畫格線。沿 u 方向重複，會跟著片盤轉動捲動。 */
function filmTexture() {
  const texture = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = WHITE;
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(i * 32 + 10, 4, 12, 9);
      ctx.fillRect(i * 32 + 10, h - 13, 12, 9);
    }
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) ctx.strokeRect(i * 64 + 4, 19, 56, 26);
  });
  texture.wrapS = RepeatWrapping;
  return texture;
}

/** 一段細線：a 到 b 之間的細圓柱。 */
const UP = new Vector3(0, 1, 0);
function strand(material, a, b, radius = 0.013) {
  const length = a.distanceTo(b);
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 5, 1, true), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return mesh;
}
/** 一條微彎的線（二次曲線），拆成幾段細線。 */
function curvedStrand(group, material, a, control, b, radius, segments = 6) {
  let previous = a;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments, k = 1 - t;
    const point = new Vector3().addScaledVector(a, k * k).addScaledVector(control, 2 * k * t).addScaledVector(b, t * t);
    group.add(strand(material, previous, point, radius));
    previous = point;
  }
}

/** 沿著曲線的一條扁帶（底片）：寬 width，帶面朝 ±z；twist 讓帶子沿途扭一點（垂下來的片尾） */
function ribbonGeometry(curve, width, segments, twist = 0) {
  const positions = [], uvs = [], index = [];
  const length = curve.getLength();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
    const across = new Vector3(0, 0, 1).applyAxisAngle(tangent, twist * t).multiplyScalar(width / 2);
    positions.push(p.x - across.x, p.y - across.y, p.z - across.z, p.x + across.x, p.y + across.y, p.z + across.z);
    uvs.push((t * length) / (width * 4), 0, (t * length) / (width * 4), 1);
    if (i < segments) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// 光束：以鏡頭為頂點、銀幕四角為底的四面錐，裡面再套一個小一號的。每一面畫成一道道從鏡頭射出去的光條
// （不用半透明，半透明的白會變成灰），光條之間是空的。每道光條中間是白的、兩側鑲一道黑邊：
// 背景是黑的時候看到白色的光，背景是白色銀幕的時候看到一條條黑線，從哪個方向看都認得出是光束。
// 光條偶爾閃一下，像老放映機的燈。
function makeBeam() {
  const positions = [], uvs = [], faces = [];
  for (const [spread, offset] of [[1, 0], [0.5, 4]]) {
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([z, y]) => new Vector3(SCREEN_X - 0.02, SCREEN.y + y * SCREEN.halfH * spread, z * SCREEN.halfW * spread));
    for (let i = 0; i < 4; i++) {
      for (const [point, u, v] of [[LENS, 0.5, 0], [corners[i], 0, 1], [corners[(i + 1) % 4], 1, 1]] as [Vector3, number, number][]) {
        positions.push(point.x, point.y, point.z);
        uvs.push(u, v);
        faces.push(i + offset);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("aFace", new BufferAttribute(new Float32Array(faces), 1));
  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color(WHITE) }, uEdge: { value: new Color(BLACK) } },
    vertexShader: "attribute float aFace; varying vec2 vUv; varying float vFace; void main(){ vUv = uv; vFace = aFace; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor, uEdge; varying vec2 vUv; varying float vFace;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main() {
        float ray = ((vUv.x - 0.5) / max(vUv.y, 0.0001) + 0.5) * (vFace < 3.5 ? 16.0 : 9.0); // 這一點在哪一條從鏡頭射出的光線上
        float cell = floor(ray) + vFace * 37.0, across = fract(ray);
        float on = step(0.42, hash(cell)) * step(0.1, hash(cell * 3.1 + floor(uTime * 9.0)));
        if (on < 0.5 || vUv.y < 0.03) discard;
        float border = 0.07 + 0.05 / (0.25 + vUv.y); // 靠近鏡頭的地方光條很窄，黑邊佔的比例大一點才看得到
        float edge = step(across, border) + step(1.0 - border, across);
        gl_FragColor = vec4(mix(uColor, uEdge, min(edge, 1.0)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// 灰塵：光束裡慢慢往銀幕飄的小點，白心黑圈（理由和光條一樣：在黑底和白底上都看得到）
function makeDust(count) {
  const random = seededRandom(106);
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = random();
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aSeed", new BufferAttribute(seeds, 3));
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uColor: { value: new Color(WHITE) }, uApex: { value: LENS.clone() },
      uAxis: { value: new Vector3(SCREEN_X - LENS.x, SCREEN.y - LENS.y, 0) }, uSpread: { value: new Vector3(0, SCREEN.halfH * 0.92, SCREEN.halfW * 0.92) }, uSize: { value: 32 },
    },
    vertexShader: `
      attribute vec3 aSeed; uniform float uTime, uSize; uniform vec3 uApex, uAxis, uSpread;
      void main() {
        float along = 0.06 + 0.9 * fract(aSeed.x + uTime * 0.008 * (0.5 + aSeed.y));
        vec3 p = uApex + along * (uAxis + (aSeed - 0.5) * 2.0 * uSpread);
        p.y += sin(uTime * 0.5 + aSeed.z * 40.0) * 0.06;
        p.z += cos(uTime * 0.37 + aSeed.y * 40.0) * 0.06;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.45 + aSeed.x) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(d > 0.36 ? vec3(0.02) : uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

// 地板：黑底上一條條朝銀幕延伸的白色地板縫，透視感主要靠它
function makeFloorTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = BLACK;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      ctx.moveTo(0, (i * h) / 40);
      ctx.lineTo(w, (i * h) / 40);
    }
    for (let i = 0; i <= 10; i++) {
      ctx.moveTo((i * w) / 10, 0);
      ctx.lineTo((i * w) / 10, h);
    }
    ctx.stroke();
  });
}

export default function createRebootSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(BLACK);
  const camera = new PerspectiveCamera(38, 1, 0.05, 200);
  const { entries, register } = createRegistry(plan.id);
  // 光從鏡頭這一側來：從後面看（往 +x）和從側面看（往 -z）朝鏡頭的面都是亮面
  const mat = makePalette([-0.5, 0.7, 0.6]);
  const white = mat.flat(WHITE), black = mat.flat(BLACK), red = mat.flat(RED);
  const { tilt, pushIn, cutToDetail } = PACE.matches.beats;

  // 霧：房間是黑的，遠處的地板線淡進黑暗裡；銀幕和牆上的燈光是光源，不受霧影響
  addFog(scene, mat, BLACK, 9, 34);
  const lit = mat.flat(WHITE, false);

  // ---- 放映室：黑地板（一格格的地板縫交代透視）、遠端立在腳架上的銀幕、放映機的桌子、側牆上的一圈燈光 ----
  const floor = ground(WHITE, 70, FLOOR);
  floor.material.map = makeFloorTexture();
  floor.material.needsUpdate = true;
  floor.position.x = 6;
  scene.add(floor);

  // 銀幕：一塊白幕，上下各一根黑色的捲軸，立在三腳架上；地上一圈映出來的亮光交代它站在哪裡
  const screen = box(lit, 0.1, SCREEN.halfH * 2, SCREEN.halfW * 2, SCREEN_X + 0.05, SCREEN.y, 0);
  const roller = (y) => {
    const bar = cylinder(mat.ink, 0.11, 0.11, SCREEN.halfW * 2 + 0.5, 0, 0, 0, 12);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(SCREEN_X + 0.05, y, 0);
    return bar;
  };
  scene.add(screen, roller(SCREEN.y + SCREEN.halfH + 0.1), roller(SCREEN.y - SCREEN.halfH - 0.1), cylinder(mat.ink, 0.06, 0.06, SCREEN.y - SCREEN.halfH - FLOOR, SCREEN_X + 0.2, FLOOR, 0, 8));
  for (const angle of [0.4, 2.5, 4.6]) scene.add(strand(mat.ink, new Vector3(SCREEN_X + 0.2, FLOOR + 1.3, 0), new Vector3(SCREEN_X + 0.2 + Math.cos(angle) * 1.5, FLOOR, Math.sin(angle) * 1.5), 0.045));
  const spill = new Mesh(new CircleGeometry(1, 48), lit);
  spill.rotation.x = -Math.PI / 2;
  spill.scale.set(1.6, 4.6, 1);
  spill.position.set(SCREEN_X - 1.7, FLOOR + 0.01, 0);
  scene.add(spill);
  // 銀幕上的刮痕：幾道細黑線左右跳動（老膠卷）
  const scratches = [0, 1, 2].map(() => box(black, 0.02, SCREEN.halfH * 2, 0.025, SCREEN_X - 0.02, SCREEN.y, 0));
  scene.add(...scratches);

  // 桌子：白色桌面、黑色的桌緣和四隻腳
  scene.add(box(mat.paper, 6.6, 0.14, 2.7, 0.7, -0.07, 0), box(mat.ink, 6.7, 0.1, 2.8, 0.7, -0.19, 0));
  for (const x of [-2.2, 3.6]) for (const z of [-1.1, 1.1]) scene.add(cylinder(mat.ink, 0.08, 0.06, -FLOOR - 0.14, x, FLOOR, z, 8));
  // 桌面的細節（合併成一個 mesh）：木板的接縫、幾道刮痕、桌腳之間的橫木；桌上一個打開的片盒（紅色）和蓋子、一圈散落的底片
  const tableBits = new Group();
  for (const z of [-0.68, 0, 0.68]) tableBits.add(box(mat.ink, 6.56, 0.012, 0.016, 0.7, 0.002, z));
  for (const [x, z, w, a] of [[-1.6, 0.9, 0.5, 0.2], [2.4, -0.9, 0.7, -0.1], [3.2, 0.5, 0.35, 0.5], [-2.4, -0.4, 0.4, -0.35]]) {
    const scratch = box(mat.ink, w, 0.008, 0.012, x, 0.002, z);
    scratch.rotation.y = a;
    tableBits.add(scratch);
  }
  for (const z of [-1.1, 1.1]) tableBits.add(box(mat.ink, 5.8, 0.08, 0.06, 0.7, FLOOR + 0.5, z));
  tableBits.add(box(mat.ink, 0.06, 0.08, 2.2, -2.2, FLOOR + 0.5, 0), box(mat.ink, 0.06, 0.08, 2.2, 3.6, FLOOR + 0.5, 0));
  const can = new Group(); // 片盒：扁圓的盒身與斜靠在旁邊的蓋子
  can.add(cylinder(mat.red, 0.62, 0.62, 0.12, 0, 0, 0, 36), cylinder(mat.ink, 0.5, 0.5, 0.125, 0, 0.002, 0, 30));
  const lid = cylinder(mat.red, 0.64, 0.64, 0.06, 0, 0, 0, 36);
  lid.rotation.z = 1.25;
  lid.position.set(-0.85, 0.6, -0.1);
  const lidRing = new Mesh(new TorusGeometry(0.5, 0.012, 4, 36), mat.darkRed);
  lidRing.rotation.x = Math.PI / 2;
  lidRing.position.y = 0.035;
  lid.add(lidRing);
  can.add(lid);
  can.position.set(-1.95, 0, 0.75);
  tableBits.add(can);
  const loose = new Mesh(new TorusGeometry(0.26, 0.012, 4, 30), mat.ink);
  loose.rotation.x = Math.PI / 2;
  loose.scale.set(1, 1.35, 6);
  loose.position.set(2.85, 0.04, 0.85);
  tableBits.add(loose);
  scene.add(bakeFigure(tableBits));

  // 側牆上的一圈燈光：放映機（黑）和蜘蛛網（紅）從側面看時的背景。只照到網的右端，光束一離開鏡頭就進到黑暗裡
  const pool = new Mesh(new CircleGeometry(3.7, 64), lit);
  pool.position.set(0.1, 2.0, -3.4);
  scene.add(pool);

  // ---- #106 放映機：黑色機身（高的主體、矮的燈箱、鏡頭筒、腳與底座），兩個紅色片盤 ----
  const projector = new Group();
  const frontZ = 0.45;
  projector.add(
    box(mat.ink, px(373) - px(315), py(1187) - py(1192.5), 1.3, (px(315) + px(373)) / 2, (py(1187) + py(1192.5)) / 2, 0), // 底座
    box(mat.ink, 0.9, 0.34, 0.9, px(324.5), py(1184.8), 0), // 兩隻腳，中間留空
    box(mat.ink, 0.72, 0.34, 0.9, px(363), py(1184.8), 0),
    box(mat.ink, px(363.5) - px(338), py(1148) - py(1183), frontZ * 2, (px(338) + px(363.5)) / 2, (py(1148) + py(1183)) / 2, 0), // 主體
    box(mat.ink, px(342) - px(316), py(1162) - py(1183), 0.8, (px(316) + px(342)) / 2, (py(1162) + py(1183)) / 2, 0), // 燈箱
    box(mat.ink, 0.36, 0.24, 0.4, px(321.5), py(1161.8), 0),
    barX(mat.ink, 0.36, px(376) - px(362), (px(362) + px(376)) / 2, py(1160), 0), // 鏡頭筒
    barX(white, 0.25, 0.03, px(376) + 0.01, py(1160), 0), // 鏡片
    box(mat.ink, 0.24, 0.3, 0.24, px(373.5), py(1154), 0), // 鏡頭上的旋鈕
    box(red, px(358) - px(345), 0.1, 0.02, (px(345) + px(358)) / 2, py(1161.8), frontZ + 0.005), // 機身上的兩道紅線
    box(red, px(358) - px(345), 0.1, 0.02, (px(345) + px(358)) / 2, py(1166.8), frontZ + 0.005),
    discZ(mat.flat(DARK_RED), 0.07, 0.02, px(347.5), py(1157.2), frontZ + 0.005, 12),
    discZ(mat.flat(DARK_RED), 0.075, 0.02, px(336), py(1166.5), 0.405, 12),
  );
  // 伸向左片盤的黑色支臂
  const armFrom = new Vector3(px(341), py(1157), 0.34), armTo = new Vector3(px(317), py(1140), 0.34);
  const arm = box(mat.ink, armFrom.distanceTo(armTo), 0.36, 0.22, 0, 0, 0);
  arm.position.copy(armFrom).add(armTo).multiplyScalar(0.5);
  arm.rotation.z = Math.atan2(armTo.y - armFrom.y, armTo.x - armFrom.x);
  projector.add(arm);
  // 撐住右片盤的三根紅色細桿
  for (const [x0, x1] of [[343, 345], [350, 351], [357.5, 357.5]]) projector.add(strand(red, new Vector3(px(x1), py(1150), 0.4), new Vector3(px(x0), py(1136), 0.5), 0.03));
  const reels = REELS.map(([x, y]) => {
    const reel = makeReel(mat);
    reel.position.set(px(x), py(y), 0.62);
    projector.add(reel, discZ(mat.ink, 0.07, 0.3, px(x), py(y), 0.48, 10)); // 片盤和它的軸
    return reel;
  });
  // 更多細節：燈箱頂上的散熱槽、機身側面的散熱縫與調焦鈕、鏡頭筒上的兩道環、一段從片盤拉進機身的膠卷
  for (let i = 0; i < 4; i++) projector.add(box(mat.ink, 0.07, 0.12, 0.62, px(319) + i * 0.3, py(1162) + 0.06, 0));
  for (let i = 0; i < 4; i++) projector.add(box(white, 0.5, 0.025, 0.02, px(329), py(1170) - i * 0.13, 0.405));
  projector.add(
    barX(mat.ink, 0.4, 0.06, px(366), py(1160), 0), barX(mat.ink, 0.4, 0.06, px(371.5), py(1160), 0),
    discZ(mat.ink, 0.13, 0.12, px(356), py(1176), frontZ + 0.05, 14), discZ(red, 0.05, 0.02, px(356), py(1176), frontZ + 0.12, 10),
    discZ(mat.ink, 0.1, 0.1, px(343), py(1178), frontZ + 0.04, 12),
  );
  // 底片：從左片盤拉進機身的片門、從片門拉上右片盤，再從右片盤垂下一段鬆掉的片尾。貼圖會跟著片盤的轉動捲動。
  const film = filmTexture();
  const filmMaterial = new MeshBasicMaterial({ map: film, side: DoubleSide });
  const filmFrom = (x, y) => new Vector3(px(x), py(y), 0.62);
  const filmPaths = [
    [filmFrom(331, 1146), filmFrom(338, 1150), filmFrom(344, 1150)],
    [filmFrom(362, 1136), filmFrom(362.5, 1143), filmFrom(361, 1150)],
    [new Vector3(px(335), py(1149), 0.62), new Vector3(px(331), py(1160), 0.7), new Vector3(px(333), py(1170), 0.78), new Vector3(px(330), py(1178), 0.74)],
  ];
  const filmMeshes = filmPaths.map((points, i) => {
    const curve = new CatmullRomCurve3(points);
    const length = curve.getLength();
    const ribbon = ribbonGeometry(curve, 0.2, 24, i === 2 ? 0.6 : 0);
    const mesh = new Mesh(ribbon, filmMaterial);
    mesh.userData.length = length;
    projector.add(mesh);
    return mesh;
  });
  film.repeat.x = 1;

  // 機身的細節（不會動，合併成少數幾個 mesh）：
  //   正面的檢修蓋（紙白的接縫）、四角的螺絲、燈箱側面的提把、手搖柄、鏡頭筒上一圈圈的滾花、片門的壓板、從背後拉到桌下的電線
  const details = new Group();
  const seam = (w, h, x, y, z) => {
    details.add(box(mat.paper, w, 0.018, 0.012, x, y + h / 2, z), box(mat.paper, w, 0.018, 0.012, x, y - h / 2, z));
    details.add(box(mat.paper, 0.018, h, 0.012, x - w / 2, y, z), box(mat.paper, 0.018, h, 0.012, x + w / 2, y, z));
  };
  seam(px(361) - px(340), py(1170) - py(1181), (px(340) + px(361)) / 2, (py(1170) + py(1181)) / 2, frontZ + 0.008); // 檢修蓋
  seam(px(340) - px(318), py(1165) - py(1181), (px(318) + px(340)) / 2, (py(1165) + py(1181)) / 2, 0.41); // 燈箱側板
  const bolt = (x, y, z) => details.add(sphere(mat.paper, 0.035, x, y, z, 8, 6));
  for (const [x, y] of [[339.5, 1150], [362, 1150], [339.5, 1182], [362, 1182]]) bolt(px(x), py(y), frontZ + 0.01);
  for (const [x, y] of [[317.5, 1163.5], [340.5, 1163.5], [317.5, 1182], [340.5, 1182]]) bolt(px(x), py(y), 0.41);
  for (const [x, y] of [[317, 1188.5], [371, 1188.5]]) bolt(px(x), py(y), 0.66);
  // 鏡頭筒的滾花：一圈圈很淺的凸環
  const knurl = [];
  for (let i = 0; i <= 24; i++) knurl.push(new Vector2(0.37 + (i % 2) * 0.025, i * 0.012));
  const ring = new Mesh(new LatheGeometry(knurl, 28), mat.ink);
  ring.rotation.z = -Math.PI / 2;
  ring.position.set(px(367.5) - 0.14, py(1160), 0);
  details.add(ring);
  // 片門的壓板（紙白的小框）
  details.add(box(mat.paper, 0.26, 0.4, 0.02, px(344.5), py(1153), frontZ + 0.01), box(mat.ink, 0.18, 0.3, 0.03, px(344.5), py(1153), frontZ + 0.02));
  // 燈箱頂上的提把
  const handle = new Mesh(new TorusGeometry(0.22, 0.03, 6, 16, Math.PI), mat.ink);
  handle.position.set(px(329), py(1162) + 0.12, 0);
  details.add(handle);
  inkOutline(details, { width: 0.008 });
  const mergedDetails = bakeFigure(details);
  projector.add(mergedDetails);
  // 手搖柄（會跟著片盤轉）：燈箱側面的軸、曲柄、紅色的握把
  const crank = new Group();
  crank.position.set(px(330), py(1174), 0.48);
  crank.add(discZ(mat.ink, 0.07, 0.1, 0, 0, 0, 12), box(mat.ink, 0.42, 0.06, 0.04, 0.18, 0, 0.06), cylinder(mat.red, 0.04, 0.04, 0.16, 0, 0, 0, 10));
  crank.children[2].rotation.x = Math.PI / 2;
  crank.children[2].position.set(0.36, 0, 0.14);
  projector.add(crank);
  // 電線：從燈箱背後垂到桌面，沿著桌面繞一彎，再從桌緣垂到地上
  const cable = new CatmullRomCurve3([
    new Vector3(px(316), py(1176), -0.2), new Vector3(px(312), py(1186), -0.4), new Vector3(px(308), 0.03, -0.75), new Vector3(-1.0, 0.03, -1.15),
    new Vector3(-2.3, 0.0, -1.0), new Vector3(-2.75, -0.6, -0.9), new Vector3(-2.85, FLOOR + 0.05, -0.6), new Vector3(-3.6, FLOOR + 0.03, 0.2),
  ]);
  projector.add(new Mesh(new TubeGeometry(cable, 80, 0.035, 6), mat.ink));
  register(106, projector);
  scene.add(projector);

  // ---- 光束與灰塵 ----
  const beam = makeBeam();
  const dust = makeDust(Math.round(280 * deviceTier.particleScale));
  scene.add(beam, dust);

  // ---- #107 紅色蜘蛛網：細線。主絲、輻絲、三圈橫絲各一組，都以網心為原點，依序從網心張開 ----
  const web = new Group();
  const hub = webPoint(HUB);
  web.position.copy(hub);
  const local = (point) => webPoint(point).sub(hub);
  const strands = new Group(), spokes = new Group();
  strands.add(strand(red, local(WEB_TOP), local(WEB_FAR), 0.017));
  curvedStrand(strands, red, local([361.5, 1141]), local([372, 1162]), local([392, 1183]), 0.015);
  curvedStrand(strands, red, local([363.5, 1178]), local([386, 1179]), local(WEB_FAR), 0.015);
  strands.add(strand(red, local([371, 1183.5]), local([382, 1188]), 0.015));
  // 兩條往後拉到機身和鏡頭筒上的絲，網才有前後的深度
  strands.add(strand(red, local(SPOKES[1]), new Vector3(px(370), py(1164), 0.3).sub(hub), 0.012), strand(red, local(SPOKES[6]), new Vector3(px(362), py(1182), frontZ).sub(hub), 0.012));
  for (const point of SPOKES) spokes.add(strand(red, new Vector3(), local(point), 0.013));
  spokes.add(sphere(red, 0.06, 0, 0, 0, 10, 8));
  const rings = RINGS.map((fraction) => {
    const ring = new Group();
    const points = SPOKES.map((point) => local(point).multiplyScalar(fraction));
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      curvedStrand(ring, red, point, point.clone().add(next).multiplyScalar(0.5 * 0.78), next, 0.011, 4); // 往網心垂一點
      // 黏在橫絲上的灰塵：紙白的小點，每段一兩顆
      if ((i + Math.round(fraction * 10)) % 2 === 0) ring.add(sphere(mat.paper, 0.014 + fraction * 0.008, ...point.clone().lerp(next, 0.4).multiplyScalar(0.9).toArray(), 6, 4));
    });
    return ring;
  });
  // 幾條鬆脫的絲：從片盤垂到支臂、從鏡頭上的旋鈕牽到機身，還有一條掛在網外面晃
  curvedStrand(strands, red, local([353, 1141]), local([349, 1150]), local([344, 1152]), 0.009, 5);
  curvedStrand(strands, red, local([374, 1151]), local([368, 1153]), local([363, 1148.5]), 0.009, 5);
  curvedStrand(strands, red, local([392, 1183]), local([398, 1180]), local([400.5, 1172]), 0.009, 5);
  web.add(strands, spokes, ...rings);
  register(107, web);
  scene.add(web);

  // 房間裡慢慢飄的塵（光束外面也有，從黑暗裡飄過的白點；數量少，不搶光束裡的灰塵）
  const motes = new Snow({ count: Math.round(90 * deviceTier.particleScale), box: new Vector3(14, 6, 8), center: new Vector3(2, 2.2, 0), size: 14, speed: 0.04, wind: 0.15, color: WHITE });
  scene.add(motes);
  // 陰影：引擎的投影陰影會把放映機、片盤、蜘蛛網投到白色桌面上（不用另外做平面投影）

  // ---- 鏡頭：從後方靠近 → 繞到側面 → 一路推近蜘蛛網，直到網心的特寫 ----
  // 第三輪：原本 0.78 硬切到網心特寫（另一條軌道），改成同一條軌道在 0.6–0.86 之間連續推進去；
  // 整章只有一次「推近→略退」（繞到側面時）和一次「→推近」，之後一路推到底，最後兩格間距拉開、位置接近，章尾慢下來。
  const track = makeCameraTrack([
    { t: -0.3, pos: [-10, 3.6, 1.7], at: [3, 2.3, 0], fov: 40 }, // 放映機的背影襯著遠處的銀幕
    { t: 0.04, pos: [-7.2, 3.2, 1.9], at: [3, 2.3, 0], fov: 38 },
    { t: 0.25, pos: [-5.2, 3.0, 3.2], at: [1.6, 2.3, 0], fov: 38 },
    { t: tilt[0] + 0.07, pos: [-2.4, 3.3, 7.0], at: [-0.2, 2.5, 0], fov: 38 }, // 繞到側面，略高，看兩個片盤
    { t: tilt[1], pos: [0.6, 2.5, 8.6], at: [0.3, 2.1, 0], fov: 36 }, // 正側面：封面上的角度
    { t: 0.6, pos: [1.6, 1.9, 6.0], at: [1.2, 1.7, 0.4], fov: 36 },
    { t: 0.72, pos: [2.2, 1.65, 4.2], at: [hub.x + 0.2, hub.y + 0.08, hub.z], fov: 33 }, // 推近蜘蛛網
    { t: cutToDetail + 0.08, pos: [hub.x + 1.0, hub.y + 0.22, hub.z + 2.25], at: [hub.x + 0.1, hub.y, hub.z], fov: 30 }, // 網心的特寫（原本硬切的那一格）
    { t: 1, pos: [hub.x + 0.7, hub.y + 0.15, hub.z + 1.9], at: [hub.x + 0.1, hub.y, hub.z], fov: 30 },
    { t: 1.3, pos: [hub.x + 0.6, hub.y + 0.12, hub.z + 1.8], at: [hub.x + 0.1, hub.y, hub.z], fov: 30 },
  ]);

  // 片盤轉角：角速度隨進度線性降到 0，在蜘蛛網織完時停住（和平面版相同）
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
    sound: soundScript.sound,
    cues: cueList(pacedCues("matches", []), [{ at: 0.02, cue: "reel" }, { at: 0.64, cue: "spindown" }, { at: 0.86, cue: "stinger" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const time = frame.time;
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.05 - 0.03 * smooth(linearstep(p, 0.7, 0.86))); // 越靠近網心，滑鼠視差越小

      // 片盤：兩個同向轉，轉角是 progress 的函式
      reels[0].rotation.z = reelAngle(p);
      reels[1].rotation.z = reelAngle(p) + 0.5;
      // 底片跟著片盤的轉動捲動、手搖柄跟著轉；片盤還在轉的時候整台機器有很細的震動，停住之後就靜止
      film.offset.x = -reelAngle(p) * REEL_R * 0.55 / 0.8;
      crank.rotation.z = reelAngle(p) * 0.6;
      const running = 1 - clamp((p - START) / (STOP - START), 0, 1);
      projector.position.set(0, Math.sin(time * 61) * 0.004 * running, Math.cos(time * 47) * 0.003 * running);

      // 光束閃爍、灰塵飄、銀幕上的刮痕跳動
      beam.material.uniforms.uTime.value = time;
      dust.material.uniforms.uTime.value = time;
      scratches.forEach((scratch, i) => {
        const tick = Math.floor(time * (5 + i * 2)) + i * 17;
        scratch.position.z = (Math.sin(tick * 12.9898) * 43758.5453 % 1) * SCREEN.halfW * 0.9;
        scratch.visible = tick % 3 !== 0;
      });

      // 蜘蛛網：tilt 時主絲從網心拉出去，pushIn 期間輻絲和三圈橫絲由內往外張開
      const open = (from, to) => smooth(linearstep(p, from, to));
      const sway = 1 + 0.012 * Math.sin(time * 1.3);
      const stages: [Group, number][] = [
        [strands, open(tilt[0] + 0.04, tilt[1] - 0.04)],
        [spokes, open(0.42, pushIn[0] + 0.07)],
        ...rings.map((ring, i): [Group, number] => [ring, open(0.5 + i * 0.07, 0.58 + i * 0.07)]),
      ];
      for (const [group, amount] of stages) {
        group.scale.set(Math.max(amount * sway, 0.0001), Math.max(amount, 0.0001), Math.max(amount, 0.0001));
        group.visible = amount > 0;
      }
      web.rotation.y = Math.sin(time * 0.9) * 0.015; // 被放映機的風吹得微微晃
      motes.update(time);
    },
  };
}
