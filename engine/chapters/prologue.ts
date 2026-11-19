// 序章：水晶球（#97–99、#117）。
// 觀星者用望遠鏡看星星 → 鏡頭移到旁邊發光的水晶球 → 球裡浮現整個圓 → 往球的頂端推進，接到下一章的領袖。
import { Color, Group, Mesh, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial, Vector3 } from "three";
import { clamp, linearstep, smooth } from "../core";
import { createRegistry } from "../elements";
import { applyCameraShot, makeCameraTrack } from "../shared/camera";
import { drawSparkle, traceBlob } from "../shared/world/props";
import { PACE, pacedCaptions } from "../pace";
import { DEFAULT_STAGE } from "../stage3d";
import { BLACK, CIRCLE, FULL_VIEW, LEADERS_VIEW, RED, WHITE, coverSprite, shot, toUnits, toWorld } from "../shared/world/space";

const BALL = { x: 623, y: 1167, r: 27 }; // 水晶球，封面像素
const INNER_R = 23.5; // 球裡那個圓的半徑
const DISC_Z = 0.105; // 球裡那個圓所在的深度

// 日本區塊的黑色夜空（地景，不屬於任何編號）
const NIGHT = [
  [398, 1108], [430, 1100], [470, 1112], [505, 1108], [530, 1100], [556, 1108], [578, 1118], [590, 1132], [586, 1150],
  [570, 1166], [558, 1184], [546, 1200], [536, 1216], [528, 1236], [470, 1238], [448, 1226], [428, 1210], [410, 1186], [398, 1150],
];
const STARS = [[485, 1139, 5], [515, 1137, 3], [552, 1147, 6.5], [537, 1179, 5.5], [498, 1160, 2.4]];
// 水晶球周圍的光芒：[角度（度，0 朝右、逆時針）, 內半徑, 外半徑]
const RAYS = [[0, 36, 50], [26, 37, 50], [52, 38, 50], [78, 38, 52], [100, 38, 52], [128, 37, 49], [154, 36, 48], [180, 36, 50], [208, 37, 50], [-28, 37, 50]];

