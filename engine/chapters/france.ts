// 第 6 章：法國（#67–75）。
// 共和廣場的瑪麗安娜像與奧斯曼建築 → 廣場上的群眾與裂開的 € 標語 → 斷裂的管線與踩下來的軍靴 → 投票的紅手。
//
// 節奏範本：goose。節拍對應：
//   strike 0.05        標語從人群裡舉起來、舉手的人開始跳（音效 flip）
//   reveal 0.08–0.30   鏡頭從遠處落到雕像與建築；有人爬上雕像（0.14–0.24）。字幕 1
//   pushIn 0.12–0.46   推進到廣場上的人群與 € 標語。字幕 2
//   rise 0.46–0.49     軍靴在右上方抬起
//   jump 0.515–0.575   軍靴朝左下踩下來
//   land 0.575–0.64    踩到封面上的位置（懸在群眾上方，不碰票箱），頓一下
//   walk 0.60–0.79     管線的黑油滴下來；紅手拿著選票移到票箱上方。字幕 3 停在管線與軍靴
//   out 0.80           選票投進票箱（音效 click），close 0.795–0.835 紅色動感線閃出來
//   back 0.80–0.98     鏡頭退後：軍靴、管線、票箱、松樹同框。字幕 4
import { Color, Group, PerspectiveCamera, Scene } from "three";
import { clamp, envelope, linearstep, smooth } from "../core";
import { PACE, pacedCaptions, pacedCues } from "../pace";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawProtester } from "../shared/world/people";
import { drawPine, traceBlob } from "../shared/world/props";
import { strokePolyline as strokeLine, tracePoly } from "../shared/world/shapes";
import { BLACK, DARK_RED, RED, WHITE, coverSprite, shot, toUnits } from "../shared/world/space";

// ---- #70 群眾：四排共 40 人。[中線 x, 頭的 y, 舉手：""｜"L"｜"R"｜"LR"] ----
// 每排：腳底 y，以及每個人的 [中線 x, 頭 y, 舉手（"L"／"R"／"LR"）]
const CROWD_ROWS: { feet: number; people: [number, number, string][] }[] = [
  { feet: 912, people: [[662, 893, ""], [674, 889, "R"], [686, 886, ""], [698, 884, "L"], [710, 883, ""], [722, 884, "R"], [734, 883, ""], [746, 885, ""], [758, 882, "LR"], [770, 886, ""], [781, 890, ""]] },
  { feet: 926, people: [[668, 902, ""], [680, 899, ""], [692, 898, "L"], [704, 897, ""], [716, 898, ""], [728, 897, "R"], [740, 898, ""], [752, 897, "L"], [764, 898, ""], [776, 900, ""]] },
  { feet: 940, people: [[686, 913, ""], [699, 911, "R"], [712, 912, ""], [725, 911, ""], [738, 912, "LR"], [751, 911, ""], [764, 912, ""], [777, 913, "L"]] },
  { feet: 951, people: [[704, 922, ""], [718, 924, ""], [732, 925, "R"], [746, 927, ""], [760, 927, ""], [774, 926, ""], [790, 924, ""], [805, 925, "L"], [820, 925, ""], [836, 924, ""], [851, 929, ""]] },
];

