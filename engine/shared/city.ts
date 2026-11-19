import { seededRandom } from "../core";
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { ColorRepresentation } from "three";

// ---- 來自 chapters/grandmother.js ----

// 山牆屋頂幾何：單位三角柱（x、z 皆 -0.5..0.5，屋脊沿 z 軸、高 1），非索引、帶頂點色。
// 左斜面、右斜面、前後兩片山牆各用一個顏色，用顏色假裝受光。
function makeGableRoofGeometry(leftSlopeColor, rightSlopeColor, gableColor) {
  const positions = [];
  const colors = [];
  const pushTriangle = (vertA, vertB, vertC, color) => {
    // 推入一個三角形（三個頂點同色）。
    positions.push(...vertA, ...vertB, ...vertC);
    for (let k = 0; k < 3; k++) {
      colors.push(color.r, color.g, color.b);
    }
  };
  const leftEaveBack = [-0.5, 0, -0.5];
  const leftEaveFront = [-0.5, 0, 0.5];
  const rightEaveBack = [0.5, 0, -0.5];
  const rightEaveFront = [0.5, 0, 0.5];
  const ridgeBack = [0, 1, -0.5];
  const ridgeFront = [0, 1, 0.5];
  pushTriangle(leftEaveBack, leftEaveFront, ridgeFront, leftSlopeColor);
  pushTriangle(leftEaveBack, ridgeFront, ridgeBack, leftSlopeColor);
  pushTriangle(rightEaveFront, rightEaveBack, ridgeBack, rightSlopeColor);
  pushTriangle(rightEaveFront, ridgeBack, ridgeFront, rightSlopeColor);
  pushTriangle(leftEaveFront, rightEaveFront, ridgeFront, gableColor);
  pushTriangle(rightEaveBack, leftEaveBack, ridgeBack, gableColor);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}
// 雙色方塊幾何：單位 Box，底面落在 y=0；法線朝上的面用 topColor，其餘用 sideColor（頂點色）。

