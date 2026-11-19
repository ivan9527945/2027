// 人形的繪圖元件。全部用封面像素座標下筆，風格照封面：色塊、沒有漸層，只用紅、黑、白。
import { BLACK, DARK_RED, RED, WHITE } from "./space";

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function ellipse(ctx, cx, cy, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/**
 * 正面站立的人形（封面高台上那一排的畫法）。
 * @param {object} p
 * @param {number} p.cx 身體中線的 x
 * @param {number} p.shoulderY 肩線的 y
 * @param {number} p.halfWidth 肩寬的一半
 * @param {number} [p.feetY] 腳底的 y
 * @param {number} [p.hipY] 上衣下襬的 y
 * @param {number} [p.legHalf] 雙腿總寬的一半
 * @param {string} [p.suit] 上衣顏色
 * @param {string} [p.sleeves] 袖子顏色（預設同上衣）
 * @param {string} [p.legs] 褲子顏色
 * @param {string|null} [p.hands] 手的顏色；null 不畫
 * @param {"tie"|"blouse"|"scarf"|"none"} [p.collar]
 * @param {string} [p.tie] 領帶顏色
 * @param {(ctx: CanvasRenderingContext2D, p: object) => void} p.head 畫頭的函式
 * @param {(ctx: CanvasRenderingContext2D, p: object) => void} [p.extra] 畫在身體之上的額外部分
 */
export function drawStandingFigure(ctx, p) {
  const { cx, shoulderY, halfWidth, feetY = 453, hipY = 428, legHalf = halfWidth - 5, suit = BLACK, legs = BLACK, hands = RED, collar = "tie", tie = RED } = p;
  const sleeves = p.sleeves ?? suit;
  const armBottom = hipY - 6;
  // 腿：一整塊，中間一道白縫
  roundRect(ctx, cx - legHalf, hipY - 3, legHalf * 2, feetY - hipY + 3, 0.8, legs);
  ctx.fillStyle = WHITE;
  ctx.fillRect(cx - 0.5, hipY + 4, 1, feetY - hipY - 4);
  // 手（露在袖口下面）
  if (hands) {
    roundRect(ctx, cx - halfWidth + 0.6, armBottom - 0.5, 3.4, 4.2, 1.4, hands);
    roundRect(ctx, cx + halfWidth - 4, armBottom - 0.5, 3.4, 4.2, 1.4, hands);
  }
  // 手臂與軀幹
  roundRect(ctx, cx - halfWidth, shoulderY + 1, 5.2, armBottom - shoulderY - 1, [2.6, 1, 1.4, 1.4], sleeves);
  roundRect(ctx, cx + halfWidth - 5.2, shoulderY + 1, 5.2, armBottom - shoulderY - 1, [1, 2.6, 1.4, 1.4], sleeves);
  roundRect(ctx, cx - halfWidth + 3.6, shoulderY, halfWidth * 2 - 7.2, hipY - shoulderY, [3, 3, 0.6, 0.6], suit);
  // 領口
  if (collar === "tie") {
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.moveTo(cx - 3.2, shoulderY - 0.2);
    ctx.lineTo(cx + 3.2, shoulderY - 0.2);
    ctx.lineTo(cx, shoulderY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tie;
    ctx.beginPath();
    ctx.moveTo(cx - 1, shoulderY);
    ctx.lineTo(cx + 1, shoulderY);
    ctx.lineTo(cx + 1.3, shoulderY + 7.5);
    ctx.lineTo(cx, shoulderY + 10);
    ctx.lineTo(cx - 1.3, shoulderY + 7.5);
    ctx.closePath();
    ctx.fill();
  } else if (collar === "blouse") {
    ctx.fillStyle = WHITE;
    ctx.beginPath();
    ctx.moveTo(cx - 2.2, shoulderY - 0.2);
    ctx.lineTo(cx + 2.2, shoulderY - 0.2);
    ctx.lineTo(cx, shoulderY + 6.5);
    ctx.closePath();
    ctx.fill();
  } else if (collar === "scarf") {
    roundRect(ctx, cx - 4, shoulderY - 1.2, 8, 3.6, 1.6, RED);
  }
  p.head(ctx, p);
  p.extra?.(ctx, p);
}

/** 頭：臉是一個橢圓，髮型由 hair(ctx, cx, cy) 畫在臉的前後。 */
/** head() 的選項：臉的位置與大小、膚色，頭髮（臉後面／前面各畫一次）與脖子 */
interface HeadOptions {
  faceY: number;
  faceRx?: number;
  faceRy?: number;
  face?: string;
  hairBack?: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void;
  hairFront?: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void;
  neck?: boolean;
}
export function head({ faceY, faceRx = 3.9, faceRy = 5, face = RED, hairBack, hairFront, neck = true }: HeadOptions) {
  return (ctx, p) => {
    const cx = p.cx;
    hairBack?.(ctx, cx, faceY);
    if (neck) {
      ctx.fillStyle = face;
      ctx.fillRect(cx - 1.6, faceY + faceRy - 1.5, 3.2, p.shoulderY - faceY - faceRy + 2);
    }
    ellipse(ctx, cx, faceY, faceRx, faceRy, face);
    hairFront?.(ctx, cx, faceY);
  };
}

/**
 * 側面站立的人（握手那兩位的畫法）。facing：1 面向右、-1 面向左。
 * reach：伸出的手往前伸多遠（像素）。
 */
export function drawProfileFigure(ctx, { cx, headY, feetY, facing, reach, color = RED, shade = DARK_RED }) {
  const f = facing;
  const shoulderY = headY + 8;
  const hipY = shoulderY + 30;
  // 腿
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 5.5, hipY - 2);
  ctx.lineTo(cx + 5.5, hipY - 2);
  ctx.lineTo(cx + 4.2, feetY - 2);
  ctx.lineTo(cx - 4.2, feetY - 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade;
  ctx.fillRect(cx - 0.4, hipY + 6, 0.8, feetY - hipY - 8);
  // 鞋
  roundRect(ctx, cx - 4.6 + f * 1.5, feetY - 2.6, 9.2, 2.6, 1.2, shade);
  // 上衣
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 6.5, shoulderY + 2);
  ctx.quadraticCurveTo(cx - 6.5, shoulderY - 1.5, cx - 2, shoulderY - 1.5);
  ctx.lineTo(cx + 2, shoulderY - 1.5);
  ctx.quadraticCurveTo(cx + 6.5, shoulderY - 1.5, cx + 6.5, shoulderY + 2);
  ctx.lineTo(cx + 7, hipY);
  ctx.lineTo(cx - 7, hipY);
  ctx.closePath();
  ctx.fill();
  // 衣服上的暗線：前襟與下襬
  ctx.strokeStyle = shade;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx + f * 2.5, shoulderY);
  ctx.lineTo(cx + f * 4.5, hipY - 1);
  ctx.moveTo(cx - 7, hipY - 0.4);
  ctx.lineTo(cx + 7, hipY - 0.4);
  ctx.stroke();
  // 伸出的手臂、白袖口、手
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx + f * 3, shoulderY + 4);
  ctx.lineTo(cx + f * (3 + reach * 0.45), shoulderY + 15);
  ctx.lineTo(cx + f * (3 + reach), shoulderY + 16.5);
  ctx.stroke();
  ctx.lineCap = "butt";
  roundRect(ctx, cx + f * (3 + reach) - 1.6, shoulderY + 14.6, 3.2, 3.8, 1, WHITE);
  // 頭：臉朝 facing 方向，後腦是深色頭髮
  ellipse(ctx, cx + f * 0.6, headY, 4.2, 5.2, color);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(cx - f * 0.8, headY - 1.4, 4.4, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ellipse(ctx, cx + f * 1.8, headY + 0.6, 2.9, 4.2, color);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 1.6, headY + 4, 3.2, 4);
}

