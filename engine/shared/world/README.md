# shared/world：封面座標系與繪圖元件庫

這個資料夾裡的函式都是 canvas 2D 的下筆函式：第一個參數是 `ctx`，座標和長度的單位一律是**封面像素**（封面原圖 1110×1475）。通常包在 `coverSprite(box, (ctx) => …)` 裡呼叫。顏色只用 `space.js` 的 `RED`、`DARK_RED`、`BLACK`、`WHITE`。

每個元件都在 `/kit.html` 下半頁有一格展示（`src/dev/kit-world.js`）。新增元件時要在那裡的 `ITEMS` 加一項，否則 `window.__kit` 會多一筆「展示頁漏了」的失敗。

## 元件庫現在有什麼

| 檔案 | 元件 | 誰在用 |
|---|---|---|
| `space.js` | 座標換算、`coverSprite`、`shot`、四個顏色、鏡位常數 | 全部章節 |
| `shapes.js` | `tracePoly`（多邊形／折線路徑）、`fillPoly`、`strokePolyline`、`boundsOf` | countdown、gulf、market、orbit、war、france |
| `people.js` | `drawStandingFigure` + `head`（正面站立的西裝人形） | stage、core |
| | `drawProfileFigure`（側面握手的人） | stage |
| | `drawQueuePerson`（實心群眾） | queue |
| | `drawProtester`（黑底白邊、可舉手的群眾） | france |
| | `drawWatcher`（背對鏡頭的空心人／剪影） | watch |
| `props.js` | `drawFurledFlag`、`drawHangingFlag`、`traceLatticeTower`、`drawRadioWaves` | stage |
| | `drawPine`（松樹） | stage、heat、france、watch |
| | `drawSparkle`（四芒星） | prologue、gulf、orbit、war |
| | `traceBlob`（圓滑的封閉輪廓） | prologue、gulf、heat、floor、market、queue、war、orbit、france |
| | `drawChain`（鐵鏈） | gulf |
| | `drawBundle`（包袱） | floor |
| | `drawChipStack`（一疊籌碼） | market |
| | `drawMicrochip`（晶片） | core |
| | `drawFilmReel`（膠卷盤） | reboot |
| | `drawBottle`、`drawFlask`、`drawCapsule`、`drawTablet`（藥瓶、錐形瓶、膠囊、藥錠） | pharma |
| `nature.js` | `drawWaveBand`（水紋） | countdown、gulf |
| | `drawPalm`（棕櫚） | gulf |
| | `drawTuft`（圓頂款草叢） | queue、floor |
| | `drawSpikyTuft`（尖葉款草叢） | heat |
| `animals.js` | `drawWalkingLeg`（會擺動的腿） | countdown（馬）、gulf（駱駝） |
| | `drawCowBody`、`drawCowHead` | heat |
| `symbols.js` | `drawStar`（五角星） | countdown、watch |
| | `drawDoubleEagle`（雙頭鷹） | queue |
| `vehicles.js` | `drawJet`（戰機） | gulf |
| | `drawMissile`、`drawStreak`、`drawDroneBody`、`drawDroneRotors` | war |
| `buildings.js` | `drawTent`（帳篷） | floor |
| | `drawChimneys`（煙囪群） | gulf |
| | `drawTurbineRotor`、`drawTurbineTower`（風機） | heat |
| `effects.js` | `drawSmokePatch`（一片黑煙） | gulf |

會動的粒子（火焰 `Flame`、雪、煙絲、星點）是 three.js 物件，在 `core.js` 和 `shared/fx.js`，不在這裡。步態動畫（`makeFlipbook`、`drawHorse`）在 `shared/flipbook.js`，目前沒有章節用到。

## M2 的盤點（搬進元件庫之前各章的狀況）

M2 是在 16 章都畫完之後才補做的，當時每個章節檔各自帶著一批私有的繪圖函式。盤點結果分三類。

### 一、同一個東西各章各寫一份（已合併）

| 東西 | 原本在哪裡 | 差異 | 現在 |
|---|---|---|---|
| 多邊形路徑 | countdown `poly`、gulf `poly`、market `poly`、orbit `poly`、war `polygon`、france `tracePoly` | market、orbit 的多一個 `close` 參數，其餘逐字相同 | `shapes.tracePoly`；各章用 `import { tracePoly as poly }` 保留原本的呼叫名稱 |
| 圓頭折線 | gulf `line(ctx, color, width, points)`、france `strokeLine(ctx, points, color, width)` | 只有參數順序不同 | `shapes.strokePolyline`（france 的順序）；gulf 留一行轉接 |
| 填色多邊形 | gulf `fillPoly(ctx, color, points)` | 只有一份 | `shapes.fillPoly(ctx, points, color)`；gulf 留一行轉接 |
| 水紋 | countdown `waveBand`、gulf `waveBand` | 形狀逐字相同；countdown 的固定填黑，gulf 的沿用呼叫端的 fillStyle | `nature.drawWaveBand`，多一個 `color` 參數（不給就沿用 fillStyle） |
| 會擺動的腿 | countdown `drawLeg`（馬）、gulf `drawLeg`（駱駝） | 運動學逐字相同；擺幅預設值、蹄的粗細與長度不同 | `animals.drawWalkingLeg`，差異都是參數；預設值是馬的，gulf 明確傳駱駝的值 |
| 五角星 | countdown `drawStar(…, outer, inner)`、watch `drawStar(…, r, rotation)` | 一個可指定內徑、一個內徑固定 0.4 倍但可旋轉 | `symbols.drawStar(…, outer, { inner, rotation })` |
| 草叢（圓頂款） | queue `drawTuft`，floor 從 queue.js import | 同一份，只是放在章節檔裡被另一章借用 | `nature.drawTuft` |

