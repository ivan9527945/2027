import { ImageResponse } from "next/og";

// 分享到社群時的預覽圖（1200×630）：紙白底、一隻眼睛、大大的 2027。
// 預覽圖的產生器沒有中文字型，所以圖上只用拉丁字母與數字。
export const alt = "2027 — The World Ahead 2027";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f2efe6", gap: 56 }}>
        <svg width="300" height="300" viewBox="0 0 64 64">
          <path d="M3 32C12 17 22 11 32 11C42 11 52 17 61 32C52 47 42 53 32 53C22 53 12 47 3 32Z" fill="#f2efe6" stroke="#050505" strokeWidth="5" strokeLinejoin="round" />
          <circle cx="32" cy="32" r="14" fill="#050505" />
          <circle cx="32" cy="32" r="5.5" fill="#c8281e" />
          <circle cx="37.5" cy="26.5" r="3.2" fill="#f2efe6" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 220, fontWeight: 700, color: "#050505", lineHeight: 1 }}>2027</div>
          <div style={{ fontSize: 40, color: "#c8281e", letterSpacing: 6, marginTop: 12 }}>THE WORLD AHEAD</div>
        </div>
      </div>
    ),
    size,
  );
}
