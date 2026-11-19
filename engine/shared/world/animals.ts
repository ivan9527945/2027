// 動物的繪圖元件：會走路的腿、牛。全部用封面像素座標下筆。
// 整隻的馬、駱駝、鹿、鳥都是照封面逐點描的固定圖形，留在各自的章節檔裡（見 README）。
import { BLACK } from "./space";

/**
 * 四足動物的一條腿（大腿、小腿、蹄三段粗線），可以依步態相位擺動。馬和駱駝共用。
 * phase = 0 時就是 leg 裡量到的封面姿勢。
 * @param {{ hip: [number, number], knee: [number, number], hoof: [number, number], off: number, upper: number, lower: number }} leg
 *   髖、膝、蹄的位置（封面像素）；off：這條腿在步態裡的相位差（弧度）；upper／lower：大腿、小腿的線寬
 * @param {number} phase 步態相位（弧度）
 * @param {1|-1} dir 面向右 +1、面向左 -1
 * @param {object} [opts]
 * @param {number} [opts.swing] 大腿前後擺的幅度（弧度）
 * @param {number} [opts.bend] 腿往前擺時小腿多收起來的幅度（弧度）
 * @param {number} [opts.hoofWidth] 蹄比小腿粗多少
 * @param {[number, number]} [opts.hoofReach] 蹄往前、往下伸多少
 * @param {string} [opts.color]
 */
export function drawWalkingLeg(ctx, leg, phase, dir, { swing = 0.34, bend = 0.75, hoofWidth = 0.6, hoofReach = [2.2, 0.6], color = BLACK } = {}) {
  const turn = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const lift = (ph) => Math.max(0, dir * Math.cos(ph)); // 腿往前擺的那半圈把小腿收起來
  const da = -dir * swing * (Math.sin(phase + leg.off) - Math.sin(leg.off));
  const db = da + dir * bend * (lift(phase + leg.off) - lift(leg.off));
  const thigh = turn([leg.knee[0] - leg.hip[0], leg.knee[1] - leg.hip[1]], da);
  const knee = [leg.hip[0] + thigh[0], leg.hip[1] + thigh[1]];
  const shin = turn([leg.hoof[0] - leg.knee[0], leg.hoof[1] - leg.knee[1]], db);
  const hoof = [knee[0] + shin[0], knee[1] + shin[1]];
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = leg.upper;
  ctx.beginPath();
  ctx.moveTo(leg.hip[0], leg.hip[1]);
  ctx.lineTo(knee[0], knee[1]);
  ctx.stroke();
  ctx.lineWidth = leg.lower;
  ctx.beginPath();
  ctx.moveTo(knee[0], knee[1]);
  ctx.lineTo(hoof[0], hoof[1]);
  ctx.stroke();
  // 蹄：往前伸一點
  ctx.lineWidth = leg.lower + hoofWidth;
  ctx.beginPath();
  ctx.moveTo(hoof[0], hoof[1]);
  ctx.lineTo(hoof[0] + dir * hoofReach[0], hoof[1] + hoofReach[1]);
  ctx.stroke();
}

/**
 * 牛的身體（不含頭）：桶形的身體、四條腿、垂在左邊的尾巴。黑色，朝右。頭另外用 drawCowHead 畫，才能低頭。
 * @param {[number, number, number]} cow [身體左緣 x, 背 y, 身長]
 */
export function drawCowBody(ctx, [x0, top, length]: number[]) {
  ctx.fillStyle = BLACK;
  ctx.strokeStyle = BLACK;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0 + 3, top + 0.6);
  ctx.quadraticCurveTo(x0 + length * 0.5, top - 0.8, x0 + length, top + 0.4);
  ctx.lineTo(x0 + length + 1, top + 10);
  ctx.quadraticCurveTo(x0 + length * 0.5, top + 15.5, x0 + 1.5, top + 13.5);
  ctx.quadraticCurveTo(x0 - 0.8, top + 6, x0 + 3, top + 0.6);
  ctx.fill();
  ctx.lineWidth = 2.8;
  for (const [from, to] of [[2.4, 3.2], [8.4, 10.6], [length - 8.2, length - 7], [length - 2.2, length + 0.2]]) {
    ctx.beginPath();
    ctx.moveTo(x0 + from, top + 11);
    ctx.lineTo(x0 + to, top + 23.2);
    ctx.stroke();
  }
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(x0 + 2, top + 2);
  ctx.quadraticCurveTo(x0 - 1.6, top + 5, x0 - 2.6, top + 12.6);
  ctx.stroke();
}

/**
 * 牛頭（朝右、兩隻耳朵）。以頸根 (px, py) 為軸：貼圖以這一點為中心，低頭時繞著它轉。
 */
export function drawCowHead(ctx, px, py) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(px - 3, py - 2.6);
  ctx.lineTo(px + 3, py - 3.4);
  ctx.lineTo(px + 7.6, py - 1.4);
  ctx.lineTo(px + 8.2, py + 3);
  ctx.lineTo(px + 6.8, py + 8.6);
  ctx.quadraticCurveTo(px + 4.6, py + 10.6, px + 3, py + 8.4);
  ctx.lineTo(px + 1.4, py + 5);
  ctx.lineTo(px - 3.4, py + 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // 兩隻耳朵
  ctx.moveTo(px + 0.4, py - 2.6);
  ctx.lineTo(px - 2.6, py - 6.4);
  ctx.lineTo(px + 3, py - 3.6);
  ctx.moveTo(px + 5.4, py - 2.6);
  ctx.lineTo(px + 9.4, py - 5.4);
  ctx.lineTo(px + 7.8, py - 0.8);
  ctx.fill();
}
