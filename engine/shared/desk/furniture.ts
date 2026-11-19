// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { PALETTE, plastic, chrome, rubber } from './palette'
import { box, cylinder, sphere, tube, group } from './primitives'
import { woodMaps, leatherBump } from './textures'
import { FLOOR_Y } from './constants'
import { DESK_Y } from './computer'

// Footprint mirrors the original desk.glb (x −3.99..2.76, z −1.27..1.82 × 900)
const DESK_W = 6100, DESK_D = 2800, DESK_T = 90
const DESK_CX = -550, DESK_CZ = 250

// ── Materials ───────────────────────────────────────────────────────────────
let _wood, _woodDark, _vinyl, _vinylDark
function woodMat() {
  if (_wood) return _wood
  const { map, bump } = woodMaps()
  _wood = new THREE.MeshPhysicalMaterial({
    map, bumpMap: bump, bumpScale: 2.5,
    roughness: 0.38, metalness: 0.0,
    clearcoat: 0.35, clearcoatRoughness: 0.3,
  })
  return _wood
}
function woodDarkMat() {
  if (_woodDark) return _woodDark
  const { map, bump } = woodMaps({ base: '#5e3a1e' })
  _woodDark = new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 2, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 })
  return _woodDark
}
function vinylMat() {
  if (_vinyl) return _vinyl
  _vinyl = new THREE.MeshPhysicalMaterial({
    color: PALETTE.vinylOrange, bumpMap: leatherBump(), bumpScale: 1.6,
    roughness: 0.48, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color(0xffb27a),
  })
  return _vinyl
}
function vinylDarkMat() {
  if (_vinylDark) return _vinylDark
  _vinylDark = new THREE.MeshPhysicalMaterial({ color: 0x1e1a18, bumpMap: leatherBump(), bumpScale: 1.2, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.4 })
  return _vinylDark
}

// Rounded-rectangle loop (piping / seams around cushions)
function pipingLoop(w, d, r, y, material, radius = 11) {
  const pts = []
  const hw = w / 2 - r, hd = d / 2 - r
  const corners = [[hw, hd], [-hw, hd], [-hw, -hd], [hw, -hd]]
  corners.forEach(([cx, cz], i) => {
    const a0 = (i * Math.PI) / 2
    for (let k = 0; k <= 6; k++) {
      const a = a0 + (k / 6) * (Math.PI / 2)
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r))
    }
  })
  return tube(pts, radius, material, { closed: true, seg: 120, radial: 8 })
}

// ── Desk ────────────────────────────────────────────────────────────────────
export function createDesk() {
  const wood = woodMat(), dark = woodDarkMat()
  const g = new THREE.Group()
  g.name = 'desk'

  // Top with a chamfered dark-wood edge band and chrome front trim
  g.add(box(DESK_W, DESK_T, DESK_D, wood, { x: DESK_CX, y: DESK_Y - DESK_T / 2, z: DESK_CZ, radius: 24, segments: 6 }))
  g.add(box(DESK_W - 120, 110, DESK_D - 120, dark, { x: DESK_CX, y: DESK_Y - DESK_T - 50, z: DESK_CZ, radius: 12 }))
  g.add(box(DESK_W, 26, 18, chrome(), { x: DESK_CX, y: DESK_Y - DESK_T / 2, z: DESK_CZ + DESK_D / 2 + 3, radius: 6 }))

  // Leather writing mat under the keyboard
  g.add(box(1900, 14, 940, vinylDarkMat(), { x: -350, y: DESK_Y + 7, z: 1180, radius: 6 }))
  g.add(box(1900, 4, 940, plastic(0x3a2a22, { roughness: 0.9 }), { x: -350, y: DESK_Y + 14.5, z: 1180 }))

  // Side panels: frame + recessed inner panel + chrome foot
  const legH = DESK_Y - DESK_T - 110 - FLOOR_Y
  const legY = FLOOR_Y + legH / 2
  for (const sx of [-1, 1]) {
    const x = DESK_CX + sx * (DESK_W / 2 - 70)
    g.add(box(110, legH, DESK_D - 240, dark, { x, y: legY, z: DESK_CZ, radius: 8 }))
    g.add(box(40, legH - 420, DESK_D - 640, wood, { x: x + sx * 50, y: legY + 40, z: DESK_CZ, radius: 6 }))
    g.add(box(120, 36, DESK_D - 240, chrome(), { x, y: FLOOR_Y + 18, z: DESK_CZ, radius: 6 }))
  }

  // Modesty panel with grooves
  const modZ = DESK_CZ - DESK_D / 2 + 150
  g.add(box(DESK_W - 300, 1000, 48, dark, { x: DESK_CX, y: DESK_Y - DESK_T - 110 - 500, z: modZ, radius: 6 }))
  for (let i = 0; i < 3; i++) g.add(box(DESK_W - 400, 14, 10, plastic(0x2a1a0e), { x: DESK_CX, y: DESK_Y - DESK_T - 110 - 300 - i * 220, z: modZ + 26 }))

  // Drawer pedestal with recessed fronts, bar pulls and a keyhole
  const pedW = 900, pedD = DESK_D - 300
  const pedX = DESK_CX + DESK_W / 2 - 110 - pedW / 2
  g.add(box(pedW, legH, pedD, dark, { x: pedX, y: legY, z: DESK_CZ, radius: 10 }))
  const frontZ = DESK_CZ + pedD / 2
  for (let i = 0; i < 3; i++) {
    const y = DESK_Y - DESK_T - 110 - 400 - i * 750
    g.add(box(pedW - 80, 680, 26, wood, { x: pedX, y, z: frontZ + 10, radius: 8 }))
    // bar pull: two posts + bar
    for (const px of [-150, 150]) g.add(cylinder(12, 12, 40, chrome(), { x: pedX + px, y: y + 220, z: frontZ + 40, rx: Math.PI / 2, seg: 12 }))
    g.add(box(360, 22, 22, chrome(), { x: pedX, y: y + 220, z: frontZ + 60, radius: 8 }))
    if (i === 0) g.add(cylinder(16, 16, 10, plastic(0x1a1a1a), { x: pedX + 330, y: y + 220, z: frontZ + 26, rx: Math.PI / 2, seg: 12 }))
  }
  return g
}

