// 自然景物的繪圖元件：水紋、棕櫚、草叢。全部用封面像素座標下筆。
// 松樹（drawPine）和四芒星（drawSparkle）在 props.js。
import { BLACK } from "./space";

/**
 * 一條波浪形的水紋：兩端收尖、中段飽滿，上下緣用不同頻率的正弦起伏。
 * @param {number} x0 左端 x
 * @param {number} x1 右端 x
 * @param {number} y 中線 y
 * @param {number} thick 中段的厚度
 * @param {number} [seed] 起伏的相位，每條給不同的值才不會一模一樣
 * @param {string|null} [color] 填色；不給就沿用呼叫端已設定的 fillStyle
 */
export function drawWaveBand(ctx, x0, x1, y, thick, seed = 0, color = null) {
  const n = Math.max(8, Math.round((x1 - x0) / 1.2));
  const half = (t) => (thick / 2) * Math.pow(Math.sin(Math.PI * t), 0.35);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t;
    const yy = y - half(t) + Math.sin(x * 0.42 + seed) * 0.7;
    if (i === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n, x = x0 + (x1 - x0) * t;
    ctx.lineTo(x, y + half(t) + Math.sin(x * 0.33 + seed + 2) * 0.7);
  }
  ctx.closePath();
  if (color) ctx.fillStyle = color;
  ctx.fill();
}

/**
 * 棕櫚樹：略彎的樹幹、從樹冠中心拱出去再垂下來的八片葉子。黑色。
 * @param {number} x 樹幹的 x
 * @param {number} crownY 樹冠中心的 y
 * @param {number} reach 葉長
 * @param {number} groundY 樹腳站的地面 y
 */
export function drawPalm(ctx, x, crownY, reach, groundY) {
  ctx.fillStyle = BLACK;
  // 樹幹：略彎，下粗上細
  ctx.beginPath();
  ctx.moveTo(x - 0.9, crownY);
  ctx.quadraticCurveTo(x - 1.6, (crownY + groundY) / 2, x - 1.5, groundY + 0.5);
  ctx.lineTo(x + 1.5, groundY + 0.5);
  ctx.quadraticCurveTo(x + 0.6, (crownY + groundY) / 2, x + 0.9, crownY);
  ctx.closePath();
  ctx.fill();
  // 葉：八片，從樹冠中心拱出去再垂下來；[末端 x, 末端 y]（以葉長為單位）
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  for (const [ex, ey] of [[-1, 0.8], [-1, 0.15], [-0.78, -0.42], [-0.3, -0.8], [0.3, -0.8], [0.78, -0.42], [1, 0.15], [1, 0.8]]) {
    const tipX = x + ex * reach, tipY = crownY + ey * reach;
    const midX = x + ex * reach * 0.62, midY = crownY + Math.min(ey, 0) * reach - reach * (ey > 0 ? 0.42 : 0.12);
    // 靠樹冠的一半粗、末梢細
    ctx.lineWidth = reach * 0.19;
    ctx.beginPath();
    ctx.moveTo(x, crownY);
    ctx.quadraticCurveTo((x + midX) / 2, (crownY + midY) / 2 - reach * 0.1, midX, midY);
    ctx.stroke();
    ctx.lineWidth = reach * 0.11;
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    ctx.quadraticCurveTo(tipX, midY + (tipY - midY) * 0.3, tipX, tipY);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, crownY, reach * 0.16, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 草叢（圓頂款）：平底、中間隆起、七片往外張的彎葉。封面圓的下緣到處都是這種填底的草（排隊、難民營那兩章）。
 * @param {number} cx 中線 x
 * @param {number} baseY 底邊 y
 * @param {number} w 寬
 * @param {number} h 高
 */
export function drawTuft(ctx, cx, baseY, w, h) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, baseY - h * 0.24, w, h * 0.24, h * 0.1);
  ctx.fill();
  const rootY = baseY - h * 0.16;
  ctx.beginPath();
  ctx.ellipse(cx, rootY, w * 0.37, h * 0.42, 0, Math.PI, 0);
  ctx.fill();
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = Math.PI * (0.1 + (0.8 * i) / (blades - 1));
    const reach = i % 2 ? 0.86 : 1;
    const tipX = cx + Math.cos(a) * w * 0.47 * reach, tipY = rootY - Math.sin(a) * h * 0.8 * reach;
    const rootX = cx + Math.cos(a) * w * 0.2;
    const nx = Math.sin(a) * w * 0.11, ny = Math.cos(a) * h * 0.13;
    ctx.beginPath();
    ctx.moveTo(rootX - nx, rootY + ny);
    ctx.quadraticCurveTo(tipX - nx * 0.5, tipY + ny * 0.5 + h * 0.1, tipX, tipY);
    ctx.quadraticCurveTo(tipX + nx * 0.5, tipY - ny * 0.5 + h * 0.1, rootX + nx, rootY - ny);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * 草叢（尖葉款）：一道薄薄的平底，上面九片直邊的尖葉，中間直立、兩邊外倒。農地那一章用的畫法。
 * 和 drawTuft 是兩種不同的外形，不要互換。
 * @param {number} cx 中線 x
 * @param {number} baseY 底邊 y
 * @param {number} width 寬
 * @param {number} height 高
 */
export function drawSpikyTuft(ctx, cx, baseY, width, height) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.roundRect(cx - width / 2, baseY - 2.6, width, 2.6, 1.3);
  ctx.fill();
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    const lean = ((i - (blades - 1) / 2) / ((blades - 1) / 2)) * 1.2; // 弧度，中間直立、兩邊外倒
    const reach = height * (0.62 + 0.38 * Math.cos(lean)) * (i % 2 ? 0.86 : 1);
    const rootX = cx + Math.sin(lean) * width * 0.2;
    const half = width * 0.075 + 0.6;
    ctx.beginPath();
    ctx.moveTo(rootX - half, baseY - 1.5);
    ctx.lineTo(rootX + Math.sin(lean) * reach, baseY - 1.5 - Math.cos(lean) * reach);
    ctx.lineTo(rootX + half, baseY - 1.5);
    ctx.closePath();
    ctx.fill();
  }
}
