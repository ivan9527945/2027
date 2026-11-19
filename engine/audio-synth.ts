// 程式合成的環境音與音效：不載入任何音檔，全部在瀏覽器裡用雜訊、正弦波、濾波器算出來。
//
// 環境音（LOOP_NAMES）是可以無縫循環的 4 秒緩衝。章節用 sound: { wind: 0.5, sea: 0.3 } 指定各軌音量（0–0.6），
// 引擎每一幀讀這個物件並在轉場時混合，所以章節可以在 update 裡改它（例如換場時從夜晚換成港口）。
// 音效（CUE_NAMES）用 cues: [{ at: 0.4, cue: "boom" }] 在進度往前經過 at 時觸發一次（倒著捲不會觸發）。
//
// 2026-11-19 使用者要求「每個劇情都要有相對應的音效，例如轟炸就要有轟炸聲」，接著要求整體「走陰森感」：
// 加了恐懼的低鳴、耳語、低沉的合唱、走音的音樂盒、金屬呻吟、靜電這幾種環境音，以及驚悚的一記、倒放的鈸、耳語、低頻重擊、喪鐘、走音的風鈴；
// 引擎另外把所有聲音送進一個長殘響（main.js 的 initAudio），並把高頻濾掉一些，聽起來像在空曠、陰暗的地方。
import { seededRandom } from "./core";

const LOOP_SECONDS = 4;
const TAU = Math.PI * 2;

// ---------- 基本工具 ----------
/** 一階低通，原地處理；k 越小越悶。 */
function lowpass(data, k) {
  let y = 0;
  for (let i = 0; i < data.length; i++) data[i] = y += (data[i] - y) * k;
  return data;
}
/** 一階高通（原訊號減掉低通） */
function highpass(data, k) {
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += (data[i] - y) * k;
    data[i] -= y;
  }
  return data;
}
function noise(length, seed) {
  const rand = seededRandom(seed);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  return data;
}
/** 把尾段疊回開頭，讓循環接點聽不出來。 */
function makeSeamless(data, fade) {
  const body = data.length - fade;
  const out = new Float32Array(body);
  for (let i = 0; i < body; i++) out[i] = data[i];
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = data[i] * t + data[body + i] * (1 - t);
  }
  return out;
}
function normalize(data, peak) {
  let max = 1e-6;
  for (const v of data) max = Math.max(max, Math.abs(v));
  for (let i = 0; i < data.length; i++) data[i] *= peak / max;
  return data;
}
/** 在 out 的 start 秒處疊上 src（乘上 gain） */
function mixIn(out, src, startSample, gain = 1) {
  for (let i = 0; i < src.length && startSample + i < out.length; i++) if (startSample + i >= 0) out[startSample + i] += src[i] * gain;
}
/** 循環用：超出結尾的部分繞回開頭疊上，循環時尾音不會被切斷 */
function mixWrap(out, src, startSample, gain = 1) {
  for (let i = 0; i < src.length; i++) out[(startSample + i) % out.length] += src[i] * gain;
}
/** 一段衰減的正弦（可以掃頻）：freq(t) 回傳頻率 */
function tone(rate, seconds, freq, decay = 4, attack = 0.005) {
  const out = new Float32Array(Math.floor(rate * seconds));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    phase += (TAU * (typeof freq === "function" ? freq(t) : freq)) / rate;
    out[i] = Math.sin(phase) * Math.min(1, t / attack) * Math.exp(-t * decay);
  }
  return out;
}
/** 一段濾過的雜訊爆發（敲擊、腳步、撞擊的「身體」） */
function burst(rate, seconds, seed, k = 0.2, decay = 30) {
  const out = noise(Math.floor(rate * seconds), seed);
  lowpass(out, k);
  for (let i = 0; i < out.length; i++) out[i] *= Math.exp((-i / rate) * decay);
  return out;
}
/** 循環用的空白緩衝，加一個可以無縫循環的起伏 */
const blank = (rate) => new Float32Array(rate * LOOP_SECONDS);

