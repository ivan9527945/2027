// 道具與地景的繪圖元件。全部用封面像素座標下筆。
import { BLACK, DARK_RED, RED, WHITE } from "./space";

/**
 * 捲起的旗：頂端一顆球、紡錘形的布、露出一截旗桿。封面頂部的 7 支黑色尖形物就是這個。
 * @param {number} x 旗桿的 x
 * @param {number} topY 旗桿頂的 y
 * @param {number} baseY 旗桿底的 y
 */
export function drawFurledFlag(ctx, x, topY, baseY, color = BLACK) {
  const clothBottom = baseY - 9;
  const height = clothBottom - topY;
  ctx.fillStyle = color;
  ctx.fillRect(x - 0.7, topY, 1.4, baseY - topY);
  ctx.beginPath();
  ctx.arc(x, topY, 1.7, 0, Math.PI * 2);
  ctx.fill();
  // 布：上窄下寬，最寬處在 78% 高，底部收回旗桿
  ctx.beginPath();
  ctx.moveTo(x, topY + 2);
  ctx.bezierCurveTo(x + 2.5, topY + height * 0.3, x + 8.5, topY + height * 0.6, x + 8, topY + height * 0.8);
  ctx.bezierCurveTo(x + 7.5, topY + height * 0.95, x + 2, clothBottom, x, clothBottom + 1.5);
  ctx.bezierCurveTo(x - 2, clothBottom, x - 7.5, topY + height * 0.95, x - 8, topY + height * 0.8);
  ctx.bezierCurveTo(x - 8.5, topY + height * 0.6, x - 2.5, topY + height * 0.3, x, topY + 2);
  ctx.fill();
}

/** 展開但垂著的紅旗：比捲旗寬，有兩道布褶，沒有圖案。 */
export function drawHangingFlag(ctx, x, topY, baseY, color = RED, fold = "#8f1f1c") {
  const clothBottom = baseY - 8;
  const height = clothBottom - topY;
  ctx.fillStyle = BLACK;
  ctx.fillRect(x - 0.7, topY, 1.4, baseY - topY);
  ctx.beginPath();
  ctx.arc(x, topY, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, topY + 2);
  ctx.bezierCurveTo(x + 4, topY + height * 0.25, x + 10.5, topY + height * 0.55, x + 9.5, topY + height * 0.82);
  ctx.lineTo(x + 5, topY + height * 0.92);
  ctx.lineTo(x + 1.5, clothBottom + 3);
  ctx.lineTo(x - 3, topY + height * 0.9);
  ctx.lineTo(x - 9, topY + height * 0.8);
  ctx.bezierCurveTo(x - 10, topY + height * 0.55, x - 4, topY + height * 0.25, x, topY + 2);
  ctx.fill();
  ctx.strokeStyle = fold;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 1, topY + height * 0.2);
  ctx.lineTo(x - 4, topY + height * 0.85);
  ctx.moveTo(x + 1.5, topY + height * 0.3);
  ctx.lineTo(x + 4.5, topY + height * 0.86);
  ctx.stroke();
}

/**
 * 通訊塔的格架：四根斜柱、橫樑、交叉斜撐，頂端有平台和天線。只下筆、不上色（呼叫端決定線色）。
 * apex：塔頂 [x, y]；baseY：塔腳的 y；halfBase：塔腳半寬。
 */
export function traceLatticeTower(ctx, [ax, ay]: number[], baseY, halfBase) {
  const height = baseY - ay;
  const half = (y) => 2.2 + ((y - ay) / height) * (halfBase - 2.2);
  ctx.beginPath();
  // 天線與平台
  ctx.moveTo(ax, ay - 9);
  ctx.lineTo(ax, ay + 6);
  ctx.moveTo(ax - 5, ay + 3);
  ctx.lineTo(ax + 5, ay + 3);
  ctx.moveTo(ax - 4, ay + 7);
  ctx.lineTo(ax + 4, ay + 7);
  // 兩根外柱
  ctx.moveTo(ax - half(ay + 3), ay + 3);
  ctx.lineTo(ax - halfBase, baseY);
  ctx.moveTo(ax + half(ay + 3), ay + 3);
  ctx.lineTo(ax + halfBase, baseY);
  // 橫樑與交叉斜撐：越往下每層越高
  const levels = [ay + 7, ay + 17, ay + 29, ay + 44, ay + 62, baseY];
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = levels[i], y1 = levels[i + 1];
    ctx.moveTo(ax - half(y1), y1);
    ctx.lineTo(ax + half(y1), y1);
    ctx.moveTo(ax - half(y0), y0);
    ctx.lineTo(ax + half(y1), y1);
    ctx.moveTo(ax + half(y0), y0);
    ctx.lineTo(ax - half(y1), y1);
  }
}

