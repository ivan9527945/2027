// 節奏範本：原作每一章的長度、進場轉場、字幕時間窗、音效時點與動作節拍。
// 新章節不自己決定節奏，而是選一個範本照著走：字幕幾句、各在什麼時候出現、重點動作落在哪個進度。
// 數值與節拍（beats）整理自原作每一章的時間軸。
// 原作多數章節用翻頁轉場（長度 1.3）。這裡的 page 是同樣長度、同樣方向與斜率的斜線擦除：
// 一道墨線從右往左掃過，不做紙張捲起的立體效果。

const PAGE = { kind: "page", length: 1.3 };

export const PACE = {
  // 開場：書打開、翻三頁、俯衝進插畫（portal），下一章硬切
  book: {
    duration: 3.5,
    enter: null,
    captions: [[0.1, 0.3], [0.3, 0.47], [0.47, 0.64]], // 原作這一章沒有字幕，文字在書頁上；這三段是封面張開與翻頁的時間
    cues: [],
    beats: { open: [0.1, 0.3], pages: [0.3, 0.64], cameraSettle: 0.62, dive: [0.62, 1], gradeBlend: [0.8, 1] },
  },
  // 一個連續的長鏡頭，由遠到近；兩句字幕
  city: {
    duration: 2.5,
    enter: { kind: "cut" },
    captions: [[0.06, 0.4], [0.5, 0.86]],
    cues: [],
    beats: { move: [0, 1] }, // 路徑參數 = 85% easeInOutCubic + 15% 線性
  },
  // 動作最多的一章：走路 → 0.40 突發事件 → 連續三個結果
  street: {
    duration: 3.5,
    enter: PAGE,
    captions: [[0.02, 0.15], [0.17, 0.31], [0.53, 0.65], [0.65, 0.77], [0.81, 0.96]],
    cues: [0.4],
    beats: { walk: [0, 0.27], closeUp: [0.27, 0.4], rush: 0.4, chase: [0.41, 0.62], impact: [0.458, 0.474], aftermath: [0.6, 0.77], exit: [0.74, 1] },
  },
  // 安靜的特寫：慢慢靠近、上搖、推近，0.78 硬切到大特寫
  matches: {
    duration: 2.5,
    enter: PAGE,
    captions: [[0.04, 0.2], [0.21, 0.37], [0.52, 0.74]],
    cues: [],
    beats: { approach: [-0.4, 0.3], tilt: [0.3, 0.5], pushIn: [0.45, 0.78], cutToDetail: 0.78 },
  },
  // 橫移 → 甩鏡換場景 → 逐步靠近 → 結尾舉起下一章要用的東西
  corner: {
    duration: 3,
    enter: PAGE,
    captions: [[0.03, 0.25], [0.38, 0.56], [0.6, 0.75], [0.79, 0.97]],
    cues: [],
    beats: { pan: [-0.2, 0.3], whip: [0.27, 0.37], settle: [0.33, 0.58], pushIn: [0.56, 0.72], detail: [0.76, 0.86], raise: [0.84, 0.95] },
  },
  // 幻象型：0.05 觸發 → 幻象浮現 → 0.74 消失 → 回到現實
  stove: {
    duration: 3,
    enter: { kind: "ink", length: 0.8 },
    captions: [[0.15, 0.31], [0.37, 0.57], [0.6, 0.76], [0.81, 0.97]],
    cues: [0.05, 0.74],
    beats: { strike: 0.05, flash: [0.05, 0.14], appear: [0.28, 0.42], pullBack: [0.3, 0.46], act: [0.6, 0.7], out: 0.74, vanish: [0.735, 0.765], back: [0.76, 0.86] },
  },
  // 幻象型加一段角色動作：觸發 → 揭露 → 角色動起來走向鏡頭 → 0.80 消失
  goose: {
    duration: 3.5,
    enter: PAGE,
    captions: [[0.1, 0.25], [0.28, 0.46], [0.5, 0.72], [0.84, 0.98]],
    cues: [0.05, 0.8],
    beats: { strike: 0.05, reveal: [0.08, 0.3], pushIn: [0.12, 0.46], rise: [0.46, 0.49], jump: [0.515, 0.575], land: [0.575, 0.64], walk: [0.6, 0.79], out: 0.8, close: [0.795, 0.835], back: [0.8, 0.98] },
  },
  // 由下往上長出來 → 鏡頭沿著上升 → 0.55 消失、粒子升空 → 一顆流星
  tree: {
    duration: 3.5,
    enter: PAGE,
    captions: [[0.12, 0.3], [0.33, 0.5], [0.54, 0.72], [0.76, 0.88], [0.9, 1.04]],
    cues: [0.035, 0.55],
    beats: { strike: 0.035, grow: [0.08, 0.36], climb: [0.12, 0.56], out: 0.55, dissolve: [0.55, 0.66], rise: [0.55, 0.84], streak: [0.77, 0.97] },
  },
  // 高潮：兩次觸發，第二次（0.445）之後畫面閃白、換到另一個尺度
  grandmother: {
    duration: 4,
    enter: PAGE,
    captions: [[0.07, 0.22], [0.235, 0.345], [0.35, 0.47], [0.485, 0.6], [0.62, 0.78], [0.84, 1.02]],
    cues: [0.035, 0.445],
    beats: { strike: 0.035, appear: [0.07, 0.19], closeUp: [0.26, 0.33], lookUp: [0.37, 0.44], strike2: 0.445, flash: [0.445, 0.57], swap: 0.505, ascend: [0.52, 1], pullBack: [0.58, 0.78], transform: [0.6, 0.94], silhouette: [0.845, 0.885] },
  },
  // 餘韻：貼近 → 退後看全身 → 旁人進場 → 退到遠處
  morning: {
    duration: 3,
    enter: { kind: "cut" },
    captions: [[0.05, 0.27], [0.32, 0.5], [0.55, 0.73]],
    cues: [],
    beats: { close: [0, 0.16], pullBack: [0.16, 0.42], others: [0.42, 0.72], wide: [0.42, 0.7], drift: [0.7, 1.45] },
  },
  // 收尾：從畫面拉出（portal）、一句話、闔上、燈暗
  close: {
    duration: 3,
    enter: { kind: "cut" },
    captions: [[0.3, 0.58]],
    cues: [],
    beats: { pullOut: [0, 0.4], gradeBlend: [0, 0.3], retreat: [0.46, 0.96], shut: [0.56, 0.8], settle: [0.8, 0.86], dim: [0.85, 1] },
  },
};

/**
 * 把字幕文字套進範本的時間窗。句數必須和範本一樣，多一句少一句都會丟錯。
 * @param {keyof PACE} name
 * @param {string[]} texts
 */
export function pacedCaptions(name, texts) {
  const windows = PACE[name].captions;
  if (texts.length !== windows.length) throw new Error(`節奏範本 ${name} 要 ${windows.length} 句字幕，給了 ${texts.length} 句`);
  return windows.map(([from, to], i) => ({ from, to, text: texts[i] }));
}

/** 把音效名稱套進範本的音效時點。 */
export function pacedCues(name, cueNames) {
  const times = PACE[name].cues;
  if (cueNames.length !== times.length) throw new Error(`節奏範本 ${name} 有 ${times.length} 個音效時點，給了 ${cueNames.length} 個`);
  return times.map((at, i) => ({ at, cue: cueNames[i] }));
}

/** 原作 city 章的鏡頭緩動：85% easeInOutCubic + 15% 線性。 */
export const cityEase = (t) => 0.85 * (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) + 0.15 * t;
