// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PALETTE, plastic, chrome, rubber, vinyl, emissive, glass } from './palette'
import { box, cylinder, sphere, torus, plane, tube, cone, group, seededRandom } from './primitives'
import { labelTexture, notepadTexture, grilleTexture, plainBookCoverTexture, stoneMaps, vhsLabelTexture, imageTexture } from './textures'
import { FLOOR_Y } from './constants'
import { DESK_Y } from './computer'
import { mergeStaticMeshes } from './merge'
// 封面圖放在 public/cover/（Next.js 的靜態檔）
const coverImageUrl = '/cover/S__189603842.jpg'

// ── Stack of 5.25" floppies ─────────────────────────────────────────────────
function createFloppies() {
  const rnd = seededRandom(5)
  const g = group([], { x: -2300, y: DESK_Y, z: -250 })
  g.name = 'floppies'
  const sleeve = plastic(0x141414, { roughness: 0.85 })
  const titles = [['ILLUMINATI.EXE', 'WORLD v2027'], ['DOS 3.3', 'SYSTEM DISK'], ['GAMES', 'ROPE ESCAPE'], ['BACKUP', '1984-11-11'], ['ILLUMINATI', 'MASTER PLAN']]
  for (let i = 0; i < 5; i++) {
    const label = new THREE.MeshStandardMaterial({ map: labelTexture(titles[i], { w: 384, h: 224, bg: '#f4f0e4', stripe: i % 2 ? '#ff2fa0' : '#2ee6ff', font: 'bold 40px "Courier New", monospace' }), roughness: 0.8 })
    const f = group([
      box(470, 9, 470, sleeve, { y: 4.5 }),
      plane(210, 122, label, { x: -110, y: 9.6, z: -150, rx: -Math.PI / 2 }),
      box(34, 10, 240, plastic(0x3a3a3a), { y: 4.5, z: 60 }), // read window
    ], { y: i * 9.5, x: (rnd() - 0.5) * 60, z: (rnd() - 0.5) * 60, ry: (rnd() - 0.5) * 0.3 })
    g.add(f)
  }
  return g
}

// ── Cassette tape ───────────────────────────────────────────────────────────
function createCassette() {
  const label = new THREE.MeshStandardMaterial({ map: labelTexture(['MIXTAPE \'84', 'SIDE A  ·  60 MIN'], { w: 512, h: 320, bg: '#f2e6c8', stripe: '#ff2fa0', fg: '#2b2622', font: 'bold 44px "Courier New", monospace' }), roughness: 0.7 })
  const shell = plastic(0x2a2a2a, { roughness: 0.5 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(350, 56, 222), [shell, shell, label, shell, shell, shell])
  body.castShadow = body.receiveShadow = true
  body.position.y = 28
  const g = group([
    body,
    cylinder(34, 34, 6, plastic(0xffffff, { roughness: 0.4 }), { x: -78, y: 58, z: 6 }),
    cylinder(34, 34, 6, plastic(0xffffff, { roughness: 0.4 }), { x:  78, y: 58, z: 6 }),
    cylinder(12, 12, 8, rubber(), { x: -78, y: 60, z: 6 }),
    cylinder(12, 12, 8, rubber(), { x:  78, y: 60, z: 6 }),
  ], { x: -1850, y: DESK_Y, z: -950, ry: 0.42 })
  g.name = 'cassette'
  return g
}

// ── Coffee mug ──────────────────────────────────────────────────────────────
function createMug() {
  const pts = [[0, 0], [150, 0], [160, 16], [160, 300], [150, 312], [136, 312], [130, 30], [0, 30]].map(([r, y]) => new THREE.Vector2(r, y))
  const mat = vinyl(0xd2691e)
  const mug = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), mat)
  mug.castShadow = mug.receiveShadow = true
  const handle = torus(96, 24, mat, { x: 150, y: 165, rz: -Math.PI / 2, arc: Math.PI, seg: 28 })
  const coffee = cylinder(128, 128, 6, plastic(0x2a1508, { roughness: 0.25 }), { y: 282 })
  const g = group([mug, handle, coffee], { x: 1650, y: DESK_Y, z: 950, ry: -0.6 })
  g.name = 'mug'
  return g
}

