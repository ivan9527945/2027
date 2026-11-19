// gulf 的 3D 場景：海灣與航道（PRD-3D 6.4）。
// 同一片紅色的海上有兩個地方：
//   綠洲：一塊伸進海裡的黑色岬角，頂上是白色的沙丘；紅色夜空、新月、星星，對岸一排高樓；
//         白袍人騎駱駝往左走，四引擎的紅色客機機頭朝左從頭頂低空飛過。
//   港口：在岬角左邊的遠處。碼頭上的工廠冒黑煙，戰機從煙裡飛出來；油輪停在紅海上，被三條鐵鏈鎖住；碼頭邊一個燒著的油桶。
// 鏡頭跟著客機往左，一路飛到港口（兩地用鏡頭移動相連）；範本 0.78 的硬切在第三輪改成沿碼頭往左移到油桶的連續鏡頭。
//
// 節奏範本 matches 的對應：
//   approach [-0.4, 0.3]  低角度跟著駱駝往左橫移並靠近；客機從對岸的天際線上方飛過來
//   tilt     [0.3, 0.5]   鏡頭上仰看客機從頭頂掠過，再跟著它往左降到港口（0.37–0.5 飛越海面）
//   pushIn   [0.45, 0.78] 黑煙冒出、戰機從煙裡穿出來、油輪停住、三條鐵鏈依序落下拉緊；鏡頭推近並往下搖到鎖鏈與海面
//   cutToDetail 0.78      （第三輪起）0.72–0.9 沿碼頭快速移到燃燒的油桶，背景是被鎖住的油輪
//
// 第二輪：棕櫚改成真的模型（一節節的樹幹、兩層鋸齒狀的葉子）；紅色夜空包住整個綠洲那一側，鏡頭飛向港口時紅雲往後退，
// 港口是白色的天；對岸的高樓加大並分前後兩排，遠的那排淡進霧裡；客機的機翼和尾翼有厚度；海面改成細長起伏的波紋；
// 駱駝是厚紙偶；火焰是擠出的厚火舌；油桶的特寫改成朝海的方向看，背景是被鎖住的油輪和三條鐵鏈。
import {
  BackSide, CatmullRomCurve3, Color, Group, IcosahedronGeometry, InstancedMesh, LatheGeometry, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry,
  Quaternion, Scene, ShaderMaterial, SphereGeometry, TetrahedronGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, deviceTier, linearstep, seededRandom, smooth } from "../core";
import { createRegistry } from "../elements";
import { PACE, pacedCues } from "../pace";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { addFog } from "../shared/set/env";
import { box, cone, cylinder, extrude, lathe, makePalette, sphere } from "../shared/set/model";
import { inkOutline, makeFigure } from "../shared/set/figure";
import { BLACK, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：綠洲的夜裡有耳語；客機從頭頂壓過去（0.3）；港口是陰沉的海和船身的金屬呻吟；戰機衝出（0.5）；三條鐵鏈落下（0.58–0.66），鎖死時一記低頻重擊（0.7）；油桶起火（0.86）。
const soundScript = soundTrack([[0, { night: 0.12, whisper: 0.1, dread: 0.18 }], [0.3, { night: 0.08, dread: 0.2 }], [0.45, { sea: 0.22, metal: 0.25, dread: 0.2, fire: 0.06 }], [0.8, { sea: 0.2, metal: 0.18, fire: 0.4, dread: 0.25 }]]);

const SEA_Y = -1.2; // 海面的高度；岬角的頂面在 y = 0
const PORT = [-34, 6]; // 港口群組在世界裡的位置（x, z）
const QUAY_H = 0.35;
const CUT = PACE.matches.beats.cutToDetail;

// 港口是在自己的座標裡搭的（鏡頭在 +z 往 -z 看，海平面 y = 0），整組繞 Y 轉 90 度放到世界裡。這個函式把港口座標換成世界座標
const W = (x, y, z) => [PORT[0] + z, SEA_Y + y, PORT[1] - x];

// 客機的航線：從右後方的對岸上空飛到左前方，過了頭頂之後往右上方爬升離開
function airlinerAt(p, out) {
  const f = (p - 0.06) / 0.34, late = Math.max(0, f - 0.85);
  return out.set(17 - 30 * f, 7.1 - 3 * f + late * late * 30, -9 + 13.4 * f - late * late * 50);
}

/**
 * 距離單調的鏡頭軌道（第三輪：鏡頭要順）。關鍵格的寫法和 makeCameraTrack 一樣；鏡頭的方向照 makeCameraTrack 內插，
 * 但鏡頭到注視點的距離另外以對數內插（單調、不衝過關鍵格），再沿著那個方向放好鏡頭。
 * pos 和 at 各走各的直線時，兩格之間的距離常會先縮再放（例如跟著客機搖的那一段），畫面就忽近忽遠；這裡把它拉直。
 */
function makeSteadyTrack(keys) {
  const base = makeCameraTrack(keys);
  const logDistance = makeCameraTrack(keys.map((key) => {
    const d = Math.log(Math.hypot(key.pos[0] - key.at[0], key.pos[1] - key.at[1], key.pos[2] - key.at[2]));
    return { t: key.t, pos: [d, 0, 0], at: [d - 1, 0, 0], fov: 0 }; // at 只是讓共用層量到的距離固定為 1
  }));
  const offset = new Vector3();
  return (time) => {
    const shot = base(time);
    const d = Math.exp(logDistance(time).pos.x);
    offset.subVectors(shot.pos, shot.at).setLength(d);
    shot.pos.copy(shot.at).add(offset);
    return shot;
  };
}

/** 平躺的擠出體：outline 是俯視的輪廓 [x, z]，往上擠出 height，底面在 y = 0。 */
function slab(material, outline, height) {
  const mesh = extrude(material, outline.map(([x, z]) => [x, -z]), height);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = height / 2;
  return mesh;
}

/** 車床旋轉體的一段弧（剖面同 lathe），用來把機身分成紅色的機背與黑色的機腹。 */
function partLathe(material, profile, phiStart, phiLength) {
  return new Mesh(new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(r, 0.0001), y)), 18, phiStart, phiLength), material);
}

/** 沿 X 軸躺著的圓柱，中心在 (x, y, z)。 */
function barX(material, radius, length, x, y, z, segments = 14) {
  const mesh = cylinder(material, radius, radius, length, 0, 0, 0, segments);
  mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  return mesh;
}

/** 把一組靜態的 mesh 依材質合併成少數幾個 mesh（省繪製次數，影子也跟著變少）。群組本身要還在原點。 */
function bake(group) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(geometry);
  });
  const baked = new Group();
  for (const [material, list] of byMaterial) baked.add(new Mesh(mergeGeometries(list), material));
  return baked;
}

// 一片棕櫚葉的側面輪廓：葉脈從基部往上拱再垂下去（角度由 from 轉到 to），下緣是一格一格的鋸齒（小葉）
function frondOutline(length, from, to, width) {
  const STEPS = 12, upper = [], lower = [];
  let x = 0, y = 0;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS, angle = from + (to - from) * Math.pow(t, 0.8);
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const w = width * Math.pow(Math.sin(Math.PI * (0.08 + 0.9 * t)), 0.7);
    upper.push([x + nx * w * 0.25, y + ny * w * 0.25]);
    lower.push([x - nx * w * (i % 2 ? 1 : 0.5), y - ny * w * (i % 2 ? 1 : 0.5)]);
    x += (Math.cos(angle) * length) / STEPS;
    y += (Math.sin(angle) * length) / STEPS;
  }
  return [...upper, ...lower.reverse()];
}

