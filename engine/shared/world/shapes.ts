// 路徑的基本工具：多邊形、折線、外框。全部用封面像素座標。
// 各章原本各自寫了一份（poly／polygon／tracePoly／fillPoly／line／strokeLine／boundsOf），統一放在這裡。

/**
 * 把一串點連成多邊形的路徑。只下筆、不上色（呼叫端自己 fill 或 stroke）。
 * @param {[number, number][]} points 頂點，封面像素
 * @param {boolean} [close] 是否封閉；畫折線時傳 false
 */
export function tracePoly(ctx, points, close = true) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  if (close) ctx.closePath();
}

/** 填滿一個多邊形。points：頂點（封面像素）；color：填色。 */
export function fillPoly(ctx, points, color) {
  ctx.fillStyle = color;
  tracePoly(ctx, points);
  ctx.fill();
}

/** 畫一條圓頭、圓角的折線。points：頂點（封面像素）；width：線寬（封面像素）。 */
export function strokePolyline(ctx, points, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
}

/** 一串點的外框 [x0, y0, x1, y1]，四周各多留 margin 像素；給 coverSprite 當範圍用。 */
export const boundsOf = (points, margin = 2) => [
  Math.min(...points.map((p) => p[0])) - margin, Math.min(...points.map((p) => p[1])) - margin,
  Math.max(...points.map((p) => p[0])) + margin, Math.max(...points.map((p) => p[1])) + margin,
];
