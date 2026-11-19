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
      <div className="captions" id="captions" aria-live="off" />
      {children}
    </>
  );
}