// ── Rubik's cube ────────────────────────────────────────────────────────────
function createRubiks() {
  const rnd = seededRandom(3)
  const S = 136, PITCH = 146
  const cubelets = new THREE.InstancedMesh(new RoundedBoxGeometry(S, S, S, 2, 14), plastic(0x111111, { roughness: 0.45 }), 27)
  const m = new THREE.Matrix4()
  let n = 0
  const stickers = []
  const colors = [0xffffff, 0xffd500, 0xc41e3a, 0xff5800, 0x009e60, 0x0051ba].map(c => new THREE.Color(c))
  const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    m.makeTranslation(i * PITCH, j * PITCH, k * PITCH)
    cubelets.setMatrixAt(n++, m)
    for (const [fx, fy, fz] of faces) {
      if ((fx && fx !== i) || (fy && fy !== j) || (fz && fz !== k)) continue
      const geo = new THREE.BoxGeometry(fx ? 6 : 112, fy ? 6 : 112, fz ? 6 : 112)
      geo.translate(i * PITCH + fx * (S / 2 + 2), j * PITCH + fy * (S / 2 + 2), k * PITCH + fz * (S / 2 + 2))
      const c = colors[Math.floor(rnd() * colors.length)]
      const col = new Float32Array(geo.attributes.position.count * 3)
      for (let v = 0; v < col.length; v += 3) { col[v] = c.r; col[v + 1] = c.g; col[v + 2] = c.b }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      stickers.push(geo)
    }
  }
  cubelets.castShadow = cubelets.receiveShadow = true
  const stickerMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(stickers, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }))
  stickerMesh.castShadow = true
  const g = group([cubelets, stickerMesh], { x: 1950, y: DESK_Y + PITCH + S / 2 + 4, z: -450, ry: 0.45 })
  g.name = 'rubiks_cube'
  return g
}

// ── Notepad + pencil ────────────────────────────────────────────────────────
function createNotepad() {
  const paper = new THREE.MeshStandardMaterial({ map: notepadTexture(), roughness: 0.95 })
  const edge  = plastic(0xe6c94a, { roughness: 0.95 })
  const pad = new THREE.Mesh(new THREE.BoxGeometry(620, 14, 820), [edge, edge, paper, edge, edge, edge])
  pad.position.y = 7
  pad.castShadow = pad.receiveShadow = true
  const binding = box(620, 20, 60, plastic(0x3a3a3a), { y: 10, z: -390 })
  const pencil = group([
    cylinder(9, 9, 520, plastic(0xf0b400, { roughness: 0.5 }), { rz: Math.PI / 2 }),
    cylinder(0, 9, 44, plastic(0xd9b48a), { x: 282, rz: Math.PI / 2 }),
    cylinder(9, 9, 34, plastic(0xff9ab5), { x: -277, rz: Math.PI / 2 }),
    cylinder(10, 10, 24, chrome(), { x: -252, rz: Math.PI / 2 }),
  ], { x: 120, y: 23, z: 120, ry: 0.9 })
  const g = group([pad, binding, pencil], { x: -2780, y: DESK_Y, z: 850, ry: 0.15 })
  g.name = 'notepad'
  return g
}

// ── Architect desk lamp (adds a warm point light) ───────────────────────────
function createLamp() {
  const black = plastic(0x1a1a1a, { roughness: 0.5 })
  const red   = plastic(0xd6412b, { roughness: 0.45 })
  const g = group([], { x: -2950, y: DESK_Y, z: -650 })
  g.name = 'lamp'

  g.add(cylinder(170, 185, 28, black, { y: 14 }))
  const elbow = new THREE.Vector3(-90, 640, 110)
  const head  = new THREE.Vector3(440, 1060, 470)
  g.add(tube([new THREE.Vector3(0, 28, 0), new THREE.Vector3(-40, 330, 50), elbow], 14, black, { seg: 12 }))
  g.add(sphere(32, black, { x: elbow.x, y: elbow.y, z: elbow.z }))
  g.add(tube([elbow, new THREE.Vector3(180, 870, 300), head], 14, black, { seg: 12 }))
  // springs along the lower arm
  g.add(tube([new THREE.Vector3(30, 120, 20), new THREE.Vector3(-20, 400, 70), new THREE.Vector3(-60, 560, 100)], 10, chrome(), { seg: 12 }))

  const dir = new THREE.Vector3(0.45, -0.78, 0.42).normalize()
  const shade = cylinder(55, 200, 240, red, { seg: 40, openEnded: true })
  shade.material = new THREE.MeshStandardMaterial({ color: 0xd6412b, roughness: 0.45, side: THREE.DoubleSide })
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir)
  shade.position.copy(head).addScaledVector(dir, 60)
  g.add(shade)
  g.add(sphere(30, black, { x: head.x, y: head.y, z: head.z }))

  const bulb = sphere(44, emissive(0xffd27a, 2.5), {})
  bulb.position.copy(head).addScaledVector(dir, 110)
  g.add(bulb)

  const light = new THREE.PointLight(0xffc98a, 1.8, 3800, 0)
  light.position.copy(head).addScaledVector(dir, 170)
  g.add(light)
  return g
}

