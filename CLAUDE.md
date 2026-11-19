# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 專案是什麼

《經濟學人》The World Ahead 2027 封面（117 個圖案）的 3D 捲動故事。原本是 `world-ahead-2027-site`（Vite + Three.js），這裡改寫成 Next.js 16（App Router）＋ TypeScript，重點是伺服器端渲染的文字內容與 SEO。程式註解、UI 文字、文件一律是繁體中文，新寫的也照這個慣例。

Next.js 是 16.4 版，API 和慣例可能和訓練資料不同：寫 Next 相關程式之前先讀 `node_modules/next/dist/docs/` 裡對應的說明。

## 指令

```sh
npm run dev              # http://localhost:3000；?ch=<章 id>&t=<0–1> 把畫面固定在某一章的某個進度
npm run build            # 先跑 build:captions，再 next build
npm run typecheck        # 寬鬆檢查全部（tsconfig.json）＋ 嚴格檢查網站程式（scripts/typecheck-strict.ts）
npm run build:captions   # 改了章節旁白之後要重跑，重新產生 data/captions.json
```

沒有測試、也沒有 lint。腳本是 `.ts`，用 Node 22.18+ 直接執行（型別剝除），不需要 tsx/ts-node。

## 型別檢查的兩層

- `tsconfig.json` 其實是**寬鬆**設定（`strict: false`、`noImplicitAny: false`），涵蓋全部程式，包含 `engine/`。（README 提到的 `tsconfig.loose.json` 並不存在。）
- `tsconfig.strict.json` 是嚴格設定；`scripts/typecheck-strict.ts` 只把 `app/`、`components/`、`lib/`、`scripts/` 的錯誤算失敗，`engine/` 的嚴格錯誤只列數量。新寫的網站程式要通過嚴格檢查；`engine/` 是從 JavaScript 搬來的，參數多半沒型別，維持現狀即可。

## 架構

兩個世界，靠固定的 DOM id 與資料檔接起來：

**伺服器端（`app/`、`lib/`、`components/`）**：所有頁面都是伺服器元件、建置時預先渲染。首頁 `app/page.tsx` 畫面上沒有可見文字，但把整段故事的文字版（每章旁白、117 個圖案的解讀）視覺隱藏地渲染進 HTML，給螢幕閱讀器與搜尋引擎。`/story`、`/elements`、`/elements/[id]` 是閱讀頁。內容全部經由 `lib/content.ts` 讀 `engine/data/*.json`、`data/cover/*.json`、`data/captions.json`。`lib/site.ts` 管網址與索引開關：**索引預設關閉**，部署時設 `SITE_INDEXABLE=true` 與 `NEXT_PUBLIC_SITE_URL` 才開放。

**客戶端引擎（`engine/`）**：只在瀏覽器執行（WebGL、Web Audio、捲動）。`components/Experience.tsx`（客戶端元件）在模組一執行就 `import("@/engine/main")`，不等 React 水合；引擎是載入即啟動的單例，依賴 `#view`（canvas）、`#scroll`、`#hint`、`#captions`、`#story` 這些伺服器端已渲染的元素。因此 `next.config.ts` 關掉了 `reactStrictMode`（開發模式 effect 跑兩次會建出兩份引擎）。

引擎內部：
- `engine/data/chapters.json` 是章節清單（順序、id、標題、長度、`pace` 節奏範本、涵蓋的圖案編號）。
- 每章有兩個模組：`engine/chapters/<id>.ts` 是 2D 封面平面版（canvas 繪製、旁白 `pacedCaptions(...)`、`build()`），`engine/sets/<id>.ts` 是專屬 3D 場景（有 set 的章用它當畫面）。沒有模組的章會出現佔位場景。
- `engine/registry.ts` 明列所有章節與場景的動態 import（取代原本 Vite 的 `import.meta.glob`）——**新增章節或場景時必須在這裡加一行**。
- `engine/pace.ts` 定義節奏範本（節拍時間點），章節檔頂端的註解會寫出每個節拍對應的畫面與音效，修改時保持註解同步。
- `engine/shared/world/` 是 canvas 2D 繪圖元件庫，座標單位是封面像素（原圖 1110×1475），顏色只用 `space.ts` 的 `RED`、`DARK_RED`、`BLACK`、`WHITE`；細節見該資料夾的 README（其中提到的 `.js`、`/kit.html` 是原專案的東西）。`shared/set/` 是 3D 場景的建模工具，`shared/desk/` 是書桌場景。
- 預熱分兩段（`main.ts` 的 `prewarm`／`ensurePrewarmed`）；各階段耗時在 `window.__loadTimes`。`?share=<mode>` 是分享圖／影片的拍攝模式。
- 章節是 lazy 建構的（`main.ts` 的 `buildChapter`／`manageChapters`）：開場只建起點附近的章，其他章在空閒時建；手機（`deviceTier.lowMemory`）只保留目前章附近的章，遠的整章卸載、GPU 資源只讓附近常駐（`updateResidency`），捲回來重建——所以章節的 `build()` 必須可重複執行、結果一致（用固定種子的亂數）。終章的封面由 `bakeWorldLazily` 另外逐章建平面版來烘。`?flat`、`?only`、`?placeholders`、分享模式仍一次全建。

**旁白的資料流**：旁白寫在 `engine/chapters/*.ts` 的 `captions: pacedCaptions("<名稱>", [ ... ])` 字串陣列裡；`scripts/extract-captions.ts` 用正規表達式把它抽到 `data/captions.json` 供伺服器端頁面使用。改寫旁白時保持這個字面格式（純字串陣列），否則抽不到。

## 驗證 3D 場景

原專案的視覺驗證工具（`scripts/shot.mjs`、`sweep.mjs`、`camera-check.mjs`、`kit-check.mjs`、`/kit.html`、`/figures.html`）綁定 Vite 開發伺服器，沒有搬過來；改動 3D 場景時仍在 `../world-ahead-2027-site/` 用那些工具驗證。在這裡可用 `?ch=&t=` 固定畫面檢查。

## 其他

- `data/cover/` 複製自 `../world-ahead-2027/`，以 `@cover/*` 別名匯入；封面圖在 `public/cover/`（長期快取）。
- `@/*` 指向專案根目錄。