export function build(register, { portal = null, resolution = null } = {}) {
  const group = new Group();

  const night = coverSprite([392, 1094, 596, 1242], (ctx) => {
    traceBlob(ctx, NIGHT);
    ctx.fillStyle = BLACK;
    ctx.fill();
  }, { z: 0, scale: 6 });
  group.add(night);

  // #98 夜空的星 ×5
  const stars = new Group();
  for (const [x, y, r] of STARS) {
    stars.add(coverSprite([x - r, y - r, x + r, y + r], (ctx) => drawSparkle(ctx, x, y, r), { z: 0.02, pad: 1, scale: 16 }));
  }
  register(98, stars, { count: 5 });
  group.add(stars);

  // #97 用望遠鏡觀星的人：紙白色的剪影，站在黑色夜空前
  const astronomer = coverSprite([458, 1150, 532, 1240], (ctx) => {
    ctx.fillStyle = WHITE;
    ctx.strokeStyle = WHITE;
    // 三腳架
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const [x, y] of [[488, 1236], [506, 1238], [521, 1226]]) {
      ctx.moveTo(505, 1188);
      ctx.lineTo(x, y);
    }
    ctx.moveTo(505, 1178);
    ctx.lineTo(505, 1190);
    ctx.stroke();
    // 望遠鏡：斜向右上的粗管，前端較粗
    ctx.lineCap = "butt";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(489, 1183);
    ctx.lineTo(512, 1167);
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(510, 1168.5);
    ctx.lineTo(526, 1157);
    ctx.stroke();
    // 人：頭、身體、抬起扶著望遠鏡的手臂
    ctx.beginPath();
    ctx.ellipse(473.5, 1173, 5.6, 6.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(463, 1186);
    ctx.quadraticCurveTo(464, 1180, 471, 1180);
    ctx.lineTo(478, 1180);
    ctx.quadraticCurveTo(484, 1181, 485, 1190);
    ctx.lineTo(484, 1236);
    ctx.lineTo(463, 1236);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 4.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(481, 1186);
    ctx.lineTo(489, 1194);
    ctx.lineTo(495, 1183);
    ctx.stroke();
    // 兩腿之間一道黑縫
    ctx.fillStyle = BLACK;
    ctx.fillRect(473, 1212, 1.2, 24);
  }, { z: 0.06 });
  register(97, astronomer);
  group.add(astronomer);

  // #99 水晶球：黑色的球、紅色高光與星芒、紅色球座、四周一圈紅色光芒
  const ball = new Group();
  ball.add(
    coverSprite([590, 1136, 656, 1212], (ctx) => {
      ctx.fillStyle = BLACK;
      ctx.beginPath();
      ctx.arc(BALL.x, BALL.y, BALL.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(598, 1200, 50, 5.5);
      ctx.beginPath();
      ctx.roundRect(593, 1204.5, 60, 5.5, 1.5);
      ctx.fill();
      // 球座
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.moveTo(605, 1200.5);
      ctx.quadraticCurveTo(606, 1190, 623, 1190);
      ctx.quadraticCurveTo(640, 1190, 641, 1200.5);
      ctx.closePath();
      ctx.fill();
      // 左側高光
      ctx.strokeStyle = RED;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(BALL.x, BALL.y, BALL.r - 6, Math.PI * 0.82, Math.PI * 1.38);
      ctx.stroke();
    }, { z: 0.1 }),
  );
  // 球裡的星芒：獨立一張圖，整個圓浮現時淡出
  const ballStars = coverSprite([602, 1146, 646, 1190], (ctx) => {
    drawSparkle(ctx, 624, 1160, 6, RED);
    drawSparkle(ctx, 636, 1173, 5, RED);
    drawSparkle(ctx, 616, 1179, 3.4, RED);
  }, { z: 0.11 });
  ball.add(ballStars);
  const rays = RAYS.map(([deg, r0, r1]) => {
    const a = (-deg * Math.PI) / 180;
    const x0 = BALL.x + Math.cos(a) * r0, y0 = BALL.y + Math.sin(a) * r0;
    const x1 = BALL.x + Math.cos(a) * r1, y1 = BALL.y + Math.sin(a) * r1;
    return coverSprite([Math.min(x0, x1) - 2, Math.min(y0, y1) - 2, Math.max(x0, x1) + 2, Math.max(y0, y1) + 2], (ctx) => {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }, { z: 0.09, pad: 0 });
  });
  ball.add(...rays);
  register(99, ball);
  group.add(ball);

  // #117 整體圓形構圖：球裡的那個圓。有 portal 時顯示終章畫面的縮圖，沒有時（終章自己）只是一個白色圓盤。
  const world = makeWorldDisc(portal, resolution);
  register(117, world);
  group.add(world);

  return { group, parts: { stars, ballStars, rays, world } };
}

// 球裡的圓盤：把終章（整個圓）的 render target 縮進來。
// portal 畫面是螢幕比例的，圓在正中央，所以取樣範圍要依畫面長寬比換算（uRes）。
function makeWorldDisc(portal, resolution) {
  const size = toUnits(INNER_R * 2);
  // 終章全景裡，圓的半徑占畫面高度的比例；多留 6% 讓頂端的領袖也進得來
  const radiusInView = (CIRCLE.r * 1.06) / FULL_VIEW.heightPx;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uPortal: portal ?? { value: null },
      uRes: resolution ?? { value: { x: 1, y: 1 } },
      uHasPortal: { value: portal ? 1 : 0 },
      uReveal: { value: 0 },
      uRadius: { value: radiusInView },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D uPortal; uniform vec2 uRes; uniform float uHasPortal, uReveal, uRadius;
      varying vec2 vUv;
      void main() {
        vec2 d = (vUv - 0.5) * 2.0;                 // 圓盤上的位置，-1..1
        float inside = smoothstep(1.0, 0.985, length(d));
        vec3 col = vec3(0.96, 0.95, 0.92);
        if (uHasPortal > 0.5) {
          // 螢幕空間取樣（原作書本插畫的做法）：球裡看到的就是下一章此刻的畫面，
          // 鏡頭推到圓盤蓋滿整個螢幕時，畫面已經全是下一章，硬切看不出來
          col = texture2D(uPortal, gl_FragCoord.xy / uRes).rgb;
        }
        gl_FragColor = vec4(col, inside * uReveal);
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(size, size), material);
  const [x, y] = toWorld(BALL.x, BALL.y);
  mesh.position.set(x, y, DISC_Z);
  mesh.renderOrder = 11;
  return mesh;
}

// 節奏範本：book。原作是「封面張開 0.10–0.30 → 翻三頁 0.30–0.64 → 0.62 起俯衝進插畫，下一章硬切」；
// 這裡對應成「水晶球亮起 → 球裡的圓浮現 → 0.62 起推進球頂」，三句字幕落在開書與翻頁的時間。
export default function createPrologueChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color(WHITE);
  const camera = new PerspectiveCamera(30, 1, 0.01, 100);
  const { entries, register } = createRegistry(plan.id);
  const { group, parts } = build(register, { portal: chapterContext.portal("stage"), resolution: chapterContext.resolution });
  scene.add(group);
  const { open, pages, cameraSettle, dive } = PACE.book.beats;

  const track = makeCameraTrack([
    shot(-0.3, 500, 1172, 170),
    shot(open[0], 503, 1170, 156),
    shot(pages[0], 560, 1168, 160),
    shot(0.47, 610, 1167, 132),
    shot(cameraSettle, BALL.x, BALL.y - 2, 96),
    shot(1.3, BALL.x, BALL.y - 4, 80),
  ]);
  // 立體化之後的俯衝：直接對準立起來的圓盤中心，推到它蓋滿整個螢幕為止
  const stage = { stand: 1, pitch: DEFAULT_STAGE.pitch, target: new Vector3(), distance: 1, targetPitch: 90 - 86, blend: 0 };
  const discRadius = toUnits(INNER_R);

  return {
    id: plan.id,
    portals: ["stage"],
    stage,
    scene,
    camera,
    grade: { vignette: 0.28, grain: 0.22 },
    sound: { wind: 0.22, tick: 0.12 },
    captions: pacedCaptions("book", [
      "封面最下面，有一個人架著望遠鏡看星星。整張圖只有他在看未來。",
      "他旁邊放著一顆發光的水晶球，正對著圓頂端的領袖。",
      "雜誌在自嘲：這張封面，就是我們的水晶球。",
    ]),
    elements: entries,
    group,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      // 待機時的指標視差在俯衝前淡出（原作 0.62→0.90）
      applyCameraShot(camera, track(p), frame.aspect, frame.pointer, 0.02 * (1 - smooth(linearstep(p, dive[0], 0.9))));
      // 俯衝（0.62 起）：注視點從自動取景滑向圓盤中心，距離縮到圓盤的外接範圍剛好蓋滿螢幕
      parts.world.getWorldPosition(stage.target);
      const halfDiagonal = Math.tan((camera.fov * Math.PI) / 360) * Math.hypot(1, frame.aspect);
      stage.distance = (discRadius * 0.9) / halfDiagonal;
      stage.blend = smooth(linearstep(p, dive[0], dive[1]));

      // 星星閃爍
      parts.stars.children.forEach((star, i) => {
        star.scale.setScalar(0.85 + 0.15 * Math.sin(frame.time * (1.1 + i * 0.37) + i * 2.1));
      });
      // 水晶球亮起（對應開書）：光芒變長並輪流伸縮
      const glow = smooth(linearstep(p, open[0], open[1]));
      parts.rays.forEach((ray, i) => {
        ray.scale.setScalar(0.7 + 0.3 * glow * (0.75 + 0.25 * Math.sin(frame.time * 2.2 + i * 0.9)));
      });
      // 球裡的星芒淡出、整個圓浮現（對應翻到第三頁，0.47–0.64）
      const reveal = smooth(linearstep(p, 0.47, pages[1]));
      parts.ballStars.material.opacity = 1 - reveal;
      parts.world.material.uniforms.uReveal.value = reveal;
    },
  };
}