// ── Office chair ────────────────────────────────────────────────────────────
export function createChair({ x = 770, z = 2450 } = {}) {
  const seatY = -1450
  const vinyl = vinylMat(), vinylDark = vinylDarkMat()
  const g = group([], { x, y: 0, z, ry: -0.25 })
  g.name = 'chair'

  // Five-star base: tapered chrome arms, forked casters with rubber wheels
  g.add(cylinder(80, 100, 120, chrome(), { y: FLOOR_Y + 110 }))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const dx = Math.sin(a), dz = Math.cos(a)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(22, 38, 680, 14), chrome())
    arm.position.set(dx * 340, FLOOR_Y + 95, dz * 340)
    arm.rotation.set(0, 0, 0)
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, -0.1, dz).normalize())
    arm.castShadow = true
    g.add(arm)
    const c = group([], { x: dx * 680, y: FLOOR_Y, z: dz * 680, ry: a })
    c.add(cylinder(18, 18, 70, chrome(), { y: 95 }))
    c.add(box(64, 76, 30, rubber(), { y: 62, z: -26, radius: 8 }))
    c.add(cylinder(50, 50, 42, rubber(), { y: 50, z: 10, rx: Math.PI / 2, seg: 24 }))
    c.add(cylinder(26, 26, 46, chrome(), { y: 50, z: 10, rx: Math.PI / 2, seg: 16 }))
    g.add(c)
  }
  // Gas lift with bellows
  g.add(cylinder(34, 34, 980, chrome(), { y: FLOOR_Y + 170 + 490 }))
  for (let i = 0; i < 3; i++) g.add(cylinder(58 - i * 8, 62 - i * 8, 170, rubber(), { y: FLOOR_Y + 260 + i * 170 }))
  // Tilt mechanism + lever
  g.add(box(520, 90, 440, rubber(), { y: seatY - 150, radius: 14 }))
  g.add(cylinder(10, 10, 300, chrome(), { x: 300, y: seatY - 150, z: 120, rz: Math.PI / 2, seg: 10 }))
  g.add(cylinder(18, 18, 70, rubber(), { x: 470, y: seatY - 150, z: 120, rz: Math.PI / 2, seg: 10 }))

  // Seat cushion: puffy rounded box, piping and a centre seam
  const seat = new THREE.Mesh(new RoundedBoxGeometry(1020, 200, 1020, 8, 95), vinyl)
  seat.position.y = seatY - 100
  seat.castShadow = seat.receiveShadow = true
  g.add(seat)
  g.add(pipingLoop(1020, 1020, 95, seatY - 16, vinyl))
  g.add(box(1000, 6, 14, plastic(0x6b2d10), { y: seatY + 2, radius: 3 }))

  // Backrest: bent (concave toward the sitter), tufted buttons, piping
  const backGeo = new RoundedBoxGeometry(960, 880, 190, 8, 80)
  const bp = backGeo.attributes.position
  for (let i = 0; i < bp.count; i++) {
    const bx = bp.getX(i), by = bp.getY(i)
    bp.setZ(i, bp.getZ(i) + (bx / 480) * (bx / 480) * 120 - (by / 440) * 40)
  }
  backGeo.computeVertexNormals()
  const back = new THREE.Mesh(backGeo, vinyl)
  back.position.set(0, seatY + 560, 500)
  back.rotation.x = -0.14
  back.castShadow = back.receiveShadow = true
  g.add(back)
  const backG = group([], { y: seatY + 560, z: 500, rx: -0.14 })
  for (const by of [-200, 60, 320]) for (const bx of [-220, 220]) {
    const z = -95 + (bx / 480) * (bx / 480) * 120 - (by / 440) * 40
    backG.add(sphere(30, vinylDark, { x: bx, y: by, z: z + 6, seg: 14 }))
  }
  g.add(backG)

  // Chrome spine from mechanism to backrest
  g.add(tube([
    new THREE.Vector3(0, seatY - 120, 240),
    new THREE.Vector3(0, seatY - 110, 560),
    new THREE.Vector3(0, seatY + 120, 600),
    new THREE.Vector3(0, seatY + 320, 590),
  ], 26, chrome(), { seg: 24 }))

  // Armrests: chrome loops with padded black vinyl tops
  for (const s of [-1, 1]) {
    g.add(tube([
      new THREE.Vector3(s * 440, seatY - 130, 180),
      new THREE.Vector3(s * 540, seatY + 60, 240),
      new THREE.Vector3(s * 545, seatY + 230, 60),
      new THREE.Vector3(s * 545, seatY + 230, -330),
    ], 22, chrome(), { seg: 32 }))
    g.add(box(110, 52, 540, vinylDark, { x: s * 545, y: seatY + 262, z: -130, radius: 22 }))
  }
  return g
}
