# world-2027

`world-ahead-2027-site`（Vite + Three.js）改寫成 **Next.js 16（App Router）＋ TypeScript** 的版本：伺服器端渲染（SSR／建置時預先渲染）加上 SEO。
3D 捲動故事本身沒變，引擎在 `engine/`，只在瀏覽器裡載入。

## 指令

```sh
npm install
npm run dev          # http://localhost:3000（?ch=<章 id>&t=<0–1> 可直接跳到某一章）
npm run build        # 先抽出旁白（build:captions），再 next build
npm start            # 執行建置結果
npm run typecheck    # tsc --noEmit
```

## 結構

- `app/`：頁面（伺服器元件）。
  - `page.tsx`：首頁＝3D 故事。畫面上沒有任何可見文字；整段故事的文字版（每章旁白、117 個圖案的解讀）在伺服器端渲染進 HTML（視覺上隱藏，給螢幕閱讀器與搜尋引擎），並連到下面兩個閱讀頁。
  - `story/page.tsx`：文字版（16 段劇情、2027 推測、流言查核、分析的限制）。
  - `elements/page.tsx`、`elements/[id]/page.tsx`：117 個圖案的總表與各自的頁面（建置時全部預先渲染）。
  - `layout.tsx`：中繼資料（title 範本、description、Open Graph、Twitter、canonical、robots）、字型（next/font 自行託管 Noto Serif TC）、WebSite 結構化資料。
  - `sitemap.ts`、`robots.ts`、`manifest.ts`、`opengraph-image.tsx`（分享預覽圖）、`icon.svg`、`apple-icon.png`、`not-found.tsx`。
- `components/Experience.tsx`：客戶端元件，掛上之後動態載入 `engine/main.ts`；引擎依賴 `#view`、`#scroll`、`#hint`、`#captions`、`#story` 這幾個元素。
- `engine/`：3D 引擎（原 `src/`，改成 `.ts`）。和原專案的差異：`import.meta.glob` 改成 `engine/registry.ts` 明列章節與場景；`?raw` 的 GLSL 改成字串模組；封面圖改放 `public/cover/`。
- `lib/site.ts`：網址（`NEXT_PUBLIC_SITE_URL`）、名稱、說明、是否允許索引（`SITE_INDEXABLE`）。`lib/content.ts`：給伺服器端頁面用的內容。
- `data/cover/`：封面清單與 0/1 座標（複製自 `../world-ahead-2027/`，用 `@cover/` 匯入）；`data/captions.json`：從章節檔抽出的旁白（`npm run build:captions` 產生）。

## SEO

- 所有頁面都在伺服器端渲染，不執行 JavaScript 也看得到完整文字內容。
- 每頁都有自己的 title、description、canonical、Open Graph；圖案頁的 title／description 由該圖案的解讀產生。
- 結構化資料（JSON-LD）：WebSite、CreativeWork（首頁，含 16 段的 hasPart）、Article（文字版）、ItemList（圖案總表）、DefinedTerm（各圖案）、BreadcrumbList。
- `sitemap.xml` 列出全部 120 頁；`robots.txt` 與 `<meta name="robots">` 由 `SITE_INDEXABLE` 控制。
- **索引預設關閉**：要開放時，部署環境設 `SITE_INDEXABLE=true` 與正式網址 `NEXT_PUBLIC_SITE_URL`。

## 型別

`tsconfig.json` 是嚴格模式。`app/`、`components/`、`lib/`、`scripts/` 都通過嚴格檢查；`engine/` 是從 JavaScript 搬過來的，目前以較寬鬆的 `tsconfig.loose.json` 檢查（不檢查隱含的 any 與 null）。

## 沒有搬過來的

原專案的開發工具（`scripts/shot.mjs`、`sweep.mjs`、`camera-check.mjs`、`kit-check.mjs`、`/kit.html`、`/figures.html` 等）綁定 Vite 的開發伺服器，這裡沒有搬；改動 3D 場景時仍在 `world-ahead-2027-site/` 用那些工具驗證。

## 載入

- 開頁先出現 `components/Loader.tsx` 的過場（伺服器端渲染、純 CSS 動畫，JavaScript 還沒下載完就看得到）；引擎準備好時（`body.ready`）眼睛推近、從瞳孔撐開淡出。
- 引擎在客戶端元件模組一執行就開始下載（不等 React 水合）。
- 預熱分兩段（`engine/main.ts` 的 `prewarm`）：開場會看到的章先做完就開始，其他章在瀏覽器空閒時一章一章做，終章的封面烘焙排最後；捲得比背景預熱快時，畫那一章之前會先補做（`ensurePrewarmed`）。
- 各階段耗時：`window.__loadTimes`。
# 2027
