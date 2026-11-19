// 終章：電腦裡的世界（使用者的要求，2026-11-19）。
// 前面十五章的世界，原來只是一台老電腦螢幕裡的畫面：鏡頭從螢幕裡退出來，看到一張電腦桌、椅子和桌上的東西。
// 讓人感覺所有事件都被操控，我們其實是活在一台巨大數位電腦底下的生物。
//
// 做法：
// - 電腦桌（電腦、鍵盤、滑鼠、桌椅、桌上所有小物）搬自使用者另一個專案 ~/worm/branded-website（`shared/desk/`），
//   背景和下雨沒有搬；這裡是一片黑色的空間，地上一層暗紅的數位格線。
// - 螢幕上一開始是上一章此刻的畫面（螢幕空間取樣，和原作書本插畫同一招），鏡頭貼得很近、螢幕蓋滿整個畫面，
//   所以硬切看不出來；接著螢幕淡成整張封面（117 個元素的平面版，載入時烘成一張貼圖）。
// - 封面裡的世界是紅黑白三色；退出來之後的「真實世界」是有顏色的（grade.raw 從 0 升到 1）。
//
// 節奏範本：close。原作是「0–0.40 從畫面拉出 → 0.56–0.86 闔書 → 0.85 之後燈暗」；
// 這裡是「0–0.40 從螢幕裡拉出到看見整張桌子 → 0.40–0.85 慢慢繞到側面 → 0.85 之後四周暗下來」。
import {
  CanvasTexture, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, OrthographicCamera,
  PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, RepeatWrapping, SRGBColorSpace, Scene, ShaderMaterial,
  Vector3, WebGLRenderTarget,
} from "three";
import type { BufferGeometry } from "three";
import { clamp, deviceTier, linearstep, smooth } from "../core";
import chapterPlan from "../data/chapters.json";
import { PACE, pacedCaptions } from "../pace";
import { SCREEN_H, SCREEN_POS, SCREEN_TILT, SCREEN_W, createComputer } from "../shared/desk/computer";
import { FLOOR_Y } from "../shared/desk/constants";
import { createDecor } from "../shared/desk/decor";
import { createChair, createDesk } from "../shared/desk/furniture";
import { createKeyboard } from "../shared/desk/keyboard";
import { CIRCLE, FULL_VIEW, toUnits, toWorld } from "../shared/world/space";

const DESK_Y = -450;
// 已經做好的章（原本用 import.meta.glob 列出 chapters/ 的檔案）
const chapterModules = Object.fromEntries(chapterPlan.filter((p) => p.id !== "cover").map((p) => [`./${p.id}.js`, true]));

/** 排在終章前面、已經做好的最後一章：螢幕一開始顯示它的畫面。 */
function previousChapterId() {
  for (const plan of chapterPlan.slice(0, -1).reverse()) if (chapterModules[`./${plan.id}.js`]) return plan.id;
  return null;
}

// 地板：黑底、暗紅的數位格線，越遠越淡
function makeGridTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(200, 40, 30, 0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    const p = (i * size) / 8;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(40, 40);
  texture.anisotropy = 8;
  return texture;
}