// ---------- 環境音（4 秒，無縫循環） ----------
const loops = {
  // 低沉的風：低通雜訊，音量慢速起伏
  wind(rate) {
    const fade = Math.floor(rate * 0.5);
    const out = makeSeamless(lowpass(lowpass(noise(rate * LOOP_SECONDS + fade, 11), 0.02), 0.05), fade);
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      out[i] *= 0.6 + 0.4 * Math.sin((TAU * t) / LOOP_SECONDS) * Math.sin((TAU * t * 3) / LOOP_SECONDS + 1);
    }
    return normalize(out, 0.8);
  },
  // 低頻持續音：整數週期，天然無縫
  drone(rate) {
    const out = blank(rate);
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      out[i] = Math.sin(TAU * 55 * t) * 0.5 + Math.sin(TAU * 82.5 * t) * 0.3 + Math.sin(TAU * 55.25 * t) * 0.35;
    }
    return normalize(out, 0.6);
  },
  // 鐘錶滴答：每秒一下，奇偶拍音高略不同
  tick(rate) {
    const out = blank(rate);
    for (let beat = 0; beat < LOOP_SECONDS; beat++) mixIn(out, tone(rate, 0.04, beat % 2 ? 1900 : 2400, 220), beat * rate);
    return normalize(out, 0.7);
  },
  // 火：悶的底噪加上隨機的爆裂聲
  fire(rate) {
    const fade = Math.floor(rate * 0.4);
    const out = makeSeamless(lowpass(noise(rate * LOOP_SECONDS + fade, 23), 0.08), fade);
    const rand = seededRandom(29);
    for (let n = 0; n < 60; n++) {
      const start = Math.floor(rand() * (out.length - 400)), amp = 0.5 + rand() * 2.5;
      for (let i = 0; i < 300; i++) out[start + i] += (rand() * 2 - 1) * amp * Math.exp(-i / 40);
    }
    return normalize(out, 0.8);
  },
  // 人群：帶通雜訊，音量不規則起伏（喊聲）
  crowd(rate) {
    const fade = Math.floor(rate * 0.5);
    const data = noise(rate * LOOP_SECONDS + fade, 37);
    const low = lowpass(Float32Array.from(data), 0.015);
    lowpass(data, 0.12);
    for (let i = 0; i < data.length; i++) data[i] -= low[i];
    const out = makeSeamless(data, fade);
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      out[i] *= 0.55 + 0.25 * Math.sin((TAU * t * 5) / LOOP_SECONDS) + 0.2 * Math.sin((TAU * t * 13) / LOOP_SECONDS + 2);
    }
    return normalize(out, 0.7);
  },
  // 海浪：兩次一進一退的浪（雜訊的音量與明暗跟著起伏）
  sea(rate) {
    const fade = Math.floor(rate * 0.5);
    const raw = noise(rate * LOOP_SECONDS + fade, 41);
    const bright = lowpass(Float32Array.from(raw), 0.12), dull = lowpass(raw, 0.025);
    const data = new Float32Array(raw.length);
    for (let i = 0; i < data.length; i++) {
      const swell = Math.pow(0.5 - 0.5 * Math.cos((TAU * 2 * i) / (rate * LOOP_SECONDS)), 1.6);
      data[i] = dull[i] * (0.35 + 0.65 * swell) + bright[i] * swell * 0.7;
    }
    return normalize(makeSeamless(data, fade), 0.75);
  },
  // 夜晚：蟋蟀一陣一陣地叫，加一點很輕的風
  night(rate) {
    const out = lowpass(noise(rate * LOOP_SECONDS, 43), 0.01);
    for (let i = 0; i < out.length; i++) out[i] *= 0.25;
    const rand = seededRandom(47);
    for (let n = 0; n < 9; n++) {
      const start = Math.floor(rand() * (LOOP_SECONDS - 0.4) * rate), freq = 4300 + rand() * 600;
      for (let c = 0; c < 4; c++) mixIn(out, tone(rate, 0.03, freq, 60, 0.004), start + Math.floor(c * 0.045 * rate), 0.5 + rand() * 0.4);
    }
    return normalize(out, 0.55);
  },
  // 電器的嗡嗡聲：60 Hz 和它的倍頻，加上風扇的細雜訊
  hum(rate) {
    const fan = highpass(lowpass(noise(rate * LOOP_SECONDS, 53), 0.3), 0.02);
    const out = blank(rate);
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      out[i] = Math.sin(TAU * 60 * t) * 0.4 + Math.sin(TAU * 120 * t) * 0.25 + Math.sin(TAU * 180 * t) * 0.08 + fan[i] * 0.25;
    }
    return normalize(out, 0.55);
  },
  // 放映機：每秒 24 格的喀喀聲，加上馬達的轉動聲
  projector(rate) {
    const out = blank(rate);
    for (let i = 0; i < out.length; i++) out[i] = Math.sin((TAU * 96 * i) / rate) * 0.12;
    const frames = 24 * LOOP_SECONDS;
    for (let f = 0; f < frames; f++) mixIn(out, burst(rate, 0.02, 59 + (f % 5), 0.5, 220), Math.floor((f * rate) / 24), f % 2 ? 0.7 : 1);
    return normalize(out, 0.6);
  },
  // 遠方的砲火：低沉的悶響，每隔一陣子一聲遠遠的炸
  rumble(rate) {
    const fade = Math.floor(rate * 0.5);
    const out = makeSeamless(lowpass(lowpass(noise(rate * LOOP_SECONDS + fade, 61), 0.008), 0.02), fade);
    for (const [at, gain] of [[0.3, 1], [1.7, 0.6], [2.6, 0.85], [3.4, 0.5]]) mixIn(out, burst(rate, 0.9, 67 + at, 0.015, 4), Math.floor(at * rate), gain * 2.2);
    return normalize(out, 0.8);
  },
  // 工廠：規律的金屬敲擊和機器的低鳴
  machine(rate) {
    const out = blank(rate);
    for (let i = 0; i < out.length; i++) out[i] = Math.sin((TAU * 45 * i) / rate) * 0.25 + Math.sin((TAU * 90 * i) / rate) * 0.1;
    for (let b = 0; b < LOOP_SECONDS * 2; b++) {
      mixIn(out, tone(rate, 0.25, 320, 18), Math.floor(b * 0.5 * rate), 0.6);
      mixIn(out, burst(rate, 0.08, 71 + b, 0.3, 50), Math.floor(b * 0.5 * rate), 0.8);
    }
    return normalize(out, 0.6);
  },
  // 太空：高處幾個微微走音的正弦，慢慢起伏（整數週期，無縫）
  space(rate) {
    const out = blank(rate);
    const partials = [[220, 0.4], [330.25, 0.3], [440.5, 0.2], [659.75, 0.12], [880, 0.08]];
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      let v = 0;
      for (const [f, a] of partials) v += Math.sin(TAU * f * t) * a * (0.6 + 0.4 * Math.sin((TAU * t) / LOOP_SECONDS + f));
      out[i] = v;
    }
    return normalize(out, 0.45);
  },
  // 心跳：每秒一次的「噗通」
  heartbeat(rate) {
    const out = blank(rate);
    for (let b = 0; b < LOOP_SECONDS; b++) {
      mixIn(out, tone(rate, 0.18, (t) => 60 - t * 80, 18), Math.floor(b * rate));
      mixIn(out, tone(rate, 0.18, (t) => 55 - t * 70, 20), Math.floor((b + 0.28) * rate), 0.7);
    }
    return normalize(out, 0.8);
  },
  // ---------- 陰森的環境音（2026-11-19 使用者要求整體走陰森感） ----------
  // 恐懼的低鳴：兩個只差小二度的低音互相拍打，加一個三全音，慢慢起伏（頻率都是 0.25 Hz 的倍數，4 秒剛好整數週期）
  dread(rate) {
    const out = blank(rate);
    for (let i = 0; i < out.length; i++) {
      const t = i / rate, swell = 0.65 + 0.35 * Math.sin((TAU * t) / LOOP_SECONDS);
      out[i] = (Math.sin(TAU * 41.25 * t) * 0.55 + Math.sin(TAU * 43.75 * t) * 0.45 + Math.sin(TAU * 58.25 * t) * 0.3 + Math.sin(TAU * 82.5 * t) * 0.12) * swell;
    }
    return normalize(out, 0.7);
  },
  // 耳語：氣聲的雜訊經過兩個會飄移的共鳴，一口一口地吐出來
  whisper(rate) {
    const fade = Math.floor(rate * 0.4);
    const raw = highpass(noise(rate * LOOP_SECONDS + fade, 307), 0.15);
    const out = new Float32Array(raw.length);
    let b1 = 0, v1 = 0, b2 = 0, v2 = 0;
    const rand = seededRandom(311);
    const puffs = Array.from({ length: 7 }, () => [rand() * LOOP_SECONDS, 0.25 + rand() * 0.45]);
    for (let i = 0; i < raw.length; i++) {
      const t = i / rate;
      // 兩個簡單的共振濾波器（狀態變數），中心頻率慢慢飄
      const f1 = (2 * Math.sin((Math.PI * (700 + 300 * Math.sin(t * 1.3))) / rate)), f2 = (2 * Math.sin((Math.PI * (2300 + 500 * Math.sin(t * 0.7 + 1))) / rate));
      b1 += f1 * v1; v1 += f1 * (raw[i] - b1 - 0.15 * v1);
      b2 += f2 * v2; v2 += f2 * (raw[i] - b2 - 0.2 * v2);
      let env = 0;
      for (const [at, len] of puffs) { const d = (t - at + LOOP_SECONDS) % LOOP_SECONDS; if (d < len) env += Math.sin((Math.PI * d) / len) ** 2; }
      out[i] = (v1 * 0.6 + v2 * 0.4) * env;
    }
    return normalize(makeSeamless(out, fade), 0.5);
  },
  // 低沉的合唱：A 小調的和弦（A2、C3、E3），每個音由幾個泛音組成並有慢顫音，濾得很暗
  choir(rate) {
    const out = blank(rate);
    const voices = [[110, 0], [130.75, 1.1], [164.75, 2.3], [109.75, 0.6]];
    for (const [f, phase0] of voices) {
      let phase = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / rate;
        phase += (TAU * f * (1 + 0.004 * Math.sin(TAU * 0.5 * t + phase0))) / rate;
        let v = 0;
        for (let h = 1; h <= 6; h++) v += (Math.sin(phase * h) / h) * (h === 2 || h === 3 ? 1.4 : 1); // 「啊」的母音：第 2、3 泛音加重
        out[i] += v * (0.7 + 0.3 * Math.sin(TAU * 0.25 * t + phase0));
      }
    }
    lowpass(out, 0.08);
    return normalize(out, 0.55);
  },
  // 走音的音樂盒：小調的幾個音，每個都微微走音，叮——慢慢衰減
  musicbox(rate) {
    const out = blank(rate);
    const notes = [[0, 880], [0.5, 1046.5], [1.0, 1318.5], [1.5, 1244.5], [2.0, 1046.5], [2.75, 830.6], [3.25, 987.8]];
    for (const [at, f] of notes) {
      const detune = f * (1 + (seededRandom(Math.floor(f))() - 0.5) * 0.03);
      mixWrap(out, tone(rate, 1.6, detune, 3.2, 0.002), Math.floor(at * rate), 0.6);
      mixWrap(out, tone(rate, 1.6, detune * 2.01, 5, 0.002), Math.floor(at * rate), 0.2);
    }
    return normalize(out, 0.5);
  },
  // 金屬的呻吟：共鳴的雜訊、音高慢慢彎（船身、鐵鏈、建築在受力）
  metal(rate) {
    const out = blank(rate);
    for (const [at, f, len] of [[0.2, 180, 1.6], [2.1, 240, 1.4]]) {
      const groan = new Float32Array(Math.floor(len * rate));
      let phase = 0;
      for (let i = 0; i < groan.length; i++) {
        const t = i / rate;
        phase += (TAU * f * (1 - 0.18 * Math.sin((Math.PI * t) / len))) / rate;
        groan[i] = (Math.sin(phase) * 0.5 + Math.sin(phase * 2.76) * 0.3 + Math.sin(phase * 5.4) * 0.15) * Math.sin((Math.PI * t) / len) ** 2;
      }
      mixWrap(out, groan, Math.floor(at * rate));
    }
    const hiss = lowpass(noise(out.length, 313), 0.03);
    for (let i = 0; i < out.length; i++) out[i] += hiss[i] * 0.4;
    return normalize(out, 0.5);
  },
  // 收訊不良的靜電：細細的嘶聲加上不規則的爆裂
  static(rate) {
    const fade = Math.floor(rate * 0.3);
    const out = makeSeamless(highpass(noise(rate * LOOP_SECONDS + fade, 317), 0.25), fade);
    for (let i = 0; i < out.length; i++) out[i] *= 0.25 * (0.6 + 0.4 * Math.sin((TAU * i * 3) / out.length));
    const rand = seededRandom(331);
    for (let n = 0; n < 40; n++) {
      const at = Math.floor(rand() * (out.length - 200));
      for (let k = 0; k < 120; k++) out[at + k] += (rand() * 2 - 1) * Math.exp(-k / 20) * (0.6 + rand());
    }
    return normalize(out, 0.45);
  },
};