/** 電波：以 [cx, cy] 為中心、左右各 count 道弧線。 */
export function drawRadioWaves(ctx, [cx, cy], count = 3, color = WHITE) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const r = 10 + i * 8;
    const spread = 0.62 - i * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -spread, spread);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI - spread, Math.PI + spread);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

/** 松樹：一根樹幹加幾層向下張開的鋸齒枝葉。baseY 是樹腳，height 是樹高。 */
export function drawPine(ctx, x, baseY, height, color = BLACK) {
  const tiers = Math.max(3, Math.round(height / 7));
  const width = height * 0.52;
  ctx.fillStyle = color;
  ctx.fillRect(x - 0.9, baseY - height * 0.2, 1.8, height * 0.2);
  for (let i = 0; i < tiers; i++) {
    const t0 = i / tiers, t1 = (i + 1.35) / tiers;
    const top = baseY - height + t0 * height * 0.82;
    const bottom = Math.min(baseY - height * 0.1, baseY - height + t1 * height * 0.82);
    const half = (width / 2) * (0.3 + 0.7 * ((i + 1) / tiers));
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bottom);
    ctx.lineTo(x + half * 0.55, bottom - 1.2);
    ctx.lineTo(x + half * 0.3, bottom + 0.8);
    ctx.lineTo(x, bottom - 0.6);
    ctx.lineTo(x - half * 0.3, bottom + 0.8);
    ctx.lineTo(x - half * 0.55, bottom - 1.2);
    ctx.lineTo(x - half, bottom);
    ctx.closePath();
    ctx.fill();
  }
}

/** 四芒星（封面上夜空的星、水晶球裡的星芒）。r 是尖端到中心的距離。 */
export function drawSparkle(ctx, x, y, r, color = WHITE) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** 把一串點連成圓滑的封閉輪廓（相鄰兩點的中點當端點、原本的點當控制點）。只下筆、不上色。 */
export function traceBlob(ctx, points) {
  const n = points.length;
  const mid = (i) => [(points[i % n][0] + points[(i + 1) % n][0]) / 2, (points[i % n][1] + points[(i + 1) % n][1]) / 2];
  ctx.beginPath();
  ctx.moveTo(...mid(0));
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(points[i % n][0], points[i % n][1], ...mid(i));
  ctx.closePath();
}

/**
 * 鐵鏈：五節鏈環（正面的橢圓和側面的粗線交錯），末端一個鉤。白色。
 * @param {[[number, number], [number, number]]} chain [上端, 下端]，封面像素
 */
export function drawChain(ctx, [from, to]: number[][]) {
  const links = 5;
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx), step = length / links;
  ctx.save();
  ctx.translate(from[0], from[1]);
  ctx.rotate(angle);
  ctx.strokeStyle = WHITE;
  ctx.lineCap = "round";
  for (let i = 0; i < links; i++) {
    const center = step * (i + 0.5);
    if (i % 2 === 0) {
      // 正面的鏈環
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.ellipse(center, 0, step * 0.62, 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // 側面的鏈環：一道粗線
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(center - step * 0.5, 0);
      ctx.lineTo(center + step * 0.5, 0);
      ctx.stroke();
    }
  }
  // 末端的鉤
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(length + 1.4, 1.6, 2.2, -Math.PI * 0.9, Math.PI * 0.35);
  ctx.stroke();
  ctx.restore();
}

/**
 * 包袱：圓鼓鼓的黑色袋身、頂上的束口、幾道暗紅的布褶。
 * @param {number} cx 袋身中心 x
 * @param {number} cy 袋身中心 y
 * @param {number} rx 袋身的橫向半徑
 * @param {number} ry 袋身的縱向半徑
 * @param {number} knotX 束口的 x
 * @param {number} knotTop 束口頂端的 y
 * @param {[number, number, number, number][]} creases 布褶，每道 [x0, y0, x1, y1]
 */
