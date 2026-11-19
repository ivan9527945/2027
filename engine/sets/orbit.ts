// orbit 的 3D 場景：冰原上的發射場（PRD-3D 6.5）。
// 白色的冰原往遠處延伸到一片黑色的海，海上漂著三塊浮冰，對岸是紅白的雪山；冰原中央是發射台和火箭，
// 西裝男站在火箭左前方；頭頂是黑色的太空，軌道上有衛星和繫著繩子的太空人。
//
// 第二輪：人物改成分層的厚紙偶（身體、軀幹、頭、手臂各一層），浮冰加厚並有吃水線，海上有漂流的碎冰，
// 冰原上有冰塊和影子，星空多了一層有遠近的小星星，點火時台座和冰面被噴焰照亮；黑色的霧讓遠處的冰原沉進夜色。
// 直式螢幕另外把鏡頭往後拉（fitPortrait），火箭和西裝男才會同時在畫面裡。
//
// 節奏範本 corner 的對應：
//   pan    [-0.2, 0.30]  鏡頭貼著冰面橫移：浮冰 → 雪山
//   whip   [0.27, 0.37]  甩到發射台：火箭和西裝男
//   settle [0.33, 0.58]  停在發射台前；西裝男舉手下令（0.46–0.55），火箭點火
//   pushIn [0.56, 0.72]  火箭升空，紅色煙雲從台座往外翻湧；鏡頭推近並跟著往上搖
//   detail [0.76, 0.86]  鏡頭升到軌道：衛星（本體、三片太陽能板、碟形天線）
//   raise  [0.84, 0.95]  鏡頭仰到最高點：太空人繫著繩子漂在頭頂（原作這一拍是「舉起」）
import {
  BackSide, BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, FrontSide, Group, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Points, Quaternion, RingGeometry, Scene, ShaderMaterial, SphereGeometry, CylinderGeometry, Vector3,
  InstancedMesh, Matrix4, TorusGeometry, Euler,
} from "three";
import type { Fog } from "three";
import { Snow, clamp, deviceTier, linearstep, seededRandom, smooth, toonMaterial } from "../core";
import { createRegistry } from "../elements";
import { PACE } from "../pace";
import { applyCameraShot, makeCameraTrack, widenFovForNarrowAspect } from "../shared/camera";
import { addFog, ground, skyDome, water } from "../shared/set/env";
import { box, cylinder, extrude, faceCamera, lathe, makePalette, sphere } from "../shared/set/model";
import { inkOutline, makeFigure } from "../shared/set/figure";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BLACK, DARK_RED, RED, WHITE } from "../shared/world/space";
import { cueList, soundTrack } from "../shared/sound";

// 聲音（2026-11-19，陰森版）：冰原的風；轉向發射台時倒放的鈸（0.3）；下令的無線電與倒數（0.46）；火箭升空（0.56）；軌道上只剩太空的嗡鳴和低沉的合唱，衛星傳回一句耳語（0.84）。
const soundScript = soundTrack([[0, { wind: 0.25, sea: 0.08, dread: 0.15 }], [0.5, { wind: 0.18, dread: 0.2 }], [0.6, { wind: 0.12, dread: 0.2 }], [0.78, { space: 0.25, choir: 0.2, dread: 0.15 }]]);

const SHORE_Z = -6; // 冰原和海的交界
const MOUNTAIN: [number, number, number] = [10, 0, -27];
const SATELLITE = new Vector3(-4.6, 30, -4);
const ASTRONAUT = new Vector3(-1.4, 33.6, -3.4);
const MAN_HEIGHT = 1.42; // 西裝男的身高（以前紙偶的高度，取景不變）
const ASTRO_HEIGHT = 2.7; // 太空人頭到腳的長度（以前紙偶的寬度）
const FOG = { near: 36, far: 125 };
const ARM_UP = 2.78; // 舉起的手臂（肩膀繞 z 軸）：封面上手往右上方伸直

/**
 * 白色外框線：把同一個幾何體沿法線往外推一點、只畫背對鏡頭的那一面。
 * 黑色的東西在黑色的太空前靠它現出輪廓（封面上火箭左緣和雪山山脊的白線）。
 * 會自己判斷法線和三角形的繞向是朝內還是朝外。回傳的 mesh 加到原物件底下。
 */
function hull(geometry, thickness, color = WHITE) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal, index = geometry.index;
  geometry.computeBoundingBox();
  const centre = geometry.boundingBox.getCenter(new Vector3());
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
  let out = 0, wind = 0;
  for (let i = 0; i < pos.count; i++) out += a.fromBufferAttribute(pos, i).sub(centre).dot(n.fromBufferAttribute(nor, i));
  const count = index ? index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib).sub(a);
    c.fromBufferAttribute(pos, ic).sub(a);
    wind += b.cross(c).dot(n.fromBufferAttribute(nor, ia));
  }
  const outward = out >= 0 ? 1 : -1;
  const frontIsOutside = (wind >= 0 ? 1 : -1) * outward > 0;
  const mesh = new Mesh(geometry, new ShaderMaterial({
    side: frontIsOutside ? BackSide : FrontSide,
    uniforms: { uT: { value: thickness * outward }, uColor: { value: new Color(color) } },
    vertexShader: "uniform float uT; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normalize(normal) * uT, 1.0); }",
    fragmentShader: "uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0);\n#include <colorspace_fragment>\n}",
  }));
  mesh.userData.noShadow = true;
  return mesh;
}

/**
 * 低多邊形的山體：rings 是由下往上的幾圈頂點（每圈點數相同），相鄰兩圈之間拉成三角面，最上面一圈封頂。
 * 回傳 { flat: 每個面各自一個法線（看得到稜角）, smooth: 共用頂點（給外框線用）, top: 最上面一圈 }。
 */
function ringsGeometry(rings) {
  const n = rings[0].length, points = rings.flat(), faces = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = k * n, q = (k + 1) * n;
      faces.push(p + i, q + i, p + j, p + j, q + i, q + j);
    }
  }
  const top = rings.at(-1), centre = [0, 1, 2].map((axis) => top.reduce((sum, point) => sum + point[axis], 0) / n);
  points.push(centre);
  const last = (rings.length - 1) * n;
  for (let i = 0; i < n; i++) faces.push(last + i, points.length - 1, last + ((i + 1) % n));
  const smoothGeometry = new BufferGeometry();
  smoothGeometry.setAttribute("position", new Float32BufferAttribute(points.flat(), 3));
  smoothGeometry.setIndex(faces);
  smoothGeometry.computeVertexNormals();
  const flatGeometry = smoothGeometry.toNonIndexed();
  flatGeometry.computeVertexNormals();
  return { flat: flatGeometry, smooth: smoothGeometry, top };
}

/** 一圈頂點：以 (cx, cz) 為中心、高度 y，radii 是每個方向的半徑。 */
const ring = (cx, y, cz, radii, turn = 0) => radii.map((r, i) => {
  const angle = turn + (i / radii.length) * Math.PI * 2;
  return [cx + Math.cos(angle) * r, y, cz + Math.sin(angle) * r];
});

