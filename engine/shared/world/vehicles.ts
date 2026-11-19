// 載具與飛行物的繪圖元件：戰機、飛彈、無人機。全部用封面像素座標下筆。
// 火箭、客機、遊艇、油輪、戰車、Cybertruck、衛星都是照封面描的固定圖形，留在各自的章節檔裡（見 README）。
import { fillPoly, strokePolyline, tracePoly } from "./shapes";
import { BLACK, RED, WHITE } from "./space";

/**
 * 戰機：紅色機體，底下一層往下偏的黑影，座艙與機背有黑線。機頭朝右。
 * @param {number} cx 機身中心 x
 * @param {number} cy 機身中心 y
 * @param {number} length 機身長
 * @param {number} [pitch] 俯仰（canvas 弧度）；負值是機頭往上
 */
export function drawJet(ctx, cx, cy, length, pitch = -0.128) {
  const shapes = (dx, dy) => {
    const at = ([u, v]) => {
      const x = (u + dx) * length, y = (v + dy) * length;
      return [cx + x * Math.cos(pitch) - y * Math.sin(pitch), cy + x * Math.sin(pitch) + y * Math.cos(pitch)];
    };
    for (const shape of [
      [[0.5, 0], [0.3, -0.032], [-0.45, -0.036], [-0.5, 0], [-0.45, 0.04], [0.3, 0.032]], // 機身
      [[0.14, -0.03], [-0.05, -0.25], [-0.15, -0.24], [-0.2, -0.03]], // 上翼
      [[0.1, 0.03], [-0.2, 0.36], [-0.3, 0.34], [-0.18, 0.03]], // 下翼
      [[-0.25, -0.03], [-0.36, -0.17], [-0.43, -0.15], [-0.4, -0.03]], // 尾翼
      [[-0.3, 0.03], [-0.46, 0.2], [-0.52, 0.17], [-0.44, 0.03]],
    ]) {
      tracePoly(ctx, shape.map(at));
      ctx.fill();
    }
    return at;
  };
  // 先畫一層往下偏的黑影，再畫紅色機體
  ctx.fillStyle = BLACK;
  shapes(-0.012, 0.03);
  ctx.fillStyle = RED;
  const at = shapes(0, 0);
  // 座艙與機背的黑線
  fillPoly(ctx, [[0.32, -0.03], [0.2, -0.052], [0.08, -0.034]].map(at), BLACK);
  strokePolyline(ctx, [at([-0.3, 0.004]), at([0.18, 0])], BLACK, Math.max(0.5, length * 0.014));
}

/**
 * 飛彈：白色彈體、紅色彈頭與尾翼。在「彈頭尖端為原點、+x 朝前」的座標裡畫。
 * @param {number} noseX 彈頭尖端 x
 * @param {number} noseY 彈頭尖端 y
 * @param {number} size 縮放；1 時全長約 60 像素
 * @param {number} angle 飛行方向（canvas 弧度）
 */
export function drawMissile(ctx, noseX, noseY, size, angle) {
  ctx.save();
  ctx.translate(noseX, noseY);
  ctx.rotate(angle);
  ctx.scale(size, size);
  // 尾端的細桿
  ctx.fillStyle = RED;
  ctx.fillRect(-60, -0.6, 12, 1.2);
  // 尾翼：往後掠的兩片
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(-37, side * 3);
    ctx.quadraticCurveTo(-46, side * 5, -53, side * 12);
    ctx.lineTo(-56, side * 11);
    ctx.quadraticCurveTo(-54, side * 5, -51, 0);
    ctx.closePath();
    ctx.fill();
  }
  // 白色彈體
  ctx.fillStyle = WHITE;
  ctx.fillRect(-50, -3.6, 37, 7.2);
  // 彈頭
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(-14, -3.9);
  ctx.quadraticCurveTo(-5, -3.9, 0, 0);
  ctx.quadraticCurveTo(-5, 3.9, -14, 3.9);
  ctx.closePath();
  ctx.fill();
  // 彈體上的紅色細節：靠彈頭的兩道環、靠尾端的中線
  ctx.fillRect(-19, -3.6, 1.5, 7.2);
  ctx.fillRect(-22, -3.6, 1.5, 7.2);
  ctx.fillRect(-48, -0.7, 9, 1.4);
  ctx.fillRect(-37, -0.7, 5, 1.4);
  ctx.restore();
}

/**
 * 遠處的飛彈：尾端細、頭端粗的紅色水滴。
 * @param {[number, number, number, number]} streak [尾 x, 尾 y, 頭 x, 頭 y]
 */
export function drawStreak(ctx, [tailX, tailY, headX, headY]: number[]) {
  const length = Math.hypot(headX - tailX, headY - tailY);
  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(Math.atan2(headY - tailY, headX - tailX));
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(-length, -0.35);
  ctx.lineTo(-3, -2.3);
  ctx.quadraticCurveTo(1.5, -2.3, 1.5, 0);
  ctx.quadraticCurveTo(1.5, 2.3, -3, 2.3);
  ctx.lineTo(-length, 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * 無人機的機身：橫臂、兩端的馬達、中間水滴形的機腹。紅色。旋翼另外用 drawDroneRotors 畫，才能各自閃動。
 * @param {number} cx 中心 x
 * @param {number} cy 橫臂的 y
 * @param {number} s 縮放；1 時橫臂寬 40 像素
 */
export function drawDroneBody(ctx, cx, cy, s) {
  ctx.fillStyle = RED;
  ctx.fillRect(cx - 20 * s, cy - 2.2 * s, 40 * s, 2.6 * s); // 橫臂
  for (const side of [1, -1]) {
    ctx.beginPath();
    ctx.roundRect(cx + side * 20 * s - 1.6 * s, cy - 6 * s, 3.2 * s, 9 * s, 1.4 * s); // 馬達
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 10 * s, cy - 1.5 * s);
  ctx.quadraticCurveTo(cx, cy - 7 * s, cx + 10 * s, cy - 1.5 * s);
  ctx.lineTo(cx + 4 * s, cy + 3 * s);
  ctx.quadraticCurveTo(cx + 2.5 * s, cy + 8 * s, cx, cy + 8 * s);
  ctx.quadraticCurveTo(cx - 2.5 * s, cy + 8 * s, cx - 4 * s, cy + 3 * s);
  ctx.closePath();
  ctx.fill();
}

/** 無人機的兩片旋翼（橫臂兩端上方各一道紅線）。參數同 drawDroneBody。 */
export function drawDroneRotors(ctx, cx, cy, s) {
  ctx.fillStyle = RED;
  for (const side of [1, -1]) ctx.fillRect(cx + side * 20 * s - 11 * s, cy - 7.4 * s, 22 * s, 1);
}