/**
 * 實心的人（排隊那一列的畫法）：圓頭、圓肩、直筒身體，沒有手腳細節。黑色。
 * @param {number} cx 中線 x
 * @param {number} headY 頭的圓心 y
 * @param {number} r 頭的半徑
 * @param {number} half 肩寬的一半
 * @param {number} bottom 身體下緣的 y（通常埋進地面一點）
 */
export function drawQueuePerson(ctx, cx, headY, r, half, bottom) {
  const shoulderY = headY + r + 1.6;
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.arc(cx, headY, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - r * 0.5, headY, r, r + 3);
  ctx.beginPath();
  ctx.moveTo(cx - half, bottom);
  ctx.lineTo(cx - half, shoulderY + 5.5);
  ctx.bezierCurveTo(cx - half, shoulderY + 1, cx - half * 0.6, shoulderY, cx - r * 0.45, shoulderY - 0.6);
  ctx.lineTo(cx + r * 0.45, shoulderY - 0.6);
  ctx.bezierCurveTo(cx + half * 0.6, shoulderY, cx + half, shoulderY + 1, cx + half, shoulderY + 5.5);
  ctx.lineTo(cx + half, bottom);
  ctx.closePath();
  ctx.fill();
}

/**
 * 示威者：黑色人形外面一圈白線（封面上廣場群眾的畫法），可以舉手。
 * @param {number} cx 中線 x
 * @param {number} headY 頭的圓心 y
 * @param {number} feetY 腳底 y
 * @param {""|"L"|"R"|"LR"} arms 哪隻手舉起來（L 是畫面左側）
 * @param {number} [size] 縮放；1 時頭的半徑 3 像素
 */
