// 由 crt.vert.glsl 轉成字串模組（Next.js 不支援 Vite 的 ?raw 匯入）
export default "varying vec2 vUv;\n\nvoid main() {\n  vUv = uv;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n}\n";
