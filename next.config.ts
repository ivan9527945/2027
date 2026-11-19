import type { NextConfig } from "next";

// Next.js 設定。
// - reactStrictMode 關閉：WebGL 引擎（engine/main.ts）是載入就啟動的單例，開發模式下 effect 跑兩次會建立兩份。
// - 封面清單的 JSON 用 @cover 別名（tsconfig.json 的 paths）。
const nextConfig: NextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  async headers() {
    return [
      // 封面圖可以長時間快取
      { source: "/cover/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