/** 把封閉輪廓往外推 t（尖角用斜接）。用來做乾淨的外框：外框是同一個形狀放大一圈、只畫背面。 */
function inflate(outline, t) {
  const n = outline.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1];
  const sign = area > 0 ? 1 : -1;
  const normalOf = (from, to) => {
    const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy) || 1;
    return [(dy / length) * sign, (-dx / length) * sign];
  };
  return outline.map((point, i) => {
    const before = normalOf(outline[(i + n - 1) % n], point), after = normalOf(point, outline[(i + 1) % n]);
    let mx = before[0] + after[0], my = before[1] + after[1];
    const length = Math.hypot(mx, my) || 1;
    mx /= length;
    my /= length;
    const reach = t / Math.max(0.35, mx * before[0] + my * before[1]);
    return [point[0] + mx * reach, point[1] + my * reach];
  });
}

/** 有白色外框的擠出體：外框是放大一圈的同一個輪廓（只畫背面），不會像沿法線外推那樣在稜角處裂開。 */
function outlinedExtrude(material, outline, depth, t) {
  const mesh = extrude(material, outline, depth);
  const rim = extrude(new MeshBasicMaterial({ color: WHITE, side: BackSide }), inflate(outline, t), depth + t * 2);
  rim.userData.noShadow = true;
  mesh.add(rim);
  return mesh;
}

/** 把幾個 mesh 掛到人物的某個關節上，並替它們加上和人物一樣的墨線 */
function attach(joint, width, ...meshes) {
  for (const mesh of meshes) {
    inkOutline(mesh, { width });
    joint.add(mesh);
  }
}

/** 立體的四芒星：兩片互相垂直的星形薄板，從哪個方向看都是四芒星，轉動時橫向的光芒會伸縮（閃爍）。 */
function sparkle(material, r) {
  const group = new Group();
  const blade = extrude(material, sparkleOutline(r), r * 0.1);
  const cross = new Mesh(blade.geometry, material);
  cross.rotation.y = Math.PI / 2;
  group.add(blade, cross);
  return group;
}

/** 有遠近的小星星：一顆一顆的圓點，近的大、遠的小，各自閃爍。不受霧影響。 */
function starField(count, seed) {
  const random = seededRandom(seed);
  const positions = [], seeds = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2, lift = Math.asin(-0.05 + random() * 1.02), radius = 55 + Math.pow(random(), 1.6) * 230;
    positions.push(Math.cos(angle) * Math.cos(lift) * radius, 14 + Math.sin(lift) * radius, -8 + Math.sin(angle) * Math.cos(lift) * radius);
    seeds.push(random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  const points = new Points(geometry, new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: Math.min(window.devicePixelRatio, 2) }, uColor: { value: new Color(WHITE) } },
    vertexShader: `
      attribute float aSeed; uniform float uTime, uPx; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (1.3 + aSeed * 2.2) * clamp(150.0 / max(-mv.z, 1.0), 0.55, 1.9);
        vA = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 60.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main() {
        if (length(gl_PointCoord - 0.5) > 0.5) discard;
        gl_FragColor = vec4(uColor, vA);
        #include <colorspace_fragment>
      }`,
  }));
  points.frustumCulled = false;
  points.renderOrder = 1;
  return points;
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

/**
 * 直式螢幕的取景：共用的鏡頭只把 fov 加大，左右看得到的範圍還是比橫式窄很多。
 * 這裡把鏡頭沿水平方向往後拉，讓注視點那個深度左右看得到的寬度，和 refAspect 的橫式畫面一樣。
 */
function fitPortrait(shot, aspect, amount = 1, refAspect = 1.3, tilt = 0.2) {
  if (aspect >= 1.25 || amount <= 0) return shot;
  const half = Math.tan((shot.fov * Math.PI) / 360), widened = Math.tan((widenFovForNarrowAspect(shot.fov, aspect) * Math.PI) / 360);
  const blend = amount * smooth(linearstep(aspect, 1.25, 0.95));
  const k = 1 + Math.max(0, (half * refAspect) / (widened * aspect) - 1) * blend;
  shot.pos.x = shot.at.x + (shot.pos.x - shot.at.x) * k;
  shot.pos.z = shot.at.z + (shot.pos.z - shot.at.z) * k;
  // 直式的畫面很高：把視線抬高一點，地平線落在下面三分之一，上面留給天空
  shot.at.y += Math.hypot(shot.pos.x - shot.at.x, shot.pos.z - shot.at.z) * tilt * blend;
  return shot;
}

/** 四芒星的輪廓 */
const sparkleOutline = (r) => {
  const points = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4, radius = i % 2 ? r * 0.16 : r;
    points.push([Math.sin(angle) * radius, Math.cos(angle) * radius]);
  }
  return points;
};

