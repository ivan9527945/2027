import { INK, canvasTexture, catmullRom2D } from "../core";

// ---- 來自 chapters/grandmother.js ----

// 帶光暈地繪製：先把 draw 畫到一張離屏畫布，再貼兩次到 ctx；
// 第一次帶 shadowBlur（glowBlur px、glowColor）當外發光，第二次是清晰的本體。
function drawWithGlow(
  ctx,
  width,
  height,
  draw,
  glowBlur = 70,
  glowColor = "rgba(255,176,64,0.95)",
) {
  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerCtx = layer.getContext("2d");
  draw(layerCtx);
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = glowBlur;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
  ctx.drawImage(layer, 0, 0);
}
// 畫奶奶的頭（以臉中心為原點，可平移、旋轉、縮放）：
// 頭巾外形、臉、兩頰腮紅、中分的白髮與髮絲、閉著的雙眼、眉毛、眼尾與嘴邊皺紋、鼻子、微笑、
// 頭巾兩側垂片、下巴的結、頭巾衣褶線。withVeilTail 為 true 時先畫一條從頭後往右下飄的頭巾長尾。

// 把一張已畫好的畫布轉成「逆光剪影」貼圖：近黑的剪影本體、頂緣一道白邊、
// 外圍一圈橘色描邊（橘色遮罩沿半徑 14px 的圓貼 12 次）與白色外發光。
// sourceCanvas 的 lw / lh 是 canvasTexture 記下的邏輯尺寸，沒有時退回 width / height。
function makeRimLitSilhouetteTexture(sourceCanvas) {
  const width = sourceCanvas.lw ?? sourceCanvas.width;
  const height = sourceCanvas.lh ?? sourceCanvas.height;
  return canvasTexture(width, height, (ctx) => {
    // 白色遮罩：原圖的 alpha 形狀填成純白。
    const whiteMask = document.createElement("canvas");
    whiteMask.width = width;
    whiteMask.height = height;
    const whiteCtx = whiteMask.getContext("2d");
    whiteCtx.drawImage(sourceCanvas, 0, 0, width, height);
    whiteCtx.globalCompositeOperation = "source-in";
    whiteCtx.fillStyle = "#fff";
    whiteCtx.fillRect(0, 0, width, height);
    // 暗色遮罩：同樣的形狀填成 #060504。
    const darkMask = document.createElement("canvas");
    darkMask.width = width;
    darkMask.height = height;
    const darkCtx = darkMask.getContext("2d");
    darkCtx.drawImage(sourceCanvas, 0, 0, width, height);
    darkCtx.globalCompositeOperation = "source-in";
    darkCtx.fillStyle = "#060504";
    darkCtx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.shadowColor = "rgba(255,252,240,1)";
    ctx.shadowBlur = 36;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(whiteMask, 0, 0);
    ctx.restore();
    // 橘色遮罩，沿圓周貼 12 次做出外框。
    const orangeMask = document.createElement("canvas");
    orangeMask.width = width;
    orangeMask.height = height;
    const orangeCtx = orangeMask.getContext("2d");
    orangeCtx.drawImage(whiteMask, 0, 0);
    orangeCtx.globalCompositeOperation = "source-in";
    orangeCtx.fillStyle = "#ffa526";
    orangeCtx.fillRect(0, 0, width, height);
    for (let x = 0; x < 12; x++) {
      const angle = (x / 12) * Math.PI * 2;
      ctx.drawImage(orangeMask, Math.cos(angle) * 14, Math.sin(angle) * 14);
    }
    // 白色本體往上偏 6px，再用 source-atop 蓋上往下偏的暗色遮罩，只在頂緣留下一道白邊。
    ctx.drawImage(whiteMask, 0, -6);
    ctx.globalCompositeOperation = "source-atop";
    ctx.drawImage(darkMask, 6, 12);
    ctx.drawImage(darkMask, -6, 12);
  });
}
// 本模組的貼圖快取：cachedTexture(key, build) 同一個 key 只建一次。

// ---- 來自 chapters/morning.js ----

