// 各章的聲音腳本：環境音隨劇情進度漸變，音效在事件發生的時點觸發。
// 2026-11-19 使用者要求「每個劇情都要有相對應的合適音效，例如轟炸就要有轟炸聲」。
//
//   const track = soundTrack([[0, { wind: 0.3 }], [0.5, { fire: 0.4 }]]);
//   回傳的章節物件寫 sound: track.sound，update 裡呼叫 track.update(progress)。
//   兩個時點之間每一軌各自線性內插；某一格沒寫到的軌音量是 0。
// 名稱必須是 audio-synth.js 裡的 LOOP_NAMES（環境音）與 CUE_NAMES（音效）。
/** @param {Array<[number, Record<string, number>]>} steps 依進度排序 */
export function soundTrack(steps: Array<[number, Record<string, number>]>) {
  const names = [...new Set(steps.flatMap(([, levels]) => Object.keys(levels)))];
  const sound = {};
  const update = (progress) => {
    let i = 0;
    while (i < steps.length - 1 && progress >= steps[i + 1][0]) i++;
    const [t0, a] = steps[i];
    const [t1, b] = steps[Math.min(i + 1, steps.length - 1)];
    const k = t1 > t0 ? Math.min(1, Math.max(0, (progress - t0) / (t1 - t0))) : 0;
    for (const name of names) sound[name] = (a[name] ?? 0) + ((b[name] ?? 0) - (a[name] ?? 0)) * k;
  };
  update(0);
  return { sound, update };
}

/** 依時間排序並合併幾組音效時點 */
export const cueList = (...groups) => groups.flat().sort((a, b) => a.at - b.at);
