import {
  INK,
  brushStroke,
  canvasTexture,
  fillSmoothShape,
  seededRandom,
} from "../core";
import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import { drawWithRimOutline } from "./draw";

// ---- 來自 chapters/street.js ----

// OFF_WHITE：米白色，用於墨色剪影上的白色描線／高光
const OFF_WHITE = "#fbfaf5";
// 畫一匹奔跑的馬（剪影，原點約在軀幹中心，朝 +x）。
// phase：步態相位（弧度）；highlights：是否加白色輪廓高光（前景那匹才加）；seed：鬃毛／尾巴的亂數種子

// 畫一匹奔跑的馬（剪影，原點約在軀幹中心，朝 +x）。
// phase：步態相位（弧度）；highlights：是否加白色輪廓高光（前景那匹才加）；seed：鬃毛／尾巴的亂數種子
function drawHorse(ctx, phase, highlights, seed) {
  // rand：鬃毛／尾巴用的亂數。
  // drawLeg(hipX, hipY, phaseOffset, isFront)：以相位算出上段角度與下段彎曲，畫一條腿（上段 92px、下段 100px、蹄）。
  // phaseOffset：此腿相對 phase 的相位差；isFront：前腿（彎曲方向相反）
  const rand = seededRandom(seed);
  const drawLeg = (hipX, hipY, phaseOffset, isFront) => {
    const legPhase = phase + phaseOffset;
    const upperAngle =
      Math.sin(legPhase) * (isFront ? 0.85 : 0.75) + (isFront ? 0.15 : -0.1);
    const lowerBend =
      (isFront ? -1 : 1) *
      (Math.max(0, Math.sin(legPhase + (isFront ? 1.4 : -1.2))) * 1.3 + 0.1);
    const kneeX = hipX + Math.sin(upperAngle) * 92;
    const kneeY = hipY + Math.cos(upperAngle) * 92;
    const lowerAngle = upperAngle + lowerBend;
    const hoofX = kneeX + Math.sin(lowerAngle) * 100;
    const hoofY = kneeY + Math.cos(lowerAngle) * 100;
    brushStroke(
      ctx,
      [
        [hipX, hipY - 20],
        [kneeX, kneeY],
      ],
      46,
      INK,
      0.3,
    );
    brushStroke(
      ctx,
      [
        [kneeX, kneeY],
        [(kneeX + hoofX) / 2, (kneeY + hoofY) / 2],
        [hoofX, hoofY],
      ],
      24,
      INK,
      0.15,
    );
    ctx.save();
    ctx.translate(hoofX, hoofY);
    ctx.rotate(-lowerAngle);
    fillSmoothShape(
      ctx,
      [
        [-14, -6],
        [14, -6],
        [18, 16],
        [-16, 16],
      ],
      INK,
    );
    if (highlights) {
      brushStroke(
        ctx,
        [
          [-14, 18],
          [18, 18],
        ],
        4,
        OFF_WHITE,
        0.4,
      );
    }
    ctx.restore();
    if (highlights) {
      brushStroke(
        ctx,
        [
          [kneeX + 10, kneeY - 10],
          [hoofX + 8, hoofY - 8],
        ],
        3,
        OFF_WHITE,
        1,
      );
    }
  };
  // 先畫遠側兩條腿，再畫軀幹、頸與頭、耳朵
  drawLeg(-150, 20, Math.PI + 0.5, false);
  drawLeg(130, 20, 0.5, true);
  fillSmoothShape(
    ctx,
    [
      [-190, -10],
      [-150, -62],
      [-40, -70],
      [80, -72],
      [150, -70],
      [190, -30],
      [180, 30],
      [120, 60],
      [-20, 64],
      [-150, 60],
      [-205, 30],
    ],
    INK,
  );
  fillSmoothShape(
    ctx,
    [
      [120, -70],
      [190, -150],
      [250, -196],
      [290, -186],
      [356, -120],
      [372, -96],
      [350, -80],
      [300, -100],
      [260, -60],
      [200, 20],
      [150, 20],
    ],
    INK,
  );
  fillSmoothShape(
    ctx,
    [
      [262, -194],
      [270, -232],
      [284, -190],
    ],
    INK,
  );
  // 7 束向後飄的鬃毛
  for (let maneIndex = 0; maneIndex < 7; maneIndex++) {
    const maneX = 140 + maneIndex * 18;
    const maneY = -84 - maneIndex * 18;
    brushStroke(
      ctx,
      [
        [maneX, maneY],
        [maneX - 50 - rand() * 30, maneY - 20 - rand() * 20],
        [maneX - 100 - rand() * 40, maneY - 10 - rand() * 30],
      ],
      14,
      INK,
      1,
    );
  }
  // 5 束尾巴，隨 phase 上下擺
  for (let tailIndex = 0; tailIndex < 5; tailIndex++) {
    brushStroke(
      ctx,
      [
        [-190, -40],
        [-260, -70 + tailIndex * 6],
        [-330 - rand() * 40, -60 + tailIndex * 16 - Math.sin(phase) * 20],
      ],
      16,
      INK,
      1,
    );
  }
  // 近側兩條腿；highlights 為 true 時再加白色輪廓線、韁繩／肚帶與眼、鼻兩個白點
  drawLeg(-120, 26, Math.PI, false);
  drawLeg(150, 26, 0, true);
  if (highlights) {
    brushStroke(
      ctx,
      [
        [-196, 10],
        [-160, -58],
        [-40, -68],
        [100, -70],
      ],
      6,
      OFF_WHITE,
      0.9,
    );
    brushStroke(
      ctx,
      [
        [150, -90],
        [200, -158],
        [252, -196],
        [290, -188],
      ],
      6,
      OFF_WHITE,
      0.9,
    );
    brushStroke(
      ctx,
      [
        [300, -184],
        [356, -122],
        [372, -98],
      ],
      5,
      OFF_WHITE,
      0.9,
    );
    brushStroke(
      ctx,
      [
        [-130, 62],
        [0, 66],
        [120, 58],
      ],
      3,
      OFF_WHITE,
      1,
    );
    brushStroke(
      ctx,
      [
        [170, -100],
        [176, -30],
        [196, 20],
      ],
      8,
      OFF_WHITE,
      0.3,
    );
    brushStroke(
      ctx,
      [
        [180, 0],
        [60, -10],
        [-100, -6],
        [-260, 6],
      ],
      4,
      OFF_WHITE,
      0.2,
    );
    brushStroke(
      ctx,
      [
        [60, -70],
        [70, 20],
      ],
      6,
      OFF_WHITE,
      0.2,
    );
    brushStroke(
      ctx,
      [
        [268, -160],
        [300, -140],
        [352, -104],
      ],
      3,
      OFF_WHITE,
      0.2,
    );
    ctx.fillStyle = OFF_WHITE;
    ctx.beginPath();
    ctx.arc(298, -156, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(360, -100, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
// 一對並排的馬：後方那匹位移 (70,-36)、相位差 0.9、無高光；前方那匹有高光；最後在馬前方灑一些白點。
// 畫在 1024×640 的邏輯畫布上

// 產生 flipbook：frameCount 張 width×height 的貼圖。繪圖座標統一為 512×1024，
// 每格以 drawFrame(ctx, frameIndex) 繪製並經 drawWithRimOutline 加上外框（rimOffset 以 512 寬為基準）
function makeFlipbook(frameCount, width, height, drawFrame, rimOffset = 7) {
  return Array.from(
    {
      length: frameCount,
    },
    (_unused, frameIndex) =>
      canvasTexture(width, height, (ctx) => {
        ctx.scale(width / 512, height / 1024);
        drawWithRimOutline(
          ctx,
          width,
          height,
          (artCtx) => drawFrame(artCtx, frameIndex),
          (rimOffset * width) / 512,
          (3 * width) / 512,
        );
      }),
  );
}
// 建立面向 ±x 的直立平面（繞 Y 轉 90°、雙面、不寫深度）。
// worldHeight：世界座標高度，寬度依貼圖長寬比；anchorUv：貼圖上要對齊到物件原點的 UV 位置（例如腳底）

// 建立面向 ±x 的直立平面（繞 Y 轉 90°、雙面、不寫深度）。
// worldHeight：世界座標高度，寬度依貼圖長寬比；anchorUv：貼圖上要對齊到物件原點的 UV 位置（例如腳底）
function sideBillboard(texture, worldHeight, anchorUv) {
  const image = texture.image;
  const worldWidth = (worldHeight * image.width) / image.height;
  const geometry = new PlaneGeometry(worldWidth, worldHeight);
  geometry.translate(
    (0.5 - anchorUv[0]) * worldWidth,
    (0.5 - anchorUv[1]) * worldHeight,
    0,
  );
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    }),
  );
  mesh.rotation.y = Math.PI / 2;
  return mesh;
}
// street 章節：女孩走在雪街上，兩輛馬車衝過，她跑開時掉了兩隻拖鞋，一隻埋進雪裡，另一隻被男孩撿走。
// 注意：這個工廠函式沒有使用 ctx 參數

export { OFF_WHITE, drawHorse, makeFlipbook, sideBillboard };
