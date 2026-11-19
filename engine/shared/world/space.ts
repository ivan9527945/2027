// 封面座標系：所有章節都用封面原圖的像素座標（1110×1475）畫圖和擺位置，
// 這樣終章只要把各章的元素放進同一個場景，就會回到封面上的位置。
// 世界座標：1 單位 = 封面 100 像素，原點在圓心，y 向上。圓的半徑是 4.7。
import positions from "../../data/positions.json";
import { canvasTexture, spritePlane } from "../../core";

export const RED = "#d2322b";
export const DARK_RED = "#8f1f1c";
export const BLACK = "#050505";
export const WHITE = "#f6f4ee";

export const CIRCLE = positions.circle; // { cx, cy, r }，封面像素
const UNIT = 100;

/** 封面像素 → 世界座標 [x, y] */
export const toWorld = (px, py): [number, number] => [(px - CIRCLE.cx) / UNIT, (CIRCLE.cy - py) / UNIT];
/** 封面上的長度（像素）→ 世界單位 */
export const toUnits = (pixels) => pixels / UNIT;

/** 元素在封面上的外框 [x0, y0, x1, y1]（像素） */
export function boxOf(id) {
  const box = positions.boxes[id];
  if (!box) throw new Error(`positions.json 沒有 #${id}`);
  return box;
}

/**
 * 用封面像素座標畫一張貼圖，並放在封面上對應的位置。
 * draw(ctx) 裡直接用封面的像素座標下筆，不用管貼圖的原點和解析度。
 * @param {[number, number, number, number]} box 這張圖涵蓋的封面範圍 [x0, y0, x1, y1]
 * @param {(ctx: CanvasRenderingContext2D) => void} draw
 * @param {{ z?: number, pad?: number, scale?: number }} [opts]
 *   z：深度（越大越靠近鏡頭，也決定繪製順序）；pad：外框四周多留的像素；scale：每個封面像素用幾個貼圖像素
 */
export function coverSprite(box, draw, { z = 0, pad = 2, scale = 10 } = {}) {
  const [x0, y0, x1, y1] = box;
  const width = x1 - x0 + pad * 2;
  const height = y1 - y0 + pad * 2;
  const texture = canvasTexture(Math.round(width * scale), Math.round(height * scale), (ctx) => {
    ctx.scale(scale, scale);
    ctx.translate(pad - x0, pad - y0);
    draw(ctx);
  });
  const [x, y] = toWorld((x0 + x1) / 2, (y0 + y1) / 2);
  return spritePlane(texture, { height: toUnits(height), x, y, z });
}

/** 鏡頭距離：要讓畫面高度剛好容納 visibleHeight（世界單位）時，鏡頭該離多遠。 */
export const distanceFor = (visibleHeight, fov) => visibleHeight / (2 * Math.tan((fov * Math.PI) / 360));

/**
 * 鏡頭關鍵格的簡寫：看著封面上的 (px, py)，畫面高度容納 heightPx 個封面像素。
 * 回傳 makeCameraTrack 用的 { t, pos, at, fov, roll }。
 */
export function shot(t, px, py, heightPx, { fov = 30, roll = 0, dx = 0, dy = 0, z = 0 } = {}) {
  // z：被拍的東西所在的深度。極近的特寫要給，否則鏡頭到物體的實際距離會比算出來的短，畫面被放大。
  const [x, y] = toWorld(px, py);
  const distance = distanceFor(toUnits(heightPx), fov);
  return { t, pos: [x + dx, y + dy, z + distance], at: [x, y, z], fov, roll };
}

/** 看得到整個圓（含頂端破出圓外的領袖）的鏡位：中心與畫面高度，封面像素。序章的水晶球和終章都用它。 */
export const FULL_VIEW = { px: CIRCLE.cx, py: CIRCLE.cy, heightPx: 1120 };

/** 第 1 章開場的鏡位（六位領袖的特寫）。序章結尾要推到球裡的同一個位置，兩章之間才能硬切。 */
export const LEADERS_VIEW = { px: 556, py: 424, heightPx: 160 };
