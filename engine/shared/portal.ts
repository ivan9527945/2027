import { MathUtils } from "three";

// ---- 來自 shared/a-book.js ----

// 書本尺寸（世界單位）。書脊在 x=0，書頁朝 +x 展開，y 向上，z 為頁高方向。
// PAGE_* 為內頁寬高，COVER_* 為封面硬板寬高與厚度。
// BLOCK_TOP_Y = 書頁疊頂面的高度（底板厚度 + 0.17 的書芯厚度）。
// OPEN_ANGLE = 封面完全翻開的角度：超過 180°，讓封面外緣落到桌面高度。
// PORTAL_UV = 插畫頁上「入口」畫框的 UV 範圍；PORTAL_CENTER / PORTAL_WIDTH / PORTAL_HEIGHT 為該畫框在書本座標中的中心與尺寸。
// PAGE_TEX_* = 內頁貼圖的邏輯像素尺寸；serifFont() 組出 Cormorant Garamond 的 canvas font 字串。
const PAGE_WIDTH = 1;

const PAGE_HEIGHT = 1.4;

const PORTAL_UV = {
  u0: 0.1,
  u1: 0.9,
  v0: 0.27,
  v1: 0.9,
};

const PORTAL_WIDTH = (PORTAL_UV.u1 - PORTAL_UV.u0) * PAGE_WIDTH;

const PORTAL_HEIGHT = (PORTAL_UV.v1 - PORTAL_UV.v0) * PAGE_HEIGHT;

// 在材質的 fragment shader 尾端加入 portal：UV 落在 PORTAL_UV 範圍內的像素，
// 改以螢幕座標（gl_FragCoord / uRes）取樣另一章的 render target
function installPortal(material, chapterCtx, portalUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPortal = portalUniform;
    shader.uniforms.uRes = chapterCtx.resolution;
    shader.fragmentShader =
      `uniform sampler2D uPortal; uniform vec2 uRes;
` +
      shader.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
         if (vMapUv.x > ${PORTAL_UV.u0.toFixed(4)} && vMapUv.x < ${PORTAL_UV.u1.toFixed(4)} && vMapUv.y > ${PORTAL_UV.v0.toFixed(4)} && vMapUv.y < ${PORTAL_UV.v1.toFixed(4)})
           gl_FragColor = vec4(texture2D(uPortal, gl_FragCoord.xy / uRes).rgb, 1.0);`,
      );
  };
}
// 建立書本場景。options = { portal: 章節 id, leaves: [[正面貼圖, 反面貼圖], …], plate: 插畫頁貼圖, end?: { blockTop } }。
// 回傳 { scene, camera, leaves, book, setCover(angle), lamp: {value}, update(time) }。
// 有 end 時為結尾版本：整本書左右鏡射、改用封底貼圖。

// 內插兩個鏡頭姿態 {target, dist, polar, az, roll}，結果寫入 out；dist 以對數（等比）方式內插
function lerpPose(from, to, mix, out) {
  out.target.lerpVectors(from.target, to.target, mix);
  out.dist = from.dist * Math.pow(to.dist / from.dist, mix);
  out.polar = from.polar + (to.polar - from.polar) * mix;
  out.az = from.az + (to.az - from.az) * mix;
  out.roll = from.roll + (to.roll - from.roll) * mix;
  return out;
}
// 由姿態的 polar / az 算出「目標指向鏡頭」的方向向量與對應的 up 向量

// 由姿態的 polar / az 算出「目標指向鏡頭」的方向向量與對應的 up 向量
function poseAxes(pose, outDir, outUp) {
  const sinPolar = Math.sin(pose.polar);
  const cosPolar = Math.cos(pose.polar);
  const sinAz = Math.sin(pose.az);
  const cosAz = Math.cos(pose.az);
  outDir.set(sinPolar * sinAz, cosPolar, sinPolar * cosAz);
  outUp.set(-cosPolar * sinAz, sinPolar, -cosPolar * cosAz);
}
// 把鏡頭放在 target 沿 dir 距離 dist 處，看向 target，再繞視線軸轉 roll

// 把鏡頭放在 target 沿 dir 距離 dist 處，看向 target，再繞視線軸轉 roll
function placeCamera(camera, target, dir, up, dist, roll) {
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.up.copy(up);
  camera.lookAt(target);
  camera.rotateZ(roll);
}
// 把姿態 {target, dist, polar, az, roll} 套用到鏡頭（球座標：polar 自 +y 起算，az 繞 y 軸）

// 把姿態 {target, dist, polar, az, roll} 套用到鏡頭（球座標：polar 自 +y 起算，az 繞 y 軸）
function applyPose(camera, pose) {
  const sinPolar = Math.sin(pose.polar);
  const cosPolar = Math.cos(pose.polar);
  const sinAz = Math.sin(pose.az);
  const cosAz = Math.cos(pose.az);
  camera.position.set(
    pose.target.x + sinPolar * sinAz * pose.dist,
    pose.target.y + cosPolar * pose.dist,
    pose.target.z + sinPolar * cosAz * pose.dist,
  );
  camera.up.set(-cosPolar * sinAz, sinPolar, -cosPolar * cosAz);
  camera.lookAt(pose.target);
  camera.rotateZ(pose.roll);
}
// 正對插畫頁、鏡頭 roll 為給定角度時，讓 portal 畫框蓋滿整個畫面所需的鏡頭距離；fill < 1 表示再靠近一點留餘裕

// 正對插畫頁、鏡頭 roll 為給定角度時，讓 portal 畫框蓋滿整個畫面所需的鏡頭距離；fill < 1 表示再靠近一點留餘裕
function portalFillDistance(camera, aspect, roll, fill = 0.94) {
  const tanHalfFov = Math.tan(MathUtils.degToRad(camera.fov / 2));
  const cosRoll = Math.abs(Math.cos(roll));
  const sinRoll = Math.abs(Math.sin(roll));
  const extentAcross = tanHalfFov * aspect * cosRoll + tanHalfFov * sinRoll;
  const extentAlong = tanHalfFov * aspect * sinRoll + tanHalfFov * cosRoll;
  return (
    fill *
    Math.min(PORTAL_WIDTH / 2 / extentAcross, PORTAL_HEIGHT / 2 / extentAlong)
  );
}
// 畫面比 referenceAspect 窄時，把鏡頭距離放大的倍率（不小於 1）

// 畫面比 referenceAspect 窄時，把鏡頭距離放大的倍率（不小於 1）
function aspectDistanceScale(aspect, referenceAspect = 1.35) {
  return Math.max(1, Math.pow(referenceAspect / aspect, 0.78));
}

export {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PORTAL_UV,
  PORTAL_WIDTH,
  PORTAL_HEIGHT,
  installPortal,
  lerpPose,
  poseAxes,
  placeCamera,
  applyPose,
  portalFillDistance,
  aspectDistanceScale,
};
