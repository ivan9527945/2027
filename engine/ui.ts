// 純文字版：給螢幕閱讀器與沒有 WebGL 的情況（視覺上隱藏）。
// 先前的查看模式、索引面板與右上角的按鈕已依使用者要求移除；捲動流程裡沒有任何可見文字或互動元件。
import chapterPlan from "./data/chapters.json";
import { ALL_ELEMENT_IDS, elementInfo } from "./elements";

const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** @param {typeof window.__wa} api 引擎的除錯與控制物件 */
export function setupStoryText(api) {
  // Next.js 版：純文字版由伺服器端渲染（app/page.js），已經有內容就不再覆寫
  if (document.getElementById("story")?.childElementCount) return;
  const elements = ALL_ELEMENT_IDS.map((id) => {
    const info = elementInfo(id);
    return { id, name: info.label ?? info.name, reading: info.reading ?? "", level: info.level };
  });
  // ---- 純文字版：每一段的文字敘述，加上 117 個元素的解讀 ----
  const captions = api.captions;
  document.getElementById("story").innerHTML =
    `<h2>文字版</h2>` +
    chapterPlan.map((plan) => {
      const lines = captions.filter((c) => c.chapter === plan.id).map((c) => `<p>${esc(c.text)}</p>`).join("");
      return lines ? `<h3>${esc(plan.title)}</h3>${lines}` : "";
    }).join("") +
    `<h2>117 個元素</h2><ul>${elements.map((e) => `<li>#${e.id} ${esc(e.name)}：${esc(e.reading)}（信心：${esc(e.level ?? "—")}）</li>`).join("")}</ul>`;
}
