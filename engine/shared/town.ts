import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ClampToEdgeWrapping,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import {
  INK,
  PAPER,
  canvasTexture,
  radialGlowTexture,
  seededRandom,
  toonMaterial,
} from "../core";

// WINDOW_BAY_WIDTH / STOREY_HEIGHT：立面 UV 的單位，一個窗格（圖集一欄）對應牆面寬 2.1、一層樓（圖集一列）高 2.9（世界單位）。
// STREET_HALF_WIDTH：街道半寬，路面寬為其 2 倍，也是第一排房屋離街心的預設距離。
// LIGHT_DIR：全場景共用的光線方向（正規化），給立面／屋頂 shader 與 toon 材質使用。
// vec3：new Vector3 的簡寫。
const WINDOW_BAY_WIDTH = 2.1;
const STOREY_HEIGHT = 2.9;
const STREET_HALF_WIDTH = 5.6;
const LIGHT_DIR = new Vector3(-0.45, 0.8, 0.35).normalize();
const vec3 = (px, py, pz) => new Vector3(px, py, pz);
// 三角形累加器：把 position / normal / uv 逐頂點推進陣列（不建 index，flat shading），
// 最後 build() 成一個 BufferGeometry，讓整條街只需要少數幾個 draw call。
class TriangleAccumulator {
  pos = [];
  nor = [];
  uv = [];
  tri(p0, p1, p2, uv0, uv1, uv2, outward) {
    // 加入一個三角形 p0-p1-p2。outward 是期望的朝外方向：算出的面法線若與它反向，就交換 p1、p2（連同 UV）並反轉法線。
    const normal = new Vector3()
      .subVectors(p1, p0)
      .cross(new Vector3().subVectors(p2, p0))
      .normalize();
    if (normal.dot(outward) < 0) {
      [p1, p2] = [p2, p1];
      [uv1, uv2] = [uv2, uv1];
      normal.negate();
    }
    for (const [vertex, vertexUv] of [
      [p0, uv0],
      [p1, uv1],
      [p2, uv2],
    ]) {
      this.pos.push(vertex.x, vertex.y, vertex.z);
      this.nor.push(normal.x, normal.y, normal.z);
      this.uv.push(vertexUv[0], vertexUv[1]);
    }
  }
  quad(p0, p1, p2, p3, uv0, uv1, uv2, uv3, outward) {
    // 加入一個四邊形 p0-p1-p2-p3，拆成 (p0,p1,p2) 與 (p0,p2,p3) 兩個三角形
    this.tri(p0, p1, p2, uv0, uv1, uv2, outward);
    this.tri(p0, p2, p3, uv0, uv2, uv3, outward);
  }
  build() {
    // 輸出 BufferGeometry（position / normal / uv）
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(this.nor, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    geometry.computeBoundingSphere();
    return geometry;
  }
}
// 立面窗格圖集（512×512，4×4 格，RepeatWrapping）。seed 決定變化。
// 底色近黑＋每 12px 一條橫線；每一「欄」有 72% 機率有窗（整欄一致），
// 每扇窗 27% 機率亮燈：亮窗為白到米色漸層，再畫窗簾（50%）或人影頭肩剪影、十字窗櫺；
// 暗窗為黑底加窗框，40% 機率兩側有百葉。窗上有窗楣，窗台上有一條不規則的積雪。
// 亮窗的高亮度在 facadeMaterial 裡被當成「自發光」遮罩。
function makeFacadeAtlas(seed) {
  const rand = seededRandom(seed);
  const texture = canvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#1c1c1c";
    ctx.lineWidth = 2;
    for (let lineY = 0; lineY < height; lineY += 12) {
      ctx.beginPath();
      ctx.moveTo(0, lineY);
      ctx.lineTo(width, lineY);
      ctx.stroke();
    }
    const cellW = width / 4;
    const cellH = height / 4;
    const columnHasWindows = [0, 1, 2, 3].map(() => rand() < 0.72);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (!columnHasWindows[col]) {
          continue;
        }
        const cellX = col * cellW;
        const cellY = row * cellH;
        const winW = cellW * 0.46;
        const winH = cellH * 0.58;
        const winX = cellX + (cellW - winW) / 2;
        const winY = cellY + cellH * 0.16;
        const lit = rand() < 0.27;
        ctx.fillStyle = "#2a2a2a";
        ctx.fillRect(winX - 5, winY - 9, winW + 10, 7);
        if (lit) {
          const glassGradient = ctx.createLinearGradient(
            0,
            winY,
            0,
            winY + winH,
          );
          glassGradient.addColorStop(0, "#ffffff");
          glassGradient.addColorStop(1, "#e9e4d8");
          ctx.fillStyle = glassGradient;
          ctx.fillRect(winX, winY, winW, winH);
          ctx.fillStyle = INK;
          if (rand() < 0.5) {
            ctx.beginPath();
            ctx.moveTo(winX, winY);
            ctx.quadraticCurveTo(
              winX + winW * 0.3,
              winY + winH * 0.4,
              winX + winW * 0.08,
              winY + winH,
            );
            ctx.lineTo(winX, winY + winH);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(winX + winW, winY);
            ctx.quadraticCurveTo(
              winX + winW * 0.7,
              winY + winH * 0.4,
              winX + winW * 0.92,
              winY + winH,
            );
            ctx.lineTo(winX + winW, winY + winH);
            ctx.fill();
          } else if (rand() < 0.3) {
            const figureX = winX + winW * (0.35 + rand() * 0.3);
            ctx.beginPath();
            ctx.arc(figureX, winY + winH * 0.5, winW * 0.13, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(
              figureX,
              winY + winH,
              winW * 0.26,
              winH * 0.32,
              0,
              Math.PI,
              0,
            );
            ctx.fill();
          }
          ctx.fillStyle = INK;
          ctx.fillRect(winX + winW / 2 - 2.5, winY, 5, winH);
          ctx.fillRect(winX, winY + winH * 0.42, winW, 4);
        } else {
          ctx.fillStyle = "#060606";
          ctx.fillRect(winX, winY, winW, winH);
          ctx.strokeStyle = "#2a2a2a";
          ctx.lineWidth = 3;
          ctx.strokeRect(winX + 1.5, winY + 1.5, winW - 3, winH - 3);
          if (rand() < 0.4) {
            ctx.fillStyle = "#191919";
            ctx.fillRect(winX - winW * 0.35, winY, winW * 0.32, winH);
            ctx.fillRect(winX + winW * 1.03, winY, winW * 0.32, winH);
          }
        }
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.moveTo(winX - 7, winY + winH + 6);
        for (let U = 0; U <= 8; U++) {
          ctx.lineTo(
            winX - 7 + ((winW + 14) * U) / 8,
            winY + winH - 1 - rand() * 5,
          );
        }
        ctx.lineTo(winX + winW + 7, winY + winH + 6);
        ctx.fill();
      }
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}
// 屋頂貼圖（256×256，RepeatWrapping）：雪白底＋幾筆灰色短橫紋，
// 畫布頂端一條墨色帶並往下伸出一排尖刺三角形，最上緣再壓一條亮線。
function makeRoofTexture() {
  const rand = seededRandom(91);
  const texture = canvasTexture(256, 256, (ctx, width, height) => {
    ctx.fillStyle = "#efece4";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#a9a59b";
    for (let v = 0; v < 14; v++) {
      const strokeY = 40 + rand() * (height - 50);
      const strokeX = rand() * width;
      const strokeLen = 30 + rand() * 70;
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      ctx.moveTo(strokeX, strokeY);
      ctx.lineTo(strokeX + strokeLen, strokeY + (rand() - 0.5) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, width, 16);
    for (let spikeX = 0; spikeX < width; spikeX += 5 + rand() * 10) {
      const spikeLen = 6 + rand() * 22;
      const spikeWidth = 2 + rand() * 4;
      ctx.beginPath();
      ctx.moveTo(spikeX, 14);
      ctx.lineTo(spikeX + spikeWidth / 2, 14 + spikeLen);
      ctx.lineTo(spikeX + spikeWidth, 14);
      ctx.fill();
    }
    ctx.fillStyle = "#f7f5ef";
    ctx.fillRect(0, 0, width, 4);
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}
// 路面貼圖（512×512，橫向 Clamp、縱向 Repeat）。dark=true 用灰色路面，false 用雪白。
// 四條微微蛇行的車轍線、120 個深淺碎點，左右兩側各一條邊緣起伏的雪堆。
function makeRoadTexture(dark = true) {
  const rand = seededRandom(5);
  const texture = canvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = dark ? "#7a776f" : "#e8e5dc";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#151515";
    for (const rutU of [0.36, 0.44, 0.56, 0.64]) {
      ctx.lineWidth = 2 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(rutU * width + (rand() - 0.5) * 6, 0);
      for (let rutY = 0; rutY <= height; rutY += 32) {
        ctx.lineTo(rutU * width + Math.sin(rutY * 0.02 + rutU * 9) * 5, rutY);
      }
      ctx.stroke();
    }
    for (let y = 0; y < 120; y++) {
      ctx.fillStyle = rand() < 0.5 ? "#2a2a2a" : "#d8d4ca";
      ctx.globalAlpha = 0.5 + rand() * 0.5;
      ctx.beginPath();
      ctx.ellipse(
        width * (0.15 + rand() * 0.7),
        rand() * height,
        1.5 + rand() * 5,
        1 + rand() * 2,
        rand() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const side of [0, 1]) {
      ctx.fillStyle = "#f4f2ec";
      ctx.beginPath();
      const edgeX = side ? width : 0;
      ctx.moveTo(edgeX, 0);
      for (let bankY = 0; bankY <= height; bankY += 16) {
        const bankWidth =
          width *
          (0.17 + Math.sin(bankY * 0.03 + side * 4) * 0.025 + rand() * 0.02);
        ctx.lineTo(side ? width - bankWidth : bankWidth, bankY);
      }
      ctx.lineTo(edgeX, height);
      ctx.fill();
    }
  });
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
// 立面 ShaderMaterial（雙面）。貼圖紅色通道高（>0.55~0.8）＝亮窗：亮窗不受光照影響，遠處只衰減到 75%；
// 其餘牆面依 N·L 做兩階明暗（0.55 / 1.0），並隨距離（uFar 的 45%~100%）淡到黑。uLift 是整體加亮量。
function facadeMaterial(map) {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      map: {
        value: map,
      },
      uLight: {
        value: LIGHT_DIR,
      },
      uFar: {
        value: 260,
      },
      uLift: {
        value: 0,
      },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 uLight; uniform float uFar, uLift;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
        vec3 c = texture2D(map, vUv).rgb;
        float win = smoothstep(0.55, 0.8, c.r);
        float lit = smoothstep(0.1, 0.2, dot(N, uLight));
        float d = distance(cameraPosition, vW);
        float fade = smoothstep(uFar * 0.45, uFar, d);
        vec3 col = mix(c * mix(0.55, 1.0, lit) * (1.0 - fade), c * mix(1.0, 0.75, fade), win) + uLift;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
// 屋頂 ShaderMaterial（雙面）。背面直接輸出近黑；正面依 N·L 兩階明暗（0.5 / 1.0），
// 距離超過 uFar 的 50% 後逐漸壓暗到 12%。
function roofMaterial(map) {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      map: {
        value: map,
      },
      uLight: {
        value: LIGHT_DIR,
      },
      uFar: {
        value: 260,
      },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 uLight; uniform float uFar;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN);
        vec3 c = texture2D(map, vUv).rgb;
        if (!gl_FrontFacing) { gl_FragColor = vec4(vec3(0.02), 1.0); return; }
        float l = dot(N, uLight);
        float lit = smoothstep(0.35, 0.45, l);
        vec3 col = c * mix(0.5, 1.0, lit);
        float d = distance(cameraPosition, vW);
        col *= mix(1.0, 0.12, smoothstep(uFar * 0.5, uFar, d));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
// 程序化生成整個城鎮，街道沿 -Z 延伸。
// opts：seed（12）、rows（每排房屋離街心的距離陣列，預設只有一排）、z0 / z1（街道起訖 Z，預設 30 → -120）、
// gaps（[zMax, zMin] 區間，區間內不蓋房子）、church（true 時在街尾加教堂並清出空地）、lamps（false 則不放路燈）。
// 回傳 { group, chimneys（煙囪頂位置）, lamps（燈頭位置）, glows（路燈光暈 Sprite）, spireTop（尖塔頂位置）, facadeMats }。
/** buildTown 的選項（說明見上方註解） */
interface TownOptions {
  seed?: number;
  rows?: number[];
  z0?: number;
  z1?: number;
  gaps?: [number, number][];
  church?: boolean;
  lamps?: boolean;
}
function buildTown(opts: TownOptions = {}) {
  // wallUv：把牆上一點換成圖集 UV。u = 沿牆距離 / 窗格寬 + 欄位移，v = (高度 - 0.5) / 樓高，兩者再除以 4（圖集 4×4）。
  const rand = seededRandom(opts.seed ?? 12);
  const rows = opts.rows ?? [STREET_HALF_WIDTH];
  const zStart = opts.z0 ?? 30;
  const zEnd = opts.z1 ?? -120;
  const gaps = opts.gaps ?? [];
  const variantCount = 3;
  const facadeAccs = Array.from(
    {
      length: variantCount,
    },
    () => new TriangleAccumulator(),
  );
  const roofAcc = new TriangleAccumulator();
  const chimneys = [];
  const group = new Group();
  const wallUv = (point, origin, along, colOffset) => [
    (point.clone().sub(origin).dot(along) / WINDOW_BAY_WIDTH + colOffset) / 4,
    (point.y - 0.5) / STOREY_HEIGHT / 4,
  ];
  // 加一面垂直的矩形牆（從 (x0,z0) 到 (x1,z1)，高度 yBottom..yTop），UV 取自立面圖集
  function addWall(acc, x0, z0, x1, z1, yBottom, yTop, outward, colOffset) {
    const bottomA = vec3(x0, yBottom, z0);
    const bottomB = vec3(x1, yBottom, z1);
    const topB = vec3(x1, yTop, z1);
    const topA = vec3(x0, yTop, z0);
    const along = vec3(x1 - x0, 0, z1 - z0).normalize();
    acc.quad(
      bottomA,
      bottomB,
      topB,
      topA,
      wallUv(bottomA, bottomA, along, colOffset),
      wallUv(bottomB, bottomA, along, colOffset),
      wallUv(topB, bottomA, along, colOffset),
      wallUv(topA, bottomA, along, colOffset),
      outward,
    );
  }
  // 加一片三角形山牆，UV 與牆面連續
  function addGable(acc, cornerA, cornerB, apex, outward, colOffset) {
    const along = cornerB.clone().sub(cornerA).setY(0).normalize();
    acc.tri(
      cornerA,
      cornerB,
      apex,
      wallUv(cornerA, cornerA, along, colOffset),
      wallUv(cornerB, cornerA, along, colOffset),
      wallUv(apex, cornerA, along, colOffset),
      outward,
    );
  }
  // 加一片屋頂斜面到 roofAcc；UV 以世界尺寸重複（寬 3、斜長 2.2 為一個貼圖週期）
  function addRoofSlope(eaveA, eaveB, ridgeB, ridgeA, outward) {
    const uRepeat = eaveA.distanceTo(eaveB) / 3;
    const vRepeat = eaveA.distanceTo(ridgeA) / 2.2;
    roofAcc.quad(
      eaveA,
      eaveB,
      ridgeB,
      ridgeA,
      [0, 0],
      [uRepeat, 0],
      [uRepeat, vRepeat],
      [0, vRepeat],
      outward,
    );
  }
  // 蓋一棟房子：四面牆、兩片斜屋頂（屋簷外伸 0.35）、兩片山牆，以及 0~2 根煙囪。
  // ridgeAlongX 決定屋脊方向；pitch 是屋頂斜率（高 / 半跨距）。隨機挑一個立面變體。
  // colOffset 是圖集欄位移 0..3；其後的 (rand() < 0.5, 0) 是逗號運算式，值恆為 0，只是多消耗一個亂數。
  function addBuilding(xMin, xMax, zMin, zMax, wallHeight, ridgeAlongX, pitch) {
    const acc = facadeAccs[Math.floor(rand() * variantCount)];
    const colOffset = Math.floor(rand() * 4) + (rand() < 0.5, 0);
    const midX = (xMin + xMax) / 2;
    const midZ = (zMin + zMax) / 2;
    addWall(
      acc,
      xMin,
      zMin,
      xMin,
      zMax,
      0,
      wallHeight,
      vec3(-1, 0, 0),
      colOffset,
    );
    addWall(
      acc,
      xMax,
      zMin,
      xMax,
      zMax,
      0,
      wallHeight,
      vec3(1, 0, 0),
      colOffset,
    );
    addWall(
      acc,
      xMin,
      zMin,
      xMax,
      zMin,
      0,
      wallHeight,
      vec3(0, 0, -1),
      colOffset,
    );
    addWall(
      acc,
      xMin,
      zMax,
      xMax,
      zMax,
      0,
      wallHeight,
      vec3(0, 0, 1),
      colOffset,
    );
    const overhang = 0.35;
    let ridgeY;
    if (ridgeAlongX) {
      const halfSpan = (zMax - zMin) / 2;
      const ridgeHeight = wallHeight + halfSpan * pitch;
      ridgeY = ridgeHeight;
      const eaveDrop = overhang * pitch;
      addRoofSlope(
        vec3(xMin - overhang, wallHeight - eaveDrop, zMin - overhang),
        vec3(xMax + overhang, wallHeight - eaveDrop, zMin - overhang),
        vec3(xMax + overhang, ridgeHeight, midZ),
        vec3(xMin - overhang, ridgeHeight, midZ),
        vec3(0, pitch, -1),
      );
      addRoofSlope(
        vec3(xMax + overhang, wallHeight - eaveDrop, zMax + overhang),
        vec3(xMin - overhang, wallHeight - eaveDrop, zMax + overhang),
        vec3(xMin - overhang, ridgeHeight, midZ),
        vec3(xMax + overhang, ridgeHeight, midZ),
        vec3(0, pitch, 1),
      );
      addGable(
        acc,
        vec3(xMin, wallHeight, zMin),
        vec3(xMin, wallHeight, zMax),
        vec3(xMin, ridgeHeight, midZ),
        vec3(-1, 0, 0),
        colOffset,
      );
      addGable(
        acc,
        vec3(xMax, wallHeight, zMin),
        vec3(xMax, wallHeight, zMax),
        vec3(xMax, ridgeHeight, midZ),
        vec3(1, 0, 0),
        colOffset,
      );
    } else {
      const halfSpan = (xMax - xMin) / 2;
      const ridgeHeight = wallHeight + halfSpan * pitch;
      ridgeY = ridgeHeight;
      const eaveDrop = overhang * pitch;
      addRoofSlope(
        vec3(xMin - overhang, wallHeight - eaveDrop, zMax + overhang),
        vec3(xMin - overhang, wallHeight - eaveDrop, zMin - overhang),
        vec3(midX, ridgeHeight, zMin - overhang),
        vec3(midX, ridgeHeight, zMax + overhang),
        vec3(-1, pitch, 0),
      );
      addRoofSlope(
        vec3(xMax + overhang, wallHeight - eaveDrop, zMin - overhang),
        vec3(xMax + overhang, wallHeight - eaveDrop, zMax + overhang),
        vec3(midX, ridgeHeight, zMax + overhang),
        vec3(midX, ridgeHeight, zMin - overhang),
        vec3(1, pitch, 0),
      );
      addGable(
        acc,
        vec3(xMin, wallHeight, zMin),
        vec3(xMax, wallHeight, zMin),
        vec3(midX, ridgeHeight, zMin),
        vec3(0, 0, -1),
        colOffset,
      );
      addGable(
        acc,
        vec3(xMin, wallHeight, zMax),
        vec3(xMax, wallHeight, zMax),
        vec3(midX, ridgeHeight, zMax),
        vec3(0, 0, 1),
        colOffset,
      );
    }
    // 煙囪：80% 機率有 1~2 根，用立面圖集第 0 欄當貼圖，頂部蓋一片取自屋頂貼圖的雪蓋；位置記入 chimneys
    const chimneyCount = rand() < 0.8 ? 1 + Math.floor(rand() * 2) : 0;
    for (let u = 0; u < chimneyCount; u++) {
      const chimneyX = lerp(xMin + 0.6, xMax - 0.6, rand());
      const chimneyZ = lerp(zMin + 0.5, zMax - 0.5, rand());
      const halfW = 0.35 + rand() * 0.25;
      const halfD = 0.45 + rand() * 0.3;
      const chimneyTop = ridgeY + 0.6 + rand() * 1.2;
      const chimneyBase = wallHeight;
      addWall(
        acc,
        chimneyX - halfW,
        chimneyZ - halfD,
        chimneyX - halfW,
        chimneyZ + halfD,
        chimneyBase,
        chimneyTop,
        vec3(-1, 0, 0),
        0,
      );
      addWall(
        acc,
        chimneyX + halfW,
        chimneyZ - halfD,
        chimneyX + halfW,
        chimneyZ + halfD,
        chimneyBase,
        chimneyTop,
        vec3(1, 0, 0),
        0,
      );
      addWall(
        acc,
        chimneyX - halfW,
        chimneyZ - halfD,
        chimneyX + halfW,
        chimneyZ - halfD,
        chimneyBase,
        chimneyTop,
        vec3(0, 0, -1),
        0,
      );
      addWall(
        acc,
        chimneyX - halfW,
        chimneyZ + halfD,
        chimneyX + halfW,
        chimneyZ + halfD,
        chimneyBase,
        chimneyTop,
        vec3(0, 0, 1),
        0,
      );
      const capOverhang = 0.08;
      roofAcc.quad(
        vec3(
          chimneyX - halfW - capOverhang,
          chimneyTop,
          chimneyZ - halfD - capOverhang,
        ),
        vec3(
          chimneyX + halfW + capOverhang,
          chimneyTop,
          chimneyZ - halfD - capOverhang,
        ),
        vec3(
          chimneyX + halfW + capOverhang,
          chimneyTop,
          chimneyZ + halfD + capOverhang,
        ),
        vec3(
          chimneyX - halfW - capOverhang,
          chimneyTop,
          chimneyZ + halfD + capOverhang,
        ),
        [0, 0.6],
        [0.3, 0.6],
        [0.3, 0.9],
        [0, 0.9],
        vec3(0, 1, 0),
      );
      chimneys.push(vec3(chimneyX, chimneyTop + 0.1, chimneyZ));
    }
  }
  // 逐排、左右兩側沿 Z 往遠處排房子：每棟深 3.2~6.4，12% 機率留一條窄巷；
  // 落在 gaps 或教堂用地內的略過。第一排（臨街）多一層樓。
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const rowOffset = rows[rowIndex];
    for (const side of [-1, 1]) {
      let zCursor = zStart;
      for (; zCursor > zEnd;) {
        const depth = 3.2 + rand() * 3.2;
        const zMin = zCursor - depth;
        const zMax = zCursor;
        zCursor = zMin - (rand() < 0.12 ? 0.6 + rand() * 1.5 : 0);
        if (gaps.some(([gapMax, gapMin]) => zMax > gapMin && zMin < gapMax)) {
          continue;
        }
        const width = 5 + rand() * 3;
        const frontX =
          rowOffset + (rowIndex === 0 ? rand() * 0.8 : (rand() - 0.5) * 0.8);
        const xMin = side > 0 ? frontX : -frontX - width;
        const xMax = side > 0 ? frontX + width : -frontX;
        if (
          opts.church &&
          Math.min(Math.abs(xMin), Math.abs(xMax)) < 22 &&
          zMin < -86 &&
          zMax > -128
        ) {
          continue;
        }
        const wallHeight =
          (1 + Math.floor(rand() * 2.6) + (rowIndex === 0 ? 1 : 0)) *
            STOREY_HEIGHT +
          0.6 +
          rand() * 0.6;
        const ridgeAlongStreet = rand() < 0.45;
        addBuilding(
          xMin,
          xMax,
          zMin,
          zMax,
          wallHeight,
          !ridgeAlongStreet,
          0.95 + rand() * 0.7,
        );
      }
    }
  }
  // 三種立面材質（不同 seed 的圖集），各對應一個累加器 → 三個 Mesh
  const facadeMats = [11, 23, 37].map((seed) =>
    facadeMaterial(makeFacadeAtlas(seed)),
  );
  facadeAccs.forEach((acc, index) =>
    group.add(new Mesh(acc.build(), facadeMats[index])),
  );
  const roofMat = roofMaterial(makeRoofTexture());
  group.add(new Mesh(roofAcc.build(), roofMat));
  // 路面：寬 2×STREET_HALF_WIDTH，比街道長 40，貼圖沿長度方向重複
  const road = new Mesh(
    new PlaneGeometry(STREET_HALF_WIDTH * 2, zStart - zEnd + 40),
    new MeshBasicMaterial({
      map: makeRoadTexture(),
      toneMapped: false,
    }),
  );
  road.material.map.repeat.set(
    1,
    (zStart - zEnd + 40) / (STREET_HALF_WIDTH * 2),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, (zStart + zEnd) / 2);
  // 路面下方 0.4 的 4000×4000 近黑大地面
  const ground = new Mesh(
    new PlaneGeometry(4e3, 4e3),
    new MeshBasicMaterial({
      color: "#0c0c0c",
      toneMapped: false,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.4, (zStart + zEnd) / 2);
  group.add(road, ground);
  let spireTop = vec3(0, 60, -105);
  // 教堂：中殿（Box）＋斜屋頂（四邊形柱體壓成稜柱）＋鐘樓、塔簷、八角尖塔、十字架，
  // 鐘面與拱窗為 canvas 貼圖平面。
  if (opts.church) {
    const church = new Group();
    const darkToon = toonMaterial({
      color: "#2b2b2b",
      shade: "#050505",
      light: LIGHT_DIR,
      rim: 0.55,
    });
    const snowToon = toonMaterial({
      color: PAPER,
      shade: "#141414",
      light: LIGHT_DIR,
      rim: 0.9,
      threshold: 0.05,
    });
    const nave = new Mesh(new BoxGeometry(12, 14, 30), darkToon);
    nave.position.set(0, 7, -118);
    const naveRoof = new Mesh(
      new CylinderGeometry(0.01, 8.6, 7, 4, 1),
      snowToon,
    );
    naveRoof.rotation.y = Math.PI / 4;
    naveRoof.scale.set(1, 1, 2.6);
    naveRoof.position.set(0, 17.5, -118);
    const tower = new Mesh(new BoxGeometry(7, 30, 7), darkToon);
    tower.position.set(0, 15, -100);
    const towerLedge = new Mesh(new BoxGeometry(7.6, 1, 7.6), snowToon);
    towerLedge.position.set(0, 30.5, -100);
    const spire = new Mesh(new ConeGeometry(4.6, 30, 8, 1), snowToon);
    spire.position.set(0, 46, -100);
    spire.rotation.y = Math.PI / 8;
    const crossPost = new Mesh(new BoxGeometry(0.25, 3, 0.25), darkToon);
    crossPost.position.set(0, 62.5, -100);
    const crossBar = new Mesh(new BoxGeometry(1.6, 0.25, 0.25), darkToon);
    crossBar.position.set(0, 63, -100);
    const clockFace = new Mesh(
      new CircleGeometry(2, 40),
      new MeshBasicMaterial({
        map: canvasTexture(256, 256, (ctx, size) => {
          ctx.fillStyle = "#fbfaf5";
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = INK;
          for (let tick = 0; tick < 12; tick++) {
            const tickAngle = (tick / 12) * Math.PI * 2;
            ctx.fillRect(
              size / 2 + Math.cos(tickAngle) * 100 - 4,
              size / 2 + Math.sin(tickAngle) * 100 - 4,
              8,
              8,
            );
          }
          ctx.lineCap = "round";
          for (const [handAngle, handLength, handWidth] of [
            [-Math.PI / 2 - 0.05, 70, 12],
            [-Math.PI / 2 - 0.52, 100, 7],
          ]) {
            ctx.lineWidth = handWidth;
            ctx.beginPath();
            ctx.moveTo(size / 2, size / 2);
            ctx.lineTo(
              size / 2 + Math.cos(handAngle) * handLength,
              size / 2 + Math.sin(handAngle) * handLength,
            );
            ctx.stroke();
          }
        }),
        toneMapped: false,
      }),
    );
    clockFace.position.set(0, 25, -96.45);
    const archWindowTex = canvasTexture(128, 256, (ctx, width, height) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(10, height);
      ctx.lineTo(10, width / 2);
      ctx.arc(width / 2, width / 2, width / 2 - 10, Math.PI, 0);
      ctx.lineTo(width - 10, height);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.fillRect(width / 2 - 4, 30, 8, height);
      ctx.fillRect(10, height * 0.55, width - 20, 6);
    });
    for (const windowZ of [-108, -114, -120, -126]) {
      for (const side of [-1, 1]) {
        const sideWindow = new Mesh(
          new PlaneGeometry(1.6, 4.4),
          new MeshBasicMaterial({
            map: archWindowTex,
            transparent: true,
            toneMapped: false,
          }),
        );
        sideWindow.position.set(side * 6.02, 7, windowZ);
        sideWindow.rotation.y = (side * Math.PI) / 2;
        church.add(sideWindow);
      }
    }
    const frontArch = new Mesh(
      new PlaneGeometry(2.2, 4.4),
      new MeshBasicMaterial({
        map: archWindowTex,
        transparent: true,
        toneMapped: false,
      }),
    );
    frontArch.position.set(0, 2.2, -96.45);
    church.add(
      nave,
      naveRoof,
      tower,
      towerLedge,
      spire,
      crossPost,
      crossBar,
      clockFace,
      frontArch,
    );
    group.add(church);
    spireTop = vec3(0, 64, -100);
  }
  const lampPositions = [];
  const glowSprites = [];
  // 路燈：每 11 單位左右各一盞（右側錯開 5.5），最遠只排到 z = -88。
  // 所有燈柱幾何合併成一個 Mesh；每盞另有兩個加色光暈 Sprite（大的存進 glows 供外部閃爍）與一片地面光斑。
  if (opts.lamps !== false) {
    const lampMat = toonMaterial({
      color: "#2a2a2a",
      shade: "#060606",
      light: LIGHT_DIR,
      rim: 0.7,
    });
    const glowTex = radialGlowTexture("#ffffff", 256, 1.6);
    const poolTex = radialGlowTexture("#ffffff", 256, 1.2);
    const lampParts = [];
    for (
      let lampRowZ = zStart - 6;
      lampRowZ > Math.max(zEnd, -88);
      lampRowZ -= 11
    ) {
      for (const side of [-1, 1]) {
        const lampX = side * (STREET_HALF_WIDTH - 0.9);
        const lampZ = lampRowZ + (side > 0 ? 5.5 : 0);
        const pole = new CylinderGeometry(0.06, 0.1, 3.4, 6);
        pole.translate(lampX, 1.7, lampZ);
        const base = new CylinderGeometry(0.14, 0.18, 0.5, 6);
        base.translate(lampX, 0.25, lampZ);
        const lanternBody = new CylinderGeometry(0.28, 0.16, 0.5, 4);
        lanternBody.rotateY(Math.PI / 4);
        lanternBody.translate(lampX, 3.7, lampZ);
        const lanternCap = new ConeGeometry(0.34, 0.32, 4);
        lanternCap.rotateY(Math.PI / 4);
        lanternCap.translate(lampX, 4.11, lampZ);
        lampParts.push(pole, base, lanternBody, lanternCap);
        const lampPos = vec3(lampX, 3.7, lampZ);
        lampPositions.push(lampPos);
        const halo = new Sprite(
          new SpriteMaterial({
            map: glowTex,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        halo.position.copy(lampPos);
        halo.scale.setScalar(1.7);
        glowSprites.push(halo);
        const core = new Sprite(
          new SpriteMaterial({
            map: glowTex,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        core.position.copy(lampPos);
        core.scale.setScalar(0.7);
        const groundPool = new Mesh(
          new PlaneGeometry(6, 6),
          new MeshBasicMaterial({
            map: poolTex,
            blending: AdditiveBlending,
            transparent: true,
            depthWrite: false,
            opacity: 0.75,
            toneMapped: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
          }),
        );
        groundPool.rotation.x = -Math.PI / 2;
        groundPool.position.set(lampX * 0.85, 0.12, lampZ);
        group.add(halo, core, groundPool);
      }
    }
    const mergedLamps = mergeGeometries(lampParts);
    group.add(new Mesh(mergedLamps, lampMat));
  }
  return {
    group: group,
    chimneys: chimneys,
    lamps: lampPositions,
    glows: glowSprites,
    spireTop: spireTop,
    facadeMats: facadeMats,
  };
}
// 線性內插
const lerp = (from, to, amount) => from + (to - from) * amount;
// 把多個 BufferGeometry 合併成一個（展開 index，只保留 position / normal，uv 全填 0）
function mergeGeometries(geometries) {
  const positions = [];
  const normals = [];
  for (const geom of geometries) {
    const flat = geom.index ? geom.toNonIndexed() : geom;
    positions.push(...flat.getAttribute("position").array);
    normals.push(...flat.getAttribute("normal").array);
  }
  const merged = new BufferGeometry();
  merged.setAttribute("position", new Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  merged.setAttribute(
    "uv",
    new Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2),
  );
  return merged;
}
// 煙霧團貼圖（128×128）：7 個隨機偏移的半透明米白放射漸層疊在一起
function makeSmokePuffTexture() {
  return canvasTexture(128, 128, (ctx, size) => {
    const rand = seededRandom(3);
    for (let t = 0; t < 7; t++) {
      const cx = size / 2 + (rand() - 0.5) * 40;
      const cy = size / 2 + (rand() - 0.5) * 40;
      const radius = 22 + rand() * 22;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, "rgba(235,232,225,0.55)");
      gradient.addColorStop(1, "rgba(235,232,225,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }
  });
}

export {
  STREET_HALF_WIDTH,
  TriangleAccumulator,
  buildTown,
  facadeMaterial,
  makeFacadeAtlas,
  makeSmokePuffTexture,
  mergeGeometries,
};