/**
 * 一棵棕櫚：樹幹是十節上窄下寬的圓台，一節節往一邊歪上去；樹冠是兩層放射狀的葉子（上層往上拱、下層下垂），
 * 每片葉子是有厚度的擠出體，底下掛幾顆椰子。原點在樹根。
 */
function makePalm(material, height, lean, seed) {
  const random = seededRandom(seed);
  const parts = new Group();
  const SEGMENTS = 10, length = height / SEGMENTS;
  let x = 0, y = 0;
  for (let i = 0; i < SEGMENTS; i++) {
    const t = i / SEGMENTS, tilt = lean * (0.3 + t * 1.2);
    const radius = height * (0.05 - 0.022 * t);
    const segment = cylinder(material, radius * 0.84, radius * 1.14, length * 1.05, 0, 0, 0, 9);
    segment.position.set(x + (Math.sin(tilt) * length) / 2, y + (Math.cos(tilt) * length) / 2, 0);
    segment.rotation.z = -tilt;
    parts.add(segment);
    x += Math.sin(tilt) * length;
    y += Math.cos(tilt) * length;
  }
  const crown = new Group();
  crown.position.set(x, y, 0);
  crown.add(sphere(material, height * 0.055, 0, 0, 0, 10, 8));
  const FRONDS = 12;
  for (let i = 0; i < FRONDS; i++) {
    const upper = i % 2 === 0;
    const reach = height * (upper ? 0.5 : 0.43) * (0.85 + random() * 0.3);
    const holder = new Group();
    holder.add(extrude(material, frondOutline(reach, upper ? 0.9 : 0.3, upper ? -1.05 : -1.4, reach * 0.15), height * 0.04));
    holder.rotation.y = (i / FRONDS) * Math.PI * 2 + random() * 0.3;
    crown.add(holder);
  }
  for (let i = 0; i < 3; i++) crown.add(sphere(material, height * 0.034, Math.cos(i * 2.1) * height * 0.05, -height * 0.05, Math.sin(i * 2.1) * height * 0.05, 8, 6));
  parts.add(crown);
  return bake(parts);
}

// 火舌的輪廓（寬約 1、高 1）：三道尖，中間那道最高
const FLAME_OUTLINE = [[-0.4, 0], [0.4, 0], [0.47, 0.22], [0.4, 0.5], [0.34, 0.3], [0.25, 0.42], [0.2, 0.74], [0.11, 0.56], [0.04, 1], [-0.07, 0.6], [-0.15, 0.82], [-0.24, 0.45], [-0.3, 0.62], [-0.4, 0.38], [-0.47, 0.5], [-0.46, 0.18]];

// 海面：紅底上一道道細長、微微起伏的黑色波紋（封面上的紅海就是這樣畫的）。波紋排成以綠洲前方為圓心的同心弧，
// 所以在綠洲（往 -z 看）和在港口（往 -x 看）都是橫在眼前的；遠處的波紋漸漸淡掉，海平線是乾淨的紅。
function makeSea() {
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBase: { value: new Color(RED) }, uWave: { value: new Color(BLACK) }, uCentre: { value: new Vector2(3, 7) } },
    vertexShader: "varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform float uTime; uniform vec3 uBase, uWave; uniform vec2 uCentre; varying vec3 vWorld;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main() {
        vec2 q = vWorld.xz - uCentre;
        float row = length(q) / 0.6;
        float id = floor(row), f = fract(row);
        float arc = atan(q.x, -q.y) * (id + 0.5) * 0.6; // 沿著這一圈走了多遠
        float x = arc / (2.2 + hash(id) * 1.6) + uTime * (0.03 + hash(id + 3.0) * 0.04) * (mod(id, 2.0) < 1.0 ? 1.0 : -1.0) + hash(id + 7.0) * 9.0;
        float seg = fract(x), cell = floor(x);
        float len = 0.4 + hash(cell + id * 13.0) * 0.5;
        float along = clamp(seg / len, 0.0, 1.0);
        float bulge = pow(sin(along * 3.14159), 0.6);
        float wobble = 0.13 * sin(seg * 15.0 + hash(cell) * 6.28);
        float ink = step(abs(f - 0.5 - wobble), 0.25 * bulge) * step(seg, len) * step(0.3, hash(cell * 1.7 + id));
        ink *= 1.0 - smoothstep(55.0, 120.0, distance(vWorld, cameraPosition));
        gl_FragColor = vec4(mix(uBase, uWave, ink), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(460, 460), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.update = (time) => (material.uniforms.uTime.value = time);
  return mesh;
}

// 新月的輪廓：大圓減掉一個往右上偏的小圓
function crescentOutline(R) {
  const r = R * 0.84, d = R * 0.42, phi = 0.62;
  const cx = Math.cos(phi) * d, cy = Math.sin(phi) * d;
  const alpha = Math.acos((R * R + d * d - r * r) / (2 * R * d));
  const beta = Math.atan2(Math.sin(phi + alpha) * R - cy, Math.cos(phi + alpha) * R - cx) - phi;
  const points = [];
  for (let i = 0; i <= 28; i++) {
    const a = phi + alpha + ((Math.PI * 2 - alpha * 2) * i) / 28;
    points.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  for (let i = 1; i < 20; i++) {
    const a = phi - beta - ((Math.PI * 2 - beta * 2) * i) / 20;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return points;
}

// 四芒星（封面上的星星是這個形狀）
const sparkleOutline = (r) => Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4, radius = i % 2 ? r * 0.2 : r;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
});