export function drawProtester(ctx, cx, headY, feetY, arms, size = 1) {
  const shoulderY = headY + 4.2 * size;
  const hipY = shoulderY + 11 * size;
  const paint = (color, grow) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const solid = () => {
      ctx.fill();
      if (grow) {
        ctx.lineWidth = grow;
        ctx.stroke();
      }
    };
    ctx.beginPath();
    ctx.arc(cx, headY, 3 * size, 0, Math.PI * 2);
    solid();
    ctx.beginPath();
    ctx.roundRect(cx - 4.2 * size, shoulderY, 8.4 * size, hipY - shoulderY + 1, [3 * size, 3 * size, 0, 0]);
    solid();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.rect(cx + (side < 0 ? -4 : 0.6) * size, hipY, 3.4 * size, feetY - hipY);
      solid();
      const raised = arms.includes(side < 0 ? "L" : "R");
      ctx.lineWidth = 2.5 * size + grow;
      ctx.beginPath();
      ctx.moveTo(cx + side * 3.8 * size, shoulderY + 1.6 * size);
      if (raised) ctx.lineTo(cx + side * 6.6 * size, headY - 6.5 * size);
      else ctx.lineTo(cx + side * 5.2 * size, hipY + 1.5 * size);
      ctx.stroke();
    }
  };
  paint(WHITE, 1.7);
  paint(BLACK, 0);
}

/**
 * 背對鏡頭的人（看板前那群人的畫法）：頭、肩、往下延伸的身體，黑色。
 * outline 為 true 時加一圈只畫到身體中段的白色輪廓線，下面敞開，看起來是空心的。
 * @param {number} cx 中線 x
 * @param {number} headY 頭的圓心 y
 * @param {boolean} outline 畫不畫白色輪廓線
 * @param {number} bottom 身體下緣的 y
 */
export function drawWatcher(ctx, cx, headY, outline, bottom) {
  const trace = (toY) => {
    ctx.beginPath();
    ctx.moveTo(cx - 5.4, toY);
    ctx.lineTo(cx - 5.4, headY + 8.5);
    ctx.quadraticCurveTo(cx - 5.2, headY + 4.6, cx - 2.3, headY + 3.4);
    ctx.arc(cx, headY, 3.7, Math.PI * 0.72, Math.PI * 0.28);
    ctx.quadraticCurveTo(cx + 5.2, headY + 4.6, cx + 5.4, headY + 8.5);
    ctx.lineTo(cx + 5.4, toY);
  };
  ctx.fillStyle = BLACK;
  trace(bottom);
  ctx.closePath();
  ctx.fill();
  if (!outline) return;
  // 輪廓線只畫到身體中段，下面是敞開的：人是空心的
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  trace(Math.min(headY + 21, bottom - 1.5));
  ctx.stroke();
}