// 雙色方塊幾何：單位 Box，底面落在 y=0；法線朝上的面用 topColor，其餘用 sideColor（頂點色）。
function makeTwoToneBoxGeometry(sideColor, topColor) {
  const geometry = new BoxGeometry(1, 1, 1).toNonIndexed();
  geometry.translate(0, 0.5, 0);
  const normals = geometry.attributes.normal;
  const colors = [];
  for (let i = 0; i < normals.count; i++) {
    const vertexColor = normals.getY(i) > 0.5 ? topColor : sideColor;
    colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}
// 腳下的城市（飛升段從高空俯瞰）：三個 InstancedMesh（牆身、山牆屋頂、煙囪）共用一個頂點色材質，
// 再加一座教堂、圓形地面與一組暖色窗燈 Points。
// opts：radius 城市半徑、clear 中央留空半徑、seed 亂數種子、window 窗燈顏色。回傳 { group, windows }。

// 腳下的城市（飛升段從高空俯瞰）：三個 InstancedMesh（牆身、山牆屋頂、煙囪）共用一個頂點色材質，
// 再加一座教堂、圓形地面與一組暖色窗燈 Points。
// opts：radius 城市半徑、clear 中央留空半徑、seed 亂數種子、window 窗燈顏色。回傳 { group, windows }。
function createCityBelow(opts: { radius?: number; clear?: number; seed?: number; window?: ColorRepresentation } = {}) {
  const radius = opts.radius ?? 90;
  const clearRadius = opts.clear ?? 7;
  const rand = seededRandom(opts.seed ?? 9);
  const group = new Group();
  const litGrey = new Color("#57544f");
  const shadeGrey = new Color("#121212");
  const nearBlack = new Color("#060606");
  const vertexColorMaterial = new MeshBasicMaterial({
    vertexColors: true,
    fog: true,
  });
  const houses = [];
  const cellSize = 7.5;
  // 以 cellSize 的格子鋪房子，每格沿 x 放兩棟；落在中央留空圈內或超出（帶隨機的）外緣者跳過。
  // 每棟記錄 x/z 位置、w 寬、d 深、h 牆高、r 屋頂高、rot 朝向（0 或 90 度再加一點偏差）。
  for (let cellX = -radius; cellX < radius; cellX += cellSize) {
    for (let cellZ = -radius; cellZ < radius; cellZ += cellSize) {
      for (let slot = 0; slot < 2; slot++) {
        const houseX = cellX + 2 + slot * 3.4 + (rand() - 0.5) * 0.5;
        const houseZ = cellZ + 1.6 + rand() * 1.2;
        if (
          Math.hypot(houseX, houseZ) < clearRadius ||
          Math.hypot(houseX, houseZ) > radius * (0.75 + rand() * 0.25)
        ) {
          continue;
        }
        const houseWidth = 2.6 + rand() * 0.9;
        const houseDepth = 3.2 + rand() * 2.4;
        const wallHeight = 2.4 + rand() * 3.2;
        houses.push({
          x: houseX,
          z: houseZ,
          w: houseWidth,
          d: houseDepth,
          h: wallHeight,
          r: houseWidth * (0.5 + rand() * 0.4),
          rot: (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.08,
        });
      }
    }
  }
  // 三個 InstancedMesh：牆身（方塊）、屋頂（三角柱）、煙囪（方塊），實例數都等於房子數。
  const houseCount = houses.length;
  const wallsMesh = new InstancedMesh(
    makeTwoToneBoxGeometry(nearBlack, litGrey),
    vertexColorMaterial,
    houseCount,
  );
  const roofsMesh = new InstancedMesh(
    makeGableRoofGeometry(litGrey, shadeGrey, nearBlack),
    vertexColorMaterial,
    houseCount,
  );
  const chimneysMesh = new InstancedMesh(
    makeTwoToneBoxGeometry(nearBlack, litGrey),
    vertexColorMaterial,
    houseCount,
  );
  const matrix = new Matrix4();
  const quat = new Quaternion();
  const scaleVec = new Vector3();
  const posVec = new Vector3();
  const upAxis = new Vector3(0, 1, 0);
  const windowPositions = [];
  // 逐棟寫入實例矩陣：牆身、略寬於牆的屋頂、煙囪（三成機率把高度壓成 0.001 等於沒有）。
  // 另外在 ±x 兩面牆上各撒最多 8 個窗燈點（每個有四成機率略過）。
  houses.forEach((house, index) => {
    quat.setFromAxisAngle(upAxis, house.rot);
    matrix.compose(
      posVec.set(house.x, 0, house.z),
      quat,
      scaleVec.set(house.w, house.h, house.d),
    );
    wallsMesh.setMatrixAt(index, matrix);
    matrix.compose(
      posVec.set(house.x, house.h, house.z),
      quat,
      scaleVec.set(house.w * 1.08, house.r, house.d * 1.04),
    );
    roofsMesh.setMatrixAt(index, matrix);
    const chimneyOffsetX = (rand() - 0.5) * house.w * 0.5;
    const chimneyOffsetZ = (rand() - 0.5) * house.d * 0.6;
    const chimneyOffset = new Vector3(
      chimneyOffsetX,
      0,
      chimneyOffsetZ,
    ).applyQuaternion(quat);
    matrix.compose(
      posVec.set(
        house.x + chimneyOffset.x,
        house.h + house.r * 0.3,
        house.z + chimneyOffset.z,
      ),
      quat,
      scaleVec.set(0.5, rand() < 0.7 ? house.r * 0.9 + 0.6 : 0.001, 0.5),
    );
    chimneysMesh.setMatrixAt(index, matrix);
    for (let X = 0; X < 8; X++) {
      if (rand() < 0.4) {
        continue;
      }
      const wallSide = rand() < 0.5 ? -1 : 1;
      const windowPos = new Vector3(
        wallSide * (house.w / 2 + 0.03),
        1 + rand() * (house.h - 2),
        (rand() - 0.5) * house.d * 0.8,
      ).applyQuaternion(quat);
      windowPositions.push(
        house.x + windowPos.x,
        windowPos.y,
        house.z + windowPos.z,
      );
    }
  });
  wallsMesh.instanceMatrix.needsUpdate =
    roofsMesh.instanceMatrix.needsUpdate =
    chimneysMesh.instanceMatrix.needsUpdate =
      true;
  // 教堂：方塔 + 四角錐尖頂 + 中殿（方塊牆身與山牆屋頂），整組縮成 0.7 倍放在 (-16, 0, -26)。
  const church = new Group();
  const churchTower = new Mesh(
    makeTwoToneBoxGeometry(nearBlack, litGrey),
    vertexColorMaterial,
  );
  churchTower.scale.set(4, 16, 4);
  const churchSpire = new Mesh(
    new ConeGeometry(3, 11, 4, 1).toNonIndexed(),
    new MeshBasicMaterial({
      color: "#2a2927",
      fog: true,
    }),
  );
  churchSpire.position.y = 21.5;
  churchSpire.rotation.y = Math.PI / 4;
  const naveRoof = new Mesh(
    makeGableRoofGeometry(litGrey, shadeGrey, nearBlack),
    vertexColorMaterial,
  );
  naveRoof.position.set(0, 10, -9);
  naveRoof.scale.set(9, 6, 16);
  const naveWalls = new Mesh(
    makeTwoToneBoxGeometry(nearBlack, litGrey),
    vertexColorMaterial,
  );
  naveWalls.position.set(0, 0, -9);
  naveWalls.scale.set(8.6, 10, 16);
  church.add(churchTower, churchSpire, naveRoof, naveWalls);
  church.position.set(-16, 0, -26);
  church.scale.setScalar(0.7);
  // 地面：近黑色圓盤，半徑為城市半徑的 1.3 倍。
  const ground = new Mesh(
    new CircleGeometry(radius * 1.3, 48),
    new MeshBasicMaterial({
      color: "#0a0a0a",
      fog: true,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  // 窗燈：一個 Points，不受 tone mapping，顏色預設 #ffb040。
  const windowGeometry = new BufferGeometry();
  windowGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(windowPositions, 3),
  );
  const windowPoints = new Points(
    windowGeometry,
    new PointsMaterial({
      color: opts.window ?? "#ffb040",
      size: 0.3,
      sizeAttenuation: true,
      fog: true,
      toneMapped: false,
    }),
  );
  group.add(ground, wallsMesh, roofsMesh, chimneysMesh, church, windowPoints);
  return {
    group: group,
    windows: windowPoints,
  };
}
// 奶奶的用色：琥珀色輪廓線、半透明的衣褶線、流蘇的金黃、布料的米白與亮白、皮膚的淡暖白。

export { makeGableRoofGeometry, makeTwoToneBoxGeometry, createCityBelow };
