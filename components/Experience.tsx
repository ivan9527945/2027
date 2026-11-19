"use client";
// 捲動的 3D 故事。引擎（engine/main.ts）只能在瀏覽器裡跑（WebGL、Web Audio、捲動），
// 所以在元件掛上之後才動態載入；伺服器端只渲染外殼和純文字版（children）。
// 引擎是載入就啟動的單例，依賴下面這幾個固定 id 的元素。
import { useEffect, type ReactNode } from "react";
import Loader from "./Loader";

// 在瀏覽器裡，這個模組一被執行就開始下載並啟動引擎，不等 React 水合（hydration）完成：
// 引擎需要的元素（canvas、#scroll…）伺服器端已經渲染在 HTML 裡了。伺服器端不執行（沒有 window）。
let started = false;
function startEngine() {
  if (started || typeof window === "undefined") return;
  started = true;
  void import("@/engine/main");
}
startEngine();

export default function Experience({ children }: { children: ReactNode }) {
  useEffect(startEngine, []); // 保險：模組先於 DOM 執行的極端情況下，掛上之後再啟動一次（只會啟動一次）
  return (
    <>
      <Loader />
      <canvas id="view" aria-hidden="true" />
      <div id="scroll" />
      <div className="scroll-hint" id="hint" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path className="line" d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {/* 引擎會往字幕容器裡加元素。引擎在 React 水合之前就啟動，手機 CPU 慢時會比水合先改到 DOM；
          用 dangerouslySetInnerHTML 讓 React 不比對它的子節點，否則水合失敗、React 重建整個 body，
          引擎手上的 canvas 就脫離頁面，畫面永遠停在載入中（2026-11-19 實測 CPU 降速 4 倍時發生）。 */}
      <div className="captions" id="captions" aria-live="off" dangerouslySetInnerHTML={{ __html: "" }} />
      {/* 量測 100lvh 的探針：由伺服器端渲染，引擎不必自己往 body 加元素（理由同上） */}
      <div className="lvh-probe" id="lvh-probe" aria-hidden="true" />
      {children}
    </>
  );
}