// ── Boombox on the floor ────────────────────────────────────────────────────
function createBoombox() {
  const body = plastic(0x3b3b3f, { roughness: 0.5, metalness: 0.25 })
  const grille = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.9 })
  const g = group([], { x: -5300, y: FLOOR_Y, z: 900, ry: 0.4 })
  g.name = 'boombox'

  g.add(box(1300, 520, 380, body, { y: 262, radius: 22 }))
  for (const s of [-1, 1]) {
    g.add(cylinder(190, 190, 24, grille, { x: s * 420, y: 262, z: 192, rx: Math.PI / 2, seg: 40 }))
    g.add(torus(192, 12, chrome(), { x: s * 420, y: 262, z: 200 }))
  }
  g.add(box(400, 180, 12, glass(), { y: 290, z: 196 }))
  g.add(box(370, 150, 6, plastic(0x101010), { y: 290, z: 192 }))
  for (let i = 0; i < 6; i++) g.add(box(48, 30, 40, chrome(), { x: -150 + i * 60, y: 160, z: 200, radius: 4 }))
  g.add(box(360, 40, 10, emissive(0x2ee6ff, 1.3), { y: 430, z: 196 }))
  g.add(tube([
    new THREE.Vector3(-520, 500, 0), new THREE.Vector3(-520, 720, 0),
    new THREE.Vector3(520, 720, 0),  new THREE.Vector3(520, 500, 0),
  ], 18, chrome(), { seg: 24 }))
  g.add(cylinder(6, 8, 1100, chrome(), { x: 600, y: 1000, z: -120, rz: -0.45 }))
  return g
}

// ── Quiet allusions: an architect's tools, two ashlars, a geometry book ──────
function brass() {
  return new THREE.MeshPhysicalMaterial({ color: 0xc9a65c, metalness: 1.0, roughness: 0.38, envMapIntensity: 1.0 })
}
function steel() {
  return new THREE.MeshPhysicalMaterial({ color: 0xb8bcc2, metalness: 1.0, roughness: 0.32, envMapIntensity: 1.0 })
}

// Drafting compass lying open on the desk (built flat in the XZ plane)
function createCompass() {
  const g = group([], { x: -1480, y: DESK_Y + 10, z: -600, ry: 0.4 })
  g.name = 'drafting_compass'
  const open = 0.42, LEG = 420
  for (const sx of [-1, 1]) {
    const dir = new THREE.Vector3(Math.sin(sx * open), 0, Math.cos(sx * open))
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, LEG, 12), brass())
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    leg.position.copy(dir).multiplyScalar(LEG / 2)
    leg.castShadow = true
    g.add(leg)
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 5, 70, 8), steel())
    tip.quaternion.copy(leg.quaternion)
    tip.position.copy(dir).multiplyScalar(LEG + 35)
    g.add(tip)
  }
  g.add(cylinder(18, 18, 26, brass(), { seg: 16 }))                                   // hinge (vertical axis)
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 90, 10), brass())
  handle.rotation.x = Math.PI / 2
  handle.position.set(0, 4, -60)
  g.add(handle)
  g.add(sphere(12, brass(), { y: 4, z: -112, seg: 12 }))
  return g
}

// Steel try square resting across the corner of the notepad
function createTrySquare() {
  const g = group([], { x: -2420, y: DESK_Y + 22, z: 1180, ry: -0.35 })
  g.name = 'try_square'
  g.add(box(420, 8, 46, steel(), { x: 210, z: 0 }))
  g.add(box(46, 8, 300, steel(), { x: 0, z: 150 }))
  g.add(box(120, 16, 60, plastic(0x3b2a1a, { roughness: 0.5 }), { x: 60, y: 4, z: 0 }))   // wooden stock
  return g
}