// ---------- 音效（一次性） ----------
const cues = {
  // ---------- 陰森的音效 ----------
  // 驚悚的一記：不協和的音簇從無到有地湧上來，最後重重落下
  stinger(rate) {
    const length = Math.floor(rate * 2.4);
    const out = new Float32Array(length);
    for (const f of [220, 233.1, 311.1, 329.6, 466.2]) {
      let phase = 0;
      for (let i = 0; i < length; i++) {
        const t = i / rate;
        phase += (TAU * f) / rate;
        const env = t < 1.2 ? Math.pow(t / 1.2, 3) : Math.exp(-(t - 1.2) * 2.5);
        out[i] += (Math.sin(phase) + 0.4 * Math.sin(phase * 2)) * env * 0.3;
      }
    }
    mixIn(out, tone(rate, 1.2, (t) => 60 - t * 25, 3), Math.floor(rate * 1.2), 1.3);
    mixIn(out, burst(rate, 0.3, 337, 0.1, 10), Math.floor(rate * 1.2), 0.8);
    return normalize(out, 0.85);
  },
  // 倒放的鈸：雜訊由小到大、越來越亮，在最高點斷掉
  reverseSwell(rate) {
    const length = Math.floor(rate * 1.8);
    const raw = noise(length, 347), out = new Float32Array(length);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      y += (raw[i] - y) * (0.02 + 0.6 * t * t);
      out[i] = y * Math.pow(t, 2.5) * (t > 0.97 ? (1 - t) / 0.03 : 1);
    }
    return normalize(out, 0.75);
  },
  // 一句聽不清楚的耳語
  whisperCue(rate) {
    const length = Math.floor(rate * 1.3);
    const raw = highpass(noise(length, 349), 0.2), out = new Float32Array(length);
    let b = 0, v = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const f = 2 * Math.sin((Math.PI * (900 + 900 * Math.sin(t * 9) ** 2)) / rate);
      b += f * v; v += f * (raw[i] - b - 0.12 * v);
      const syll = Math.max(0, Math.sin(t * 14)) ** 2; // 一個一個音節
      out[i] = v * syll * Math.sin((Math.PI * t) / 1.3);
    }
    return normalize(out, 0.55);
  },
  // 電影裡的低頻重擊：極低的下滑音加一點空氣聲，拖很長
  lowHit(rate) {
    const out = tone(rate, 3, (t) => 32 + 40 * Math.exp(-t * 6), 1.2, 0.004);
    mixIn(out, burst(rate, 1.5, 353, 0.02, 3), 0, 0.6);
    return normalize(out, 0.95);
  },
  // 喪鐘：很低、走音的鐘，泛音互相拍打，拖六秒
  bellToll(rate) {
    const out = new Float32Array(Math.floor(rate * 6));
    for (const [f, gain, decay] of [[73.4, 1, 0.45], [74.1, 0.8, 0.45], [176, 0.5, 0.8], [221, 0.35, 1.1], [293, 0.25, 1.5], [440.6, 0.12, 2]]) mixIn(out, tone(rate, 6, f, decay, 0.004), 0, gain);
    mixIn(out, burst(rate, 0.1, 359, 0.1, 30), 0, 0.5);
    return normalize(out, 0.9);
  },
  // 走音的玻璃風鈴
  chime(rate) {
    const out = new Float32Array(Math.floor(rate * 3));
    [1567.98, 1661.2, 2093, 2217.5, 1396.9].forEach((f, n) => mixIn(out, tone(rate, 2.6, f, 1.6, 0.002), Math.floor(n * 0.13 * rate), 0.5));
    return normalize(out, 0.45);
  },

  // 翻轉、掠過：雜訊由悶到亮再收掉
  flip(rate) {
    const out = noise(Math.floor(rate * 0.6), 101);
    let y = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      y += (out[i] - y) * (0.02 + 0.5 * t * t);
      out[i] = y * Math.sin(Math.PI * t) ** 2;
    }
    return normalize(out, 0.8);
  },
  // 大爆炸：下滑的低頻、一陣雜訊、再拖一段隆隆的尾巴
  boom(rate) {
    const out = noise(Math.floor(rate * 2.4), 103);
    lowpass(out, 0.06);
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      phase += (TAU * (38 + 70 * Math.exp(-t * 9))) / rate;
      out[i] = out[i] * (Math.exp(-t * 3) * 1.6 + 0.25 * Math.exp(-t * 0.9)) + Math.sin(phase) * Math.exp(-t * 2.4);
    }
    mixIn(out, burst(rate, 0.12, 107, 0.6, 30), 0, 0.8); // 最前面爆開的那一下
    return normalize(out, 0.95);
  },
  // 短促的喀一聲
  click(rate) {
    return normalize(tone(rate, 0.08, 1200, 90), 0.7);
  },
  // 沙漏翻過來：木頭碰一聲，接著細沙往下流
  hourglass(rate) {
    const out = new Float32Array(Math.floor(rate * 1.8));
    mixIn(out, tone(rate, 0.3, 180, 14), 0, 0.9);
    mixIn(out, burst(rate, 0.15, 109, 0.4, 25), 0, 0.6);
    const sand = highpass(noise(Math.floor(rate * 1.5), 113), 0.3);
    for (let i = 0; i < sand.length; i++) sand[i] *= Math.min(1, i / (rate * 0.2)) * Math.exp((-i / rate) * 1.4) * 0.35;
    mixIn(out, sand, Math.floor(rate * 0.25));
    return normalize(out, 0.75);
  },
  // 大鐘敲一下：不和諧的泛音，長長地衰減
  bell(rate) {
    const out = new Float32Array(Math.floor(rate * 4.5));
    for (const [ratio, gain, decay] of [[1, 1, 0.9], [2.0, 0.6, 1.3], [2.4, 0.5, 1.6], [3.0, 0.35, 2.0], [4.2, 0.25, 2.6], [5.4, 0.15, 3.2]]) mixIn(out, tone(rate, 4.5, 196 * ratio, decay, 0.003), 0, gain);
    return normalize(out, 0.85);
  },
  // 寺廟的鐘：更低、更長，有拍頻
  templeBell(rate) {
    const out = new Float32Array(Math.floor(rate * 6));
    for (const [f, gain, decay] of [[110, 1, 0.5], [110.8, 0.8, 0.5], [264, 0.5, 0.9], [352, 0.3, 1.3], [580, 0.15, 1.8]]) mixIn(out, tone(rate, 6, f, decay, 0.004), 0, gain);
    mixIn(out, burst(rate, 0.08, 117, 0.15, 40), 0, 0.5);
    return normalize(out, 0.85);
  },
  // 馬蹄：兩秒的「噠噠、噠噠」
  gallop(rate) {
    const out = new Float32Array(Math.floor(rate * 2.4));
    for (let s = 0; s < 6; s++) for (const [dt, g] of [[0, 1], [0.09, 0.7], [0.18, 0.85]]) mixIn(out, burst(rate, 0.07, 119 + s, 0.25, 70), Math.floor((s * 0.38 + dt) * rate), g);
    return normalize(out, 0.8);
  },
  // 客機從頭頂飛過：一大片噴射噪音，音量和明暗先升後降、音高往下掉（都卜勒）
  jetPass(rate) {
    const length = Math.floor(rate * 4);
    const raw = noise(length, 127), out = new Float32Array(length);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length, near = Math.exp(-((t - 0.45) ** 2) / 0.03);
      y += (raw[i] - y) * (0.03 + 0.25 * near);
      out[i] = y * (0.15 + near);
    }
    mixIn(out, tone(rate, 4, (t) => 340 - 120 * Math.tanh((t - 1.8) * 2), 0.2, 0.8), 0, 0.12);
    return normalize(out, 0.85);
  },
  // 戰機掠過：更短、更尖
  fighter(rate) {
    const length = Math.floor(rate * 2.2);
    const raw = noise(length, 131), out = new Float32Array(length);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length, near = Math.exp(-((t - 0.4) ** 2) / 0.012);
      y += (raw[i] - y) * (0.08 + 0.5 * near);
      out[i] = y * (0.1 + near);
    }
    mixIn(out, tone(rate, 2.2, (t) => 900 - 500 * Math.tanh((t - 0.9) * 4), 0.6, 0.3), 0, 0.15);
    return normalize(out, 0.9);
  },
  // 鐵鏈：一串金屬碰撞聲
  chain(rate) {
    const out = new Float32Array(Math.floor(rate * 1.2));
    const rand = seededRandom(137);
    for (let n = 0; n < 9; n++) {
      const at = Math.floor((n * 0.09 + rand() * 0.04) * rate);
      for (const ratio of [1, 2.7, 4.1]) mixIn(out, tone(rate, 0.25, (900 + rand() * 500) * ratio, 25 + ratio * 6, 0.001), at, 0.5 / ratio);
    }
    return normalize(out, 0.75);
  },
  // 火箭升空：低沉的轟鳴越來越大、越來越亮，維持一陣再遠去
  rocket(rate) {
    const length = Math.floor(rate * 5.5);
    const raw = noise(length, 139), out = new Float32Array(length);
    let y = 0, low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const env = Math.min(1, t / 1.2) * Math.exp(-Math.max(0, t - 3) * 0.9);
      y += (raw[i] - y) * (0.03 + 0.12 * Math.min(1, t / 2));
      low += (raw[i] - low) * 0.006;
      out[i] = (y * 0.8 + low * 6) * env;
    }
    return normalize(out, 0.95);
  },
  // 無線電：一陣靜電雜訊加兩聲短嗶
  radio(rate) {
    const out = highpass(lowpass(noise(Math.floor(rate * 1.2), 149), 0.5), 0.1);
    for (let i = 0; i < out.length; i++) out[i] *= 0.35 * (0.6 + 0.4 * Math.sin(i / 300));
    mixIn(out, tone(rate, 0.12, 1400, 2, 0.002), Math.floor(rate * 0.15), 1.2);
    mixIn(out, tone(rate, 0.12, 1400, 2, 0.002), Math.floor(rate * 0.4), 1.2);
    return normalize(out, 0.6);
  },
  // 倒數的嗶聲：三短一長
  countdown(rate) {
    const out = new Float32Array(Math.floor(rate * 2.2));
    for (let n = 0; n < 3; n++) mixIn(out, tone(rate, 0.12, 880, 3, 0.002), Math.floor(n * 0.5 * rate));
    mixIn(out, tone(rate, 0.5, 1320, 2, 0.002), Math.floor(1.5 * rate));
    return normalize(out, 0.6);
  },
  // 人群歡呼：一陣湧上來的喊聲
  crowdRoar(rate) {
    const length = Math.floor(rate * 2.5);
    const data = noise(length, 151), low = lowpass(Float32Array.from(data), 0.02);
    lowpass(data, 0.15);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      data[i] = (data[i] - low[i]) * Math.min(1, t / 0.3) * Math.exp(-Math.max(0, t - 0.8) * 1.5);
    }
    return normalize(data, 0.85);
  },
  // 軍靴重重踩下：低沉的一聲加一點碎石
  stomp(rate) {
    const out = new Float32Array(Math.floor(rate * 1));
    mixIn(out, tone(rate, 0.6, (t) => 70 - t * 50, 7), 0, 1.2);
    mixIn(out, burst(rate, 0.25, 157, 0.12, 14), 0, 1);
    mixIn(out, burst(rate, 0.4, 163, 0.6, 9), Math.floor(rate * 0.04), 0.25);
    return normalize(out, 0.9);
  },
  // 選票滑進票箱：紙的摩擦聲，然後「咚」一聲落底
  ballot(rate) {
    const out = new Float32Array(Math.floor(rate * 0.9));
    const paper = highpass(noise(Math.floor(rate * 0.35), 167), 0.2);
    for (let i = 0; i < paper.length; i++) paper[i] *= Math.sin((Math.PI * i) / paper.length) * 0.4;
    mixIn(out, paper, 0);
    mixIn(out, tone(rate, 0.3, 140, 16), Math.floor(rate * 0.38), 0.9);
    return normalize(out, 0.7);
  },
  // 硬幣與籌碼：幾聲叮噹
  coins(rate) {
    const out = new Float32Array(Math.floor(rate * 1.2));
    const rand = seededRandom(173);
    for (let n = 0; n < 7; n++) {
      const at = Math.floor((n * 0.11 + rand() * 0.05) * rate), f = 2200 + rand() * 1600;
      mixIn(out, tone(rate, 0.4, f, 14, 0.001), at, 0.6);
      mixIn(out, tone(rate, 0.4, f * 1.5, 18, 0.001), at, 0.3);
    }
    return normalize(out, 0.65);
  },
  // 下跌：一聲往下滑的長音（股市重挫）
  plunge(rate) {
    const out = tone(rate, 1.6, (t) => 900 * Math.pow(0.18, t / 1.6), 0.6, 0.02);
    mixIn(out, tone(rate, 1.6, (t) => 450 * Math.pow(0.18, t / 1.6), 0.6, 0.02), 0, 0.5);
    return normalize(out, 0.6);
  },
  // 石塊落地（立體字掉下來）
  thud(rate) {
    const out = new Float32Array(Math.floor(rate * 0.6));
    mixIn(out, tone(rate, 0.4, (t) => 110 - t * 60, 12), 0, 1);
    mixIn(out, burst(rate, 0.2, 179, 0.2, 20), 0, 0.7);
    return normalize(out, 0.75);
  },
  // 腳步：下台階的幾步
  steps(rate) {
    const out = new Float32Array(Math.floor(rate * 2));
    for (let s = 0; s < 6; s++) mixIn(out, burst(rate, 0.08, 181 + s, 0.2, 45), Math.floor(s * 0.32 * rate), s % 2 ? 0.7 : 1);
    return normalize(out, 0.6);
  },
  // 布在風裡啪啪地飄
  flag(rate) {
    const out = new Float32Array(Math.floor(rate * 1.4));
    const rand = seededRandom(191);
    for (let n = 0; n < 8; n++) mixIn(out, burst(rate, 0.06, 193 + n, 0.35, 60), Math.floor((n * 0.15 + rand() * 0.05) * rate), 0.5 + rand() * 0.5);
    return normalize(out, 0.55);
  },
  // 油滴落下
  drip(rate) {
    return normalize(tone(rate, 0.25, (t) => 600 + t * 2400, 22, 0.002), 0.6);
  },
  // 馬達轉動（監視攝影機轉頭）
  servo(rate) {
    const out = new Float32Array(Math.floor(rate * 0.7));
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      phase += (TAU * (420 + 160 * Math.sin(Math.PI * t))) / rate;
      out[i] = (Math.sin(phase) * 0.6 + Math.sin(phase * 2.01) * 0.3) * Math.sin(Math.PI * t);
    }
    return normalize(out, 0.45);
  },
  // 快門
  shutter(rate) {
    const out = new Float32Array(Math.floor(rate * 0.3));
    mixIn(out, burst(rate, 0.04, 197, 0.6, 120), 0);
    mixIn(out, burst(rate, 0.05, 199, 0.5, 90), Math.floor(rate * 0.09), 0.8);
    return normalize(out, 0.7);
  },
  // 通電：低到高的嗡一聲
  power(rate) {
    const out = tone(rate, 1.5, (t) => 40 + t * 120, 1.2, 0.05);
    mixIn(out, tone(rate, 1.5, (t) => 80 + t * 240, 1.6, 0.05), 0, 0.5);
    return normalize(out, 0.7);
  },
  // 保險箱轉盤：一串細小的喀喀
  dial(rate) {
    const out = new Float32Array(Math.floor(rate * 0.9));
    for (let n = 0; n < 10; n++) mixIn(out, tone(rate, 0.02, 2600, 250, 0.001), Math.floor((n * 0.07 + (n > 6 ? 0.1 : 0)) * rate), n === 9 ? 1.5 : 0.7);
    return normalize(out, 0.6);
  },
  // 厚重的鐵門彈開：吱一聲加上一聲悶響，接著警報
  safeDoor(rate) {
    const out = new Float32Array(Math.floor(rate * 2.2));
    mixIn(out, tone(rate, 0.5, 90, 8), 0, 1);
    mixIn(out, burst(rate, 0.2, 211, 0.15, 18), 0, 0.8);
    const creak = tone(rate, 0.6, (t) => 300 + Math.sin(t * 60) * 40 - t * 120, 3, 0.02);
    mixIn(out, creak, Math.floor(rate * 0.1), 0.35);
    for (let n = 0; n < 3; n++) mixIn(out, tone(rate, 0.3, (t) => 1100 - t * 400, 1, 0.01), Math.floor((0.6 + n * 0.45) * rate), 0.35);
    return normalize(out, 0.85);
  },
  // 機器人跑步：金屬的腳步聲加關節的嘶嘶
  robotRun(rate) {
    const out = new Float32Array(Math.floor(rate * 1.6));
    for (let s = 0; s < 7; s++) {
      mixIn(out, tone(rate, 0.12, 520, 40), Math.floor(s * 0.2 * rate), 0.6);
      mixIn(out, burst(rate, 0.06, 223 + s, 0.4, 70), Math.floor(s * 0.2 * rate), 0.6);
    }
    return normalize(out, 0.7);
  },
  // 數據灑出來：一陣隨機的電子嗶嗶
  digits(rate) {
    const out = new Float32Array(Math.floor(rate * 1.6));
    const rand = seededRandom(227);
    for (let n = 0; n < 40; n++) mixIn(out, tone(rate, 0.03, 600 + Math.floor(rand() * 8) * 220, 80, 0.001), Math.floor(rand() * 1.5 * rate), 0.35);
    return normalize(out, 0.6);
  },
  // 充電的電弧
  zap(rate) {
    const out = highpass(noise(Math.floor(rate * 0.4), 229), 0.3);
    for (let i = 0; i < out.length; i++) out[i] *= Math.exp((-i / rate) * 9) * (0.5 + 0.5 * Math.sign(Math.sin(i / 25)));
    mixIn(out, tone(rate, 0.4, 120, 8), 0, 0.5);
    return normalize(out, 0.6);
  },
  // 針筒推注的嘶聲
  syringe(rate) {
    const out = highpass(lowpass(noise(Math.floor(rate * 0.8), 233), 0.6), 0.25);
    for (let i = 0; i < out.length; i++) out[i] *= Math.sin((Math.PI * i) / out.length) * 0.5;
    return normalize(out, 0.5);
  },
  // 藥丸撒在桌上
  pills(rate) {
    const out = new Float32Array(Math.floor(rate * 0.9));
    const rand = seededRandom(239);
    for (let n = 0; n < 14; n++) mixIn(out, tone(rate, 0.05, 2000 + rand() * 2000, 90, 0.001), Math.floor(rand() * 0.8 * rate), 0.4);
    return normalize(out, 0.55);
  },
  // 玻璃瓶輕碰
  glass(rate) {
    const out = new Float32Array(Math.floor(rate * 1.2));
    for (const [f, g, d] of [[2800, 1, 4], [5600, 0.4, 6], [7300, 0.25, 8]]) mixIn(out, tone(rate, 1.2, f, d, 0.001), 0, g);
    mixIn(out, tone(rate, 1.2, 3100, 5, 0.001), Math.floor(rate * 0.12), 0.6);
    return normalize(out, 0.5);
  },
  // 玻璃爆裂（溫度計衝破）：碎裂聲加嘶嘶的蒸氣
  crack(rate) {
    const out = new Float32Array(Math.floor(rate * 1.4));
    mixIn(out, burst(rate, 0.1, 241, 0.9, 50), 0, 1.2);
    const rand = seededRandom(251);
    for (let n = 0; n < 10; n++) mixIn(out, tone(rate, 0.15, 3000 + rand() * 4000, 30, 0.001), Math.floor(rand() * 0.25 * rate), 0.4);
    const hiss = highpass(noise(Math.floor(rate * 1.2), 257), 0.4);
    for (let i = 0; i < hiss.length; i++) hiss[i] *= Math.exp((-i / rate) * 2) * 0.3;
    mixIn(out, hiss, Math.floor(rate * 0.1));
    return normalize(out, 0.85);
  },
  // 火勢猛然竄起
  fireWhoosh(rate) {
    const length = Math.floor(rate * 1.6);
    const raw = noise(length, 263), out = new Float32Array(length);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      y += (raw[i] - y) * (0.04 + 0.2 * Math.min(1, t / 0.4));
      out[i] = y * Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.4) * 2.2);
    }
    return normalize(out, 0.8);
  },
  // 牛叫：低沉、有共鳴、音高先升後降
  moo(rate) {
    const out = new Float32Array(Math.floor(rate * 1.6));
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / rate;
      const f = 110 + 30 * Math.sin(Math.PI * Math.min(1, t / 1.4));
      phase += (TAU * f) / rate;
      const env = Math.min(1, t / 0.15) * Math.min(1, (1.5 - t) / 0.3);
      let v = 0;
      for (let h = 1; h <= 8; h++) v += (Math.sin(phase * h) / h) * (h === 3 || h === 4 ? 1.6 : 1); // 第 3、4 泛音加重，像有鼻音的共鳴
      out[i] = v * Math.max(0, env);
    }
    return normalize(out, 0.6);
  },
  // 飛彈飛來：越來越近的呼嘯，音高往下掉
  missile(rate) {
    const length = Math.floor(rate * 1.8);
    const out = tone(rate, 1.8, (t) => 1400 - t * 500, 0, 0.3);
    const air = lowpass(noise(length, 269), 0.15);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      out[i] = (out[i] * 0.4 + air[i] * 0.8) * t * t * Math.min(1, (1 - t) / 0.05);
    }
    return normalize(out, 0.75);
  },
  // 戰車開砲：很短、很硬的一聲，加一點回音
  cannon(rate) {
    const out = new Float32Array(Math.floor(rate * 1.6));
    const shot = burst(rate, 0.5, 271, 0.35, 12);
    mixIn(out, shot, 0, 1.3);
    mixIn(out, tone(rate, 0.5, (t) => 90 - t * 60, 9), 0, 0.9);
    mixIn(out, lowpass(Float32Array.from(shot), 0.05), Math.floor(rate * 0.35), 0.4);
    return normalize(out, 0.95);
  },
  // 無人機：嗡嗡地飛過
  drone(rate) {
    const out = new Float32Array(Math.floor(rate * 2.5));
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      phase += (TAU * (190 + 30 * Math.sin(t * 40))) / rate;
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(phase * h) / h;
      out[i] = v * Math.sin(Math.PI * t);
    }
    return normalize(out, 0.45);
  },
  // 放映機啟動：馬達由慢到快，喀喀聲越來越密
  reel(rate) {
    const out = new Float32Array(Math.floor(rate * 1.8));
    let pos = 0;
    while (pos < out.length) {
      const t = pos / out.length;
      mixIn(out, burst(rate, 0.02, 277, 0.5, 220), pos, 0.8);
      pos += Math.floor(rate / (4 + 20 * t));
    }
    mixIn(out, tone(rate, 1.8, (t) => 30 + t * 50, 0, 0.5), 0, 0.15);
    return normalize(out, 0.6);
  },
  // 放映機停下：反過來，由快到慢
  spindown(rate) {
    const out = new Float32Array(Math.floor(rate * 1.8));
    let pos = 0;
    while (pos < out.length) {
      const t = pos / out.length;
      mixIn(out, burst(rate, 0.02, 281, 0.5, 220), pos, 0.8 * (1 - t * 0.6));
      pos += Math.floor(rate / (24 - 20 * t));
    }
    return normalize(out, 0.55);
  },
  // 水晶球亮起：一串往上爬的晶瑩音
  shimmer(rate) {
    const out = new Float32Array(Math.floor(rate * 2.5));
    [880, 1108.7, 1318.5, 1760, 2217.5, 2637].forEach((f, n) => mixIn(out, tone(rate, 2.2, f, 1.8, 0.01), Math.floor(n * 0.09 * rate), 0.5));
    return normalize(out, 0.5);
  },
  // 鍵盤打字
  typing(rate) {
    const out = new Float32Array(Math.floor(rate * 1.8));
    const rand = seededRandom(283);
    let at = 0;
    while (at < 1.6) {
      mixIn(out, burst(rate, 0.03, 287 + Math.floor(at * 100), 0.5, 140), Math.floor(at * rate), 0.6 + rand() * 0.4);
      at += 0.07 + rand() * 0.12;
    }
    return normalize(out, 0.55);
  },
  // 包袱落地
  bundle(rate) {
    return normalize(burst(rate, 0.4, 293, 0.08, 14), 0.7);
  },
  // 瓶子在地上滾動
  bottle(rate) {
    const out = new Float32Array(Math.floor(rate * 1.4));
    for (let n = 0; n < 9; n++) mixIn(out, tone(rate, 0.15, 1500 + (n % 3) * 120, 30, 0.002), Math.floor((n * 0.13 + n * n * 0.004) * rate), 0.5 * (1 - n / 10));
    return normalize(out, 0.5);
  },
};

export const LOOP_NAMES = Object.keys(loops);
export const CUE_NAMES = Object.keys(cues);

/** @returns {AudioBuffer|null} 名稱不存在時回傳 null */
export function synthBuffer(audioCtx, name) {
  const make = loops[name] ?? cues[name];
  if (!make) return null;
  const data = make(audioCtx.sampleRate);
  const buffer = audioCtx.createBuffer(1, data.length, audioCtx.sampleRate);
  buffer.copyToChannel(data, 0);
  return buffer;
}