export function drawBundle(ctx, cx, cy, rx, ry, knotX, knotTop, creases) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(knotX - 4.6, knotTop + 1);
  ctx.quadraticCurveTo(knotX, knotTop - 1.2, knotX + 4.8, knotTop + 1);
  ctx.lineTo(knotX + 3.4, knotTop + 5);
  ctx.lineTo(knotX + 6, cy - ry * 0.55);
  ctx.lineTo(knotX - 6, cy - ry * 0.55);
  ctx.lineTo(knotX - 3.2, knotTop + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of creases) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

/**
 * 一疊籌碼：黑色圓柱，側面每一枚有三格紅色，頂面是紅色的齒輪狀花紋。
 * @param {number} cx 中線 x
 * @param {number} topY 頂面中心的 y
 * @param {number} count 幾枚
 * @param {{ rx?: number, ry?: number, chipHeight?: number }} [size] 頂面橢圓的兩個半徑、每一枚的厚度
 */
export function drawChipStack(ctx, cx, topY, count, { rx = 14, ry = 5, chipHeight = 5.4 } = {}) {
  const bottomY = topY + count * chipHeight;
  ctx.fillStyle = BLACK;
  ctx.fillRect(cx - rx, topY, rx * 2, bottomY - topY);
  ctx.beginPath();
  ctx.ellipse(cx, bottomY, rx, ry, 0, 0, Math.PI * 2);
  ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RED;
  for (let i = 0; i < count; i++) {
    for (const dx of [-9.6, 0, 9.6]) {
      const sag = ry * Math.sqrt(1 - (dx / rx) ** 2); // 跟著圓柱的弧度往下彎
      ctx.beginPath();
      ctx.roundRect(cx + dx - 2.2, topY + i * chipHeight + sag + 1.5, 4.4, 2.5, 1);
      ctx.fill();
    }
  }
  // 頂面
  ctx.beginPath();
  ctx.ellipse(cx, topY, rx - 2, ry - 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(cx, topY, 6, 2.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const angle = (k / 6) * Math.PI * 2 + 0.5;
    ctx.moveTo(cx + Math.cos(angle) * 8.4, topY + Math.sin(angle) * 2.9);
    ctx.lineTo(cx + Math.cos(angle) * 13, topY + Math.sin(angle) * 4.5);
  }
  ctx.stroke();
}

/**
 * 晶片：紅色圓角方塊，四邊各五支針腳，中間一個白色方框。
 * @param {number} cx 中心 x
 * @param {number} cy 中心 y
 * @param {number} size 本體的邊長（不含針腳）
 */
export function drawMicrochip(ctx, cx, cy, size) {
  const half = size / 2, pin = size * 0.16;
  ctx.fillStyle = RED;
  // 四邊的針腳
  const pins = 5;
  for (let i = 0; i < pins; i++) {
    const offset = -half + (size * (i + 0.5)) / pins - pin * 0.3;
    ctx.fillRect(cx + offset, cy - half - pin, pin * 0.6, size + pin * 2);
    ctx.fillRect(cx - half - pin, cy + offset, size + pin * 2, pin * 0.6);
  }
  ctx.beginPath();
  ctx.roundRect(cx - half, cy - half, size, size, size * 0.12);
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = size * 0.07;
  ctx.strokeRect(cx - half * 0.55, cy - half * 0.55, size * 0.55, size * 0.55);
}

/**
 * 膠卷盤：紅色圓盤、暗紅的邊線、六個黑孔和中心的軸孔。
 * @param {number} cx 中心 x
 * @param {number} cy 中心 y
 * @param {number} [r] 半徑；孔的位置和大小是照 r = 15 畫的，不會跟著縮放
 */
export function drawFilmReel(ctx, cx, cy, r = 15) {
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = BLACK;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 8.6, cy + Math.sin(a) * 8.6, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 2.3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 藥瓶：窄瓶頸、瓶口有一圈凸緣、圓肩的瓶身。
 * @param {number} cx 中線 x
 * @param {number} top 瓶口 y
 * @param {number} bottom 瓶底 y
 * @param {number} width 瓶身寬
 * @param {string} [color]
 */
export function drawBottle(ctx, cx, top, bottom, width, color = RED) {
  const h = bottom - top, neck = width * 0.42;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - neck - 0.5, top);
  ctx.lineTo(cx + neck + 0.5, top);
  ctx.lineTo(cx + neck + 0.5, top + 1.6);
  ctx.lineTo(cx + neck, top + 1.6);
  ctx.lineTo(cx + neck, top + h * 0.3);
  ctx.quadraticCurveTo(cx + width / 2, top + h * 0.42, cx + width / 2, top + h * 0.58);
  ctx.lineTo(cx + width / 2, bottom);
  ctx.lineTo(cx - width / 2, bottom);
  ctx.lineTo(cx - width / 2, top + h * 0.58);
  ctx.quadraticCurveTo(cx - width / 2, top + h * 0.42, cx - neck, top + h * 0.3);
  ctx.lineTo(cx - neck, top + 1.6);
  ctx.lineTo(cx - neck - 0.5, top + 1.6);
  ctx.closePath();
  ctx.fill();
}

/**
 * 錐形瓶：細頸、往下張開的錐形瓶身、圓角的瓶底。紅色。
 * @param {number} cx 中線 x
 * @param {number} top 瓶口 y
 * @param {number} bottom 瓶底 y
 * @param {number} width 瓶底寬
 */
export function drawFlask(ctx, cx, top, bottom, width) {
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(cx - 1.3, top);
  ctx.lineTo(cx + 1.3, top);
  ctx.lineTo(cx + 1.3, top + (bottom - top) * 0.38);
  ctx.lineTo(cx + width / 2, bottom - 1.5);
  ctx.quadraticCurveTo(cx + width / 2, bottom, cx + width / 2 - 1.5, bottom);
  ctx.lineTo(cx - width / 2 + 1.5, bottom);
  ctx.quadraticCurveTo(cx - width / 2, bottom, cx - width / 2, bottom - 1.5);
  ctx.lineTo(cx - 1.3, top + (bottom - top) * 0.38);
  ctx.closePath();
  ctx.fill();
}

/**
 * 膠囊：兩端半圓的長條，前後兩半各一色。
 * @param {object} capsule
 * @param {[number, number]} capsule.from 軸線起點（半圓的圓心）
 * @param {[number, number]} capsule.to 軸線終點
 * @param {number} capsule.r 半徑
 * @param {[string, string]} capsule.colors [起點那一半的顏色, 終點那一半的顏色]
 * @param {boolean} [capsule.glint] 終點那一半上要不要畫一道紅色反光
 */
export function drawCapsule(ctx, { from, to, r, colors, glint }) {
  const cx = (from[0] + to[0]) / 2, cy = (from[1] + to[1]) / 2;
  const half = Math.hypot(to[0] - from[0], to[1] - from[1]) / 2 + r;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(to[1] - from[1], to[0] - from[0]));
  ctx.beginPath();
  ctx.roundRect(-half, -r, half * 2, r * 2, r);
  ctx.clip();
  ctx.fillStyle = colors[0];
  ctx.fillRect(-half, -r, half, r * 2);
  ctx.fillStyle = colors[1];
  ctx.fillRect(0, -r, half, r * 2);
  if (glint) {
    // 黑色那一半上的紅色反光
    ctx.strokeStyle = RED;
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(half * 0.3, -r * 0.5);
    ctx.lineTo(half * 0.62, -r * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 藥錠：紅色橢圓、底下一圈黑色的厚度、中間一道暗紅刻痕。
 * @param {[number, number, number, number, number]} tablet [中心 x, 中心 y, 長半徑, 短半徑, 傾角（弧度）]
 */
export function drawTablet(ctx, [cx, cy, rx, ry, tilt]: number[]) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.fillStyle = BLACK; // 側面的厚度
  ctx.beginPath();
  ctx.ellipse(0.6, 2.6, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = DARK_RED; // 中間的刻痕
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-rx * 0.55, ry * 0.25);
  ctx.lineTo(rx * 0.55, -ry * 0.25);
  ctx.stroke();
  ctx.restore();
}
