// 3D 場景的建模工具。座標是 Y 向上；1 單位 = 封面 100 像素（和平面版同一把尺）。
// 做法照原作：東西用基本幾何體、車床旋轉體、擠出體拼出來，套二值的卡通材質，再由後製壓成紅黑白。
import {
  BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, LatheGeometry, Mesh,
  Matrix4, MeshBasicMaterial, PlaneGeometry, Shape, SphereGeometry, Vector2, Vector3,
} from "three";
import { deviceTier, toonMaterial } from "../../core";
import { BLACK, DARK_RED, RED, WHITE } from "../world/space";

/** 封面像素 → 世界單位 */
export const u = (pixels) => pixels / 100;

/**
 * 一個場景共用的一組卡通材質（同一個光向）。
 * ink 是黑色物件：亮暗面都是黑的，靠白色的邊緣光勾出輪廓（原作夜景的做法）。
 * @param {[number, number, number]} lightDirection 指向光源的方向
 */
export function makePalette(lightDirection = [-0.5, 0.8, 0.6]) {
  const light = new Vector3(...lightDirection).normalize();
  const all = []; // 這個場景所有的卡通材質，加霧的時候要一起設定
  let fog = null;
  const make = (color, shade, rim, rimColor = WHITE) => {
    const material = toonMaterial({ color, shade, light, rim, rimColor, threshold: 0.15, side: DoubleSide });
    all.push(material);
    if (fog) applyFog(material, fog);
    return material;
  };
  const applyFog = (material, { color, near, far }) => {
    material.uniforms.uFogColor.value.set(color);
    material.uniforms.uFogNear.value = near;
    material.uniforms.uFogFar.value = far;
  };
  return {
    light,
    all,
    /** 由 env.js 的 addFog 呼叫：替這組材質（包含之後才建立的）設定霧 */
    setFog(settings) {
      fog = settings;
      for (const material of all) applyFog(material, settings);
    },
    red: make(RED, DARK_RED, 0.25),
    darkRed: make(DARK_RED, "#3a0c0a", 0.2),
    paper: make(WHITE, "#0a0a0a", 0),
    ink: make("#141414", BLACK, 0.9),
    /** 另外做一個顏色的材質（同一個光向） */
    custom: (color, shade = BLACK, rim = 0.3, rimColor = WHITE) => make(color, shade, rim, rimColor),
    /** 不受光的純色（遠景、發光的東西）。fog 給 false 就不會被霧吃掉（太陽、月亮、遠方發光的東西） */
    flat: (color, fog = true) => new MeshBasicMaterial({ color, side: DoubleSide, fog }),
  };
}

export function place(mesh, x = 0, y = 0, z = 0) {
  mesh.position.set(x, y, z);
  return mesh;
}
export const box = (material, w, h, d, x = 0, y = 0, z = 0) => place(new Mesh(new BoxGeometry(w, h, d), material), x, y, z);
/** 直立的圓柱或圓台；y 是底面的高度 */
export const cylinder = (material, rTop, rBottom, h, x = 0, y = 0, z = 0, segments = 24) =>
  place(new Mesh(new CylinderGeometry(rTop, rBottom, h, segments), material), x, y + h / 2, z);
export const cone = (material, r, h, x = 0, y = 0, z = 0, segments = 4) => place(new Mesh(new ConeGeometry(r, h, segments), material), x, y + h / 2, z);
export const sphere = (material, r, x = 0, y = 0, z = 0, w = 20, h = 14) => place(new Mesh(new SphereGeometry(r, w, h), material), x, y, z);

/**
 * 車床旋轉體：profile 是一串 [半徑, 高度]（世界單位），由下往上，繞 Y 軸旋轉一圈。
 * 沙漏、球座、火箭、瓶子都用這個。
 */
export function lathe(material, profile, segments = 28) {
  return new Mesh(new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(r, 0.0001), y)), segments), material);
}

/**
 * 擠出體：outline 是一串 [x, y]（世界單位，y 向上）的封閉輪廓，沿 Z 擠出 depth 的厚度，前後置中。
 * 立體字、星形、車身側面輪廓都用這個。
 */
export function extrude(material, outline, depth, { bevel = 0 } = {}) {
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  geometry.translate(0, 0, -depth / 2);
  return new Mesh(geometry, material);
}

/** 把封面像素的輪廓換成 extrude 用的輪廓：以 [originX, baseY] 為原點，y 翻成向上。 */
export const fromCover = (points, originX, baseY) => points.map(([x, y]) => [u(x - originX), u(baseY - y)]);

/** 五角星的輪廓（外半徑 r） */
export function starOutline(r, inner = 0.42) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, radius = i % 2 ? r * inner : r;
    points.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return points;
}

/**
 * 紙偶：直接拿平面版已經畫好的那張圖（coverSprite 產生的 sprite）做成站立的卡片。
 * 邊緣用 alpha 測試硬切並寫入深度，才能和模型互相遮擋。原點在腳底中央。
 * @param {import("three").Mesh} sprite 平面版的 sprite
 * @param {number} [scale] 放大倍率（3D 場景裡人物通常要比封面上的比例大一點）
 */