let bakedWorld: { target: WebGLRenderTarget; done: boolean } | null = null;
export default async function createCoverChapter(chapterContext, plan) {
  const scene = new Scene();
  scene.background = new Color("#050505");
  scene.fog = new Fog("#050505", 16000, 60000);
  const camera = new PerspectiveCamera(35, 1, 10, 200000);
  const { pullOut, dim } = PACE.close.beats;
  const previous = previousChapterId();
  const renderer = chapterContext.renderer;
  if (deviceTier.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
  }

  // ---- 電腦桌（搬自 branded-website） ----
  // 每一件之間讓出主執行緒（見 main.ts 的 buildContext）：電腦、擺飾、桌子、椅子各自都要建模、產生貼圖
  const pause = () => chapterContext.yield?.();
  const desk = new Group();
  const computer = createComputer();
  await pause();
  const decor = await createDecor(pause);
  await pause();
  const keyboard = createKeyboard({ x: -200, y: DESK_Y, z: 1280 });
  const deskTop = createDesk();
  await pause();
  const chair = createChair();
  await pause();
  desk.add(computer.group, keyboard, deskTop, chair, decor);
  scene.add(desk);
  const floor = new Mesh(new PlaneGeometry(200000, 200000), new MeshBasicMaterial({ map: makeGridTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  scene.add(floor);
  // 椅子和桌腳落在格線上的影子：一片接收陰影的地面（ShadowMaterial 只畫影子）
  // 這裡用另一盞弱光代替，光照設定沿用 branded-website 的 lights_surreal（去掉了雨天的色調）
  const hemi = new HemisphereLight(0xd8dde6, 0x2a2420, 0.55);
  const sun = new DirectionalLight(0xffe9c8, 1.6);
  sun.position.set(14000, 9000, -20000).normalize().multiplyScalar(26000);
  sun.castShadow = deviceTier.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { near: 2000, far: 70000, left: -6000, right: 6000, top: 6000, bottom: -6000 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 18;
  const fill = new DirectionalLight(0xcfdcf0, 0.9);
  fill.position.set(-12000, 9000, 15000);
  const screenGlow = new PointLight(0xffd7a0, 1.2, 4200, 0);
  screenGlow.position.set(0, 760, 950);
  scene.add(hemi, sun, sun.target, fill, fill.target, screenGlow);

  // ---- 螢幕：上一章的畫面 → 整張封面 ----
  // 烘好的封面放在模組層級（bakedWorld）：手機上終章被卸載、捲回來重建時直接沿用，
  // 不必再把十五章的平面版重建一遍來烘（約佔 20 MB，換掉一次很重的重建）。
  if (!bakedWorld) {
    // 手機螢幕上這張封面最多也只有幾百像素寬：1024、兩倍取樣就夠（2048、四倍取樣光這張就佔約 130 MB）
    const size = deviceTier.lowMemory ? 1024 : 2048;
    const target = new WebGLRenderTarget(size, size, { samples: deviceTier.lowMemory ? 2 : 4 });
    target.texture.colorSpace = SRGBColorSpace;
    bakedWorld = { target, done: false };
  }
  const worldTarget = bakedWorld.target;
  const screenMaterial = new ShaderMaterial({
    uniforms: {
      uPortal: previous ? chapterContext.portal(previous) : { value: null },
      uWorld: { value: worldTarget.texture },
      uRes: chapterContext.resolution,
      uMix: { value: 0 },
      uAspect: { value: SCREEN_W / SCREEN_H },
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform sampler2D uPortal, uWorld; uniform vec2 uRes; uniform float uMix, uAspect;
      varying vec2 vUv;
      void main() {
        vec3 portal = texture2D(uPortal, gl_FragCoord.xy / uRes).rgb;
        // 封面是正方形，放在 5:4 的螢幕中央，左右留紙白
        vec2 uv = vec2((vUv.x - 0.5) * uAspect + 0.5, vUv.y);
        vec3 paper = vec3(0.95, 0.94, 0.91);
        vec3 world = (uv.x < 0.0 || uv.x > 1.0) ? paper : texture2D(uWorld, uv).rgb;
        gl_FragColor = vec4(mix(portal, world, uMix), 1.0);
      }`,
  });
  const screen = new Mesh(new PlaneGeometry(SCREEN_W, SCREEN_H), screenMaterial);
  const tilted = computer.group.getObjectByName("monitor_tilted");
  screen.position.z = 1; // 在 CRT 掃描線那一層的後面
  tilted.add(screen);
  const crt = tilted.getObjectByName("crt_overlay") as Mesh<BufferGeometry, ShaderMaterial>;
  crt.material.uniforms.uTint.value.set(0x000000); // 原專案是琥珀色螢光；這裡只留掃描線的暗紋，讓封面保持原色

  // 螢幕中心與法線（世界座標）
  const screenCenter = SCREEN_POS.clone();
  const screenNormal = new Vector3(0, Math.sin(-SCREEN_TILT), Math.cos(SCREEN_TILT)).normalize();
  const grade = { vignette: 0.6, grain: 0.3, raw: 0 };
  const lookAt = new Vector3(), position = new Vector3();

  // 烘焙：引擎把每一章的平面版元素放進 worldScene 之後，從正上方拍一張整張封面
  const worldScene = new Scene();
  worldScene.background = new Color("#f2efe6");
  const worldCamera = new PerspectiveCamera(30, 1, 0.1, 100);
  const { px, py, heightPx } = { ...FULL_VIEW, heightPx: CIRCLE.r * 2 + 90 };
  const [wx, wy] = toWorld(px, py);
  worldCamera.position.set(wx, wy, toUnits(heightPx) / (2 * Math.tan((30 * Math.PI) / 360)));
  worldCamera.lookAt(wx, wy, 0);

  return {
    id: plan.id,
    portals: previous ? [previous] : [],
    scene,
    camera,
    grade,
    // 聲音（陰森版）：螢幕裡的世界退出來之後，只剩電腦的嗡嗡聲、很低的恐懼低鳴和一點靜電；有人在敲鍵盤（0.3、0.62），
    // 彷彿一切都是被操作出來的；最後滑鼠喀一聲，接著一記低頻重擊（0.88、0.92）
    sound: { hum: 0.3, dread: 0.18, static: 0.05 },
    cues: [{ at: 0.04, cue: "power" }, { at: 0.3, cue: "typing" }, { at: 0.62, cue: "typing" }, { at: 0.88, cue: "click" }, { at: 0.92, cue: "lowHit" }],
    captions: pacedCaptions("close", ["退出來看：那整個世界，只是一台電腦螢幕裡的畫面。"]),
    showsWholeWorld: true, // 引擎據此把每一章登記過的元素列進 elements
    worldScene,
    /** 引擎在載入時呼叫一次：把整張封面烘成螢幕上的貼圖 */
    bakeWorld(gl) {
      worldScene.updateMatrixWorld(true);
      gl.setRenderTarget(worldTarget);
      gl.clear();
      gl.render(worldScene, worldCamera);
      gl.setRenderTarget(null);
      bakedWorld.done = true;
    },
    elements: [],
    /** 封面是否已經烘過（終章重建時引擎據此跳過重烘） */
    isWorldBaked: () => bakedWorld.done,
    update(progress, frame) {
      const p = clamp(progress, -0.3, 1.3);
      computer.tick(frame.time * 1000);
      decor.traverse((o) => o.userData.tick?.(frame.time * 1000));

      // 開場：鏡頭離螢幕近到螢幕蓋滿整個畫面（取寬、高兩個方向比較嚴的那一個）
      camera.fov = 35;
      const t = Math.tan((camera.fov * Math.PI) / 360);
      const near = Math.min((SCREEN_H * 0.94) / (2 * t), (SCREEN_W * 0.94) / (2 * t * frame.aspect));
      // 0–0.40 沿螢幕法線退後並升高，看見整張桌子；之後慢慢往右繞到側面
      const out = smooth(linearstep(p, pullOut[0], pullOut[1]));
      const orbit = smooth(linearstep(p, pullOut[1], 1.2));
      const back = near + (7600 - near) * Math.pow(out, 1.6);
      position.copy(screenCenter).addScaledVector(screenNormal, back);
      position.y += 1500 * out + 500 * orbit;
      position.x += 2600 * orbit;
      position.z -= 1300 * orbit;
      lookAt.copy(screenCenter);
      lookAt.y += -700 * out;
      if (frame.aspect < 1) position.addScaledVector(screenNormal, back * (1 / frame.aspect - 1) * 0.7 * out); // 直式螢幕退遠一點
      camera.position.copy(position);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookAt);
      camera.updateProjectionMatrix();

      // 螢幕內容：上一章 → 封面；CRT 掃描線在退出來的過程中才出現
      screenMaterial.uniforms.uMix.value = previous ? smooth(linearstep(p, 0.04, 0.2)) : 1;
      crt.material.opacity = 1;
      crt.visible = p > 0.06;
      // 封面裡是三色的世界，退出來之後是有顏色的真實世界
      grade.raw = smooth(linearstep(p, 0.12, 0.34));
      grade.grain = 0.3 - 0.2 * grade.raw;
      grade.vignette = 0.6 - 0.3 * grade.raw + 0.5 * smooth(linearstep(p, dim[0], dim[1]));
      screenGlow.intensity = 1.2 + Math.sin(frame.time * 11) * 0.05;
    },
  };
}