// 天空：封面上的紅色夜空是一團邊緣起伏的紅雲，外面是白的。這裡把它畫在天空球上，佔住從 uLeft 到 uRight 的方位角
// （0 是 -z，往 +x 為正），頂端和兩側是起伏的雲邊，貼近海平線留一圈白（紅海和紅天才分得開）。
// 在綠洲時紅雲包住整個視野；鏡頭飛向港口時 uLeft 往右退，港口那邊就是白色的天，黑煙和紅色戰機都襯在白底上。
function makeSky() {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { uRed: { value: new Color(RED) }, uWhite: { value: new Color(WHITE) }, uLeft: { value: -2.3 }, uRight: { value: 2.4 } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 uRed, uWhite; uniform float uLeft, uRight; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float az = atan(d.x, -d.z), el = asin(clamp(d.y, -1.0, 1.0));
        float edge = 0.08 * sin(el * 11.0) + 0.04 * sin(el * 27.0 + 1.0) + 0.06 * sin(el * 4.0 + 2.0);
        float top = 1.42 + 0.07 * sin(az * 7.0) + 0.04 * sin(az * 17.0 + 1.0);
        float low = 0.035 + 0.012 * sin(az * 9.0) + 0.008 * sin(az * 23.0 + 2.0);
        float red = step(uLeft + edge, az) * step(az, uRight - edge) * step(low, el) * step(el, top);
        gl_FragColor = vec4(mix(uWhite, uRed, red), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new Mesh(new SphereGeometry(190, 48, 24), material);
}

/**
 * 兩節手臂的解算：調整肩膀（x、y、z）與手肘（x）的角度，讓 makeFigure 的手掌落在世界座標 target 上。
 * 座標下降法慢慢逼近（只在建場景時算一次）。
 */
function reachTo(figure, side, target) {
  const j = figure.userData.joints;
  const shoulder = j[`shoulder${side}`], elbow = j[`elbow${side}`];
  const hand = elbow.children.find((child) => child.isMesh && Math.abs(child.position.y + 0.31) < 0.001);
  const at = new Vector3();
  const error = () => {
    figure.updateMatrixWorld(true);
    return hand.getWorldPosition(at).distanceTo(target);
  };
  const params = [[shoulder.rotation, "x", -3.0, 1.0], [shoulder.rotation, "z", -1.2, 1.2], [shoulder.rotation, "y", -0.8, 0.8], [elbow.rotation, "x", -2.4, 0]];
  let best = error();
  for (let step = 0.4; step > 0.002; step *= 0.6) {
    for (let round = 0; round < 6; round++) {
      for (const [rotation, axis, lo, hi] of params) {
        for (const delta of [step, -step]) {
          const before = rotation[axis];
          rotation[axis] = Math.min(hi, Math.max(lo, before + delta));
          const e = error();
          if (e < best - 1e-6) best = e;
          else rotation[axis] = before;
        }
      }
    }
  }
  return best;
}

// 黑色單峰駱駝加白袍騎士。單位約為世界單位，身長約 2.4、駝峰頂高約 1.6；原點在四隻腳中間的地面，朝 -x。
function buildCamelRider(mat) {
  const g = new Group();
  const black = mat.ink, white = mat.paper, red = mat.red;
  const ell = (material, rx, ry, rz, x, y, z = 0) => {
    const m = sphere(material, 1, x, y, z, 24, 16);
    m.scale.set(rx, ry, rz);
    return m;
  };
  const tube = (material, points, radius) => {
    const curve = new CatmullRomCurve3(points.map(([x, y, z = 0]) => new Vector3(x, y, z)));
    return new Mesh(new TubeGeometry(curve, 24, radius, 10, false), material);
  };
  // 身體與駝峰
  g.add(ell(black, 0.78, 0.36, 0.34, 0.08, 1.12));
  g.add(ell(black, 0.42, 0.34, 0.27, 0.2, 1.36));
  // S 形的長脖子：從胸口往前下彎，再往上接到頭
  const neck = new Group();
  neck.position.set(-0.55, 1.15, 0);
  neck.add(tube(black, [[0, 0.05], [-0.28, -0.08], [-0.52, 0.02], [-0.66, 0.3], [-0.7, 0.55]], 0.11));
  neck.add(ell(black, 0.13, 0.13, 0.12, -0.02, 0.0)); // 接到胸口的圓肩
  // 頭：長的口鼻、下垂的唇、兩隻小耳朵、白色的眼睛
  const head = new Group();
  head.position.set(-0.72, 0.62, 0);
  head.add(ell(black, 0.13, 0.11, 0.1, 0, 0));
  head.add(ell(black, 0.2, 0.075, 0.075, -0.17, -0.05));
  for (const z of [0.06, -0.06]) {
    const ear = cone(black, 0.03, 0.08, 0.05, 0.08, z, 6);
    ear.rotation.z = 0.4;
    head.add(ear);
  }
  for (const z of [0.088, -0.088]) head.add(sphere(mat.flat(WHITE), 0.022, -0.06, 0.03, z, 10, 8));
  neck.add(head);
  g.add(neck);
  g.userData.neck = neck;
  // 尾巴
  const tail = tube(black, [[0.82, 1.18], [0.9, 1.0], [0.9, 0.8]], 0.03);
  g.add(tail);
  // 四條腿：大腿（上粗）＋膝＋小腿＋扁平的蹄。對角的兩條同相
  const legs = [];
  for (const [x, z, phase] of [[-0.45, 0.16, 0], [-0.45, -0.16, Math.PI], [0.55, 0.16, Math.PI], [0.55, -0.16, 0]]) {
    const hip = new Group();
    hip.position.set(x, 1.0, z);
    hip.add(cylinder(black, 0.085, 0.06, 0.5, 0, -0.5, 0, 10));
    const knee = new Group();
    knee.position.y = -0.5;
    knee.add(sphere(black, 0.065, 0, 0, 0, 10, 8));
    knee.add(cylinder(black, 0.05, 0.04, 0.46, 0, -0.46, 0, 10));
    const hoof = ell(black, 0.09, 0.035, 0.07, -0.02, -0.47);
    knee.add(hoof);
    hip.add(knee);
    hip.userData = { phase, knee };
    g.add(hip);
    legs.push(hip);
  }
  g.userData.legs = legs;

  // 膝蓋的胼胝、蹄上的趾縫：黑色的小球與細縫，靠邊緣光看得出來
  for (const leg of legs) {
    leg.userData.knee.add(sphere(black, 0.058, 0, -0.02, 0, 10, 8));
  }
  // 鞍：駝峰前一塊黑色的鞍座與前鞍橋（騎士的白袍蓋在上面）
  g.add(ell(black, 0.2, 0.06, 0.3, -0.12, 1.44), cylinder(black, 0.025, 0.035, 0.16, -0.32, 1.42, 0, 8));
  inkOutline(g, { width: 0.012 });
  g.userData.tail = tail;

  // 白袍騎士（第四輪改成立體人物 makeFigure）：白袍（長到膝下的外袍）、白頭巾與黑色頭箍、紅色的臉和手；
  // 跨坐在駝峰前的鞍上，臉朝 -x，雙手往前握著紅色韁繩
  const RIDER_H = 1.5;
  const k = RIDER_H / 1.75;
  // 白袍用自己的光向（從騎士的左前上方、也就是鏡頭這一側來）：場景的主光在右前方，騎士臉朝 -x，
  // 用場景的光時朝鏡頭的那半身整片是排線的暗面，封面上的騎士是一個乾淨的白色剪影
  const robe = mat.custom(WHITE, "#0a0a0a", 0);
  robe.uniforms.uLight = { value: new Vector3(-0.35, 0.8, 0.6).normalize() };
  const rider = makeFigure(mat, { suit: robe, pants: robe, hairMaterial: robe, skin: red, shirt: null, shoes: black, hair: "keffiyeh", coat: true, build: 1.12, height: RIDER_H });
  rider.rotation.y = -Math.PI / 2;
  rider.position.set(-0.12, 1.47 - 0.95 * k, 0);
  rider.userData.pose({ hipL: [-1.25, 0, 0.62], hipR: [-1.25, 0, -0.62], kneeL: 1.15, kneeR: 1.15, spine: [0.06, 0, 0] });
  // 白袍的前襟：一道細黑線（白色的面上才有東西讓排線落上去）
  rider.userData.joints.spine.add(box(black, 0.012, 0.4, 0.012, 0, 0.24, 0.118));
  // keffiyeh 的頭巾在 figure.js 裡固定用 mat.paper：換成同一塊白袍的材質
  rider.traverse((o) => {
    if ((o as Mesh).isMesh && (o as Mesh).material === white) (o as Mesh).material = robe;
  });
  // 白袍不接收陰影貼圖（陰影貼圖用的是場景的主光向，會把朝鏡頭的面當成被自己擋住），但照樣投影到沙地上
  rider.traverse((o) => {
    if ((o as Mesh).isMesh && (o as Mesh).material === robe) Object.assign(o, { castShadow: true, receiveShadow: false }).userData.shadowSet = true;
  });
  g.add(rider);
  g.userData.rider = rider;
  // 紅色韁繩：從手拉到駱駝的口鼻
  const reins = new Group();
  for (const z of [0.07, -0.07]) reins.add(tube(red, [[-0.44, 1.54, z], [-0.85, 1.55, z * 1.2], [-1.25, 1.75, z * 1.3], [-1.38, 1.73, z]], 0.012));
  g.add(reins);
  g.updateMatrixWorld(true);
  reachTo(rider, "L", new Vector3(-0.46, 1.54, 0.08));
  reachTo(rider, "R", new Vector3(-0.46, 1.54, -0.08));
  const j = rider.userData.joints;
  g.userData.armPose = ["shoulderL", "shoulderR", "elbowL", "elbowR"].map((name) => [name, j[name].rotation.clone()]);
  g.scale.setScalar(0.95);
  return g;
}

export default async function createGulfSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(40, 1, 0.05, 500);
  const { entries, register } = createRegistry(plan.id);
  // 光從右前上方來：綠洲（鏡頭往 -z 看）和港口（鏡頭往 -x 看）朝鏡頭的面都是亮面
  const mat = makePalette([0.45, 0.8, 0.5]);
  const random = seededRandom(2027);
  const white = mat.flat(WHITE), black = mat.flat(BLACK), red = mat.flat(RED);
  const glow = mat.flat(WHITE, false); // 月亮和星星：不被霧吃掉
  // 霧：綠洲是紅色的夜，遠處的高樓淡進紅色的天；飛到港口的途中換成白霧，回頭看綠洲就淡在白色的天裡
  const FOG = { near: 18, far: 115 };
  const fogRed = new Color(RED), fogWhite = new Color(WHITE), fogColor = new Color(RED);
  addFog(scene, mat, fogColor, FOG.near, FOG.far);

  // ---- #26 紅色夜空、#89 紅海 ----
  const sky = makeSky();
  register(26, sky);
  scene.add(sky);

  const sea = makeSea();
  sea.position.set(-20, SEA_Y, -10);
  register(89, sea);
  scene.add(sea);

  // ================= 綠洲 =================

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #32 岬角：伸進海裡的一塊台地，側面是黑色的崖壁，頂面是白沙；尖端朝右（和封面同向） ----
  const headland = slab([white, mat.ink], [[-11, -3.4], [-4, -3.7], [6, -3.2], [10, -1.8], [14, 0.4], [9.6, 1.5], [4, 2.3], [-3, 2.6], [-11, 2.4]], -SEA_Y);
  headland.position.y = SEA_Y / 2;
  register(32, headland);
  scene.add(headland);
  // 沙丘：壓扁的球（壓扁後重算法線，只有背光的陡坡是黑的）
  const dunes = new Group();
  for (const [x, z, rx, h, rz] of [[-6.5, -2.2, 3.4, 0.55, 1.2], [4.8, -2.5, 3.8, 0.7, 1.1], [8.2, -1.4, 2.6, 0.42, 0.9], [-8.5, 0.9, 2.0, 0.22, 0.6]]) {
    const geometry = new SphereGeometry(1, 24, 12).scale(rx, h, rz);
    geometry.computeVertexNormals();
    const dune = new Mesh(geometry, mat.paper);
    dune.position.set(x, 0, z);
    dunes.add(dune);
  }
  scene.add(dunes);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #27 新月（有厚度的白色月牙）、#28 五顆星（四芒星，放在不同的遠近） ----
  const moon = extrude(glow, crescentOutline(3.4), 0.5);
  moon.position.set(-24, 30, -78);
  moon.rotation.y = 0.25;
  register(27, moon);
  scene.add(moon);

  const stars = new Group();
  for (const [x, y, z, r] of [[-15, 13, -60, 1.1], [3.5, 20, -84, 1.5], [12, 10.5, -46, 0.8], [6, 9.2, -34, 0.55], [19, 17, -70, 1.2]]) {
    const star = new Group(); // 兩片互相垂直的四芒星，從哪個方向看都是星形
    for (const turn of [0, Math.PI / 2]) {
      const blade = extrude(glow, sparkleOutline(r), r * 0.12);
      blade.rotation.y = turn;
      star.add(blade);
    }
    star.position.set(x, y, z);
    stars.add(star);
  }
  register(28, stars, { count: 5 });
  scene.add(stars);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #30 天際線：對岸一座黑色的城，細長的高樓分前後兩排（後排在霧裡淡一點），有的退縮、有的頂著尖塔 ----
  const skylineParts = new Group();
  skylineParts.add(box(mat.ink, 86, 0.9, 10, -14, SEA_Y + 0.45, -47));
  const groundY = SEA_Y + 0.9;
  for (let i = 0; i < 30; i++) {
    const back = i % 2, width = 1.5 + random() * 1.5;
    // 最高的一群在棕櫚和駱駝之間（和封面上的位置一樣），往兩邊漸漸變矮
    const x = -52 + i * 2.75 + random() * 1.2, centre = Math.exp(-Math.pow((x + 14) / 16, 2));
    const height = (3.2 + random() * 3.5 + centre * (5 + random() * 5)) * (back ? 1.15 : 0.85), z = back ? -50 : -44;
    skylineParts.add(box(mat.ink, width, height, width, x, groundY + height / 2, z));
    const kind = i % 4;
    if (kind === 0) skylineParts.add(cone(mat.ink, width * 0.34, 1.8 + centre * 2, x, groundY + height, z, 4)); // 尖頂
    if (kind === 1) skylineParts.add(box(mat.ink, width * 0.6, 1.1, width * 0.6, x, groundY + height + 0.55, z), cylinder(mat.ink, 0.05, 0.08, 1.6, x, groundY + height + 1.1, z, 6)); // 退縮的頂層和天線
    if (kind === 2) skylineParts.add(box(mat.ink, width * 0.72, 0.7, width * 0.72, x, groundY + height + 0.35, z), box(mat.ink, width * 0.42, 0.7, width * 0.42, x, groundY + height + 1.05, z));
  }
  // 一座特別高的針塔
  skylineParts.add(lathe(mat.ink, [[1.5, 0], [1.2, 3], [0.85, 7], [0.5, 11], [0.22, 14.5], [0.05, 17.5], [0.01, 19]], 10));
  skylineParts.children.at(-1).position.set(-12, groundY, -47);
  const skyline = bake(skylineParts);
  register(30, skyline);
  scene.add(skyline);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #29 兩棵棕櫚：真的模型（一節節的樹幹、十二片有厚度的葉子、椰子），左邊那棵高、右邊那棵矮 ----
  const palms = new Group();
  for (const [x, z, height, lean, turn, seed] of [[-3.7, -1.5, 4.0, 0.16, 0.5, 29], [-1.6, -0.7, 2.9, -0.13, -0.4, 30]]) {
    const palm = makePalm(mat.ink, height, lean, seed);
    palm.position.set(x, 0, z);
    palm.rotation.y = turn;
    palms.add(palm);
  }
  register(29, palms, { count: 2 });
  scene.add(palms);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #31 駱駝與白袍騎士：真的 3D 模型（2026-11-19 使用者回饋「人物跟駱駝怪怪的」後改寫） ----
  // 先前用平面版的剪影做厚紙板，封面上那個抽象的白色剪影在 3D 裡讀起來像一隻白鳥。
  // 現在駱駝和騎士都用幾何體拼：黑色單峰駱駝（身體、駝峰、S 形的長脖子、頭、四條會走的腿、尾巴），
  // 白袍騎士坐在駝峰前（長袍、紅色的臉、白頭巾垂到肩後、黑色頭箍、兩隻手握著紅色韁繩、腿垂在駱駝身側）。
  // 顏色分配照封面：駱駝全黑、騎士白袍、紅色韁繩；駱駝朝 -x（往左）走。
  const camel = buildCamelRider(mat);
  const camelLegs = camel.userData.legs;
  const camelFrom = 6.2, camelTo = 0.2, camelZ = 0.6, camelStride = 0.46;
  register(31, camel);
  scene.add(camel);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #25 四引擎客機：機身上半紅、下半黑，黑色主翼下掛四具紅色引擎，紅色垂直尾翼；機頭朝 -x（左） ----
  const airliner = new Group();
  const fuselageProfile = [[0.02, 0], [0.16, 0.5], [0.33, 1.6], [0.42, 2.7], [0.42, 5.6], [0.37, 6.25], [0.24, 6.75], [0.02, 7]];
  const fuselage = new Group();
  const BELLY = 0.6; // 紅色往下包過機身中線多少弧度；剩下的機腹是黑的
  fuselage.add(partLathe(mat.red, fuselageProfile, -BELLY, Math.PI + BELLY * 2), partLathe(mat.ink, fuselageProfile, Math.PI + BELLY, Math.PI - BELLY * 2));
  fuselage.rotation.z = Math.PI / 2; // 車床的軸轉成 -x：機尾在 x = 3.5，機頭在 x = -3.5
  fuselage.position.x = 3.5;
  const matte = mat.custom("#141414", BLACK, 0); // 沒有邊緣光的黑：薄薄的機翼斜著看才不會整片變白
  // 主翼有厚度：外翼一層，靠機身的內段再加厚一層（翼根最厚），底下是翼根的整流罩
  const wings = slab(matte, [[-1.0, 0], [1.7, 3.5], [2.3, 3.5], [0.8, 0], [2.3, -3.5], [1.7, -3.5]], 0.15);
  wings.position.y = -0.26;
  const wingRoot = slab(matte, [[-0.85, 0], [0.5, 1.75], [1.45, 1.75], [0.75, 0], [1.45, -1.75], [0.5, -1.75]], 0.24);
  wingRoot.position.y = -0.3;
  const tailplane = slab(matte, [[2.5, 0], [3.35, 1.3], [3.7, 1.3], [3.35, 0], [3.7, -1.3], [3.35, -1.3]], 0.11);
  tailplane.position.y = 0.06;
  // 垂直尾翼是黑的，靠根部兩道紅色斜條（和封面一樣）
  const finLead = (t) => [2.1 + 1.2 * t, 0.3 + 1.45 * t], finTrail = (t) => [3.5 + 0.3 * t, 0.2 + 1.55 * t];
  const fin = new Group();
  fin.add(extrude(matte, [finLead(0), finLead(1), finTrail(1), finTrail(0)], 0.14));
  for (const [from, to] of [[0.1, 0.22], [0.32, 0.44]]) fin.add(extrude(mat.red, [finLead(from), finLead(to), finTrail(to), finTrail(from)], 0.17));
  airliner.add(fuselage, wings, wingRoot, tailplane, fin, box(mat.ink, 0.34, 0.1, 0.5, -2.95, 0.3, 0)); // 最後一塊是駕駛艙的窗
  for (const side of [1, -1]) {
    for (const [x, z] of [[0.05, 1.25], [0.95, 2.4]]) {
      airliner.add(barX(mat.red, 0.17, 0.85, x - 0.3, -0.52, side * z), barX(mat.ink, 0.12, 0.06, x - 0.74, -0.52, side * z), box(matte, 0.55, 0.26, 0.07, x, -0.38, side * z)); // 引擎、進氣口、掛架
    }
    for (let i = 0; i < 12; i++) if (i !== 5 && i !== 6) airliner.add(box(black, 0.11, 0.08, 0.04, -2.5 + i * 0.42, 0.13, side * 0.4)); // 舷窗
  }
  register(25, airliner);
  scene.add(airliner);

  const oasis = [headland, dunes, skyline, palms, camel];

  // ================= 港口 =================
  const port = new Group();
  port.position.set(PORT[0], SEA_Y, PORT[1]);
  port.rotation.y = Math.PI / 2;
  scene.add(port);

  // 碼頭：白色的平台，邊緣一道黑線和幾個繫纜樁
  port.add(box(mat.paper, 18, QUAY_H, 22, -11.2, QUAY_H / 2, -5), box(black, 0.12, QUAY_H + 0.02, 22, -2.2, QUAY_H / 2, -5));
  const bollardParts = new Group();
  for (let i = 0; i < 6; i++) bollardParts.add(cylinder(mat.ink, 0.1, 0.13, 0.26, -2.55, QUAY_H, 5 - i * 1.7, 10), cylinder(mat.ink, 0.15, 0.15, 0.05, -2.55, QUAY_H + 0.24, 5 - i * 1.7, 10));
  const bollards = bake(bollardParts);
  port.add(bollards);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #86 工廠：黑色的廠房上立著 12 根煙囪，中間橫著管線 ----
  const factory = new Group();
  factory.add(
    box(mat.ink, 7.4, 0.5, 2.6, -6.7, QUAY_H + 0.25, -3.7),
    box(mat.ink, 1.6, 1.1, 1.2, -8.6, QUAY_H + 0.55, -4.4),
    box(mat.ink, 1.2, 0.85, 1.0, -4.4, QUAY_H + 0.42, -4.3),
    cylinder(mat.ink, 0.5, 0.5, 0.9, -6.5, QUAY_H + 0.5, -3.1, 16),
  );
  const CHIMNEYS = [ // [x, z, 高, 底半徑]
    [-9.7, -3.2, 2.1, 0.17], [-9.1, -4.3, 3.0, 0.19], [-8.5, -3.0, 1.5, 0.13], [-7.7, -4.5, 3.7, 0.21],
    [-7.1, -3.3, 2.4, 0.15], [-6.5, -4.1, 2.8, 0.16], [-5.9, -3.0, 1.7, 0.12], [-5.3, -4.4, 4.0, 0.21],
    [-4.8, -3.4, 2.3, 0.14], [-4.3, -4.1, 3.1, 0.17], [-3.8, -3.0, 1.6, 0.12], [-8.0, -3.7, 1.9, 0.12],
  ];
  const chimneys = new Group();
  for (const [x, z, height, radius] of CHIMNEYS) {
    chimneys.add(cylinder(mat.ink, radius * 0.62, radius, height, x, QUAY_H + 0.5, z, 12), cylinder(mat.ink, radius * 0.8, radius * 0.8, 0.07, x, QUAY_H + 0.5 + height, z, 12));
  }
  for (const [y, x0, x1, z] of [[1.3, -9.7, -7.1, -3.25], [1.7, -6.5, -4.3, -4.1], [1.0, -5.9, -3.8, -3.0]]) chimneys.add(barX(mat.ink, 0.045, x1 - x0, (x0 + x1) / 2, QUAY_H + 0.5 + y, z, 8));
  register(86, chimneys, { count: 12 });
  factory.add(chimneys);
  port.add(factory);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #87 黑煙：六根最高的煙囪各冒一道，一顆顆黑色的煙團往右上方（戰機那邊）飄 ----
  const PLUMES = [1, 3, 5, 7, 9, 4].map((i) => CHIMNEYS[i]);
  const puffCount = Math.round(168 * deviceTier.particleScale / 6) * 6;
  const puffs = new InstancedMesh(new IcosahedronGeometry(1, 1), black, puffCount);
  puffs.frustumCulled = false;
  const puffSeeds = Array.from({ length: puffCount }, () => [random(), random(), random()]);
  const smoke = new Group();
  smoke.add(puffs);
  register(87, smoke, { count: 6 });
  port.add(smoke);
  const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3(), still = new Quaternion();

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #88 油輪：黑色船身（俯視輪廓擠出，船頭朝右）、紅色水線、船尾的紅色艙房、甲板上的桅杆 ----
  const tanker = new Group();
  const HULL_H = 1.3, BEAM = 0.85;
  const hullOutline = [[-5, -0.55], [-4.7, -BEAM], [3.3, -BEAM], [5, 0], [3.3, BEAM], [-4.7, BEAM], [-5, 0.55]];
  const waterline = slab(red, hullOutline.map(([x, z]) => [x * 1.006, z * 1.04]), 0.2);
  tanker.add(slab(mat.ink, hullOutline, HULL_H), waterline);
  for (let i = 0; i < 7; i++) tanker.add(box(white, 0.55, 0.05, 0.03, -1.9 + i * 0.8, HULL_H - 0.1, BEAM + 0.01)); // 舷邊的白色短線
  tanker.add(
    box(mat.red, 1.9, 0.95, 1.4, -3.6, HULL_H + 0.475, 0), // 艙房
    box(mat.ink, 2.1, 0.12, 1.5, -3.6, HULL_H + 1.0, 0),
    box(mat.ink, 1.0, 0.5, 1.0, -3.9, HULL_H + 1.3, 0), // 駕駛台
    box(mat.ink, 0.9, 0.5, 1.3, -2.3, HULL_H + 0.25, 0),
    cylinder(mat.ink, 0.045, 0.045, 1.5, -3.9, HULL_H + 1.55, 0, 8), // 主桅與橫桿
    box(mat.ink, 0.7, 0.06, 0.06, -3.9, HULL_H + 2.5, 0),
    box(mat.ink, 0.4, 0.06, 0.06, -3.9, HULL_H + 2.8, 0),
    box(mat.ink, 0.8, 1.0, 1.0, 3.0, HULL_H + 0.5, 0), // 船頭的黑色艙塊
    cylinder(mat.ink, 0.035, 0.035, 0.9, 3.9, HULL_H, 0, 8),
    box(mat.ink, 0.4, 0.05, 0.05, 3.9, HULL_H + 0.6, 0),
    sphere(red, 0.13, 3.95, 0.7, 0.5, 12, 8), // 船頭的紅點
  );
  for (let i = 0; i < 3; i++) tanker.add(box(black, 0.2, 0.2, 0.04, -4.1 + i * 0.5, HULL_H + 0.6, 0.7)); // 艙房的窗
  const TANKER_X = 3.6, TANKER_Z = -2.5;
  tanker.position.set(TANKER_X, 0, TANKER_Z);
  register(88, tanker);
  port.add(tanker);

  // 三條鐵鏈：每一節是一個真的鐵環，相鄰兩節互相垂直扣在一起。從甲板邊斜掛到水線（封面上是 \ / \ 三條）
  const linkGeometry = new TorusGeometry(0.085, 0.028, 6, 14);
  const rollX = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  const chains = [[-1.5, -0.4], [0.85, -0.05], [1.7, 2.8]].map(([topX, bottomX]) => {
    const top = new Vector3(topX, HULL_H - 0.02, BEAM + 0.07), bottom = new Vector3(bottomX, 0.03, BEAM + 0.07);
    const count = Math.round(top.distanceTo(bottom) / 0.135) + 1;
    const lean = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.atan2(bottom.y - top.y, bottom.x - top.x));
    const links = Array.from({ length: count }, (_, k) => {
      const link = new Mesh(linkGeometry, white);
      link.scale.x = 1.45;
      link.quaternion.copy(lean);
      if (k % 2) link.quaternion.multiply(rollX);
      tanker.add(link);
      return link;
    });
    return { top, bottom, links };
  });

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #90 四架戰機（一大三小）：紅色機身、三角翼、雙垂尾，機腹是黑的；機頭朝 +x ----
  function makeJet(size) {
    const jet = new Group();
    const body = lathe(mat.red, [[0.03, 0], [0.075, 0.04], [0.075, 0.5], [0.055, 0.78], [0.004, 1]], 12);
    body.rotation.z = -Math.PI / 2;
    body.position.x = -0.5;
    const wingOutline = [[0.16, 0], [-0.22, 0.38], [-0.33, 0.38], [-0.26, 0], [-0.33, -0.38], [-0.22, -0.38]];
    const tailOutline = [[-0.3, 0], [-0.45, 0.19], [-0.53, 0.19], [-0.48, 0], [-0.53, -0.19], [-0.45, -0.19]];
    const belly = slab(mat.ink, wingOutline, 0.025);
    belly.position.y = -0.024;
    const canopy = sphere(mat.ink, 0.05, 0.2, 0.055, 0, 10, 8);
    canopy.scale.set(2.4, 0.8, 0.8);
    jet.add(body, slab(mat.red, wingOutline, 0.04), slab(mat.red, tailOutline, 0.034), belly, canopy);
    for (const side of [1, -1]) {
      const tail = extrude(mat.red, [[-0.24, 0.04], [-0.4, 0.24], [-0.47, 0.24], [-0.44, 0.04]], 0.03);
      tail.position.z = side * 0.065;
      tail.rotation.x = side * 0.3;
      jet.add(tail);
    }
    jet.scale.setScalar(size);
    return jet;
  }
  const jetHeading = new Vector3(1, 0.14, 0.3).normalize();
  const JETS = [[7.8, 4.4, 1.0, 2.9], [5.2, 3.6, -0.4, 1.7], [3.6, 4.4, -1.6, 1.45], [2.2, 3.5, -2.6, 1.3]]; // [停留的位置 x, y, z, 大小]
  const jets = new Group();
  for (const [x, y, z, size] of JETS) {
    const jet = makeJet(size);
    jet.userData.rest = new Vector3(x, y, z);
    jet.rotation.set(0.45, -Math.atan2(jetHeading.z, jetHeading.x), Math.asin(jetHeading.y)); // 稍微側傾，看得到機背
    jets.add(jet);
  }
  register(90, jets, { count: 4 });
  port.add(jets);

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- #92 燃燒的油桶：車床做的鐵桶（三道箍），桶身幾道紅色反光；火是六片擠出的厚火舌交叉插在桶口，加上往上飄的紅色火星 ----
  const barrel = new Group();
  const R = 0.4;
  barrel.add(
    lathe(mat.ink, [[R - 0.03, 0], [R, 0.03], [R, 0.3], [R + 0.035, 0.33], [R + 0.035, 0.38], [R, 0.41], [R, 0.66], [R + 0.035, 0.69], [R + 0.035, 0.74], [R, 0.77], [R, 1.04], [R + 0.03, 1.07], [R - 0.03, 1.07], [R - 0.03, 0.98], [0, 0.98]], 28),
    cylinder(red, R + 0.012, R + 0.012, 0.035, 0, 0.0, 0, 28), // 桶底的紅邊
  );
  for (const [angle, y, height] of [[4.3, 0.44, 0.2], [4.3, 0.8, 0.22], [4.62, 0.08, 0.2], [3.95, 0.44, 0.12]]) {
    const glint = box(red, 0.035, height, 0.02, Math.cos(angle) * (R + 0.006), y + height / 2, Math.sin(angle) * (R + 0.006));
    glint.rotation.y = Math.PI / 2 - angle;
    barrel.add(glint);
  }
  const flames = new Group();
  // 三片交叉的大火舌，裡面再插三片小的；每片都是擠出的厚板
  for (let i = 0; i < 6; i++) {
    const inner = i >= 3;
    const sheet = extrude(inner ? mat.red : red, FLAME_OUTLINE, 0.07);
    sheet.rotation.y = (i * Math.PI) / 3 + (inner ? 0.82 : 0.3);
    sheet.userData.size = inner ? [0.6, 0.62] : [1.0, 0.98];
    sheet.userData.noShadow = true;
    flames.add(sheet);
  }
  flames.position.y = 0.94;
  const emberCount = Math.round(26 * deviceTier.particleScale);
  const embers = new InstancedMesh(new TetrahedronGeometry(0.035), red, emberCount);
  embers.frustumCulled = false;
  embers.userData.noShadow = true;
  const emberSeeds = Array.from({ length: emberCount }, () => [random(), random(), random()]);
  barrel.add(flames, embers);
  const BARREL: [number, number, number] = [-4.6, QUAY_H, 3.4];
  barrel.position.set(...BARREL);
  register(92, barrel);
  port.add(barrel);

  // 影子：第四輪拿掉平面投影，沙地上的駱駝與棕櫚、碼頭上的工廠與油桶由引擎的陰影貼圖投影

  await chapterContext.yield?.(); // 讓出主執行緒：一章的建構拆成幾個短任務（見 main.ts 的 buildContext）
  // ---- 鏡頭 ----
  const planePos = new Vector3();
  const lookAtPlane = (p) => airlinerAt(p, planePos).toArray();
  // 從 from 看向 to 的那條視線上、距離 from 為 distance 的點
  const beyond = (from, to, distance) => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    return to.map((v, i) => from[i] + ((v - from[i]) * distance) / d);
  };
  // 第三輪（鏡頭要順）：拿掉 0.78 的硬切，整章一個連續的鏡頭。推拉只有「靠近駱駝 → 跟著客機拉遠到港口全景 → 一路推近到油桶」
  // 兩次轉向。0.72 鐵鏈拉緊之後，鏡頭沿著碼頭往左移、同時轉向油桶，0.9 停在原本特寫的位置，再慢慢靠近。
  // 港口全景那一格往後退、fov 收小（畫面大小和原本差不多），之後 fov 固定在 38 只靠距離推近，客機飛越海面那一段的位移相對於距離才不會太快。
  const keys = (barrelAt, barrelAtLate) => [
    { t: -0.3, pos: [7.4, 1.5, 10], at: [4.6, 1.5, 0], fov: 40 }, // 遠一點、高一點：岬角、沙丘、夜空
    { t: 0.04, pos: [4.6, 0.5, 7.6], at: [3.2, 1.45, 0], fov: 38 }, // 降到駱駝的高度，跟著它往左
    { t: 0.2, pos: [1.6, 0.45, 6.6], at: [1.0, 2.0, 0], fov: 40 },
    { t: 0.3, pos: [-0.4, 0.55, 5.8], at: lookAtPlane(0.3), fov: 46 }, // 上仰：客機從頭頂掠過
    // 注視點放在客機後方同一條視線上（畫面一樣）：鏡頭到注視點的距離從這裡一路變長到港口全景，不會先縮一下
    { t: 0.34, pos: [-2.4, 0.8, 5.8], at: beyond([-2.4, 0.8, 5.8], lookAtPlane(0.34), 10), fov: 46 },
    { t: 0.55, pos: W(2.6, 3.0, 16.5), at: W(2.2, 2.0, -2.5), fov: 38 }, // 跟著客機飛越海面，降到港口：工廠、黑煙、油輪
    { t: 0.63, pos: W(3.0, 2.2, 12), at: W(3.0, 1.9, -2.5), fov: 38 },
    { t: 0.72, pos: W(3.6, 1.5, 6.6), at: W(4.0, 0.85, -2.5), fov: 38 }, // 推近、往下搖：三條鐵鏈與海面
    // 0.72–0.9：沿碼頭往左移到油桶後面（原本 0.78 硬切的地方）。油桶在左前方，襯著白色的碼頭和天；右後方是被鎖住的油輪
    { t: 0.9, pos: W(-5.6, 1.5, 8.0), at: barrelAt, fov: 36 },
    { t: 1.0, pos: W(-5.3, 1.4, 7.6), at: barrelAtLate, fov: 34 },
    { t: 1.3, pos: W(-5.1, 1.35, 7.4), at: barrelAtLate, fov: 34 },
  ];
  const track = makeSteadyTrack(keys(W(-2.6, 1.0, 2.6), W(-2.9, 1.0, 2.6)));
  // 直式螢幕比較窄：最後改成對著油桶，油輪的船尾和鐵鏈在它右後方
  const trackTall = makeSteadyTrack(keys(W(-4.1, 1.15, 3.2), W(-4.0, 1.15, 3.2)));

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList(pacedCues("matches", []), [{ at: 0.3, cue: "jetPass" }, { at: 0.5, cue: "fighter" }, { at: 0.58, cue: "chain" }, { at: 0.62, cue: "chain" }, { at: 0.66, cue: "chain" }, { at: 0.7, cue: "lowHit" }, { at: 0.86, cue: "fireWhoosh" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const time = frame.time;
      applyCameraShot(camera, (frame.aspect < 1 ? trackTall : track)(p), frame.aspect, frame.pointer, 0.05);
      sea.userData.update(time);

      // 紅色夜空：在綠洲時包住整個視野；跟著客機轉向港口時紅雲往右退；特寫（朝海看）時整片天是白的
      const toPort = smooth(linearstep(p, 0.3, 0.48));
      sky.material.uniforms.uLeft.value = p < CUT ? -2.3 + 1.75 * toPort : 0.5;
      fogColor.copy(fogRed).lerp(fogWhite, smooth(linearstep(p, 0.36, 0.46)));
      scene.fog.color.copy(fogColor);
      mat.setFog({ color: fogColor, ...FOG });
      // 特寫是朝綠洲那個方向看的：黑色的岬角和高樓在白霧裡會變成一片灰，硬切之後就收起來
      for (const thing of oasis) thing.visible = p < CUT;

      // 星星輪流閃；棕櫚被風吹得微微晃
      stars.children.forEach((star, i) => {
        star.scale.setScalar(1 + 0.3 * Math.sin(time * 2.2 + i * 1.9));
        star.rotation.z = Math.sin(time * 0.7 + i) * 0.2;
      });
      palms.children.forEach((palm, i) => {
        palm.rotation.z = Math.sin(time * 0.9 + i * 2) * 0.03;
        palm.rotation.x = Math.cos(time * 0.7 + i * 2) * 0.015;
      });

      // 駱駝：approach 期間從右邊走到定位（往左）；步伐由還沒走完的距離決定，倒著捲也對
      const walk = linearstep(p, -0.3, 0.3);
      const x = camelFrom + (camelTo - camelFrom) * walk;
      const step = (x - camelTo) / camelStride;
      // 四條腿依走過的距離擺動（對角的兩條同相），身體跟著微微起伏
      for (const leg of camelLegs) {
        const swing = Math.sin(step * Math.PI * 2 + leg.userData.phase);
        leg.rotation.z = swing * 0.2;
        leg.userData.knee.rotation.z = Math.max(0, -Math.cos(step * Math.PI * 2 + leg.userData.phase)) * -0.7;
      }
      camel.position.set(x, 0.03 * Math.abs(Math.sin(step * Math.PI * 2)), camelZ);
      camel.userData.neck.rotation.z = Math.sin(step * Math.PI * 2) * 0.04;
      camel.userData.tail.rotation.x = Math.sin(time * 1.3) * 0.12;
      // 騎士隨駱駝的步伐前後搖（駱駝是同側步，騎士會左右晃）；手跟著韁繩微微動
      const rj = camel.userData.rider.userData.joints;
      rj.spine.rotation.set(0.06 + Math.sin(step * Math.PI * 2) * 0.05, 0, Math.sin(step * Math.PI * 2 + 0.8) * 0.04);
      rj.neck.rotation.set(-0.04 - Math.sin(step * Math.PI * 2) * 0.04, Math.sin(time * 0.35) * 0.12, 0);
      for (const [name, rest] of camel.userData.armPose) rj[name].rotation.set(rest.x + (name.startsWith("elbow") ? Math.sin(step * Math.PI * 2) * 0.05 : 0), rest.y, rest.z);

      // 客機：0.06 從對岸上空出現，0.3–0.37 從頭頂掠過，之後爬升離開。機頭永遠朝左
      airlinerAt(p, airliner.position);
      airliner.visible = p > 0.06 && p < 0.5;
      airliner.rotation.set(0.16 + Math.sin(time * 0.8) * 0.02, 0.35, 0.05);

      // 黑煙：0.36 起一道一道冒出來；煙團沿著各自的路徑循環往右上飄，越飄越大
      for (let i = 0; i < puffCount; i++) {
        const plume = i % 6, [sx, sy, sz] = puffSeeds[i];
        const [cx, cz, height] = PLUMES[plume];
        const reach = smooth(linearstep(p, 0.36 + plume * 0.02, 0.52 + plume * 0.02)) * 1.15;
        const age = (sx + time * (0.03 + sy * 0.012)) % 1;
        const shown = clamp((reach - age) * 6, 0, 1) * Math.min(1, (1 - age) * 5);
        position.set(
          cx + Math.pow(age, 1.3) * 8 + Math.sin(sz * 40 + age * 5) * 0.25 * age,
          QUAY_H + 0.6 + height + age * 3.4 + Math.sin(sy * 30 + age * 6) * 0.35 * age,
          cz + age * 1.6 + Math.cos(sz * 23 + age * 4) * 0.5 * age,
        );
        scale.setScalar(Math.max(0.0001, (0.2 + 1.1 * age) * shown));
        puffs.setMatrixAt(i, matrix.compose(position, still, scale));
      }
      puffs.instanceMatrix.needsUpdate = true;

      // 戰機：0.5 起依序從煙裡沿機頭方向飛出來（大的最先），飛到定位後輕輕起伏
      jets.children.forEach((jet, i) => {
        const arrive = smooth(linearstep(p, 0.5 + i * 0.025, 0.7 + i * 0.025));
        jet.visible = arrive > 0;
        jet.position.copy(jet.userData.rest).addScaledVector(jetHeading, -10 * (1 - arrive));
        jet.position.y += Math.sin(time * 1.6 + i * 1.3) * 0.05;
      });

      // 油輪：往左開到定位停住；三條鐵鏈由左到右依序從上面落下，先鬆垮再拉緊
      const halt = smooth(linearstep(p, 0.4, 0.6));
      tanker.position.x = TANKER_X + 2.6 * (1 - halt);
      tanker.position.y = Math.sin(time * 0.9) * 0.03 * (1 - halt);
      chains.forEach(({ top, bottom, links }, i) => {
        const lock = linearstep(p, 0.56 + i * 0.04, 0.64 + i * 0.04);
        const slack = 1 - smooth(linearstep(lock, 0.65, 1));
        links.forEach((link, k) => {
          const t = k / (links.length - 1);
          const drop = clamp(lock * 1.7 - t * 0.7, 0, 1);
          link.visible = drop > 0;
          link.position.lerpVectors(top, bottom, t);
          link.position.y += (1 - drop) * (1 - drop) * 3.5 - Math.sin(t * Math.PI) * 0.1 * slack;
          link.position.z += Math.sin(t * Math.PI) * 0.22 * slack;
        });
      });

      // 火：每片火舌各自伸縮；火星循環往上飄
      flames.children.forEach((sheet, i) => {
        const flicker = 1 + 0.09 * Math.sin(time * 9 + i * 2.1) + 0.05 * Math.sin(time * 15.3 + i);
        sheet.scale.set(sheet.userData.size[0] * (1 + 0.05 * Math.sin(time * 11 + i)), sheet.userData.size[1] * flicker, 1);
      });
      for (let i = 0; i < emberCount; i++) {
        const [sx, sy, sz] = emberSeeds[i];
        const age = (sx + time * (0.25 + sy * 0.2)) % 1;
        position.set((sy - 0.5) * 0.5 + Math.sin(age * 7 + sz * 20) * 0.12, 1.2 + age * 1.9, (sz - 0.5) * 0.5 + Math.cos(age * 6 + sx * 20) * 0.12);
        scale.setScalar(Math.max(0.0001, 1.4 * (1 - age)));
        embers.setMatrixAt(i, matrix.compose(position, still, scale));
      }
      embers.instanceMatrix.needsUpdate = true;

    },
  };
}