export default function createOrbitSet(chapterContext, plan, flat) {
  const scene = new Scene();
  scene.background = new Color(BLACK);
  const camera = new PerspectiveCamera(40, 1, 0.2, 700);
  const { entries, register } = createRegistry(plan.id);
  const mat = makePalette([0.6, 0.72, 0.5]); // 光從右前方來：雪山的左側是背光的黑
  const { pushIn, raise } = PACE.corner.beats;
  addFog(scene, mat, BLACK, FOG.near, FOG.far); // 黑色的霧：遠處的冰原沉進夜色，升到軌道之後腳下的冰原也看不見了
  const glowing = (color) => mat.flat(color, false); // 會發光的東西（星星、噴焰照出來的光）不被霧吃掉
  const orbitMat = makePalette([0.6, 0.72, 0.5]); // 軌道上的東西（衛星）另外一組材質：不受霧影響

  // ---- #12 黑色太空：天空球；白色冰原；遠處一片黑色的海（白色波紋） ----
  const space = skyDome(BLACK, 500);
  register(12, space);
  scene.add(space, ground(WHITE, 3000)); // 地面比鏡頭的遠裁切面還大，升到高空時地平線才是一條平的線
  const sea = water({ width: 600, depth: 44, base: BLACK, wave: WHITE, rows: 30 });
  sea.position.set(0, 0.05, SHORE_Z - 22);
  Object.assign(sea.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }); // 海只比冰原高一點點：鏡頭拉遠時不要和底下的冰原搶深度
  scene.add(sea);
  // 遠近不一的小星星（不算在十一顆四芒星裡）：鏡頭升空時近的走得快、遠的走得慢
  const farStars = starField(Math.round(520 * deviceTier.particleScale), 12);
  scene.add(farStars);

  // ---- #13 十一顆白色四芒星：兩片交叉的立體星形，有遠近，各自慢慢轉動 ----
  const stars = new Group();
  const starGeometrySource = [
    [-16, 9, -60, 1.5], [3, 15, -70, 1.0], [22, 12, -64, 1.7], [30, 7, -50, 0.9], // 地面上就看得到的
    [-9, 19, -16, 0.8], [6, 23, -22, 1.1], [-12, 27, -12, 0.5], [3.5, 30, -14, 0.9], [-9.5, 35, -11, 0.7], [1.5, 38, -10, 0.6], [-5, 41, -16, 1.0], // 上升途中與軌道上的
  ];
  for (const [x, y, z, r] of starGeometrySource) {
    const star = sparkle(glowing(WHITE), r);
    star.position.set(x, y, z);
    stars.add(star);
  }
  register(13, stars, { count: 11 });
  scene.add(stars);

  // ---- #16 雪山：低多邊形。受光面是紅的、背光面是黑的（外框一圈白線），右肩一片白雪，山腳一條白色冰層 ----
  const mountain = new Group();
  // 山的光壓得比場景的主光更低、更偏右：背光的溝槽整條變黑，像封面上主峰的黑色裂隙
  const rock = toonMaterial({ color: RED, shade: BLACK, light: new Vector3(0.9, 0.34, 0.28), rim: 0, threshold: 0.12, side: DoubleSide });
  rock.uniforms.uFogColor.value.set(BLACK);
  rock.uniforms.uFogNear.value = FOG.near;
  rock.uniforms.uFogFar.value = FOG.far;
  // 一圈有稜有溝的半徑：奇數點往內縮
  const jagged = (radius, sides, depth, wobble) => Array.from({ length: sides }, (_, i) => radius * (i % 2 ? depth : 1) * (1 + wobble * Math.sin(i * 2.7 + radius)));
  const addPeak = (rings, outline = 0.13) => {
    const geometry = ringsGeometry(rings);
    const mesh = new Mesh(geometry.flat, rock);
    mesh.add(hull(geometry.smooth, outline));
    mountain.add(mesh);
    return geometry.top;
  };
  // 主峰：峰頂偏左，稜線有高有低
  addPeak([
    ring(0, 0, 0, jagged(5.8, 12, 0.8, 0.06)),
    ring(-0.2, 2.6, 0, jagged(4.2, 12, 0.66, 0.08), 0.06),
    ring(-0.5, 5.0, 0, jagged(2.6, 12, 0.58, 0.1), 0.1),
    ring(-0.8, 7.4, 0, jagged(1.1, 12, 0.55, 0.1), 0.16),
    ring(-0.9, 9.4, 0, jagged(0.05, 12, 1, 0)),
  ]);
  // 右肩的岩塊：頂面往左上斜，上面蓋著整張封面僅剩的一片白雪
  const shoulderTop = addPeak([
    ring(5.2, 0, 0.8, [3.3, 3.0, 3.4, 3.0, 3.2]),
    [[7.2, 4.1, 0.9], [5.6, 4.6, 2.4], [3.2, 5.6, 1.6], [3.4, 5.5, -0.6], [6.4, 4.2, -1.0]],
  ]);
  const snowCap = ringsGeometry([shoulderTop.map(([x, y, z]) => [x, y + 0.02, z]), shoulderTop.map(([x, y, z]) => [x + (x - 5.2) * 0.04, y + 0.28, z + (z - 0.8) * 0.04])]);
  mountain.add(new Mesh(snowCap.flat, mat.flat(WHITE)));
  // 最左邊的小山頭
  addPeak([ring(-5.6, 0, 0.6, [2.2, 1.9, 2.3, 1.8, 2.1]), ring(-5.4, 2.2, 0.6, [0.9, 0.6, 0.9, 0.6, 0.8], 0.4), ring(-5.3, 3.4, 0.6, [0.05, 0.05, 0.05, 0.05, 0.05])]);
  mountain.add(box(mat.flat(WHITE), 10.5, 0.36, 2.2, 0.4, 0.18, 5.2)); // 山腳的冰層
  mountain.position.set(...MOUNTAIN);
  register(16, mountain);
  scene.add(mountain);

  // ---- #17 三塊浮冰：有厚度的冰塊。側面是紅的（上寬下窄的切面，背光面暗紅），頂上一層白雪，
  //      水面上一圈白色的吃水線；在黑色的海上起伏 ----
  const floes = new Group();
  const iceSide = mat.custom(RED, DARK_RED, 0);
  /** 一塊冰：outline 是俯視的輪廓（x, z），thick 是露出水面的高度。回傳 { block: 會起伏的冰塊, line: 留在水面的吃水線 } */
  const iceBlock = (outline, thick, snow = 0.1) => {
    const at = (k, y) => outline.map(([x, z]) => [x * k, y, z * k]);
    const block = new Group();
    block.add(new Mesh(ringsGeometry([at(0.86, -0.12), at(1.02, thick * 0.45), at(1, thick)]).flat, iceSide)); // 紅色的冰體，水面下還有一截
    block.add(new Mesh(ringsGeometry([at(1.07, thick), at(1.07, thick + snow * 0.6), at(0.94, thick + snow)]).flat, mat.paper)); // 白色的雪蓋，比冰體寬一點
    const line = new Mesh(ringsGeometry([at(1.2, 0), at(1.2, 0.012)]).flat, mat.flat(WHITE));
    return { block, line };
  };
  const waterlines = [];
  [
    { at: [4.2, -9.5], outline: [[-1.5, -0.2], [-0.4, -0.75], [1.4, -0.3], [1.2, 0.35], [-0.3, 0.7]], thick: 0.52, turn: 0.2 },
    { at: [7.2, -13.5], outline: [[-1.0, -0.15], [0.1, -0.5], [1.0, -0.1], [0.2, 0.4]], thick: 0.34, turn: -0.3 },
    { at: [10.6, -10.5], outline: [[-1.7, 0], [-0.2, -0.65], [1.6, -0.1], [0.3, 0.6]], thick: 0.46, turn: 0.1 },
  ].forEach(({ at, outline, thick, turn }) => {
    const { block, line } = iceBlock(outline, thick);
    for (const part of [block, line]) {
      part.position.set(at[0], 0.06, at[1]);
      part.rotation.y = turn;
    }
    floes.add(block);
    waterlines.push(line);
    scene.add(line);
  });
  register(17, floes, { count: 3 });
  scene.add(floes);

  // 海上漂流的碎冰：和浮冰同一個做法的小塊，慢慢往右漂
  const random17 = seededRandom(17);
  const bits = [];
  for (let i = 0; i < Math.round(22 * deviceTier.particleScale); i++) {
    const r = 0.16 + random17() * 0.3, sides = 4 + Math.floor(random17() * 2);
    const outline = Array.from({ length: sides }, (_, k) => {
      const angle = (k / sides) * Math.PI * 2 + random17() * 0.5, radius = r * (0.7 + random17() * 0.5);
      return [Math.cos(angle) * radius * 1.5, Math.sin(angle) * radius];
    });
    const { block, line } = iceBlock(outline, 0.1 + random17() * 0.14, 0.05);
    block.add(line);
    scene.add(block);
    bits.push({ block, x: random17() * 70, z: SHORE_Z - 1.2 - Math.pow(random17(), 1.4) * 26, speed: 0.12 + random17() * 0.2, seed: random17() * 9 });
  }

  // 冰原上的冰塊：白色的頂面、紅色的背光面，替白色的冰原交代遠近；影子落在冰面上
  const hummocks = new Group();
  const iceRock = mat.custom(WHITE, RED, 0);
  for (const [x, z, r, h, turn] of [[8.4, -3.4, 0.6, 0.4, 0.3], [0.4, -3.6, 0.6, 0.42, 1.2], [13.0, -3.6, 0.9, 0.7, 2.0], [-5.6, -2.6, 0.8, 0.6, 0.7], [-7.4, 3.0, 0.55, 0.36, 2.6], [-3.4, 8.2, 0.5, 0.3, 0.4]]) {
    const base = ring(0, 0, 0, [r, r * 0.8, r * 1.1, r * 0.7, r * 0.95], turn);
    const top = ring(r * 0.1, h, 0, [r * 0.55, r * 0.4, r * 0.62, r * 0.36, r * 0.5], turn + 0.3).map(([px, py, pz], k) => [px, py * (0.75 + 0.25 * (k % 2)), pz]);
    const rockMesh = new Mesh(ringsGeometry([base, top]).flat, iceRock);
    rockMesh.position.set(x, 0, z);
    hummocks.add(rockMesh);
  }
  scene.add(hummocks);

  // 第四輪：冰原不是一塊平板。冰面上有黑色的細裂縫（從冰塊和發射台往外裂開，分岔），被風吹成一道道的雪脊（白頂、紅色背光面），
  // 和散落的碎冰；陰影和排線落在這些起伏上
  const random4 = seededRandom(404);
  const crackPieces = [];
  const crack = (x, z, angle, length, depth) => {
    let px = x, pz = z;
    const steps = 4 + Math.floor(random4() * 4);
    for (let i = 0; i < steps; i++) {
      angle += (random4() - 0.5) * 0.9;
      const step = (length / steps) * (0.7 + random4() * 0.6);
      const nx = px + Math.cos(angle) * step, nz = pz + Math.sin(angle) * step;
      const piece = new PlaneGeometry(Math.hypot(nx - px, nz - pz) + 0.02, 0.035 * (1 - i / steps) + 0.012);
      piece.rotateX(-Math.PI / 2);
      piece.rotateY(-Math.atan2(nz - pz, nx - px));
      piece.translate((px + nx) / 2, 0.004, (pz + nz) / 2);
      crackPieces.push(piece);
      if (depth > 0 && random4() < 0.35) crack(nx, nz, angle + (random4() < 0.5 ? 0.8 : -0.8), length * 0.45, depth - 1);
      px = nx;
      pz = nz;
    }
  };
  for (let i = 0; i < 9; i++) crack(Math.cos(i * 0.7) * 1.8, Math.sin(i * 0.7) * 1.8 + 0.2, i * 0.7 + (random4() - 0.5) * 0.3, 3 + random4() * 4, 2); // 從發射台往外
  for (const [x, z] of [[8.4, -3.4], [-5.6, -2.6], [-7.4, 3.0], [0.4, -3.6]]) crack(x, z, random4() * 6.28, 2.5 + random4() * 2, 1); // 從冰塊旁邊
  for (let i = 0; i < 6; i++) crack(-10 + random4() * 24, -4.5 + random4() * 14, random4() * 6.28, 2 + random4() * 3, 1); // 散在各處
  const cracks = new Mesh(mergeGeometries(crackPieces), mat.flat(BLACK));
  Object.assign(cracks.material, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  cracks.userData.noShadow = true;
  scene.add(cracks);
  // 雪脊：三角斷面的長條，順著光的方向排（兩個斜面都受光，只在邊上落一道排線和影子，不會變成紅色的刀痕）；碎冰：小小的多面體。都用 InstancedMesh（各一個 draw call）
  const drift = new CylinderGeometry(0.0, 0.5, 1, 3, 1);
  drift.rotateY(-Math.PI / 6); // 先轉到「一個面朝下」，再躺平：底面貼地，兩個斜面朝上
  drift.rotateZ(Math.PI / 2);
  drift.translate(0, 0.25, 0);
  drift.scale(1.4, 0.1, 0.3); // 扁平的比例做在幾何體裡（卡通材質的法線不會隨 instance 的不等比縮放修正）
  drift.computeVertexNormals();
  const drifts = new InstancedMesh(drift, iceRock, 26);
  const chips = new InstancedMesh(new SphereGeometry(1, 5, 3), iceRock, 70);
  const m4 = new Matrix4(), q4 = new Quaternion(), e4 = new Euler(), v4 = new Vector3(), s4 = new Vector3();
  for (let i = 0; i < drifts.count; i++) {
    let x, z;
    do { x = -14 + random4() * 30; z = -5 + random4() * 18; } while (Math.hypot(x, z) < 2.2 || Math.hypot(x + 2.4, z - 4) < 1);
    const length = 0.8 + random4() * 1.8;
    drifts.setMatrixAt(i, m4.compose(v4.set(x, 0, z), q4.setFromEuler(e4.set(0, -0.69 + (random4() - 0.5) * 0.2, 0)), s4.setScalar(length * 0.7)));
  }
  for (let i = 0; i < chips.count; i++) {
    const near = i < 30; // 一半散在發射台附近
    const angle = random4() * Math.PI * 2, radius = near ? 1.8 + random4() * 2.6 : 2 + random4() * 14;
    const r = 0.04 + random4() * (near ? 0.08 : 0.14);
    chips.setMatrixAt(i, m4.compose(v4.set(Math.cos(angle) * radius + (near ? 0 : 1), r * 0.3, Math.sin(angle) * radius * 0.9 + (near ? 0 : 3)), q4.setFromEuler(e4.set(random4() * 3, random4() * 3, random4() * 3)), s4.setScalar(r)));
  }
  drifts.instanceMatrix.needsUpdate = chips.instanceMatrix.needsUpdate = true;
  drifts.computeBoundingSphere();
  chips.computeBoundingSphere();
  scene.add(drifts, chips);

  // ---- 發射台：一個黑色的低圓台 ----
  const pad = new Group();
  pad.add(cylinder(mat.ink, 1.45, 1.6, 0.14, 0, 0, 0, 32));
  for (let i = 0; i < 4; i++) pad.add(box(mat.ink, 0.16, 0.5, 0.16, Math.cos(i * 1.5708 + 0.785) * 1.25, 0.25, Math.sin(i * 1.5708 + 0.785) * 1.25));
  for (let i = 0; i < 12; i++) pad.add(box(mat.flat(WHITE), 0.07, 0.02, 0.2, Math.cos(i * 0.5236) * 1.38, 0.145, Math.sin(i * 0.5236) * 1.38)); // 台面邊緣的一圈白色刻度
  pad.children.slice(-12).forEach((mark, i) => { mark.rotation.y = -i * 0.5236 + Math.PI / 2; mark.userData.noShadow = true; });
  // 第四輪：台座的細節。側面一圈螺栓、台面上的導焰槽（十字的黑溝，邊緣是白線），四根支柱頂上的夾爪
  for (let i = 0; i < 24; i++) pad.add(sphere(mat.paper, 0.035, Math.cos(i * 0.2618) * 1.53, 0.07, Math.sin(i * 0.2618) * 1.53, 6, 4));
  for (const turn of [0, Math.PI / 2]) {
    const trench = box(mat.flat(WHITE), 2.5, 0.01, 0.2, 0, 0.142, 0);
    trench.rotation.y = turn;
    trench.userData.noShadow = true;
    const groove = box(mat.flat(BLACK), 2.52, 0.012, 0.12, 0, 0.143, 0);
    groove.rotation.y = turn;
    groove.userData.noShadow = true;
    pad.add(trench, groove);
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 1.5708 + 0.785;
    const clamp4 = box(mat.red, 0.24, 0.08, 0.1, Math.cos(a) * 1.12, 0.52, Math.sin(a) * 1.12);
    clamp4.rotation.y = -a;
    pad.add(clamp4);
  }
  scene.add(pad);

  // 噴焰照出來的光：台面上一圈白光、冰面上一片紅光（中間白熱），點火時由內往外亮起來
  const glow = new Group();
  const flat2 = (geometry, material, y) => {
    const mesh = new Mesh(geometry, material);
    Object.assign(material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    glow.add(mesh);
    return mesh;
  };
  const burst = (points, inner) => {
    const mesh = extrude(glowing(RED), Array.from({ length: points * 2 }, (_, i) => {
      const angle = (i / (points * 2)) * Math.PI * 2, radius = i % 2 ? inner : 1;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }), 0.002);
    return mesh.geometry;
  };
  const glowRed = flat2(burst(22, 0.8), glowing(RED), 0.011); // 一圈放射狀的紅光
  const glowInner = flat2(burst(16, 0.72), glowing(DARK_RED), 0.013); // 靠近台座的地方更濃
  const padLight = flat2(new RingGeometry(0.6, 1.3, 40), glowing(WHITE), 0.148);
  scene.add(glow);

  // ---- #18 火箭：車床做的黑色箭身（白色外框線）、紅色環帶、黑色尾裙與四片尾翼；底下是黑色的尖形噴焰 ----
  const rocket = new Group();
  const hullProfile = [[0.62, 0], [0.56, 0.5], [0.5, 1.0], [0.46, 1.24], [0.46, 3.3], [0.43, 3.65], [0.35, 4.0], [0.2, 4.3], [0.02, 4.45]];
  const rocketBody = lathe(mat.ink, hullProfile, 32);
  rocketBody.add(hull(rocketBody.geometry, 0.04));
  rocket.add(rocketBody, cylinder(mat.red, 0.475, 0.475, 1.2, 0, 1.24, 0, 32), cylinder(mat.red, 0.45, 0.47, 0.07, 0, 3.52, 0, 32));
  rocket.add(cylinder(mat.ink, 0.34, 0.44, 0.2, 0, -0.14, 0, 20)); // 噴嘴（升空之後才看得到）
  // 第四輪：箭身的接縫。紅色環帶上下各一條黑線、中間一圈細的黑線；黑色箭身上幾條白色的細接縫（受光的那一側才看得到）
  for (const y of [1.25, 1.84, 2.43]) {
    const seam = new Mesh(new TorusGeometry(0.478, 0.008, 4, 40), mat.flat(BLACK));
    seam.rotation.x = Math.PI / 2;
    seam.position.y = y;
    seam.userData.noShadow = true;
    rocket.add(seam);
  }
  for (const y of [2.9, 3.3, 0.75]) {
    const seam = new Mesh(new TorusGeometry(y < 1 ? 0.54 : 0.462, 0.006, 4, 40), mat.flat(WHITE));
    seam.rotation.x = Math.PI / 2;
    seam.position.y = y;
    seam.userData.noShadow = true;
    rocket.add(seam);
  }
  for (let i = 0; i < 4; i++) {
    // 尾翼：外框用放大一圈的輪廓做（乾淨的一圈白線）；翼根埋在箭身裡，不會在裙部留下雜線
    const fin = outlinedExtrude(mat.ink, [[0.3, 0.02], [1.08, -0.06], [1.0, 0.3], [0.3, 1.2]], 0.1, 0.028);
    fin.rotation.y = i * (Math.PI / 2) + Math.PI / 4;
    rocket.add(fin);
  }
  const flame = lathe(mat.ink, [[0.001, -3.4], [0.07, -2.5], [0.15, -1.0], [0.3, -0.62], [0.2, -0.12], [0.06, 0]], 14);
  flame.add(hull(flame.geometry, 0.035));
  flame.userData.noShadow = true;
  rocket.add(flame);
  register(18, rocket);
  scene.add(rocket);

  // ---- #19 紅色煙雲：一團一團的球從台座底下往外、往上翻湧 ----
  const smoke = new Group();
  const puffGeometry = new SphereGeometry(1, 12, 9);
  const random = seededRandom(19);
  const puffCount = Math.round(130 * deviceTier.particleScale);
  const puffs = [];
  const puffMaterial = mat.custom(RED, DARK_RED, 0);
  for (let i = 0; i < puffCount; i++) {
    const far = Math.pow(random(), 0.75);
    const distance = 1.3 + far * 3.1;
    let angle = random() * Math.PI * 2;
    if (distance < 3.6 && Math.abs(angle - Math.PI / 2) < 0.32) angle += 0.7; // 正面留一道缺口，看得到噴焰
    const size = 0.34 + random() * 0.34 + far * 0.5;
    const top = 3.0 * Math.exp(-(distance - 1.3) / 1.1) + 0.35; // 靠火箭的地方堆得高，往外變矮
    const mesh = new Mesh(puffGeometry, puffMaterial);
    mesh.userData.noShadow = true;
    smoke.add(mesh);
    puffs.push({ mesh, angle, distance, size, height: size * 0.45 + random() * top, delay: far * 0.42 + random() * 0.12, seed: random() * 20 });
  }
  register(19, smoke);
  scene.add(smoke);
  // 煙雲落在冰面上的影子：一片黑色的橢圓，跟著煙一起長大，往背光的左後方偏
  const smokeShadow = new Mesh(new CircleGeometry(1, 36), mat.flat(BLACK));
  Object.assign(smokeShadow.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  smokeShadow.rotation.x = -Math.PI / 2;
  smokeShadow.position.set(-1.3, 0.008, -1.1);
  scene.add(smokeShadow);

  // ---- #20 舉手的西裝男（第四輪：立體人物）：黑西裝、黑色的頭（封面上是一整個黑色剪影），白襯衫領口和一條白色細領帶；
  //      左手（畫面右側）在 settle 的後半舉起來下令發射，之後一直舉著，手肘微彎、手掌張開；點火時頭轉向火箭、仰頭看它升空 ----
  const man = makeFigure(mat, { suit: mat.ink, skin: mat.ink, hair: "short", shirt: mat.paper, tie: mat.paper, height: MAN_HEIGHT, build: 1.05 });
  const manJoints = man.userData.joints;
  for (const o of [...manJoints.head.children]) if (o.geometry?.parameters?.radius === 0.022) manJoints.head.remove(o); // 剪影的臉不要五官
  // 西裝的細節：外套下襬（從腰往下開一點）、胸前口袋巾的一點白、袖口的白邊
  const manLine = (0.011 * 1.75) / MAN_HEIGHT;
  const hem = new Mesh(new CylinderGeometry(0.175, 0.2, 0.2, 20, 1, true), mat.ink);
  hem.scale.z = 0.66;
  hem.position.y = -0.05;
  attach(manJoints.hips, manLine, hem);
  attach(manJoints.spine, manLine, box(mat.paper, 0.05, 0.022, 0.02, 0.1, 0.43, 0.105));
  for (const elbow of [manJoints.elbowL, manJoints.elbowR]) {
    const cuff = new Mesh(new TorusGeometry(0.043, 0.008, 6, 16), mat.paper);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.25;
    cuff.userData.noOutline = true;
    elbow.add(cuff);
  }
  man.position.set(-2.4, 0, 4.0); // 站在煙雲外緣的前面：煙鼓起來之後，他背後是一片紅
  register(20, man);
  scene.add(man);

  // ---- #14 衛星：白色本體（背光面是紅的）、正面一個紅圓、三片紅色格狀太陽能板、一個碟形天線 ----
  const satellite = new Group();
  const craft = new Group();
  craft.add(box(orbitMat.custom(WHITE, RED, 0), 1.0, 1.3, 0.8));
  const disc = cylinder(glowing(RED), 0.33, 0.33, 0.03, 0, 0, 0, 28);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(-0.05, -0.15, 0.405);
  craft.add(disc, box(glowing(RED), 0.45, 0.08, 0.02, -0.03, 0.5, 0.41), box(orbitMat.red, 0.2, 1.24, 0.82, 0.56, 0, 0));
  const panel = (w, h, cols, rows, x, y) => {
    const group = new Group();
    group.add(box(orbitMat.red, w, h, 0.06));
    for (let i = 1; i < cols; i++) group.add(box(glowing(WHITE), 0.035, h, 0.075, -w / 2 + (w * i) / cols, 0, 0));
    for (let j = 1; j < rows; j++) group.add(box(glowing(WHITE), w, 0.035, 0.075, 0, -h / 2 + (h * j) / rows, 0));
    group.position.set(x, y, 0);
    return group;
  };
  craft.add(panel(1.05, 1.7, 4, 6, 0.1, 1.85), panel(1.05, 1.7, 4, 6, 0.17, -1.8), panel(1.5, 0.9, 6, 4, -1.4, -0.65)); // 上、下、左
  craft.add(box(orbitMat.red, 0.07, 0.4, 0.07, 0.1, 0.83, 0), box(orbitMat.red, 0.07, 0.34, 0.07, 0.15, -0.8, 0), box(orbitMat.red, 0.2, 0.07, 0.07, -0.58, -0.6, 0)); // 連接桿
  const dish = lathe(orbitMat.red, [[0.02, 0], [0.2, 0.04], [0.36, 0.13], [0.47, 0.27]], 24);
  dish.rotation.z = -Math.PI / 2 - 0.15;
  dish.position.set(1.0, 0.15, 0);
  const feed = cylinder(orbitMat.red, 0.025, 0.025, 0.5, 0, 0, 0, 6);
  feed.rotation.z = -Math.PI / 2 - 0.15;
  feed.position.set(1.25, 0.11, 0);
  craft.add(dish, feed, sphere(glowing(RED), 0.06, 1.5, 0.07, 0, 8, 6), box(orbitMat.red, 0.3, 0.07, 0.07, 0.8, 0.15, 0));
  for (const [x, y] of [[-0.38, 0.52], [0.38, 0.52], [-0.38, -0.52], [0.38, -0.52]]) craft.add(sphere(glowing(RED), 0.035, x, y, 0.41, 8, 6)); // 四角的鉚釘
  craft.add(box(orbitMat.red, 0.7, 0.9, 0.12, -0.03, 0, -0.46)); // 背面的機箱
  craft.rotation.z = (-25 * Math.PI) / 180; // 封面上整個往右傾 25 度
  satellite.add(craft);
  satellite.position.copy(SATELLITE);
  register(14, satellite);
  scene.add(satellite);

  // ---- #15 太空人（第四輪：立體人物）：紅色太空衣（同一個人形，體型加寬），圓的紅色頭盔上一片白色面罩，
  //      背後一個維生背包，手臂和腿上各有白色的環帶（封面上太空衣的白色條紋）。整個人橫躺著漂：頭在左、腳在右，
  //      一隻手往上伸，四肢慢慢划動；繩子從腰間連到衛星 ----
  const spacewalk = new Group();
  const astronaut = new Group(); // 原點在身體中央，漂浮時繞著它晃
  const astroFigure = makeFigure(orbitMat, { suit: orbitMat.red, skin: orbitMat.red, shoes: orbitMat.red, hair: "bald", shirt: null, build: 1.3, height: ASTRO_HEIGHT });
  const astroJoints = astroFigure.userData.joints;
  const astroLine = (0.011 * 1.75) / ASTRO_HEIGHT;
  const helmet = new Mesh(new SphereGeometry(0.165, 24, 16), orbitMat.red);
  helmet.position.y = 0.09;
  const visor = new Mesh(new SphereGeometry(0.14, 24, 12, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.24, Math.PI * 0.42), orbitMat.paper);
  visor.position.set(0, 0.1, 0.035);
  const visorRim = new Mesh(new TorusGeometry(0.11, 0.014, 8, 28), orbitMat.red);
  visorRim.position.set(0, 0.1, 0.13);
  visorRim.scale.y = 0.8;
  attach(astroJoints.head, astroLine, helmet, visor, visorRim);
  const pack = box(orbitMat.red, 0.3, 0.42, 0.16, 0, 0.3, -0.16);
  const packLid = box(orbitMat.paper, 0.24, 0.035, 0.12, 0, 0.53, -0.16);
  attach(astroJoints.spine, astroLine, pack, packLid);
  // 白色環帶：上臂、前臂、大腿、小腿各一圈；腰間一圈（繩子扣在這裡）
  const band = (joint, y, r) => {
    const ringMesh = new Mesh(new TorusGeometry(r, 0.016, 6, 20), orbitMat.paper);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = y;
    ringMesh.userData.noOutline = true;
    joint.add(ringMesh);
  };
  band(astroJoints.shoulderL, -0.18, 0.068); band(astroJoints.shoulderR, -0.18, 0.068);
  band(astroJoints.elbowL, -0.17, 0.052); band(astroJoints.elbowR, -0.17, 0.052);
  band(astroJoints.hipL, -0.24, 0.092); band(astroJoints.hipR, -0.24, 0.092);
  band(astroJoints.kneeL, -0.24, 0.062); band(astroJoints.kneeR, -0.24, 0.062);
  const belt = new Mesh(new TorusGeometry(0.2, 0.022, 6, 24), orbitMat.paper);
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.66;
  belt.position.y = 0.04;
  belt.userData.noOutline = true;
  astroJoints.hips.add(belt);
  astroFigure.position.y = -ASTRO_HEIGHT * 0.53; // 身體中央（腰）在原點
  const astroBody = new Group();
  astroBody.rotation.z = Math.PI / 2 - 0.12; // 橫躺：頭在左、腳在右（封面上頭略高）
  astroBody.add(astroFigure);
  astronaut.add(astroBody);
  const waistPoint = new Vector3();
  const TETHER_SEGMENTS = 30;
  const tetherGeometry = new CylinderGeometry(0.03, 0.03, 1, 6);
  const tether = Array.from({ length: TETHER_SEGMENTS }, () => new Mesh(tetherGeometry, glowing(RED)));
  spacewalk.add(astronaut, ...tether);
  register(15, spacewalk);
  scene.add(spacewalk);
  const tetherFrom = new Vector3(), tetherTo = new Vector3(), pointA = new Vector3(), pointB = new Vector3(), direction = new Vector3();
  const up = new Vector3(0, 1, 0), turn = new Quaternion();
  const tetherPoint = (t, time, target) => {
    const slack = Math.sin(t * Math.PI);
    target.lerpVectors(tetherFrom, tetherTo, t);
    target.x += Math.sin(t * Math.PI * 3.5 + time * 0.7) * 0.45 * slack;
    target.y -= slack * 0.5;
    target.z += Math.cos(t * Math.PI * 2.5 + time * 0.5) * 0.3 * slack;
    return target;
  };

  // ---- 空氣：冰原上的飄雪（只在低空） ----
  const snow = new Snow({ count: Math.round(1500 * deviceTier.particleScale), box: new Vector3(44, 11, 36), center: new Vector3(3, 5.5, -6), size: 36, speed: 0.7, wind: 1.3 });
  scene.add(snow);


  // ---- 鏡頭：貼著冰面橫移 → 甩到發射台 → 跟著火箭升到軌道 → 仰看太空人 ----
  // 第三輪（鏡頭要順）：推拉只轉向兩次——冰面到發射台一路推近（0.56 最近）→ 跟著火箭往上升時往後退（0.8 最遠）
  // → 軌道上一路推近到太空人。fov 固定 42，遠近只靠距離；距離用 makeSteadyTrack 單調內插。
  // 冰面那幾格看的是遠方的浮冰和雪山，注視點放在同一條視線上 18–20 的地方（畫面一樣），距離才不會在甩鏡時一下子縮短。
  // 甩鏡拉長成 0.26–0.4、升空拉長成 0.64–0.9，位移不會一步跳太遠。
  const track = makeSteadyTrack([
    { t: -0.3, pos: [3.2, 0.7, 5.5], at: [6.9, 1.26, -14.15], fov: 42 }, // 冰面上低角度：浮冰
    { t: 0.05, pos: [4.6, 0.8, 3.6], at: [7.79, 1.86, -15.1], fov: 42 },
    { t: 0.26, pos: [6.0, 1.1, 3.0], at: [8.37, 2.75, -14.77], fov: 42 }, // 雪山
    { t: 0.4, pos: [2.6, 2.3, 13.2], at: [-0.9, 1.9, 0], fov: 42 }, // 甩到發射台：火箭和西裝男從頭到腳都在畫面裡
    { t: 0.56, pos: [1.6, 2.2, 11.6], at: [-1.0, 1.9, 0], fov: 42 }, // 慢慢推近、繞到正面一點
    { t: 0.64, pos: [1.1, 2.4, 12.3], at: [-0.6, 2.8, 0], fov: 42 }, // 點火：開始往上搖、往後退
    { t: 0.72, pos: [1.8, 6.0, 15.0], at: [0, 8.2, 0], fov: 42 }, // 跟著火箭升起
    { t: 0.8, pos: [4.0, 17.4, 13.5], at: [-1.4, 23.5, -1.5], fov: 42 }, // 跟著火箭升空（最遠的一格）
    { t: 0.9, pos: [0.6, 28.2, 8.0], at: [-3.6, 30.6, -4], fov: 42 }, // 軌道上的衛星
    { t: 0.97, pos: [-0.6, 28.0, 6.9], at: [-2.9, 31.9, -3.8], fov: 42 }, // 仰看太空人
    { t: 1.0, pos: [-0.8, 28.1, 6.6], at: [-2.9, 32.0, -3.8], fov: 42 },
    { t: 1.3, pos: [-1.1, 28.3, 6.3], at: [-2.8, 32.2, -3.8], fov: 42 },
  ]);

  let fogState = -1;
  const night = new Color(BLACK);
  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: soundScript.sound,
    cues: cueList([], [{ at: 0.3, cue: "reverseSwell" }, { at: 0.46, cue: "radio" }, { at: 0.49, cue: "countdown" }, { at: 0.56, cue: "rocket" }, { at: 0.84, cue: "whisperCue" }]),
    captions: [],
    elements: entries,
    update(progress, frame) {
      soundScript.update(progress);
      const p = clamp(progress, -0.3, 1.3);
      const time = frame.time;
      // 直式螢幕：發射台那幾個鏡位把鏡頭往後拉（火箭和西裝男同時入鏡），軌道上只拉一點
      const portrait = smooth(linearstep(p, 0.27, 0.37)) * (1 - 0.65 * smooth(linearstep(p, 0.72, 0.86)));
      applyCameraShot(camera, fitPortrait(track(p), frame.aspect, portrait), frame.aspect, frame.pointer, 0.05);
      // 鏡頭升空之後霧收緊，腳下的冰原和海沉進黑暗（軌道上的衛星和太空人不受霧影響）
      const altitude = smooth(linearstep(camera.position.y, 6, 20));
      if (altitude !== fogState) {
        fogState = altitude;
        const near = FOG.near + (8 - FOG.near) * altitude, far = FOG.far + (40 - FOG.far) * altitude;
        (scene.fog as Fog).near = rock.uniforms.uFogNear.value = near;
        (scene.fog as Fog).far = rock.uniforms.uFogFar.value = far;
        mat.setFog({ color: BLACK, near, far });
        sea.material.uniforms.uWave.value.set(WHITE).lerp(night, altitude);
      }
      sea.userData.update(time);
      snow.update(time);
      farStars.material.uniforms.uTime.value = time;

      // 星星：各自慢慢轉動、閃爍（兩片交叉，轉到哪個角度都是四芒星）
      stars.children.forEach((star, i) => {
        star.quaternion.copy(camera.quaternion); // 直的那一道光芒永遠是直的；繞著它轉，橫的光芒忽長忽短
        star.rotateY(time * (0.25 + (i % 3) * 0.08) + i * 1.3);
        star.scale.setScalar(0.85 + 0.15 * Math.sin(time * 1.7 + i * 1.9));
      });
      // 浮冰在水面上起伏、微微搖晃（吃水線留在水面）；碎冰慢慢往右漂，漂出範圍就從左邊再來
      floes.children.forEach((floe, i) => {
        floe.position.y = 0.06 + Math.sin(time * 1.1 + i * 2.2) * 0.05;
        floe.rotation.z = Math.sin(time * 0.8 + i * 1.3) * 0.025;
        floe.rotation.x = Math.sin(time * 0.6 + i * 2.9) * 0.02;
      });
      for (const bit of bits) {
        bit.block.position.set(((bit.x + time * bit.speed) % 70) - 28, 0.06 + Math.sin(time * 1.3 + bit.seed) * 0.025, bit.z + Math.sin(time * 0.2 + bit.seed) * 0.4);
        bit.block.rotation.y = bit.seed + time * 0.05;
      }

      const ignite = smooth(linearstep(p, pushIn[0] - 0.05, pushIn[0] + 0.01));
      const climb = Math.max(0, (p - (pushIn[0] - 0.005)) / 0.445);
      // 西裝男：settle 的後半把手舉起來（下令發射），舉到頂時手臂稍微過頭再回來，之後一直舉著；
      // 平常有呼吸的起伏、重心在兩腳之間換；點火後頭轉向火箭、跟著它仰起來
      const order = smooth(linearstep(p, 0.46, 0.55));
      const overshoot = Math.sin(clamp((p - 0.5) / 0.08, 0, 1) * Math.PI) * 0.12;
      const breathe = Math.sin(time * 1.7);
      man.userData.pose({
        armL: [-0.25 * order, 0, 0.08 + (ARM_UP - 0.08) * order + overshoot],
        elbowL: [-0.12 - 0.25 * order + Math.sin(time * 2.4) * 0.05 * order, 0, 0],
        armR: [0.05 + breathe * 0.02, 0, -0.1],
        elbowR: -0.18,
        spine: [0.02 * breathe, 0, -0.05 * order],
        hips: [0, 0, Math.sin(time * 0.5) * 0.02],
        head: [-0.5 * smooth(linearstep(climb, 0.02, 0.4)), 0.55 * ignite, 0],
      });
      manJoints.hips.position.y = 0.95 + breathe * 0.004;
      faceCamera(man, camera, 0.5); // 只跟一半：鏡頭在他右前方，看得到身體的側面

      // 火箭：pushIn 前一點點火，越飛越快，一路飛出畫面上方
      rocket.position.y = 0.14 + 62 * climb * climb + 9000 * Math.max(0, climb - 0.5) ** 3; // 過了衛星那一格之後加速飛走，不留在太空人的畫面裡
      rocket.rotation.y = climb * 1.2;
      const flicker = climb > 0 ? 1 + 0.08 * Math.sin(time * 23) : 1;
      flame.scale.set(0.6 + 0.4 * ignite, Math.max(0.001, ignite * flicker), 0.6 + 0.4 * ignite);
      flame.visible = ignite > 0.001;
      // 噴焰的光：點火時在台面和冰面上亮起來，跟著火焰閃動；火箭飛遠之後暗下去
      const lit = ignite * (1 - smooth(linearstep(climb, 0.25, 0.6))) * (1 + 0.06 * Math.sin(time * 19));
      glow.visible = lit > 0.001;
      glowRed.scale.setScalar(Math.max(0.001, 3.9 * lit));
      glowRed.rotation.z = time * 0.6;
      glowInner.scale.setScalar(Math.max(0.001, 2.3 * lit));
      glowInner.rotation.z = -time * 0.9;
      padLight.scale.setScalar(Math.max(0.001, 0.6 + 0.4 * lit));

      // 煙雲：點火後從台座往外、往上翻湧；外圈的比較晚到。鼓起來之後留在原地慢慢滾動
      const billow = linearstep(p, pushIn[0] - 0.04, pushIn[1] + 0.02);
      for (const puff of puffs) {
        const grow = smooth(linearstep(billow, puff.delay, puff.delay + 0.46));
        const reach = 0.7 + (puff.distance - 0.7) * grow;
        const roll = Math.sin(time * 1.6 + puff.seed) * 0.07 * grow;
        puff.mesh.position.set(Math.cos(puff.angle) * (reach + roll), puff.height * grow + roll, Math.sin(puff.angle) * (reach + roll));
        puff.mesh.scale.setScalar(Math.max(0.0001, puff.size * grow * (1 + 0.05 * Math.sin(time * 2.3 + puff.seed))));
        puff.mesh.visible = grow > 0.001;
      }
      const spread = smooth(billow);
      smokeShadow.scale.set(Math.max(0.001, 5.6 * spread), Math.max(0.001, 4.6 * spread), 1);
      smokeShadow.visible = spread > 0.001;

      // 衛星緩慢擺動；太空人在繩子那一頭漂，raise 這一拍被繩子帶著往上盪高一點
      satellite.rotation.y = -0.35 + Math.sin(time * 0.3) * 0.3;
      satellite.rotation.x = Math.sin(time * 0.23) * 0.08;
      const lift = smooth(linearstep(p, raise[0], raise[1]));
      astronaut.position.set(ASTRONAUT.x + Math.sin(time * 0.5) * 0.12, ASTRONAUT.y - 1.1 * (1 - lift) + Math.sin(time * 0.9) * 0.1, ASTRONAUT.z);
      astronaut.quaternion.copy(camera.quaternion);
      astronaut.rotateZ(Math.sin(time * 0.6) * 0.06 + 0.25 * (1 - lift));
      astronaut.rotateY(-0.5 + Math.sin(time * 0.45) * 0.4); // 不完全正對鏡頭：慢慢翻轉，看得到頭盔、軀幹、背包的前後層次
      astronaut.rotateX(Math.sin(time * 0.37) * 0.18);
      // 四肢慢慢划動：上面那隻手往前上方伸（封面上舉起的手），另一隻手和兩條腿張開，像在水裡漂
      const swim = time * 0.7;
      astroFigure.userData.pose({
        armL: [-0.3 + Math.sin(swim) * 0.15, 0, 2.3 + 0.35 * lift + Math.sin(swim + 1) * 0.12],
        elbowL: -0.35 - Math.sin(swim) * 0.15,
        armR: [0.2 + Math.sin(swim + 2) * 0.12, 0, -0.75 + Math.sin(swim + 0.5) * 0.1],
        elbowR: -0.6,
        hipL: [-0.15 + Math.sin(swim + 1.5) * 0.12, 0, 0.22],
        hipR: [0.1 + Math.sin(swim + 3) * 0.12, 0, -0.18],
        kneeL: 0.35 + Math.sin(swim) * 0.15,
        kneeR: 0.2 + Math.sin(swim + 2) * 0.12,
        head: [0.15, 0.2 * Math.sin(time * 0.4), 0],
      });
      astronaut.updateMatrixWorld(true);
      satellite.updateMatrixWorld(true);
      astroJoints.hips.localToWorld(tetherFrom.copy(waistPoint));
      craft.localToWorld(tetherTo.set(0.1, 2.7, 0));
      tetherPoint(0, time, pointA);
      for (let i = 0; i < TETHER_SEGMENTS; i++) {
        tetherPoint((i + 1) / TETHER_SEGMENTS, time, pointB);
        const segment = tether[i];
        direction.subVectors(pointB, pointA);
        const length = direction.length();
        segment.position.addVectors(pointA, pointB).multiplyScalar(0.5);
        segment.quaternion.copy(turn.setFromUnitVectors(up, direction.divideScalar(length)));
        segment.scale.set(1, length * 1.08, 1);
        pointA.copy(pointB);
      }
    },
  };
}
