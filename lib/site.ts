// 網站層級的設定：網址、名稱、說明、是否允許搜尋引擎索引。
//
// 索引預設關閉。SEO 的設定（中繼資料、結構化資料、sitemap、伺服器端渲染的文字內容）都已做好，
// 要開放搜尋引擎索引時，部署環境設 SITE_INDEXABLE=true。
export const SITE_URL: string = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "2027";
export const SITE_TITLE = "2027：《經濟學人》The World Ahead 2027 封面的捲動故事";
export const SITE_DESCRIPTION =
  "把《經濟學人》The World Ahead 2027 封面上的 117 個圖案，做成一段可以捲動走過的 3D 故事：權力舞台、倒數、伊朗之後、太空與極地、法國、AI 的圓心、戰火，一直到世界的地板。附每個圖案的解讀、推測與可信度。";
export const INDEXABLE: boolean = process.env.SITE_INDEXABLE === "true";
export const LOCALE = "zh_TW";
