// 把場景物件投影成螢幕上的外框，給標註層（游標移到元素上顯示解讀）使用。
import { Box3, Vector3 } from "three";

const box = new Box3();
const corner = new Vector3();

/**
 * @param {import("three").Object3D} object
 * @param {import("three").Camera} camera
 * @param {number} width  視窗寬（CSS 像素）
 * @param {number} height 視窗高（CSS 像素）
 * @returns {{x0:number,y0:number,x1:number,y1:number}|null} 物件不可見、在鏡頭後方或完全在畫面外時回傳 null
 */
export function projectElement(object, camera, width, height) {
  if (!isShown(object)) return null;
  box.setFromObject(object);
  if (box.isEmpty()) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, inFront = false;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    if (corner.z > 1) continue; // 在鏡頭後方
    inFront = true;
    const x = (corner.x * 0.5 + 0.5) * width;
    const y = (1 - (corner.y * 0.5 + 0.5)) * height;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (!inFront || x1 < 0 || y1 < 0 || x0 > width || y0 > height) return null;
  return { x0, y0, x1, y1 };
}

function isShown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}