// Rough ashlar and perfect ashlar: two small stone cubes side by side
function createAshlars() {
  const { map, bump, roughness } = stoneMaps({ base: [196, 188, 172] })
  const rough = new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 1.2, roughnessMap: roughness, roughness: 1.0 })
  const polished = new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15 })
  const g = group([], { x: 1250, y: DESK_Y, z: -720, ry: 0.3 })
  g.name = 'ashlars'
  const r = new THREE.Mesh(new THREE.BoxGeometry(210, 210, 210, 6, 6, 6), rough)
  const rp = r.geometry.attributes.position
  const rnd = seededRandom(9)
  for (let i = 0; i < rp.count; i++) { rp.setXYZ(i, rp.getX(i) + (rnd() - 0.5) * 24, rp.getY(i) + (rnd() - 0.5) * 24, rp.getZ(i) + (rnd() - 0.5) * 24) }
  r.geometry.computeVertexNormals()
  r.position.set(-150, 105, 0); r.rotation.y = 0.3; r.castShadow = r.receiveShadow = true
  g.add(r)
  const pm = new THREE.Mesh(new RoundedBoxGeometry(200, 200, 200, 3, 10), polished)
  pm.position.set(130, 100, 20); pm.castShadow = pm.receiveShadow = true
  g.add(pm)
  return g
}

// Worn leather book: Euclid's Elements (geometry, nothing more)
function createGeometryBook() {
  const g = group([], { x: -2950, y: DESK_Y, z: 120, ry: -0.2 })
  g.name = 'geometry_book'
  const cover = new THREE.MeshPhysicalMaterial({ map: plainBookCoverTexture(), roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.6 })
  const leather = plastic(0x2e2a26, { roughness: 0.65 })
  const pages = plastic(0xe6dfcc, { roughness: 0.9 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(560, 90, 740), [pages, leather, cover, leather, pages, leather])
  body.position.y = 45
  body.castShadow = body.receiveShadow = true
  g.add(body)
  g.add(box(30, 96, 744, leather, { x: -280, y: 48, radius: 10 }))
  g.add(box(26, 4, 300, plastic(0x6b2f2a, { roughness: 0.8 }), { x: 120, y: 92, z: 420, ry: 0.1 }))
  return g
}

// ── The Economist "The World Ahead 2026" lying on the desk ─────────────────
function createMagazine() {
  const g = group([], { x: -2250, y: DESK_Y, z: 1180, ry: 0.12 })
  g.name = 'magazine'
  const cover = new THREE.MeshStandardMaterial({ map: imageTexture(coverImageUrl), roughness: 0.55 })
  const paper = plastic(0xe9e4d8, { roughness: 0.9 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(600, 14, 720), [paper, paper, cover, paper, paper, paper])
  body.position.y = 7
  body.castShadow = body.receiveShadow = true
  g.add(body)
  return g
}

// ── VHS tapes: the whole run so far ───────────────────────────────────────
function createVHSStack() {
  const g = group([], { x: -3340, y: DESK_Y, z: -850, ry: 0.08 })
  g.name = 'vhs_stack'
  const shell = plastic(0x151515, { roughness: 0.6 })
  const labels = [
    ['THE SIMPSONS', 'S01-S10  1989-1999'],
    ['THE SIMPSONS', 'S11-S20  1999-2009'],
    ['THE SIMPSONS', 'S21-S30  2009-2019'],
    ['THE SIMPSONS', 'S31-S38  814 EPS'],
  ]
  labels.forEach((l, i) => {
    const t = group([
      box(400, 34, 210, shell, { y: 17, radius: 3 }),
      plane(300, 70, new THREE.MeshStandardMaterial({ map: vhsLabelTexture(l), roughness: 0.8 }), { y: 34.6, z: -40, rx: -Math.PI / 2, castShadow: false }),
      plane(300, 28, new THREE.MeshStandardMaterial({ map: vhsLabelTexture([l[1]]), roughness: 0.8 }), { y: 17, z: 106, castShadow: false }),
    ], { y: i * 35, x: (i % 2) * 18 - 9, ry: (i % 2 ? -1 : 1) * 0.04 })
    g.add(t)
  })
  return g
}

// ── Quiet nods to the show's future-set episodes ──────────────────────────
// Lisa's saxophone on its stand (2030: the jazz kid in the Oval Office)
function createSaxophone() {
  const g = group([], { x: 2250, y: DESK_Y, z: 330, ry: -0.5 })
  g.name = 'saxophone'
  const brassM = new THREE.MeshPhysicalMaterial({ color: 0xd4a84b, metalness: 1, roughness: 0.26, envMapIntensity: 1.3 })
  const dark = plastic(0x1a1a1a, { roughness: 0.5 })
  // stand
  g.add(cylinder(80, 100, 14, dark, { y: 7 }))
  g.add(cylinder(8, 8, 150, dark, { y: 85 }))
  g.add(torus(60, 7, dark, { y: 160, rx: Math.PI / 2, arc: Math.PI, seg: 20 }))
  // body tube: long slightly tapered cylinder, tilted back a little
  const body = group([], { y: 160, rx: -0.12 })
  const tubeGeo = new THREE.CylinderGeometry(20, 26, 330, 20)
  const bodyMesh = new THREE.Mesh(tubeGeo, brassM); bodyMesh.position.y = 165; bodyMesh.castShadow = true
  body.add(bodyMesh)
  // U-bend at the bottom (half torus) leading to the bell in front
  body.add(torus(46, 24, brassM, { y: 0, x: 0, z: 46, rx: 0, ry: Math.PI / 2, arc: Math.PI, rz: Math.PI, seg: 24, tubeSeg: 12 }))
  // bell: flaring lathe in front of the body
  const pts = []
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(24 + Math.pow(t, 2.2) * 62, t * 190)) }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshPhysicalMaterial({ color: 0xd4a84b, metalness: 1, roughness: 0.26, side: THREE.DoubleSide, envMapIntensity: 1.3 }))
  bell.position.set(0, 0, 92); bell.rotation.x = 0.1; bell.castShadow = true
  body.add(bell)
  // keys and rods on the front of the body
  for (let i = 0; i < 7; i++) {
    body.add(cylinder(10, 10, 5, brassM, { x: (i % 2 ? 6 : -6), y: 70 + i * 36, z: 27, rx: Math.PI / 2, seg: 12 }))
    body.add(sphere(5, dark, { x: (i % 2 ? 6 : -6), y: 70 + i * 36, z: 31, seg: 8 }))
  }
  body.add(cylinder(3, 3, 260, brassM, { x: 24, y: 190, z: 14, seg: 6 }))
  // neck: curved tube from the top bending backward, then mouthpiece
  body.add(tube([new THREE.Vector3(0, 330, 0), new THREE.Vector3(0, 380, -10), new THREE.Vector3(0, 405, -50), new THREE.Vector3(0, 410, -95)], 13, brassM, { seg: 20, radial: 10 }))
  body.add(cylinder(9, 11, 60, dark, { y: 410, z: -125, rx: Math.PI / 2, seg: 10 }))
  g.add(body)
  return g
}

