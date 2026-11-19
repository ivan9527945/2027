import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Noto_Serif_TC } from "next/font/google";
import JsonLd from "@/components/JsonLd";
import { INDEXABLE, LOCALE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

// 伺服器端渲染（SSR）：每一個請求都在伺服器上渲染出完整的 HTML（使用者要求）。
// 內容是固定的研究資料，若想改成建置時預先渲染（更快、可以放 CDN），把這行改成 "force-static" 即可。
export const dynamic = "force-dynamic";

// 字型：Noto Serif TC 由 next/font 在建置時下載並自行託管（執行時不向 Google 發請求、沒有版面跳動）。
// 中文字型很大，不預先載入。
const serif = Noto_Serif_TC({ weight: ["500", "600", "700"], subsets: ["latin"], preload: false, display: "swap", variable: "--font-serif" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // 瀏覽器頁籤只顯示「2027」（使用者要求）；搜尋結果與分享卡片用的描述性標題放在 Open Graph／Twitter
  title: { default: SITE_NAME, template: `%s｜${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["The World Ahead 2027", "經濟學人", "The Economist", "2027 預測", "封面解讀", "捲動敘事", "WebGL", "3D"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE_NAME, locale: LOCALE, url: "/", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: INDEXABLE
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } }
    : { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f2efe6",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" className={serif.variable}>
      <body>
        {children}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE_NAME,
            alternateName: SITE_TITLE,
            url: SITE_URL,
            inLanguage: "zh-Hant",
            description: SITE_DESCRIPTION,
          }}
        />
      </body>
    </html>
  );
}