### 二、名字或題材相同、但畫法不同（各自保留，沒有統一外觀）

- **草叢兩款**：queue／floor 的是圓頂、七片彎葉（`drawTuft`）；heat 的是薄底、九片直邊尖葉（`drawSpikyTuft`）。兩個都進了元件庫，名字分開，不要互換。
- **群眾三款**：queue 的實心人（`drawQueuePerson`）、france 的白邊人（`drawProtester`）、watch 的背影（`drawWatcher`）。三種畫法都是照封面不同區塊畫的，各自進元件庫。
- **瓶子兩款**：pharma 的直立藥瓶進了元件庫（`drawBottle`）；floor 的倒地瓶子是固定座標、另一種外形，留在 floor.js（私有的 `drawBottle`）。
- **煙兩款**：gulf 的黑煙是「一串點 → 一片煙」（`drawSmokePatch`）；orbit 的紅色煙雲（`drawSmoke(side)`）是寫死座標的多邊形加圓，留在 orbit.js。
- **火焰**：gulf `drawFlames`、heat `traceFire`／`drawFire`、orbit `drawFlame` 都是照封面逐點描的不同輪廓，全部留在原章。
- **松樹**：本來就只有 `props.drawPine` 一份，四章共用，沒有第二種畫法。

### 三、只有一章用、而且座標寫死（留在章節檔，沒有搬）

這些函式的簽名是 `drawXxx(ctx)`，裡面直接寫封面座標，是「這一個元素」而不是可重複使用的元件。搬進來只是換個地方放，不會有第二個使用者，所以不搬。TODO 的 M2 清單裡有不少項目屬於這一類：

- **人形**：countdown `drawCowboy`；gulf `drawCamelRider`；heat `drawFarmer`；floor `drawMother`、`drawBaby`、`drawSittingChild`、`drawSitter`；market `drawWalker`（只有 x 可調，y 全部寫死）；queue `drawBearer`；orbit `drawAstronaut`、`drawSuitMan`、`drawRaisedArm`；pharma `drawScientist`；france `drawMarianne`、`drawVotingHand`、`drawClimber`（`drawProtester` 的一行包裝）；core `drawRobot`。
- **建築**：countdown `drawTrumpTower`、`drawKremlin`；gulf `drawSkyline`；market `drawTemple`、`drawPagoda`；pharma `drawIndiaGate`；france `drawHaussmannLeft`、`drawHaussmannRight`；war `drawRuins`、`drawCity`；watch `drawBillboard`。
- **載具**：countdown `drawYacht`；gulf `drawAirliner`、`drawTanker`；orbit `drawSatellite`、`drawRocket`；core `drawCybertruck`；war `drawTank`（左右兩輛用鏡像，座標寫死）。
- **動物**：countdown `drawBird`、馬的身體（在 `drawCowboy` 裡）；gulf 駱駝的身體（在 `drawCamelRider` 裡）；heat `drawStag`。
- **自然與地景**：countdown `drawShore`、`drawSun`；gulf `drawSky`、`drawMoon`、`drawSeaWaves`；orbit `drawMountain`；market `drawFuji`；heat `drawFireHill`；war `drawTerrain`；pharma `drawGround`；stage `traceHill`。
- **符號與文字**：market `drawGreek`（π Σ ν）、`drawYen`、`drawArrow`、`drawGrid`；france `drawEuroBanner`；TRUMP 字樣（在 `drawTrumpTower` 裡）；queue `drawFlag`。
- **道具**：countdown `drawHourglass`、`traceGlass`、`drawSandStream`、`drawMinuteHand`；gulf `drawBarrel`；heat 溫度計三件；market `drawBanknotes`；core `drawBrain`、`drawSafe`；reboot `drawProjector`、蜘蛛網四件；pharma 針筒、顯微鏡、實驗桌、口紅、試管架、櫃子；france `drawPipeline`、水滴、`drawBoot`、`drawBallotBox`、`drawMotionLines`；war `drawBurst`；watch 攝影機兩件；floor `drawBottle`。

日後如果第二個地方要用到其中某一個，再把它參數化搬進來。

## 搬家時怎麼確認畫面沒變

函式本體是用腳本從章節檔原文抽出來的，只把模組層級的常數換成參數（例如 `GROUND_Y` → `groundY`、`FLIGHT_ANGLE` → `angle`、`CHIP_RX` → `rx`）。搬完之後用無頭瀏覽器把「搬家前的原文」和「元件庫的函式」各畫一次（用章節裡實際的參數，8 倍解析度），逐像素比較，64 組全部零差異。另外每章截圖前後對照。

## 幾個呼叫慣例

- `traceXxx` 只下筆、不上色；`drawXxx` 會自己上色。
- 少數元件沿用呼叫端已設定的 `fillStyle`（`drawStar`、不給 `color` 的 `drawWaveBand`），文件註解裡有寫。
- 有些元件的參數是整筆資料的陣列（`drawTent(ctx, tent)`、`drawTurbineRotor(ctx, turbine)`、`drawTablet(ctx, tablet)`…），因為章節裡本來就是一張表一筆一筆傳進來；陣列每一格的意義寫在文件註解裡。
- 原本靠章節常數算出來的值現在由呼叫端傳入：`drawQueuePerson` 和 `drawWatcher` 的 `bottom`、`drawPalm` 的 `groundY`、`drawJet` 的 `pitch`、`drawMissile` 的 `angle`。
