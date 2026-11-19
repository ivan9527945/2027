import { MathUtils, Vector3 } from "three";

// ---- 來自 shared/c-girl.js ----

// 依畫面比例調整相機 fov：aspect >= minAspect 時直接用 baseFov（度）；
// 較窄的畫面則把 tan(fov/2) 乘上 (minAspect/aspect)^0.85 放寬視野，上限 88 度。回傳設定後的 fov。
function fitFov(camera, baseFov, aspect, minAspect = 1.25) {
  if (aspect >= minAspect) {
    return (camera.fov = baseFov);
  }
  const widenedTan =
    Math.tan(MathUtils.degToRad(baseFov / 2)) *
    Math.pow(minAspect / aspect, 0.85);
  camera.fov = Math.min(88, MathUtils.radToDeg(2 * Math.atan(widenedTan)));
  return camera.fov;
}
// toonMaterial 的可淡出版本：多一個 uFade uniform（0–1），最後輸出顏色乘上它。

// ---- 來自 shared/d-fx.js ----

// 鏡頭軌道：把 [{t, pos, at, fov, roll}] 關鍵格變成「依時間」的平滑曲線。回傳 (time) => { pos, at, fov, roll }。
//
// 2026-11-19 改寫（使用者回饋：轉場卡、視角忽近忽遠）。舊版每一段各自做 smoothstep 緩動，
// 所以鏡頭在每個關鍵格都減速到四成再加速，看起來一頓一頓的；而且 Catmull-Rom 曲線會衝過關鍵格再折回來，
// 遠近就忽前忽後。新版：
// - 每個分量（x、y、z、fov、roll）各自用三次 Hermite 曲線，以「時間」為參數，經過關鍵格時速度連續，不會停頓；
// - 切線用 Fritsch–Carlson 的單調做法：前後兩段方向相反（例如先推近再拉遠）時，那個關鍵格的切線設成 0，
//   曲線不會衝過關鍵格，所以不會出現多出來的一推一拉；
// - 第一格之前、最後一格之後停在端點。
// 回傳的 pos / at 是重複使用的同一組 Vector3。
function makeCameraTrack(rawKeyframes) {
  const keyframes = softenZoomSwings(rawKeyframes);
  const times = keyframes.map((key) => key.t);
  const channels = [
    ...[0, 1, 2].map((axis) => keyframes.map((key) => key.pos[axis])),
    ...[0, 1, 2].map((axis) => keyframes.map((key) => key.at[axis])),
    keyframes.map((key) => key.fov),
    keyframes.map((key) => key.roll ?? 0),
  ];
  const n = keyframes.length;
  const tangents = channels.map((values) => {
    const slope = (i) => (values[i + 1] - values[i]) / Math.max(1e-6, times[i + 1] - times[i]);
    const m = new Array(n).fill(0);
    if (n < 2) return m;
    m[0] = slope(0);
    m[n - 1] = slope(n - 2);
    for (let i = 1; i < n - 1; i++) {
      const a = slope(i - 1), b = slope(i);
      m[i] = a * b <= 0 ? 0 : (a + b) / 2;
    }
    // Fritsch–Carlson：切線太大時縮回來，保證每一段單調、不衝過端點
    for (let i = 0; i < n - 1; i++) {
      const d = slope(i);
      if (Math.abs(d) < 1e-9) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d, b = m[i + 1] / d;
      const r = a * a + b * b;
      if (r > 9) { const k = 3 / Math.sqrt(r); m[i] = k * a * d; m[i + 1] = k * b * d; }
    }
    return m;
  });
  const out = new Array(channels.length).fill(0);
  const posOut = new Vector3();
  const atOut = new Vector3();
  return (time) => {
    if (n === 1 || time <= times[0]) for (let c = 0; c < channels.length; c++) out[c] = channels[c][0];
    else if (time >= times[n - 1]) for (let c = 0; c < channels.length; c++) out[c] = channels[c][n - 1];
    else {
      let i = 0;
      while (i < n - 2 && time > times[i + 1]) i++;
      const h = times[i + 1] - times[i];
      const s = (time - times[i]) / h;
      const s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      for (let c = 0; c < channels.length; c++) {
        const v = channels[c], m = tangents[c];
        out[c] = h00 * v[i] + h10 * h * m[i] + h01 * v[i + 1] + h11 * h * m[i + 1];
      }
    }
    posOut.set(out[0], out[1], out[2]);
    atOut.set(out[3], out[4], out[5]);
    return { pos: posOut, at: atOut, fov: out[6], roll: out[7] };
  };
}
// 把「推近、拉遠、再推近」的鋸齒收斂一些：某個關鍵格的鏡頭距離如果比前後兩格都近（或都遠），
// 就把它往前後兩格的平均（取對數）拉回三成。注視點和方向不動，只改距離；連續的停格（距離相同）不受影響。
function softenZoomSwings(keyframes, amount = 0.3) {
  if (keyframes.length < 3) return keyframes;
  const dist = (k) => Math.hypot(k.pos[0] - k.at[0], k.pos[1] - k.at[1], k.pos[2] - k.at[2]) || 1e-6;
  const logs = keyframes.map((k) => Math.log(dist(k)));
  return keyframes.map((key, i) => {
    if (i === 0 || i === keyframes.length - 1) return key;
    const a = logs[i - 1], b = logs[i + 1], c = logs[i];
    const isPeak = (c - a) * (c - b) > 0 && Math.abs(c - a) > 0.05 && Math.abs(c - b) > 0.05;
    if (!isPeak) return key;
    const target = c + ((a + b) / 2 - c) * amount;
    const k = Math.exp(target - c);
    return { ...key, pos: key.pos.map((p, axis) => key.at[axis] + (p - key.at[axis]) * k) };
  });
}

function applyCameraShot(camera, shot, aspect, pointer, parallax = 0.04) {
  (camera.userData.focus ??= new Vector3()).copy(shot.at); // 量測工具用：鏡頭看著的點
  camera.position.copy(shot.pos);
  if (pointer) {
    camera.position.x += pointer.x * parallax;
    camera.position.y += pointer.y * parallax * 0.6;
  }
  camera.up.set(Math.sin(shot.roll), Math.cos(shot.roll), 0);
  camera.lookAt(shot.at);
  camera.fov = widenFovForNarrowAspect(shot.fov, aspect);
  camera.updateProjectionMatrix();
}
// 畫面比 refAspect（1.25）更窄時把 fov 加大，讓直式螢幕仍看得到兩側；上限 100 度。

// 畫面比 refAspect（1.25）更窄時把 fov 加大，讓直式螢幕仍看得到兩側；上限 100 度。
function widenFovForNarrowAspect(fov, aspect, refAspect = 1.25) {
  if (aspect >= refAspect) {
    return fov;
  }
  const widen = Math.pow(refAspect / aspect, 0.62);
  return Math.min(
    100,
    (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * widen) * 180) / Math.PI,
  );
}

export { fitFov, makeCameraTrack, applyCameraShot, widenFovForNarrowAspect };