// A small red globe (2051: a one-way ticket to Mars)
function createMarsGlobe() {
  const g = group([], { x: -1000, y: DESK_Y, z: -950 })
  g.name = 'mars_globe'
  const brassM = new THREE.MeshPhysicalMaterial({ color: 0xc9a65c, metalness: 1, roughness: 0.35 })
  g.add(cylinder(70, 90, 16, brassM, { y: 8 }))
  g.add(cylinder(8, 8, 120, brassM, { y: 70 }))
  g.add(torus(136, 7, brassM, { y: 150, ry: 0.4, rz: 0.4, arc: Math.PI * 1.1, seg: 40 }))
  const rnd = seededRandom(44)
  const mars = new THREE.Mesh(new THREE.SphereGeometry(118, 48, 32), new THREE.MeshStandardMaterial({ color: 0xb8532d, roughness: 0.9 }))
  const cols = new Float32Array(mars.geometry.attributes.position.count * 3)
  for (let i = 0; i < cols.length; i += 3) { const v = 0.75 + rnd() * 0.35; cols[i] = v; cols[i + 1] = v * 0.9; cols[i + 2] = v * 0.85 }
  mars.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  mars.material.vertexColors = true
  mars.position.y = 150; mars.rotation.z = 0.4; mars.castShadow = true
  g.add(mars)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(119, 24, 8, 0, Math.PI * 2, 0, 0.35), plastic(0xf4efe8, { roughness: 0.8 }))
  cap.position.y = 150; cap.rotation.z = 0.4
  g.add(cap)
  return g
}

