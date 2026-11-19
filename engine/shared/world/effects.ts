// 煙、氣這類效果的繪圖元件。全部用封面像素座標下筆。
// 會動的粒子（火焰、雪、煙絲）是 three.js 物件，在 core.js 和 shared/fx.js；這裡只放畫在 canvas 上的靜態形狀。
import { traceBlob } from "./props";
import { tracePoly } from "./shapes";
import { BLACK } from "./space";

/**
 * 一片黑煙。
 * @param {{ smooth: boolean, points: [number, number][] }} smoke
 *   points：輪廓的點（封面像素）。smooth 為 true 時連成圓滑的一團（traceBlob）；
 *   false 時照折線畫，再用圓角描邊把尖角磨圓（大片煙幕、底下有往下滴的尖）
 */
export function drawSmokePatch(ctx, smoke) {
  ctx.fillStyle = BLACK;
  if (smoke.smooth) {
    traceBlob(ctx, smoke.points);
    ctx.fill();
  } else {
    ctx.strokeStyle = BLACK;
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    tracePoly(ctx, smoke.points);
    ctx.fill();
    ctx.stroke();
  }
}