// ---- #67 瑪麗安娜像：右手高舉橄欖枝，站在圓柱形基座上 ----
function drawMarianne(ctx) {
  ctx.fillStyle = BLACK;
  // 基座：上細下粗的兩段圓柱
  ctx.fillRect(738, 824, 30, 18);
  ctx.fillRect(734, 839, 38, 46);
  // 基座左側的附屬雕像（一團剪影）
  traceBlob(ctx, [[727, 784], [735, 780], [738, 800], [737, 832], [728, 834], [723, 822], [726, 806], [723, 794]]);
  ctx.fill();
  // 身體與長袍
  traceBlob(ctx, [[735, 762], [744, 758], [756, 758], [764, 762], [770, 774], [775, 786], [779, 794], [776, 801], [770, 798], [768, 806], [771, 818], [772, 831], [734, 831], [731, 818], [729, 806], [731, 794], [735, 786], [734, 774]]);
  ctx.fill();
  // 高舉的右臂（畫面左側）與橄欖枝
  strokeLine(ctx, [[737, 765], [729, 753], [722, 742]], BLACK, 6.5);
  strokeLine(ctx, [[722, 743], [724, 731], [729, 719]], BLACK, 1.6);
  ctx.fillStyle = BLACK;
  for (const [x, y, angle] of [[720, 735, -0.9], [727, 736, 0.5], [721, 728, -0.8], [729, 729, 0.6], [723, 722, -0.6], [731, 723, 0.8], [729, 717, 0.1]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 4.2, 1.7, angle - Math.PI / 2 + 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // 頭與髮冠
  ctx.beginPath();
  ctx.ellipse(750, 753.5, 5.4, 6.8, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y, r] of [[749.5, 748.5, 6.3], [756, 750.5, 3.4], [744.6, 751.5, 2.8]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // 白色：領口、斜披的布與衣褶
  ctx.fillStyle = WHITE;
  tracePoly(ctx, [[745, 763], [751.5, 762], [750, 774], [746, 771]]);
  ctx.fill();
  strokeLine(ctx, [[757, 768], [748, 777], [739, 785]], WHITE, 2.6);
  strokeLine(ctx, [[740, 788], [749, 791], [742, 802], [750, 804], [744, 817], [751, 816]], WHITE, 1.5);
  strokeLine(ctx, [[755, 781], [752, 800], [755, 826]], WHITE, 1.2);
  strokeLine(ctx, [[761, 779], [761, 826]], WHITE, 1.2);
  strokeLine(ctx, [[766, 790], [765, 823]], WHITE, 1.1);
  // 基座上的環線、拱門與直線
  strokeLine(ctx, [[740, 829.5], [766, 829.5]], WHITE, 1.3);
  strokeLine(ctx, [[737, 838.5], [769, 838.5]], WHITE, 1.3);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(742.5, 876);
  ctx.lineTo(742.5, 851);
  ctx.arc(747, 851, 4.5, Math.PI, 0);
  ctx.lineTo(751.5, 876);
  ctx.stroke();
  strokeLine(ctx, [[758, 848], [758, 876]], WHITE, 1.2);
  strokeLine(ctx, [[764, 848], [764, 876]], WHITE, 1.2);
}

// ---- #69 奧斯曼建築：斜屋頂、老虎窗、煙囪、一排排長窗與陽台線 ----
function drawHaussmannLeft(ctx) {
  ctx.fillStyle = BLACK;
  tracePoly(ctx, [[633, 810], [642, 806], [702, 846], [702, 902], [664, 920], [640, 908], [633, 897], [639, 874], [635, 850]]);
  ctx.fill();
  // 和雕像之間的那一段
  tracePoly(ctx, [[700, 846], [704, 838], [717, 838], [723, 850], [737, 850], [737, 888], [700, 888]]);
  ctx.fill();
  for (const [x, y, w, h] of [[639, 798, 5, 12], [646, 803, 3, 8], [682, 821, 5, 12], [690, 827, 3.5, 9], [707, 829, 4, 11], [713, 832, 3, 8]]) ctx.fillRect(x, y, w, h);
  // 老虎窗
  ctx.fillStyle = WHITE;
  for (const [x, y] of [[638, 819], [655, 824], [671, 831], [687, 838], [708, 844]]) {
    ctx.beginPath();
    ctx.roundRect(x, y, 4.2, 6.5, [2, 2, 0, 0]);
    ctx.fill();
  }
  // 檐口與陽台線：往右下斜（透視）
  const line1 = (x) => 837 + (x - 634) * 0.25;
  const line2 = (x) => 859 + (x - 634) * 0.22;
  const line3 = (x) => 881 + (x - 634) * 0.2;
  strokeLine(ctx, [[634, line1(634)], [701, line1(701)]], WHITE, 1.7);
  strokeLine(ctx, [[636, line1(636) + 3.4], [701, line1(701) + 3.4]], WHITE, 0.8);
  strokeLine(ctx, [[648, line2(648)], [697, line2(697)]], WHITE, 1.4);
  strokeLine(ctx, [[646, line3(646)], [680, line3(680)]], WHITE, 1.4);
  // 長窗：每扇兩道直線
  for (const x of [643, 660, 677, 693]) {
    for (const [line, top, bottom] of [[line1, 7, 19], [line2, 5, 18], [line3, 5, 17]] as [(x: number) => number, number, number][]) {
      if (line === line3 && x > 665) continue; // 被群眾擋住的不畫
      for (const dx of [0, 3.6]) strokeLine(ctx, [[x + dx, line(x) + top], [x + dx, line(x) + bottom]], WHITE, 1.1);
    }
  }
  strokeLine(ctx, [[704, 856], [704, 884]], WHITE, 1.1);
}
function drawHaussmannRight(ctx) {
  ctx.fillStyle = BLACK;
  tracePoly(ctx, [[772, 852], [786, 846], [840, 871], [844, 876], [844, 930], [772, 930]]);
  ctx.fill();
  for (const [x, y, w, h] of [[785, 837, 4.5, 11], [791, 842, 3, 7], [832, 860, 4.5, 11], [826, 862, 3, 7]]) ctx.fillRect(x, y, w, h);
  ctx.fillStyle = WHITE;
  for (const [x, y] of [[796, 855], [809, 861], [822, 867]]) {
    ctx.beginPath();
    ctx.roundRect(x, y, 4, 6, [2, 2, 0, 0]);
    ctx.fill();
  }
  const cornice = (x) => 866 + (x - 790) * 0.36;
  strokeLine(ctx, [[790, cornice(790)], [840, cornice(840)]], WHITE, 1.6);
  for (const x of [821, 830]) {
    for (const [top, bottom] of [[5, 17], [22, 34], [39, 50]]) {
      for (const dx of [0, 3.4]) strokeLine(ctx, [[x + dx, cornice(x) + top], [x + dx, cornice(x) + bottom]], WHITE, 1);
    }
  }
  strokeLine(ctx, [[839.5, 886], [839.5, 926]], WHITE, 1.1);
}

// 廣場的黑色地面（不屬於任何編號）：群眾站在上面
const PLAZA = [[640, 902], [700, 878], [790, 878], [843, 905], [846, 934], [800, 953], [762, 958], [722, 951], [692, 941], [664, 920]];

// ---- #71 裂開的 € 標語：斜放的白牌，黑圓裡一個暗紅的 €，一道亮紅的裂痕 ----
function drawEuroBanner(ctx) {
  ctx.fillStyle = WHITE;
  tracePoly(ctx, [[777, 885], [810, 879], [817, 909], [783, 914.5]]);
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.arc(797, 897, 13.6, 0, Math.PI * 2);
  ctx.fill();
  // €
  ctx.strokeStyle = DARK_RED;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(792.5, 899, 5.2, 0.9, Math.PI * 2 - 0.9);
  ctx.stroke();
  strokeLine(ctx, [[785.5, 897.4], [792.5, 897.4]], DARK_RED, 1.4);
  strokeLine(ctx, [[785.5, 900.6], [792, 900.6]], DARK_RED, 1.4);
  // 裂痕：從圓頂鋸齒狀劈到圓底
  ctx.fillStyle = RED;
  tracePoly(ctx, [[794, 883.8], [800, 883.6], [802.5, 890], [800, 893], [804.5, 899], [802, 902], [805, 910], [801.5, 910.2], [799.5, 903], [801.5, 900], [797, 894], [799, 891]]);
  ctx.fill();
}

// ---- #72 斷裂的管線 ----
function drawPipeline(ctx) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(803, 794, 229, 28, 13);
  ctx.clip();
  ctx.fillStyle = BLACK;
  ctx.fillRect(800, 790, 240, 40);
  ctx.fillStyle = RED;
  ctx.fillRect(800, 790, 240, 12);
  ctx.restore();
  // 法蘭接頭：比管身粗的兩圈
  for (const [x0, bulge] of [[900, -1], [937, 1]]) {
    ctx.fillStyle = BLACK;
    ctx.beginPath();
    ctx.roundRect(x0, 790, 17, 36, 5);
    ctx.fill();
    for (const dx of [5, 11.5]) {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0 + dx, 792.5);
      ctx.quadraticCurveTo(x0 + dx + bulge * 3.2, 808, x0 + dx, 823.5);
      ctx.stroke();
    }
  }
  // 斷口：把中間挖掉一道鋸齒
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  tracePoly(ctx, [[918, 786], [923, 799], [916.5, 805], [921, 812], [918, 830], [932, 830], [934.5, 813], [928, 806], [933, 799], [930, 786]]);
  ctx.fill();
  ctx.restore();
}
/** 小的那一滴 */
function drawSmallDrop(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(911, 832.5);
  ctx.bezierCurveTo(913, 836.5, 914.6, 838.5, 914.6, 840.6);
  ctx.arc(911, 840.6, 3.6, 0, Math.PI);
  ctx.bezierCurveTo(907.4, 838.5, 909, 836.5, 911, 832.5);
  ctx.fill();
}
/** 還連在斷口上的那一道：一條細流，底下垂著一大滴 */
function drawLongDrip(ctx) {
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.moveTo(919, 817);
  ctx.lineTo(926, 817);
  ctx.bezierCurveTo(926.5, 827, 928.5, 833, 929.5, 837);
  ctx.bezierCurveTo(933.5, 843, 932.5, 853.5, 926.5, 853.5);
  ctx.bezierCurveTo(920.5, 853.5, 920, 844, 923.5, 838);
  ctx.bezierCurveTo(923, 830, 920, 826, 919, 817);
  ctx.fill();
}

// ---- #73 軍靴：靴筒在左上，露出紅色鞋底紋；整隻往左下踩，沒有碰到票箱 ----
function drawBoot(ctx) {
  // 靴筒後面的提環
  ctx.strokeStyle = BLACK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(832.5, 846, 3.2, 3.8, -0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = BLACK;
  // 靴筒與鞋面
  traceBlob(ctx, [[835, 846], [845, 836], [849, 828], [855, 828], [858, 838], [863, 849], [870, 856], [868, 876], [860, 890], [851, 889], [847, 874], [842, 860], [837, 853]]);
  ctx.fill();
  // 鞋底：前掌（右上的大瓣）與後跟（左下的小瓣）
  traceBlob(ctx, [[866, 852], [873, 845], [884, 842.5], [894, 846], [897.5, 856], [896, 868], [890, 878], [881, 881], [879, 889], [874, 898], [864, 903], [855, 902], [851, 893], [854, 883], [861, 870]]);
  ctx.fill();
  // 鞋面與鞋底之間的縫線
  ctx.strokeStyle = RED;
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(887.5, 846);
  ctx.bezierCurveTo(874, 852, 870, 868, 864, 876);
  ctx.bezierCurveTo(860, 882, 856, 885, 852.5, 888.5);
  ctx.stroke();
  // 鞋底紋
  ctx.fillStyle = RED;
  for (const [x, y, w, h] of [[891.5, 855, 5.6, 5], [881.5, 861.5, 5.4, 4.2], [890.5, 866, 5.2, 4.4], [876.5, 870, 5.2, 4.2], [886, 873.5, 5.4, 4], [870.5, 886, 6.4, 4.4], [865.5, 894.5, 6.6, 4.2]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.35);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 1.4);
    ctx.fill();
    ctx.restore();
  }
  // 鞋帶
  for (const [x0, y0, x1, y1] of [[849.5, 839.5, 856, 838], [852.5, 845.5, 860, 843.5], [856.5, 851.5, 863.5, 849], [861.5, 857.5, 866, 853.5]]) strokeLine(ctx, [[x0, y0], [x1, y1]], RED, 1.5);
}

// ---- #74 投票箱與投票的紅手 ----
function drawBallotBox(ctx) {
  ctx.fillStyle = BLACK;
  tracePoly(ctx, [[889, 892], [938, 882.5], [970, 891.5], [970, 933], [922, 952], [889, 935]]);
  ctx.fill();
  // 頂面是紅的
  ctx.fillStyle = RED;
  tracePoly(ctx, [[890.5, 892.6], [938, 883.6], [968.5, 892], [922, 903.2]]);
  ctx.fill();
  // 投票口
  ctx.fillStyle = BLACK;
  tracePoly(ctx, [[911, 892.6], [940, 887.4], [950, 890.2], [921, 896]]);
  ctx.fill();
  // 兩個側面的紅色飾線
  strokeLine(ctx, [[895, 903.5], [908.5, 909]], RED, 1.6);
  strokeLine(ctx, [[918, 910.5], [918, 943.5]], RED, 1.6);
  strokeLine(ctx, [[931, 911.5], [962, 903], [962, 929]], RED, 1.6);
}
function drawVotingHand(ctx) {
  // 選票：紅紙上一個 X，下緣插進投票口
  ctx.fillStyle = RED;
  tracePoly(ctx, [[925, 871], [941, 876.5], [935.5, 893.5], [919.5, 890]]);
  ctx.fill();
  strokeLine(ctx, [[928, 881.5], [934, 888.5]], BLACK, 1.3);
  strokeLine(ctx, [[934, 882], [928.5, 888.5]], BLACK, 1.3);
  // 手：從右上的袖口伸下來，手指捏著選票
  ctx.fillStyle = RED;
  traceBlob(ctx, [[959, 855], [962, 869], [951, 874], [942, 880], [936, 882], [929, 876], [927, 868], [934, 860], [946, 856]]);
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.beginPath();
  ctx.ellipse(938.5, 868.5, 2.6, 4.6, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // 黑色袖子
  ctx.beginPath();
  ctx.save();
  ctx.translate(968.5, 859);
  ctx.rotate(-0.33);
  ctx.roundRect(-10.5, -11, 21, 22, 2.6);
  ctx.restore();
  ctx.fill();
  strokeLine(ctx, [[958.3, 853.5], [962.3, 871]], RED, 1.6);
}
function drawMotionLines(ctx) {
  strokeLine(ctx, [[905.5, 858], [911, 872]], RED, 2.2);
  strokeLine(ctx, [[900, 868], [905.5, 874]], RED, 2.2);
  strokeLine(ctx, [[894, 877.6], [907, 880]], RED, 2.2);
}

/** 一個爬雕像的人：黑色人形加白邊，一隻手往上伸。 */
function drawClimber(ctx, cx, headY, feetY, side) {
  drawProtester(ctx, cx, headY, feetY, side > 0 ? "R" : "L", 1.05);
}

/**
 * 在封面座標系裡建立這一章的所有元素。章節本身和終章都呼叫它。
 * @param {(id: number, object: import("three").Object3D, opts?: {count?: number}) => unknown} register
 */
export function build(register) {
  const group = new Group();

  // 地景：廣場的黑色地面
  const plaza = coverSprite([630, 874, 850, 962], (ctx) => {
    traceBlob(ctx, PLAZA);
    ctx.fillStyle = BLACK;
    ctx.fill();
  }, { z: 0, scale: 5 });
  group.add(plaza);

  // #69 奧斯曼建築：雕像左右各一棟
  const buildings = new Group();
  buildings.add(
    coverSprite([630, 796, 739, 922], drawHaussmannLeft, { z: 0.01, scale: 8 }),
    coverSprite([770, 835, 846, 932], drawHaussmannRight, { z: 0.01, scale: 8 }),
  );
  register(69, buildings, { count: 2 });
  group.add(buildings);

  // #67 瑪麗安娜像
  const statue = coverSprite([714, 712, 782, 886], drawMarianne, { z: 0.02, scale: 9 });
  register(67, statue);
  group.add(statue);

  // #68 攀上雕像的人：右邊一個舉著手，左邊一個正在往上爬
  const climbers = new Group();
  for (const [cx, headY, feetY, side] of [[775, 803, 846, 1], [727, 842, 874, -1]]) {
    const climber = coverSprite([cx - 9, headY - 12, cx + 9, feetY], (ctx) => drawClimber(ctx, cx, headY, feetY, side), { z: 0.03, scale: 12 });
    climber.userData.restY = climber.position.y;
    climbers.add(climber);
  }
  register(68, climbers);
  group.add(climbers);

  // #70 群眾：一人一張圖，後排先畫
  const crowd = new Group();
  CROWD_ROWS.forEach((row, rowIndex) => {
    for (const [cx, headY, arms] of row.people) {
      const feetY = rowIndex === 3 ? headY + 26 : Math.min(row.feet, headY + 27);
      const person = coverSprite([cx - 8, headY - 11, cx + 8, feetY], (ctx) => drawProtester(ctx, cx, headY, feetY, arms), { z: rowIndex === 3 ? 0.08 : 0.04 + rowIndex * 0.01, scale: 12 });
      person.userData.restY = person.position.y;
      person.userData.raised = arms !== "";
      person.userData.phase = (cx * 0.37 + headY * 0.11) % (Math.PI * 2);
      crowd.add(person);
    }
  });
  register(70, crowd, { count: 40 });
  group.add(crowd);

  // #71 裂開的 € 標語：在最前排和後面三排之間
  const banner = coverSprite([775, 877, 819, 916], drawEuroBanner, { z: 0.07, scale: 16 });
  banner.userData.restY = banner.position.y;
  register(71, banner);
  group.add(banner);

  // #72 斷裂的管線，和它滴下來的兩滴黑油
  const pipeline = new Group();
  const pipe = coverSprite([801, 788, 1034, 828], drawPipeline, { z: 0.03, scale: 8 });
  const smallDrop = coverSprite([906, 831, 916, 846], drawSmallDrop, { z: 0.02, scale: 16 });
  const longDrip = coverSprite([918, 816, 933, 855], drawLongDrip, { z: 0.02, scale: 16, pad: 1 });
  smallDrop.userData.restY = smallDrop.position.y;
  longDrip.userData.restY = longDrip.position.y;
  longDrip.userData.height = toUnits(41);
  pipeline.add(pipe, smallDrop, longDrip);
  register(72, pipeline);
  group.add(pipeline);

  // #73 軍靴
  const boot = coverSprite([827, 825, 900, 906], drawBoot, { z: 0.05, scale: 12 });
  boot.userData.rest = boot.position.clone();
  register(73, boot);
  group.add(boot);

  // #74 投票箱、紅手、動感線
  const ballot = new Group();
  const box = coverSprite([887, 880, 972, 954], drawBallotBox, { z: 0.03, scale: 10 });
  const hand = coverSprite([917, 842, 984, 896], drawVotingHand, { z: 0.05, scale: 12 });
  const motionLines = coverSprite([891, 855, 914, 883], drawMotionLines, { z: 0.04, scale: 14 });
  hand.userData.rest = hand.position.clone();
  ballot.add(box, hand, motionLines);
  register(74, ballot);
  group.add(ballot);

  // #75 兩棵松樹
  const pines = new Group();
  pines.add(
    coverSprite([994, 826, 1028, 880], (ctx) => drawPine(ctx, 1011, 879, 52), { z: 0.01 }),
    coverSprite([988, 882, 1030, 954], (ctx) => drawPine(ctx, 1008, 953, 70), { z: 0.01 }),
  );
  register(75, pines, { count: 2 });
  group.add(pines);

  return { group, parts: { statue, climbers, crowd, banner, smallDrop, longDrip, boot, hand, motionLines, pines } };
}

/** 這一章最後一格的鏡位：軍靴、管線、票箱、松樹同框。 */
export const END_VIEW = { px: 932, py: 880, heightPx: 196 };

export default function createFranceChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register);
  scene.add(group);
  const { climbers, crowd, banner, smallDrop, longDrip, boot, hand, motionLines, pines } = parts;
  const { strike, rise, jump, land, walk, out, close } = PACE.goose.beats;

  // 鏡頭在每句字幕的時間窗裡停在那句話講的東西上
  const track = makeCameraTrack([
    shot(-0.3, 760, 850, 380),
    shot(0.1, 742, 822, 250), // 字幕 1：雕像與兩棟建築
    shot(0.25, 744, 818, 232),
    shot(0.3, 762, 902, 132), // 字幕 2：群眾與 € 標語
    shot(0.46, 770, 900, 118),
    shot(0.52, 876, 858, 142), // 字幕 3：管線斷口與軍靴（靴子放在字幕框的右上方）
    shot(0.72, 874, 858, 134),
    shot(0.765, 934, 892, 122), // 選票投進票箱
    shot(0.83, 934, 890, 130),
    shot(1, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx), // 字幕 4：退後
    shot(1.3, END_VIEW.px, END_VIEW.py, END_VIEW.heightPx + 16),
  ]);

  return {
    id: plan.id,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { crowd: 0.4, drone: 0.15 },
    cues: pacedCues("goose", ["flip", "click"]),
    captions: pacedCaptions("goose", [
      "瑪麗安娜像，兩旁是奧斯曼建築：這裡是巴黎共和廣場。有人攀上了雕像，示威在升級。",
      "約四十名群眾，有人舉手，有人舉著裂開的 € 標語：反歐元或財政危機就是訴求本身。",
      "斷裂的管線滴下兩滴黑油；軍靴的鞋底朝著投票箱，但沒有碰到；可能是威權反撲，也可能是派兵。",
      "一隻紅手把選票投進票箱：2027 年 4–5 月法國總統大選，圖上唯一的民主動作。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.03);

      // 觸發（0.05）：標語從人群裡舉起來，之後跟著口號上下晃
      const lifted = smooth(linearstep(p, strike, strike + 0.07));
      banner.position.y = banner.userData.restY - toUnits(24) * (1 - lifted) + lifted * Math.sin(frame.time * 3.1) * toUnits(0.8);
      banner.rotation.z = lifted * Math.sin(frame.time * 2.3) * 0.035;

      // 群眾：舉手的人在跳，其他人只微微晃。軍靴踩下來的那一下（land）全體往下一縮
      const shouting = linearstep(p, strike, strike + 0.05);
      const cower = envelope(p, land[0], land[0] + 0.02, land[1], land[1] + 0.06);
      for (const person of crowd.children) {
        const { restY, raised, phase } = person.userData;
        const hop = raised ? Math.abs(Math.sin(frame.time * 5.2 + phase)) * toUnits(2.4) : Math.sin(frame.time * 2.2 + phase) * toUnits(0.5);
        person.position.y = restY + shouting * hop * (1 - 0.8 * cower) - cower * toUnits(1.6);
      }

      // 爬雕像的人：字幕 1 的時間裡爬上去，到位後舉著的手跟著晃
      climbers.children.forEach((climber, i) => {
        const climbed = smooth(linearstep(p, 0.14 + i * 0.03, 0.22 + i * 0.03));
        climber.position.y = climber.userData.restY - toUnits(i === 0 ? 22 : 14) * (1 - climbed);
        climber.rotation.z = climbed * Math.sin(frame.time * 3 + i * 2) * 0.05;
      });

      // 軍靴：rise 時在右上方抬起，jump 朝左下踩下來，land 到封面上的位置後頓一下
      const raisedUp = 1 - smooth(linearstep(p, jump[0], jump[1]));
      const shown = smooth(linearstep(p, rise[0] - 0.02, rise[1]));
      const thud = envelope(p, jump[1], land[0] + 0.012, land[0] + 0.02, land[1]);
      boot.position.x = boot.userData.rest.x + toUnits(34) * raisedUp - toUnits(2.2) * thud;
      boot.position.y = boot.userData.rest.y + toUnits(40) * raisedUp + toUnits(46) * (1 - shown) - toUnits(2.6) * thud;
      boot.rotation.z = -0.3 * raisedUp;
      boot.visible = shown > 0;

      // 黑油：小的那滴先落下，連在斷口上的那一道慢慢拉長
      const fall = linearstep(p, jump[0], land[0]);
      smallDrop.position.y = smallDrop.userData.restY + toUnits(13) * (1 - fall * fall);
      smallDrop.visible = fall > 0;
      const stretch = 0.25 + 0.75 * smooth(linearstep(p, walk[0], walk[0] + 0.12));
      longDrip.scale.y = stretch;
      longDrip.position.y = longDrip.userData.restY + (longDrip.userData.height * (1 - stretch)) / 2;

      // 紅手：walk 的後半段把選票移到票箱上方，out（0.80）投進去；動感線在 close 那一段閃出來
      const cast = smooth(linearstep(p, walk[1] - 0.06, out));
      hand.position.x = hand.userData.rest.x + toUnits(7) * (1 - cast);
      hand.position.y = hand.userData.rest.y + toUnits(15) * (1 - cast);
      const flash = linearstep(p, close[0], close[1]);
      motionLines.visible = flash > 0;
      motionLines.scale.setScalar(0.6 + 0.4 * smooth(flash) + 0.12 * envelope(p, close[0], close[0] + 0.015, close[1] - 0.01, close[1] + 0.02));

      // 松樹隨風微微擺動
      pines.children.forEach((pine, i) => {
        pine.rotation.z = Math.sin(frame.time * 0.9 + i * 1.7) * 0.012;
      });
    },
  };
}

export { CROWD_ROWS };
