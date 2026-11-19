// 伺服器端用的內容：章節、旁白、117 個元素的解讀、推測與流言。
// 全部來自研究資料（engine/data/*.json、data/cover/*.json、data/captions.json），在建置時渲染成 HTML，
// 搜尋引擎與螢幕閱讀器不用執行 WebGL 也讀得到。
import chapterPlan from "@/engine/data/chapters.json";
import analysisData from "@/engine/data/analysis.json";
import captionData from "@/data/captions.json";
import { ALL_ELEMENT_IDS, elementInfo } from "@/engine/elements";

export interface ChapterPlan {
  id: string;
  title: string;
  duration: number;
  headline: string | null;
  elements: number[];
  pace: string;
}
export interface Chapter extends ChapterPlan {
  index: number;
  captions: string[];
}
export interface DualReading {
  item: string;
  ids: number[];
  a: string;
  b: string;
  settledBy: string;
}
export interface Prediction {
  id: string;
  tier: string;
  text: string;
  basis: string;
  basisIds?: number[];
  reason: string;
  falsifiedBy: string;
}
export interface Rumor {
  claim: string;
  verdict: string;
  reason: string;
}
export interface Element {
  id: number;
  name: string;
  region: string | null;
  detail: string | null;
  color: string | null;
  count: number;
  reading: string;
  level: string | null;
  dual: DualReading | null;
  chapter: Chapter | null;
  predictions: Prediction[];
}

interface Analysis {
  predictions: Prediction[];
  rumors: Rumor[];
  rejected: string[];
  limits: string[];
  dualReadings: DualReading[];
}
const analysis = analysisData as unknown as Analysis;
const captions = captionData as Record<string, string[]>;

export const chapters: Chapter[] = (chapterPlan as ChapterPlan[]).map((plan, index) => ({
  ...plan,
  index,
  captions: captions[plan.id] ?? [],
}));

export function element(id: number): Element {
  const info = elementInfo(id) as Record<string, unknown> & { dual: DualReading | null };
  const text = (key: string): string | null => (typeof info[key] === "string" ? (info[key] as string) : null);
  return {
    id,
    name: text("label") ?? text("name") ?? `#${id}`,
    region: text("region"),
    detail: text("detail"),
    color: text("color"),
    count: typeof info.count === "number" ? info.count : 1,
    reading: text("reading") ?? "",
    level: text("level") ?? text("confidence"),
    dual: info.dual ?? null,
    chapter: chapters.find((c) => c.elements.includes(id)) ?? null,
    predictions: analysis.predictions.filter((p) => p.basisIds?.includes(id)),
  };
}

export const elements: Element[] = (ALL_ELEMENT_IDS as number[]).map(element);
export const predictions = analysis.predictions;
export const rumors = analysis.rumors;
export const rejected = analysis.rejected;
export const limits = analysis.limits;
export const dualReadings = analysis.dualReadings;
export const elementById = (id: number): Element | undefined => elements.find((e) => e.id === id);
