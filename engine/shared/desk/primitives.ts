// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// Small helpers so the model builders read like a parts list.

/** 擺放選項：位置、旋轉與陰影開關（每個建模工具都會把 opts 傳給 place） */
interface PlaceOptions {
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
  castShadow?: boolean
  receiveShadow?: boolean
}

function place(mesh, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, castShadow = true, receiveShadow = true }: PlaceOptions = {}) {
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  mesh.castShadow    = castShadow
  mesh.receiveShadow = receiveShadow
  return mesh
}

export function box(w, h, d, material, opts: PlaceOptions & { radius?: number; segments?: number } = {}) {
  const { radius = 0, segments = 3 } = opts
  const geo = radius > 0
    ? new RoundedBoxGeometry(w, h, d, segments, radius)
    : new THREE.BoxGeometry(w, h, d)
  return place(new THREE.Mesh(geo, material), opts)
}

export function cylinder(rTop, rBottom, h, material, opts: PlaceOptions & { seg?: number; openEnded?: boolean } = {}) {
  const { seg = 32, openEnded = false } = opts
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, openEnded)
  return place(new THREE.Mesh(geo, material), opts)
}

export function cone(r, h, material, opts: PlaceOptions & { seg?: number } = {}) {
  const { seg = 32 } = opts
  return place(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material), opts)
}

export function sphere(r, material, opts: PlaceOptions & { seg?: number } = {}) {
  const { seg = 24 } = opts
  return place(new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), material), opts)
}

export function torus(r, tube, material, opts: PlaceOptions & { arc?: number; seg?: number; tubeSeg?: number } = {}) {
  const { arc = Math.PI * 2, seg = 24, tubeSeg = 12 } = opts
  return place(new THREE.Mesh(new THREE.TorusGeometry(r, tube, tubeSeg, seg, arc), material), opts)
}

export function plane(w, h, material, opts: PlaceOptions = {}) {
  return place(new THREE.Mesh(new THREE.PlaneGeometry(w, h), material), opts)
}

// Box whose back face (−Z) is scaled down: CRT tube bodies, lamp shades, etc.
// Front face sits at z = 0, back face at z = −depth.
export function frustumBox(wFront, hFront, wBack, hBack, depth, material, opts: PlaceOptions = {}) {
  const geo = new THREE.BoxGeometry(wFront, hFront, depth)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < 0) {
      pos.setX(i, pos.getX(i) * (wBack / wFront))
      pos.setY(i, pos.getY(i) * (hBack / hFront))
    }
  }
  geo.translate(0, 0, -depth / 2)
  geo.computeVertexNormals()
  return place(new THREE.Mesh(geo, material), opts)
}

// Smooth tube along a list of points (cables, chair frames, lamp arms).
export function tube(points, radius, material, opts: PlaceOptions & { closed?: boolean; seg?: number; radial?: number; tension?: number } = {}) {
  const { closed = false, seg = 64, radial = 10, tension = 0.5 } = opts
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension)
  const geo   = new THREE.TubeGeometry(curve, seg, radius, radial, closed)
  return place(new THREE.Mesh(geo, material), opts)
}

// Coiled (telephone-style) cable along a path.
export function coiledTube(points, { coilRadius = 26, turns = 28, radius = 9, coilStart = 0.15, coilEnd = 0.85 } = {}, material, opts = {}) {
  const base   = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)
  const n      = 600
  const frames = base.computeFrenetFrames(n, false)
  const pts    = []
  for (let i = 0; i <= n; i++) {
    const t   = i / n
    const p   = base.getPointAt(t)
    const amp = coilRadius * THREE.MathUtils.smoothstep(t, coilStart - 0.05, coilStart) * (1 - THREE.MathUtils.smoothstep(t, coilEnd, coilEnd + 0.05))
    const phi = t * turns * Math.PI * 2
    const idx = Math.min(i, n - 1)
    const off = new THREE.Vector3()
      .addScaledVector(frames.normals[idx],   Math.cos(phi) * amp)
      .addScaledVector(frames.binormals[idx], Math.sin(phi) * amp)
    pts.push(p.add(off))
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  const geo   = new THREE.TubeGeometry(curve, n, radius, 8, false)
  return place(new THREE.Mesh(geo, material), opts)
}

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

export function roundedRectPath(w, h, r) {
  const p = new THREE.Path()
  const x = -w / 2, y = -h / 2
  p.moveTo(x + r, y)
  p.lineTo(x + w - r, y)
  p.quadraticCurveTo(x + w, y, x + w, y + r)
  p.lineTo(x + w, y + h - r)
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  p.lineTo(x + r, y + h)
  p.quadraticCurveTo(x, y + h, x, y + h - r)
  p.lineTo(x, y + r)
  p.quadraticCurveTo(x, y, x + r, y)
  return p
}

export function group(children = [], opts: PlaceOptions = {}) {
  const g = new THREE.Group()
  for (const c of children) if (c) g.add(c)
  const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = opts
  g.position.set(x, y, z)
  g.rotation.set(rx, ry, rz)
  return g
}

// Deterministic pseudo-random so the scene looks identical on every load.
export function seededRandom(seed = 1984) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 2D value noise / fbm (terrain, procedural textures) ─────────────────────
export function valueNoise2D(seed = 1) {
  const rnd = seededRandom(seed)
  const SIZE = 256
  const perm = new Uint8Array(SIZE * 2)
  const grid = new Float32Array(SIZE)
  for (let i = 0; i < SIZE; i++) { perm[i] = i; grid[i] = rnd() }
  for (let i = SIZE - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]] }
  for (let i = 0; i < SIZE; i++) perm[i + SIZE] = perm[i]
  const at = (x, y) => grid[perm[(perm[x & 255] + (y & 255)) & 255]]
  const fade = t => t * t * (3 - 2 * t)
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y)
    const xf = x - xi, yf = y - yi
    const u = fade(xf), v = fade(yf)
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1)
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v
  }
  const fbm = (x, y, octaves = 5, lac = 2.0, gain = 0.5) => {
    let s = 0, a = 1, f = 1, norm = 0
    for (let i = 0; i < octaves; i++) { s += a * noise(x * f, y * f); norm += a; a *= gain; f *= lac }
    return s / norm
  }
  // sharp ridges: 1 - |2n - 1|
  const ridged = (x, y, octaves = 5) => {
    let s = 0, a = 1, f = 1, norm = 0
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(2 * noise(x * f, y * f) - 1)
      s += a * n * n; norm += a; a *= 0.5; f *= 2.1
    }
    return s / norm
  }
  return { noise, fbm, ridged }
}

// Rescale BoxGeometry UVs so a texture tiles every `tile` world units on every face.
export function worldUVBox(geo, w, h, d, tile) {
  const uv = geo.attributes.uv
  const faceDims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]   // +x −x +y −y +z −z
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faceDims[f]
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, uv.getX(i) * fw / tile, uv.getY(i) * fh / tile)
  }
  uv.needsUpdate = true
  return geo
}

// Vertex colour gradient by height (weathering: darker toward the ground).
export function weatherByHeight(geo, yMin, yMax, bottom = 0.72, top = 1.0) {
  const pos = geo.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - yMin) / (yMax - yMin)))
    const v = bottom + (top - bottom) * Math.pow(t, 0.6)
    col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geo
}