export function cardFromSprite(sprite, scale = 1) {
  const { width, height } = sprite.geometry.parameters;
  const geometry = new PlaneGeometry(width * scale, height * scale);
  geometry.translate(0, (height * scale) / 2, 0);
  const material = new MeshBasicMaterial({ map: sprite.material.map, alphaTest: 0.5, side: DoubleSide, toneMapped: false });
  const card = new Mesh(geometry, material);
  card.userData.size = [width * scale, height * scale];
  return card;
}

/**
 * 有厚度的紙偶：把同一張圖前後疊幾層，中間幾層塗暗當作切面。正面和背面是原圖，
 * 從側面或斜角看得到厚度，不再是一張紙。原點在腳底中央。
 * @param {number} [depth] 厚度（世界單位）
 * @param {number} [layers] 疊幾層（越多切面越實，也越耗效能）
 */
export function thickCard(sprite, scale = 1, depth = 0.07, layers = 6) {
  const group = new Group();
  const front = cardFromSprite(sprite, scale);
  const edge = front.material.clone();
  edge.color.set("#1c1c1c");
  for (let i = 0; i < layers; i++) {
    const layer = i === 0 || i === layers - 1 ? front.clone() : new Mesh(front.geometry, edge);
    layer.position.z = depth * (0.5 - i / (layers - 1));
    group.add(layer);
  }
  group.userData.size = front.userData.size;
  group.userData.card = group.children[0];
  return group;
}

/** 腳下的假影子：一片壓在地上的黑色橢圓（原作清晨章用壓扁的剪影，這是更省的版本）。 */
export function blobShadow(rx, rz, x = 0, z = 0) {
  const shadow = new Mesh(new CircleGeometry(1, 24), new MeshBasicMaterial({ color: BLACK }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(rx, rz, 1);
  shadow.position.set(x, 0.004, z);
  return shadow;
}

/** 把有厚度的紙偶和它的影子包成一組，原點在腳底。 */
export function puppet(sprite, scale = 1, shadow = true) {
  const group = new Group();
  const card = thickCard(sprite, scale);
  group.add(card);
  if (shadow) group.add(blobShadow(card.userData.size[0] * 0.42, card.userData.size[0] * 0.13));
  group.userData.card = card;
  group.userData.size = card.userData.size;
  return group;
}

/**
 * 讓紙偶繞 Y 軸轉向鏡頭（不仰俯，像立牌）。follow 是跟隨的比例：1 完全正對鏡頭；
 * 預設 0.7（原作清晨章路人的做法），鏡頭繞到側面時看得到紙偶的厚度，立體感比完全正對好。
 * @param {number} [home] 不跟隨時的朝向（弧度，0 = 朝 +z）
 */
export function faceCamera(object, camera, follow = 0.7, home = 0) {
  const toCamera = Math.atan2(camera.position.x - object.position.x, camera.position.z - object.position.z);
  let delta = toCamera - home;
  delta = Math.atan2(Math.sin(delta), Math.cos(delta));
  object.rotation.y = home + delta * follow;
}

/**
 * 投影陰影：把 roots 底下每個 mesh 沿著光的方向壓扁到地面（y = groundY），畫成黑色的影子。
 * 影子的形狀跟著物件走（會動的物件影子也會動），比陰影貼圖省很多，手機上自動關閉。
 * 回傳的群組加進場景；每一幀在所有物件更新之後呼叫 group.userData.update()。
 * 地面是黑色的場景不用加（看不到）。紙偶的影子會帶著圖案的鏤空。
 * @param {import("three").Object3D[]} roots 要投影的物件
 * @param {Vector3} light 指向光源的方向（makePalette(...).light）
 */
export function planarShadows(roots, light, groundY = 0.006) {
  const group = new Group();
  group.userData.update = () => {};
  // 桌機改用真的投影陰影（引擎的 setupShadows），平面投影只在手機上當替代品
  if (deviceTier.shadowMaps || !deviceTier.shadows) return group;
  const pairs = [];
  const solid = new MeshBasicMaterial({ color: BLACK, side: DoubleSide });
  for (const root of roots) {
    root.traverse((source) => {
      if (!source.isMesh || source.userData.noShadow) return;
      const material = source.material.map && source.material.alphaTest
        ? new MeshBasicMaterial({ color: BLACK, map: source.material.map, alphaTest: 0.5, side: DoubleSide })
        : solid;
      const shadow = new Mesh(source.geometry, material);
      shadow.matrixAutoUpdate = false;
      shadow.frustumCulled = false;
      group.add(shadow);
      pairs.push([source, shadow]);
    });
  }
  // 沿光線方向投影到平面 y = groundY 的矩陣
  const project = new Matrix4().set(
    1, -light.x / light.y, 0, (light.x / light.y) * groundY,
    0, 0, 0, groundY,
    0, -light.z / light.y, 1, (light.z / light.y) * groundY,
    0, 0, 0, 1,
  );
  group.userData.update = () => {
    for (const [source, shadow] of pairs) {
      source.updateWorldMatrix(true, false);
      shadow.matrix.multiplyMatrices(project, source.matrixWorld);
      shadow.visible = source.visible && isShown(source);
    }
  };
  return group;
}
function isShown(object) {
  for (let o = object.parent; o; o = o.parent) if (!o.visible) return false;
  return true;
}