// PAPER_EDGE：剪影右側露出的紙邊顏色；SNOW_WHITE：雪點與近景屋頂積雪的白。
// SHADOW_DIR：地面影子倒下的方向（世界座標 x, z，已正規化），朝左後方的牆角。
const PAPER_EDGE = "#f4f2ec";

// 剪紙人形貼圖。drawSilhouette 先把墨色剪影畫在離屏 canvas；再用 source-in 染成紙色，
// 向右（並交錯向上）偏移畫 4 次，形成一圈像紙板厚度的亮邊；最後疊回剪影本體，再呼叫 drawDetails 畫細節。
// edgeOffset：亮邊偏移量（px）。
function makeCutoutTexture(
  width,
  height,
  drawSilhouette,
  edgeOffset = 7,
  drawDetails,
) {
  return canvasTexture(width, height, (ctx) => {
    const silhouetteCanvas = document.createElement("canvas");
    silhouetteCanvas.width = width;
    silhouetteCanvas.height = height;
    const silhouetteCtx = silhouetteCanvas.getContext("2d");
    drawSilhouette(silhouetteCtx);
    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = width;
    edgeCanvas.height = height;
    const edgeCtx = edgeCanvas.getContext("2d");
    edgeCtx.drawImage(silhouetteCanvas, 0, 0);
    edgeCtx.globalCompositeOperation = "source-in";
    edgeCtx.fillStyle = PAPER_EDGE;
    edgeCtx.fillRect(0, 0, width, height);
    // 4 次偏移：x = edgeOffset × 0.4/0.6/0.8/1.0，奇數次再往上 0.35 × edgeOffset。
    for (let pass = 0; pass < 4; pass++) {
      ctx.drawImage(
        edgeCanvas,
        edgeOffset * (0.4 + pass * 0.2),
        -edgeOffset * 0.35 * (pass % 2),
      );
    }
    ctx.drawImage(silhouetteCanvas, 0, 0);
    drawDetails?.(ctx);
  });
}
// 靴子剪影：(x, soleY) 是鞋底基準點，靴筒高 120 × scale，鞋尖朝 dir（±1）伸出 100 × scale。

// ---- 來自 shared/b-girl.js ----

// OFF_WHITE：米白底色（頭髮、皮膚、白色描線都用這個顏色）。
// PORTRAIT_WIDTH × PORTRAIT_HEIGHT：肖像畫布 1024×1280 px；臉、頭髮、髮束、肩膀各畫在同尺寸畫布上再疊成紙偶
const OFF_WHITE = "#fbfaf5";

// 沿曲線（Catmull-Rom）兩側展開成帶狀多邊形並回傳點列。
// 寬度由 startWidth 內插到 endWidth，中段依 bulge 以 sin 鼓起；給 widthFn(u) 時改用它決定寬度
function taperedOutline(points, startWidth, endWidth, bulge = 0.25, widthFn) {
  const spine = catmullRom2D(points, 8);
  const leftEdge = [];
  const rightEdge = [];
  for (let index = 0; index < spine.length; index++) {
    const prev = spine[Math.max(0, index - 1)];
    const next = spine[Math.min(spine.length - 1, index + 1)];
    let normalX = -(next[1] - prev[1]);
    let normalY = next[0] - prev[0];
    const normalLength = Math.hypot(normalX, normalY) || 1;
    normalX /= normalLength;
    normalY /= normalLength;
    const frac = index / (spine.length - 1);
    const halfWidth =
      (widthFn
        ? widthFn(frac)
        : (startWidth + (endWidth - startWidth) * frac) *
          (1 + bulge * Math.sin(Math.PI * frac))) / 2;
    leftEdge.push([
      spine[index][0] + normalX * halfWidth,
      spine[index][1] + normalY * halfWidth,
    ]);
    rightEdge.push([
      spine[index][0] - normalX * halfWidth,
      spine[index][1] - normalY * halfWidth,
    ]);
  }
  return [...leftEdge, ...rightEdge.reverse()];
}
// 填滿多邊形（直線邊），可選擇再描邊