// Wind-up tin robot (the plant's new workforce)
function createTinRobot() {
  const g = group([], { x: 1230, y: DESK_Y, z: 1000, ry: -0.6 })
  g.name = 'tin_robot'
  const tin = new THREE.MeshPhysicalMaterial({ color: 0xb9c1c9, metalness: 0.9, roughness: 0.35 })
  const red = plastic(0xb3261e, { roughness: 0.4 })
  g.add(box(110, 150, 80, tin, { y: 135, radius: 6 }))
  g.add(box(84, 70, 70, tin, { y: 255, radius: 6 }))
  g.add(box(140, 20, 60, red, { y: 230 }))                                // collar
  for (const sx of [-1, 1]) {
    g.add(cylinder(16, 16, 60, tin, { x: sx * 28, y: 30, seg: 10 }))      // legs
    g.add(box(40, 14, 60, red, { x: sx * 28, y: 7, z: 10 }))             // feet
    g.add(cylinder(10, 10, 120, tin, { x: sx * 70, y: 150, rz: sx * 0.25, seg: 8 }))   // arms
    g.add(cylinder(10, 10, 10, plastic(0x111), { x: sx * 18, y: 262, z: 36, rx: Math.PI / 2, seg: 10 }))  // eyes
  }
  g.add(box(30, 70, 6, red, { x: 56, y: 150, z: 0, rz: Math.PI / 2 }))  // wind-up key
  g.add(cylinder(4, 4, 60, tin, { y: 320, seg: 6 }))
  g.add(sphere(9, red, { y: 352, seg: 10 }))                            // antenna
  return g
}

// Small holographic projector (hologram mail, 2030)
function createHoloProjector() {
  const g = group([], { x: -700, y: DESK_Y, z: -1000 })
  g.name = 'holo_projector'
  g.add(cylinder(90, 100, 26, plastic(0x14110e, { roughness: 0.35 }), { y: 13, seg: 32 }))
  g.add(cylinder(30, 30, 8, new THREE.MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x7fe3ff, emissiveIntensity: 1.5 }), { y: 30, seg: 24 }))
  const beam = new THREE.Mesh(new THREE.ConeGeometry(120, 260, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x8fe9ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  beam.position.y = 164; beam.rotation.x = Math.PI
  g.add(beam)
  const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(55, 1), new THREE.MeshBasicMaterial({ color: 0xa8f0ff, wireframe: true, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
  holo.position.y = 200
  holo.name = 'hologram'
  g.add(holo)
  g.userData.tick = elapsed => { holo.rotation.y = elapsed * 0.0012; holo.position.y = 200 + Math.sin(elapsed * 0.003) * 10 }
  return g
}

// VR visor (the Ultranet jack, 2041)
function createVRVisor() {
  const g = group([], { x: 1560, y: DESK_Y, z: -250, ry: 0.35 })
  g.name = 'vr_visor'
  g.add(box(250, 110, 130, plastic(0x24262b, { roughness: 0.45 }), { y: 55, radius: 24 }))
  g.add(box(230, 70, 20, plastic(0x0d0d10, { roughness: 0.2 }), { y: 60, z: 70, radius: 8 }))
  g.add(box(60, 16, 6, new THREE.MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x7fe3ff, emissiveIntensity: 1.2 }), { y: 100, z: 68 }))
  g.add(tube([new THREE.Vector3(-125, 60, -20), new THREE.Vector3(-170, 60, -150), new THREE.Vector3(0, 70, -230), new THREE.Vector3(170, 60, -150), new THREE.Vector3(125, 60, -20)], 12, plastic(0x3a3d44, { roughness: 0.7 }), { seg: 32 }))
  return g
}

// pause：每建幾件呼叫一次（傳 chapterContext.yield），建構拆成幾個短任務，不會一次卡住畫面
export async function createDecor(pause = () => {}) {
  const makers = [
    createFloppies, createCassette, createMug, createRubiks,
    createNotepad, createLamp, createBoombox,
    createCompass, createTrySquare, createAshlars, createGeometryBook,
    createMagazine, createVHSStack,
    createSaxophone, createMarsGlobe, createTinRobot, createHoloProjector, createVRVisor,
  ]
  const items = []
  for (const [i, make] of makers.entries()) {
    items.push(make())
    if (i % 6 === 5) await pause()
  }
  const g = group(items)
  g.name = 'decor'
  g.children.forEach(mergeStaticMeshes)
  return g
}
