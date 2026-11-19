// 嚴格型別檢查（tsconfig.strict.json），只算 app/、components/、lib/、scripts/ 的錯誤。
// engine/ 是從 JavaScript 搬過來的 3D 引擎，目前以 tsconfig.json 的寬鬆設定檢查（不檢查隱含 any 與 null），
// 它在嚴格設定下的錯誤這裡只列出數量，不算失敗。
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["tsc", "--noEmit", "-p", "tsconfig.strict.json"], { encoding: "utf8" });
const lines = (result.stdout + result.stderr).split("\n").filter((l) => l.includes("error TS"));
const own = lines.filter((l) => !l.startsWith("engine/"));
console.log(`嚴格檢查：網站程式 ${own.length} 個錯誤；引擎（僅供參考）${lines.length - own.length} 個`);
if (own.length) {
  console.log(own.join("\n"));
  process.exit(1);
}