// 把 draw(ctx) 的圖先畫到離屏畫布，再輸出三層：往上／左上偏移 rimOffset 的米白剪影（上緣白邊）、
// 半徑 outlineRadius 的墨色外框、原圖。用於街景人物的 flipbook 影格
function drawWithRimOutline(
  ctx,
  width,
  height,
  draw,
  rimOffset = 4,
  outlineRadius = 2.5,
) {
  const makeCanvas = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const artCanvas = makeCanvas();
  const artCtx = artCanvas.getContext("2d");
  artCtx.setTransform(ctx.getTransform());
  draw(artCtx);
  const tinted = (color) => {
    const tintCanvas = makeCanvas();
    const tintCtx = tintCanvas.getContext("2d");
    tintCtx.drawImage(artCanvas, 0, 0);
    tintCtx.globalCompositeOperation = "source-in";
    tintCtx.fillStyle = color;
    tintCtx.fillRect(0, 0, width, height);
    return tintCanvas;
  };
  const whiteCopy = tinted(OFF_WHITE);
  const inkCopy = tinted(INK);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let rimIndex = 0; rimIndex < 10; rimIndex++) {
    const angle = Math.PI * (0.75 + (rimIndex / 9) * 0.9);
    ctx.drawImage(
      whiteCopy,
      Math.cos(angle) * rimOffset,
      -Math.abs(Math.sin(angle)) * rimOffset,
    );
  }
  for (let ringIndex = 0; ringIndex < 12; ringIndex++) {
    const angle = (ringIndex / 12) * Math.PI * 2;
    ctx.drawImage(
      inkCopy,
      Math.cos(angle) * outlineRadius,
      Math.sin(angle) * outlineRadius,
    );
  }
  ctx.drawImage(artCanvas, 0, 0);
  ctx.restore();
}
// 步行姿勢：由步態相位 phase（弧度）與 run（0 走～1 跑）算出髖關節擺角 hip 與膝彎角 knee（弧度）

// ---- 來自 shared/d-fx.js ----

// 在 ctx 上建立一條通過 points 的 Catmull-Rom 路徑（只建路徑，不填不描）。
// closed=true 時首尾相接並 closePath；segments 為每段的細分數。
function tracePath(ctx, points, closed = true, segments = 10) {
  const curve = closed
    ? catmullRom2D([...points, points[0], points[1]], segments).slice(
        0,
        -segments,
      )
    : catmullRom2D(points, segments);
  ctx.beginPath();
  ctx.moveTo(curve[0][0], curve[0][1]);
  for (const point of curve) {
    ctx.lineTo(point[0], point[1]);
  }
  if (closed) {
    ctx.closePath();
  }
}
// 填滿一個平滑封閉形狀；outlineWidth > 0 時再描一圈圓角外框。

// 填滿一個平滑封閉形狀；outlineWidth > 0 時再描一圈圓角外框。
function fillOutlinedShape(
  ctx,
  points,
  fill,
  outlineWidth = 0,
  outlineColor = INK,
) {
  tracePath(ctx, points);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outlineWidth > 0) {
    ctx.lineWidth = outlineWidth;
    ctx.strokeStyle = outlineColor;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}
// 沿 points 描一條平滑開放曲線（圓頭、圓角）。

// 沿 points 描一條平滑開放曲線（圓頭、圓角）。
function strokeCurve(ctx, points, width, color = INK) {
  tracePath(ctx, points, false, 8);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}
// 填滿一個橢圓；rotation 為弧度。

// 填滿一個橢圓；rotation 為弧度。
function fillEllipse(ctx, cx, cy, rx, ry, fill, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}
// 在兩條折線 fromLine → toLine 之間畫 count 根筆刷細線（grandmother 章用來畫髮絲）。
// 每根的起點沿 fromLine 取樣，終點在 toLine 上略帶隨機偏移；sway 為橫向擺動幅度（px）。

export {
  drawWithGlow,
  makeRimLitSilhouetteTexture,
  PAPER_EDGE,
  makeCutoutTexture,
  OFF_WHITE,
  taperedOutline,
  drawWithRimOutline,
  tracePath,
  fillOutlinedShape,
  strokeCurve,
  fillEllipse,
};
