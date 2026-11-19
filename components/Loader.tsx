// 載入的過場（2026-11-19 使用者要求「添加過場 loading 特效」）。沒有文字，只有一隻版畫風格的眼睛：
//   載入中：眼眶的線一筆一筆畫出來、十二道光芒依序亮起又暗下，眼睛偶爾眨一下；
//   載入完成（引擎在 body 加上 .ready）：眼睛睜開、瞳孔放大，整個畫面從瞳孔撐開淡出，露出 3D 故事。
// 伺服器端就渲染好、只靠 CSS 動畫，所以在 JavaScript 下載完成之前就會出現（首次繪製就看得到）。
const RAYS = Array.from({ length: 12 }, (_, i) => i);

export default function Loader() {
  return (
    <div className="loader" aria-hidden="true">
      <svg className="loader-eye" viewBox="-60 -60 120 120">
        <g className="loader-rays">
          {RAYS.map((i) => (
            <line key={i} x1="0" y1="-38" x2="0" y2="-52" transform={`rotate(${i * 30})`} style={{ animationDelay: `${(i * 0.12).toFixed(2)}s` }} />
          ))}
        </g>
        <g className="loader-lid">
          <path className="loader-almond" d="M-34 0C-24 -16 -12 -22 0 -22C12 -22 24 -16 34 0C24 16 12 22 0 22C-12 22 -24 16 -34 0Z" />
          {/* 版畫的排線：眼皮上幾道短弧線 */}
          <path className="loader-hatch" d="M-22 -14Q0 -24 22 -14M-17 -19Q0 -27 17 -19M-22 14Q0 24 22 14" />
          <circle className="loader-iris" r="12" />
          <circle className="loader-pupil" r="4.5" />
          <circle className="loader-glint" cx="4.5" cy="-4.5" r="2.4" />
        </g>
      </svg>
    </div>
  );
}
