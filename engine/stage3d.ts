// 立體化：把封面當成攤在桌上的地圖。封面平面是地面（世界座標的 XY），z 是高度。
// 每個已登記的元素以自己的底邊為軸從地面立起來，像立體書的紙板；地景留在地面；會飛的東西浮在空中。
// 章節完全不用知道這件事：它們照舊在封面平面上擺東西、用「正對平面」的鏡頭取景，
// 這裡在每次繪製前把元素立起來，並把鏡頭換算成斜向俯視。stand = 0 時一切回到原本的平面（終章用）。
import { Box3, Matrix4, Vector3 } from "three";
import staging from "./data/staging.json";

const STAND_ANGLE = (86 * Math.PI) / 180; // 立起來的角度；不到 90 度，從正上方看才不會變成一條線
export const DEFAULT_STAGE = { stand: 1, pitch: 34 }; // pitch：鏡頭視線和地面的夾角（度）；90 是正上方

const units = []; // { object, baseY, lift, centerX }：每個要立起來的單位
const box = new Box3();
const tmp = new Vector3(), tmpAt = new Vector3(), forward = new Vector3();
const pivotMatrix = new Matrix4(), rotate = new Matrix4(), back = new Matrix4();

/**
 * 把 object 登記成一個要立起來的單位：之後它繞著 y = baseY 這條底邊立起來。
 * 不改動物件階層（章節還會用 children 找東西），而是關掉它的自動矩陣，每次繪製前由 applyStand 重算。
 */
function stand(object, baseY, lift, chapterId) {
  box.setFromObject(object);
  if (box.isEmpty()) return;
  const record = { object, chapterId, baseY: baseY ?? box.min.y, lift, centerX: (box.min.x + box.max.x) / 2 };
  object.matrixAutoUpdate = false;
  object.userData.staged = true;
  units.push(record);
  // 單位底下的每個 mesh：改由「所屬單位離鏡頭的遠近」決定繪製順序，同一單位裡再照原本的層次
  object.traverse((child) => {
    if (!child.isMesh && !child.isPoints) return;
    child.userData.unit = record;
    child.userData.layer = child.renderOrder;
    child.renderOrder = 0;
  });
}

const insideStaged = (object) => {
  for (let o = object.parent; o; o = o.parent) if (o.userData.staged) return true;
  return false;
};

/** 所有章節載入後呼叫一次：依 staging.json 決定每個已登記的元素怎麼立。 */
export function setupStaging(chapters) {
  units.length = 0;
  const flat = new Set(staging.flat), unit = new Set(staging.unit);
  const entries = new Map(); // 元素編號 → 登記的物件
  for (const chapter of chapters) if (chapter.group) for (const entry of chapter.flatElements ?? chapter.elements) entries.set(entry.id, { ...entry, chapterId: chapter.id });

  // 先量好所有「跟著別人立」的元素要用的底邊
  const borrowedBase = {};
  for (const [child, parent] of Object.entries(staging.on)) {
    if (!entries.has(+child) || !entries.has(parent)) continue;
    box.setFromObject(entries.get(parent).object);
    borrowedBase[child] = box.min.y;
  }
  for (const [id, entry] of entries) {
    if (flat.has(id) || insideStaged(entry.object) || entry.object.userData.staged) continue;
    const lift = staging.float[id] ?? 0;
    const base = borrowedBase[id];
    // 成群登記的元素（群眾、旗子、星星）：每個成員各自立在自己的位置；其餘整組一起立
    const each = entry.object.isGroup && !unit.has(id) && base === undefined && entry.object.children.length > 1 && (entry.count > 1 || id in staging.float);
    for (const member of each ? entry.object.children : [entry.object]) stand(member, base, lift, entry.chapterId);
  }
  // 沒被立起來的（地景與 flat 元素）：一律先畫，維持彼此原本的層次
  for (const chapter of chapters) {
    chapter.group?.traverse((child) => {
      if ((child.isMesh || child.isPoints) && !child.userData.unit) child.renderOrder = -10000 + child.renderOrder;
    });
  }
}

/**
 * 讓某一章的元素立起來 amount（0 = 平躺在封面上，1 = 完全立起來），其他章的元素一律平躺：
 * 鏡頭走到哪一章，那一章的東西才從地圖上立起來，像立體書翻到那一頁。
 * 章節每一幀都可能改動物件的位置、旋轉、縮放，所以要在章節的 update 之後呼叫。
 */
export function applyStand(amount, chapterId) {
  for (const { object, baseY, lift, chapterId: owner } of units) {
    object.updateMatrix();
    if (owner === chapterId && amount > 0) {
      pivotMatrix.makeTranslation(0, baseY, lift * amount).multiply(rotate.makeRotationX(STAND_ANGLE * amount)).multiply(back.makeTranslation(0, -baseY, 0));
      object.matrix.premultiply(pivotMatrix);
    }
    object.matrixWorldNeedsUpdate = true;
  }
}

/**
 * 章節的鏡頭是「正對封面平面」設好的；這裡換成斜向俯視，保持看著同一塊地方、同樣的遠近。
 * 立起來的東西的底邊通常在取景範圍的中下方、身體在地面以上，所以注視點往鏡頭這一側移一點、再抬高一點。
 * stage.target（世界座標）有給的話改看那一點，用 stage.blend（0–1）和自動算出來的結果混合。
 */
export function stageCamera(camera, stage) {
  const { stand, pitch } = stage;
  camera.getWorldDirection(forward);
  if (Math.abs(forward.z) < 1e-4) return;
  // 視線和地面（z = 0）的交點，以及鏡頭到它的距離
  const t = -camera.position.z / forward.z;
  tmpAt.copy(camera.position).addScaledVector(forward, t);
  let distance = Math.abs(t);
  const viewHeight = 2 * distance * Math.tan((camera.fov * Math.PI) / 360);
  tmpAt.y -= 0.3 * viewHeight * stand;
  tmpAt.z = 0.3 * viewHeight * stand;
  let angle = (pitch * Math.PI) / 180;
  if (stage.target && stage.blend > 0) {
    tmpAt.lerp(stage.target, stage.blend);
    distance += ((stage.distance ?? distance) - distance) * stage.blend;
    angle += ((((stage.targetPitch ?? pitch) * Math.PI) / 180) - angle) * stage.blend;
  }
  camera.position.set(tmpAt.x, tmpAt.y - Math.cos(angle) * distance, tmpAt.z + Math.sin(angle) * distance);
  camera.up.set(0, Math.sin(angle), Math.cos(angle));
  camera.lookAt(tmpAt);
  camera.updateMatrixWorld();
}

/** 繪製前算好每個單位離鏡頭多遠，給 transparentSort 用。 */
export function updateSortKeys(camera) {
  camera.getWorldDirection(forward);
  for (const record of units) {
    const parent = record.object.parent;
    tmp.set(record.centerX, record.baseY, 0);
    if (parent) tmp.applyMatrix4(parent.matrixWorld);
    record.depth = tmp.sub(camera.position).dot(forward);
  }
}

/** 取代 three.js 預設的透明物件排序：地景先畫；立起來的單位由遠到近；同一單位裡照原本的層次。 */
export function stagedSort(a, b) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  const ua = a.object.userData.unit, ub = b.object.userData.unit;
  if (ua && ub) {
    if (ua !== ub && ua.depth !== ub.depth) return ub.depth - ua.depth;
    const la = a.object.userData.layer, lb = b.object.userData.layer;
    if (la !== lb) return la - lb;
  }
  if (a.z !== b.z) return b.z - a.z;
  return a.id - b.id;
}
