// 3D 場景的環境：地面、天空、水面。粒子沿用 core.js 的 Snow / Flame 和 shared/fx.js。
import { BackSide, Color, Fog, Mesh, MeshBasicMaterial, PlaneGeometry, ShaderMaterial, SphereGeometry } from "three";
import { BLACK, WHITE } from "../world/space";

/** 一大片平的地面（純色，不受光）。 */
export function ground(color = WHITE, size = 200, y = 0) {
  const mesh = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ color }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** 天空：一顆從裡面看的大球，純色。 */
export function skyDome(color = WHITE, radius = 150) {
  return new Mesh(new SphereGeometry(radius, 24, 12), new MeshBasicMaterial({ color, side: BackSide, depthWrite: false, fog: false }));
}

/**
 * 水面：一片平面，上面是一排排會流動的墨色波紋（封面上的海就是這樣畫的）。
 * 波紋越遠越細密，自然產生透視感。update(time) 讓它流動。
 */
export function water({ width = 60, depth = 40, base = WHITE, wave = BLACK, rows = 26 } = {}) {
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBase: { value: new Color(base) }, uWave: { value: new Color(wave) }, uRows: { value: rows } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uTime, uRows; uniform vec3 uBase, uWave; varying vec2 vUv;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main() {
        float row = vUv.y * uRows;
        float id = floor(row), f = fract(row);
        // 每一排的波紋是一串長短不一的梭形，往左右慢慢漂
        float x = vUv.x * (10.0 + hash(id) * 6.0) + uTime * (0.25 + hash(id + 3.0) * 0.35) * (mod(id, 2.0) < 1.0 ? 1.0 : -1.0) + hash(id + 7.0) * 9.0;
        float seg = fract(x), cell = floor(x);
        float len = 0.35 + hash(cell + id * 13.0) * 0.5;
        float along = smoothstep(0.0, 0.12, seg) * smoothstep(len, len - 0.12, seg);
        float bulge = sin(clamp(seg / len, 0.0, 1.0) * 3.14159);
        float band = smoothstep(0.34 * bulge + 0.02, 0.30 * bulge, abs(f - 0.5));
        float ink = along * band * step(0.25, hash(cell * 1.7 + id));
        gl_FragColor = vec4(mix(uBase, uWave, ink), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.update = (time) => (material.uniforms.uTime.value = time);
  return mesh;
}

/**
 * 霧：離鏡頭 near 到 far 之間的東西漸漸融進 color。color 用這個場景的背景色（白、黑或紅），
 * 遠的東西就會淡進背景，拉出前後的層次。同時作用在卡通材質（palette）和不受光的材質與紙偶上。
 * 天空球和水面不受影響；它們的顏色應該就是霧的顏色。
 * @param {import("three").Scene} scene
 * @param {ReturnType<typeof import("./model").makePalette>} palette
 */
export function addFog(scene, palette, color, near, far) {
  scene.fog = new Fog(color, near, far);
  palette.setFog({ color, near, far });
}
