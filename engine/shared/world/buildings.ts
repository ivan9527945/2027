// 建築與構造物的繪圖元件：帳篷、煙囪、風機。全部用封面像素座標下筆。
// 神殿、TRUMP 大樓、克宮塔、奧斯曼樓、五重塔、印度門、廢墟都是照封面描的固定圖形，留在各自的章節檔裡（見 README）。
import { BLACK, DARK_RED, RED } from "./space";

/**
 * 三角帳篷：紅色外帳（三個角磨圓）、入口左側一道暗紅門簾、黑色入口。
 * @param {[number, number, number, number, number, number, number]} tent
 *   [頂點 x, 頂點 y, 底邊 y, 底邊左端 x, 底邊右端 x, 入口左緣 x, 入口右緣 x]
 */
export function drawTent(ctx, [ax, ay, baseY, x0, x1, doorX0, doorX1]: number[]) {
  // 紅色外帳：用同色的圓角描邊把三個角磨圓
  ctx.fillStyle = RED;
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ax, ay + 1.6);
  ctx.lineTo(x1 - 1.6, baseY - 1.2);
  ctx.lineTo(x0 + 1.6, baseY - 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 入口左側一道暗紅的門簾
  ctx.fillStyle = DARK_RED;
  ctx.beginPath();
  ctx.moveTo(ax - 0.6, ay + 5);
  ctx.lineTo(doorX0 + 2, baseY);
  ctx.lineTo(doorX0 - 5.5, baseY);
  ctx.closePath();
  ctx.fill();
  // 黑色入口
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(ax - 0.4, ay + 6);
  ctx.quadraticCurveTo(ax, ay + 4.6, ax + 0.6, ay + 6);
  ctx.lineTo(doorX1, baseY);
  ctx.lineTo(doorX0, baseY);
  ctx.closePath();
  ctx.fill();
}

/**
 * 一組工廠煙囪加上橫管。黑色。
 * @param {[number, number, number, number, number][]} cluster 每根煙囪 [中線 x, 頂 y, 底 y, 頂寬, 底寬]；頂端是圓的
 * @param {[number, number, number, number][]} pipes 每條橫管 [x, y, 寬, 高]
 */
export function drawChimneys(ctx, cluster, pipes) {
  ctx.fillStyle = BLACK;
  for (const [x, top, base, wTop, wBase] of cluster) {
    ctx.beginPath();
    ctx.moveTo(x - wBase / 2, base);
    ctx.lineTo(x - wTop / 2, top + wTop / 2);
    ctx.quadraticCurveTo(x, top - wTop / 3, x + wTop / 2, top + wTop / 2);
    ctx.lineTo(x + wBase / 2, base);
    ctx.closePath();
    ctx.fill();
  }
  for (const [x, y, w, h] of pipes) ctx.fillRect(x, y, w, h);
}

/**
 * 風機的三片葉片和輪轂。黑色。畫在以輪轂為中心的方形貼圖上，轉動時繞著輪轂。
 * @param {[number, number, number, number, number]} turbine [輪轂 x, 輪轂 y, 塔底 y（這裡用不到）, 葉片長, 第一片的角度（canvas 弧度）]
 */
export function drawTurbineRotor(ctx, [hx, hy, , length, angle]: number[]) {
  ctx.fillStyle = BLACK;
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle + (i * Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.moveTo(0, -0.9);
    ctx.quadraticCurveTo(length * 0.2, -2.6, length * 0.42, -1.9);
    ctx.lineTo(length, -0.25);
    ctx.lineTo(length, 0.35);
    ctx.lineTo(length * 0.3, 1.1);
    ctx.lineTo(0, 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(hx, hy, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 風機的塔柱：上窄下寬的黑色細梯形。
 * @param {[number, number, number]} turbine [輪轂 x, 輪轂 y, 塔底 y]
 */
export function drawTurbineTower(ctx, [hx, hy, baseY]: number[]) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(hx - 0.8, hy);
  ctx.lineTo(hx + 0.8, hy);
  ctx.lineTo(hx + 1.9, baseY);
  ctx.lineTo(hx - 1.9, baseY);
  ctx.closePath();
  ctx.fill();
}
