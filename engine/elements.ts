// 元素登記：每個場景畫出封面清單裡的某一項時，呼叫 register(編號, 物件)。
// 標註層靠這份登記把 3D 物件對回清單與解讀；scripts/check-coverage.mjs 靠它確認 117 項沒有遺漏。
import inventory from "@cover/world-ahead-2027-cover-inventory.json";
import analysis from "./data/analysis.json";

const inventoryById = new Map();
for (const region of inventory.regions) for (const item of region.items) inventoryById.set(item.id, { ...item, region: region.region });
const analysisById = new Map(analysis.elements.map((e) => [e.id, e]));
const dualById = new Map();
for (const d of analysis.dualReadings) for (const id of d.ids) dualById.set(id, d);

/** 清單資料＋最終解讀＋（若有）保留的兩種讀法。內容衝突時以最終解讀為準。 */
export function elementInfo(id) {
  const item = inventoryById.get(id);
  if (!item) throw new Error(`封面清單沒有 #${id}`);
  return { ...item, ...analysisById.get(id), dual: dualById.get(id) ?? null };
}

export const ALL_ELEMENT_IDS = [...inventoryById.keys()].sort((a, b) => a - b);

/** 一章一份登記表。chapter.elements = registry.entries */
export function createRegistry(chapterId) {
  const entries = [];
  return {
    entries,
    /**
     * @param {number} id 清單編號
     * @param {import("three").Object3D} object 代表這個元素的物件（成群的元素傳群組）
     * @param {{count?: number}} [opts] count：實際畫出的數量，供覆蓋檢查比對清單
     */
    register(id, object, opts = {}) {
      elementInfo(id); // 編號不存在就丟錯
      object.userData.elementId = id;
      entries.push({ id, object, chapter: chapterId, ...opts });
      return object;
    },
  };
}
