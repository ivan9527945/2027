// 符號的繪圖元件：五角星、雙頭鷹。全部用封面像素座標下筆。
// TRUMP 字樣、π Σ ν、€、¥、新月都是照封面描的固定圖形，留在各自的章節檔裡（見 README）。
import { BLACK } from "./space";

/**
 * 五角星。顏色沿用呼叫端已設定的 fillStyle。
 * @param {number} cx 中心 x
 * @param {number} cy 中心 y
 * @param {number} outer 尖端到中心的距離
 * @param {object} [opts]
 * @param {number} [opts.inner] 凹處到中心的距離（預設是 outer 的 0.4 倍）
 * @param {number} [opts.rotation] 旋轉（弧度）；0 是一個尖朝正上方
 */
export function drawStar(ctx, cx, cy, outer, { inner = outer * 0.4, rotation = 0 } = {}) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? inner : outer;
    const angle = rotation - Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * 雙頭鷹：兩個朝外的頭、張開成鋸齒的雙翼、扇形尾，左右對稱。黑色。
 * @param {number} cx 中線 x
 * @param {number} cy 身體中心 y
 * @param {number} s 縮放；1 時全寬約 14 像素、全高約 15 像素
 */
export function drawDoubleEagle(ctx, cx, cy, s) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 0.6 * s, 1.7 * s, 3.8 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const side of [-1, 1]) {
    const X = (dx) => cx + side * dx * s, Y = (dy) => cy + dy * s;
    // 頸與頭、喙
    ctx.beginPath();
    ctx.moveTo(X(0), Y(-2));
    ctx.lineTo(X(0.5), Y(-5.4));
    ctx.quadraticCurveTo(X(1.2), Y(-7.2), X(2.6), Y(-6.6));
    ctx.lineTo(X(4.3), Y(-5.6));
    ctx.lineTo(X(2.7), Y(-5));
    ctx.quadraticCurveTo(X(2.2), Y(-3.4), X(1.6), Y(-1.6));
    ctx.closePath();
    ctx.fill();
    // 翼：三段羽毛
    ctx.beginPath();
    ctx.moveTo(X(0.8), Y(-2.6));
    ctx.lineTo(X(4.6), Y(-3.6));
    ctx.lineTo(X(7), Y(-5.6));
    ctx.lineTo(X(6.6), Y(-2.2));
    ctx.lineTo(X(5.2), Y(-1.9));
    ctx.lineTo(X(6.2), Y(0.6));
    ctx.lineTo(X(4.4), Y(0.3));
    ctx.lineTo(X(4.9), Y(2.8));
    ctx.lineTo(X(1), Y(1.6));
    ctx.closePath();
    ctx.fill();
    // 爪與尾
    ctx.beginPath();
    ctx.moveTo(X(0.6), Y(2.6));
    ctx.lineTo(X(3.4), Y(5.2));
    ctx.lineTo(X(1.7), Y(4.9));
    ctx.lineTo(X(2.3), Y(7.4));
    ctx.lineTo(X(0), Y(6.2));
    ctx.lineTo(X(0), Y(2.6));
    ctx.closePath();
    ctx.fill();
  }
}
