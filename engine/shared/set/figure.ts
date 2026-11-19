// 立體人物（第四輪，2026-11-19 使用者回饋「人物的拼接感太重」）。
// 以前的人物是幾片厚紙板疊起來（thickCard / puppet），側面看得到一片片的接縫。
// 這裡改成一個真的人形：圓潤的軀幹（車床旋轉體再壓扁成橢圓斷面）、膠囊形的四肢、關節處用同材質的球接起來，
// 外面再包一圈墨線（反向外殼描邊），所以從任何角度看都是一個連續、有體積的人，輪廓仍是封面那種版畫線條。
//
//   const person = makeFigure(mat, { suit: mat.ink, skin: mat.red, hair: "short", tie: mat.red });
//   person.userData.pose({ armL: [0, 0, 0.4], elbowL: 0.3 });   // 各關節的旋轉（弧度）
//   walkCycle(person, phase, 1);                                  // 走路：phase 是走過的步數 × 2π
//
// 尺寸：預設身高 1.75（世界單位），腳底在 y = 0，臉朝 +z。scale 調整整個人的大小。
// 材質都用 makePalette 的卡通材質（會接收與投射陰影、有版畫排線）。
import { BackSide, Color, InstancedMesh, Matrix4, CylinderGeometry, Group, LatheGeometry, Mesh, ShaderMaterial, SphereGeometry, TorusGeometry, Vector2 } from "three";
import type { Material } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const outlineMaterials = new Map();
/** 反向外殼描邊用的材質：把頂點沿法線往外推 width（世界單位），只畫背面 */
function outlineMaterial(color, width) {
  const key = `${color}|${width}`;
  if (!outlineMaterials.has(key)) {
    outlineMaterials.set(key, new ShaderMaterial({
      side: BackSide,
      uniforms: { uColor: { value: new Color(color) }, uWidth: { value: width } },
      vertexShader: `
        uniform float uWidth;
        void main() {
          vec3 p = position + normalize(normal) * uWidth;
          #ifdef USE_INSTANCING
            gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
          #else
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          #endif
        }`,
      fragmentShader: `uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
    }));
  }
  return outlineMaterials.get(key);
}

/**
 * 替一個物件底下的每個 mesh 加上墨線外框（反向外殼）。
 * width 是世界單位；color 預設墨黑，黑色的東西放在黑色背景前時用紙白。
 * 外框不投影（userData.noShadow）。
 */
export function inkOutline(root, { width = 0.012, color = "#050505" } = {}) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && !o.userData.noOutline) meshes.push(o);
  });
  for (const mesh of meshes) {
    const outline = new Mesh(mesh.geometry, outlineMaterial(color, width));
    outline.userData.isOutline = true;
    outline.userData.noShadow = true;
    outline.raycast = () => {};
    mesh.add(outline);
  }
  return root;
}

// 細緻度（FigureOptions.detail）：makeFigure 執行期間有效，圓柱、球、旋轉體的分段數照比例減少。
// 遠景群眾用 0.5 左右：一個人從約 9,600 個三角形降到約 2,500 個，剪影加描邊在那個距離看不出差別。
let DETAIL = 1;
const seg = (n: number, min = 3) => Math.max(min, Math.round(n * DETAIL));
const smoothProfile = (points) => points.map(([r, y]) => new Vector2(Math.max(r, 0.0001), y));
/** 一段上粗下細的肢體：從關節往下（-y）長 length，上端半徑 r0、下端 r1，兩端都是圓的 */
function limb(material, length, r0, r1) {
  const profile = [];
  const steps = seg(10, 4);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = r0 + (r1 - r0) * t;
    profile.push([r, -t * length]);
  }
  // 下端收圓
  profile.push([r1 * 0.7, -length - r1 * 0.55], [0, -length - r1]);
  profile.unshift([0, r0], [r0 * 0.7, r0 * 0.55]);
  const geometry = new LatheGeometry(smoothProfile(profile.reverse()), seg(18));
  return new Mesh(geometry, material);
}
const ball = (material, r, segments = 18) => new Mesh(new SphereGeometry(r, seg(segments), seg(Math.round(segments * 0.7), 2)), material);
const joint = (x = 0, y = 0, z = 0) => {
  const g = new Group();
  g.position.set(x, y, z);
  return g;
};

/**
 * 做一個立體人物。
 * @param {object} mat makePalette() 的回傳值
 * @param {object} o
 *   suit：西裝或衣服（預設 mat.ink）　pants：褲子（預設同 suit）　shirt：襯衫領口（預設 mat.paper，null 不要）
 *   tie：領帶（材質或 null）　skin：臉和手（預設 mat.red，和封面上的人一樣）
 *   hair："short" | "long" | "bob" | "curly" | "bald" | "hijab" | "cowboy" | "helmet" | "cap" | "keffiyeh"
 *   hairMaterial：頭髮或帽子（預設 mat.ink）　skirt：裙子（true 或材質）　coat：長大衣（下襬到膝蓋）
 *   build：體型，1 是一般，>1 較寬　height：身高（預設 1.75）
 *   shoulders："square" 方肩（西裝墊肩）　scratch：false 時黑色衣服不刻白線
 *   outline：描邊顏色（預設墨黑；黑衣服站在黑色背景前給 "#f2efe6"）、outlineWidth
 */
// 黑色的材質換成「刮版畫」版本（受光面刻出紙白細線，見 core.js 的 uScratch），每個調色盤每個材質只做一次。
// 複本加進調色盤的 all，之後 addFog 也會套到它。
const scratchCache = new WeakMap();
function scratchy(mat, material) {
  const u = material?.uniforms;
  if (!u?.uColor || !u.uScratch) return material;
  const c = u.uColor.value;
  if (c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.12) return material;
  if (!scratchCache.has(material)) {
    const copy = material.clone();
    copy.uniforms.uScratch.value = 0.85;
    copy.uniforms.uHatch.value = 0.06;
    copy.uniforms.uRim.value = Math.min(copy.uniforms.uRim.value, 0.35); // 有了白線，邊緣光減弱，免得關節處出現白色光帶
    mat.all?.push(copy);
    scratchCache.set(material, copy);
  }
  return scratchCache.get(material);
}

/** makeFigure 的選項（各欄位說明見上方註解） */
export interface FigureOptions {
  scratch?: boolean;
  suit?: Material;
  pants?: Material;
  skin?: Material;
  hairMaterial?: Material;
  build?: number;
  shoulders?: string;
  shirt?: Material | null;
  tie?: Material | null;
  coat?: Material | boolean;
  skirt?: Material | boolean;
  hair?: string;
  shoes?: Material;
  height?: number;
  outlineWidth?: number;
  outline?: string;
  /** 細緻度 0–1（預設 1）：遠景群眾給 0.5 左右，面數約剩四分之一 */
  detail?: number;
}

export function makeFigure(mat, o: FigureOptions = {}) {
  const previous = DETAIL;
  DETAIL = o.detail ?? 1;
  try {
    return buildFigure(mat, o);
  } finally {
    DETAIL = previous;
  }
}
function buildFigure(mat, o: FigureOptions) {
  const scratch = o.scratch !== false;
  const dress = (m) => (scratch ? scratchy(mat, m) : m);
  const suit = dress(o.suit ?? mat.ink);
  const pants = dress(o.pants ?? o.suit ?? mat.ink);
  const skin = dress(o.skin ?? mat.red); // 黑色的皮膚（剪影人物）也刻線，頭和身體才一致
  const hairMaterial = dress(o.hairMaterial ?? mat.ink);
  const build = o.build ?? 1;
  const root = new Group();
  const body = new Group(); // 身高 1.75 的人；最後依 height 縮放
  root.add(body);

  // ---- 骨架（關節是 Group，旋轉它們就能擺姿勢） ----
  const hips = joint(0, 0.95, 0);
  const spine = joint(0, 0.06, 0);
  hips.add(spine);
  const neck = joint(0, 0.56, 0);
  spine.add(neck);
  const head = joint(0, 0.1, 0);
  neck.add(head);
  const shoulderL = joint(0.2 * build, 0.48, 0), shoulderR = joint(-0.2 * build, 0.48, 0);
  spine.add(shoulderL, shoulderR);
  const elbowL = joint(0, -0.3, 0), elbowR = joint(0, -0.3, 0);
  shoulderL.add(elbowL);
  shoulderR.add(elbowR);
  const hipL = joint(0.095 * build, 0, 0), hipR = joint(-0.095 * build, 0, 0);
  hips.add(hipL, hipR);
  const kneeL = joint(0, -0.45, 0), kneeR = joint(0, -0.45, 0);
  hipL.add(kneeL);
  hipR.add(kneeR);
  body.add(hips);

  // ---- 軀幹：肩寬、腰收、骨盆，斷面是橢圓 ----
  const torsoProfile = o.shoulders === "square"
    ? [[0.0, -0.02], [0.15, 0.0], [0.17, 0.12], [0.16, 0.26], [0.185, 0.38], [0.22, 0.5], [0.215, 0.545], [0.1, 0.565], [0.0, 0.575]]
    : [[0.0, -0.02], [0.15, 0.0], [0.17, 0.12], [0.155, 0.26], [0.17, 0.38], [0.2, 0.47], [0.17, 0.53], [0.08, 0.57], [0.0, 0.58]];
  const torso = new Mesh(new LatheGeometry(smoothProfile(torsoProfile.map(([r, y]) => [r * build, y])), seg(24)), suit);
  torso.scale.z = 0.62;
  spine.add(torso);
  const pelvis = new Mesh(new SphereGeometry(0.16 * build, seg(20), seg(12, 2)), pants);
  pelvis.scale.set(1, 0.65, 0.7);
  pelvis.position.y = 0.02;
  hips.add(pelvis);
  // 襯衫領口（V 字的白）與領帶
  if (o.shirt !== null) {
    const collar = new Mesh(new CylinderGeometry(0.0, 0.07, 0.2, 3, 1), o.shirt ?? mat.paper);
    collar.rotation.x = Math.PI;
    collar.scale.z = 0.25;
    collar.position.set(0, 0.47, 0.105 * build);
    spine.add(collar);
  }
  if (o.tie) {
    const tie = new Mesh(new CylinderGeometry(0.0, 0.03, 0.3, 4, 1), o.tie);
    tie.rotation.x = Math.PI;
    tie.scale.z = 0.3;
    tie.position.set(0, 0.36, 0.112 * build);
    spine.add(tie);
  }
  // 長大衣：從腰往下開成一個圓台，蓋到膝蓋
  if (o.coat) {
    const coat = new Mesh(new CylinderGeometry(0.17 * build, 0.24 * build, 0.55, seg(20), 1, true), o.coat === true ? suit : o.coat);
    coat.scale.z = 0.7;
    coat.position.y = -0.2;
    hips.add(coat);
  }
  // 裙子
  if (o.skirt) {
    const skirt = new Mesh(new CylinderGeometry(0.16 * build, 0.25 * build, 0.42, seg(20), 1, true), o.skirt === true ? pants : o.skirt);
    skirt.scale.z = 0.72;
    skirt.position.y = -0.15;
    hips.add(skirt);
  }

  // ---- 頭與脖子 ----
  neck.add(new Mesh(new CylinderGeometry(0.05, 0.055, 0.12, seg(12)), skin).translateY(0.0));
  const skull = ball(skin, 0.105, 22);
  skull.scale.set(0.92, 1.12, 1);
  skull.position.y = 0.1;
  head.add(skull);
  const nose = ball(skin, 0.022, 10);
  nose.position.set(0, 0.09, 0.1);
  head.add(nose);
  addHair(head, o.hair ?? "short", hairMaterial, mat);

  // ---- 手臂：上臂、手肘、前臂、手（手是一個圓） ----
  for (const [shoulder, elbow] of [[shoulderL, elbowL], [shoulderR, elbowR]]) {
    if (o.shoulders === "square") {
      // 方肩（西裝的墊肩）：一塊圓角的扁方塊蓋在肩關節上，肩線是平的
      const pad = new Mesh(new CylinderGeometry(0.075 * build, 0.075 * build, 0.16, 4, 1), suit);
      pad.rotation.set(0, Math.PI / 4, Math.PI / 2);
      pad.scale.set(1, 1, 0.75);
      pad.position.set(Math.sign(shoulder.position.x) * -0.02, 0.035, 0);
      spine.add(pad);
      pad.position.x += shoulder.position.x;
      pad.position.y += shoulder.position.y;
    }
    shoulder.add(ball(suit, 0.062 * build));
    shoulder.add(limb(suit, 0.3, 0.062 * build, 0.052));
    elbow.add(ball(suit, 0.052));
    elbow.add(limb(suit, 0.27, 0.05, 0.042));
    const hand = ball(skin, 0.05, 14);
    hand.scale.set(0.8, 1.15, 0.6);
    hand.position.y = -0.31;
    elbow.add(hand);
  }
  // ---- 腿：大腿、膝、小腿、鞋 ----
  for (const [hip, knee] of [[hipL, kneeL], [hipR, kneeR]]) {
    hip.add(limb(pants, 0.45, 0.085 * build, 0.065));
    knee.add(ball(pants, 0.064));
    knee.add(limb(pants, 0.44, 0.062, 0.048));
    const shoe = ball(dress(o.shoes ?? mat.ink), 0.06, 14);
    shoe.scale.set(0.85, 0.55, 1.75);
    shoe.position.set(0, -0.47, 0.05);
    knee.add(shoe);
  }

  // 自然站姿：手臂微微往外、手肘微彎
  shoulderL.rotation.z = 0.08;
  shoulderR.rotation.z = -0.08;
  elbowL.rotation.x = elbowR.rotation.x = -0.12;

  body.scale.setScalar((o.height ?? 1.75) / 1.75);
  inkOutline(body, { width: (o.outlineWidth ?? 0.011) * 1.75 / (o.height ?? 1.75), color: o.outline ?? "#050505" });

  const joints = { hips, spine, neck, head, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR };
  // 不可列舉：clone() 用 JSON 深拷貝 userData，關節（Object3D）會被整個序列化，很慢
  Object.defineProperty(root.userData, "joints", { value: joints, enumerable: false, writable: true, configurable: true });
  /** 擺姿勢：{ 關節名: [x, y, z] 或單一數字（繞 x） } */
  root.userData.pose = (pose) => {
    for (const [name, value] of Object.entries(pose)) {
      const j = joints[name.replace(/^arm/, "shoulder").replace(/^leg/, "hip")];
      if (!j) continue;
      if (Array.isArray(value)) j.rotation.set(...value);
      else j.rotation.x = value;
    }
  };
  return root;
}

function addHair(head, kind, hair, mat) {
  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    head.add(mesh);
    return mesh;
  };
  const cap = (r, sy = 1, y = 0.13, z = -0.01) => {
    const m = new Mesh(new SphereGeometry(r, seg(22), seg(12, 2), 0, Math.PI * 2, 0, Math.PI * 0.42), hair);
    m.scale.y = sy;
    return add(m, 0, y, z);
  };
  switch (kind) {
    case "bald":
      break;
    case "short":
      cap(0.112, 0.95);
      break;
    case "long": {
      cap(0.116, 1);
      const back = new Mesh(new CylinderGeometry(0.1, 0.13, 0.32, seg(18), 1, true, Math.PI * 0.6, Math.PI * 1.8), hair);
      add(back, 0, -0.02, -0.01);
      break;
    }
    case "bob": {
      cap(0.118, 1.05);
      const sides = new Mesh(new CylinderGeometry(0.115, 0.125, 0.16, seg(18), 1, true, Math.PI * 0.7, Math.PI * 1.6), hair);
      add(sides, 0, 0.06, 0);
      break;
    }
    case "curly":
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add(ball(hair, 0.06, 10), Math.cos(a) * 0.1, 0.2 + Math.sin(i * 2.1) * 0.02, Math.sin(a) * 0.08 - 0.02);
      }
      cap(0.115, 1.1);
      break;
    case "hijab":
    case "keffiyeh": {
      // 頭巾：蓋住頭頂和後腦，垂到肩上；臉露出來
      const cloth = kind === "hijab" ? (hair === mat.ink ? mat.paper : hair) : mat.paper;
      const hood = new Mesh(new SphereGeometry(0.128, seg(22), seg(16, 2), Math.PI * 0.62, Math.PI * 1.76), cloth);
      hood.scale.y = 1.12;
      add(hood, 0, 0.1, -0.01);
      const drape = new Mesh(new CylinderGeometry(0.115, 0.17, 0.26, seg(20), 1, true, Math.PI * 0.62, Math.PI * 1.76), cloth);
      add(drape, 0, -0.06, -0.01);
      if (kind === "keffiyeh") {
        const band = new Mesh(new TorusGeometry(0.118, 0.014, seg(8), seg(26)), mat.ink);
        band.rotation.x = Math.PI / 2;
        add(band, 0, 0.17, -0.005);
      }
      break;
    }
    case "cowboy": {
      const brim = new Mesh(new CylinderGeometry(0.2, 0.2, 0.012, seg(26)), hair);
      add(brim, 0, 0.18, 0);
      add(new Mesh(new CylinderGeometry(0.085, 0.105, 0.12, seg(20)), hair), 0, 0.245, 0);
      break;
    }
    case "helmet": {
      cap(0.13, 0.9, 0.12, 0);
      add(new Mesh(new CylinderGeometry(0.15, 0.15, 0.01, seg(24)), hair), 0, 0.12, 0);
      break;
    }
    case "cap": {
      cap(0.115, 0.9);
      const visor = new Mesh(new CylinderGeometry(0.08, 0.08, 0.01, seg(18), 1, false, -Math.PI / 2, Math.PI), hair);
      add(visor, 0, 0.15, 0.08);
      break;
    }
  }
}

/** 走路的擺動：phase 是走過的步數 × 2π，amount 0–1 */
export function walkCycle(figure, phase, amount = 1) {
  const j = figure.userData.joints;
  const s = Math.sin(phase), c = Math.cos(phase);
  j.hipL.rotation.x = 0.45 * s * amount;
  j.hipR.rotation.x = -0.45 * s * amount;
  j.kneeL.rotation.x = Math.max(0, -c) * 0.7 * amount;
  j.kneeR.rotation.x = Math.max(0, c) * 0.7 * amount;
  j.shoulderL.rotation.x = -0.35 * s * amount;
  j.shoulderR.rotation.x = 0.35 * s * amount;
  j.hips.position.y = 0.95 + Math.abs(c) * 0.025 * amount;
}

/**
 * 把一個擺好姿勢的人烘成少數幾個 mesh（同材質的部分合併成一個），之後不能再動關節。
 * 一個人原本約 40 個 mesh（加描邊 80 個），群眾一多 draw call 會爆；烘過之後每個人只剩「材質數 × 2」個。
 * 回傳 Group；userData.parts 是 [{ geometry, material }]，可以拿去做 InstancedMesh（見 instancedCrowd）。
 */
export function bakeFigure(figure) {
  figure.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(figure.matrixWorld).invert();
  const byMaterial = new Map();
  figure.traverse((o) => {
    if (!o.isMesh) return;
    const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geometry.attributes)) if (!["position", "normal", "uv"].includes(name)) geometry.deleteAttribute(name);
    geometry.applyMatrix4(new Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
    byMaterial.get(o.material).push(geometry);
  });
  const group = new Group();
  const parts = [];
  for (const [material, geometries] of byMaterial) {
    const geometry = mergeGeometries(geometries);
    const mesh = new Mesh(geometry, material);
    if (material.side === BackSide && material.uniforms?.uWidth) {
      mesh.userData.isOutline = mesh.userData.noShadow = true;
    }
    group.add(mesh);
    parts.push({ geometry, material });
  }
  // parts 掛成不可列舉的屬性：Object3D.clone() 會用 JSON 深拷貝 userData，
  // 若 parts（裡面有整個 geometry）可以列舉，每複製一次就序列化一次幾何體（實測隊伍的十個人光複製就花了 3 秒）。
  Object.defineProperty(group.userData, "parts", { value: parts, enumerable: false, writable: true, configurable: true });
  return group;
}

/**
 * 群眾：同一個烘好的人（bakeFigure 的結果）用 InstancedMesh 複製到很多位置，每個材質只要一個 draw call。
 * matrices：每個人的 Matrix4（位置、轉向、大小）。回傳 Group。
 */
export function instancedCrowd(baked, matrices) {
  const group = new Group();
  for (const { geometry, material } of baked.userData.parts) {
    const mesh = new InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (material.side === BackSide && material.uniforms?.uWidth) mesh.userData.noShadow = true;
    group.add(mesh);
  }
  return group;
}
