// 從 engine/chapters/*.ts 抽出每一章的旁白（pacedCaptions 的字串），寫到 data/captions.json。
// 伺服器端渲染的文字版與 /story 頁面讀這份檔案；改了章節的旁白之後重跑：npm run build:captions
// （Node 22.18 以上可以直接執行 .ts：型別會被去掉後執行）
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("engine/chapters");
const out: Record<string, string[]> = {};
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
  const source = fs.readFileSync(path.join(dir, file), "utf8");
  const match = source.match(/captions:\s*pacedCaptions\(\s*"[^"]+",\s*\[([\s\S]*?)\]\s*\)/);
  if (!match) continue;
  out[file.replace(/\.ts$/, "")] = [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`) as string);
}
fs.writeFileSync("data/captions.json", JSON.stringify(out, null, 2) + "\n");
console.log(`已抽出 ${Object.keys(out).length} 章的旁白，共 ${Object.values(out).flat().length} 句`);
