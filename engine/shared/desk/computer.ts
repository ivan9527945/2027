// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'
import { PALETTE, plastic, chrome, rubber, emissive } from './palette'
import { box, cylinder, plane, frustumBox, tube, coiledTube, roundedRectShape, roundedRectPath, group } from './primitives'
import { labelTexture } from './textures'
import crtVert from './crtVertex'
import crtFrag from './crtFragment'

// World-space layout (1 Blender unit of the original scene = 900 world units)
export const DESK_Y = -450                 // desk top surface
export const SCREEN_POS = new THREE.Vector3(0, 950, 255)   // must match monitor.js
export const SCREEN_TILT = -3 * THREE.MathUtils.DEG2RAD
export const SCREEN_W = 1280
export const SCREEN_H = 1024

const UNIT_W = 1560, UNIT_H = 420, UNIT_D = 1610
const UNIT_FRONT_Z = 740
const UNIT_CENTER_Z = UNIT_FRONT_Z - UNIT_D / 2
const UNIT_BACK_Z = UNIT_FRONT_Z - UNIT_D
const UNIT_TOP_Y = DESK_Y + UNIT_H

// ── System unit (desktop case lying under the monitor) ─────────────────────
function createSystemUnit() {
  const beige     = plastic(PALETTE.beige)
  const beigeDark = plastic(PALETTE.beigeDark)
  const dark      = plastic(PALETTE.plasticDark, { roughness: 0.7 })

  const g = group([], { y: DESK_Y })
  g.name = 'system_unit'

  // Main case
  g.add(box(UNIT_W, UNIT_H, UNIT_D, beige, { y: UNIT_H / 2, z: UNIT_CENTER_Z, radius: 18 }))
  // Front fascia (slightly proud, darker beige)
  g.add(box(UNIT_W - 70, UNIT_H - 60, 24, beigeDark, { y: UNIT_H / 2, z: UNIT_FRONT_Z + 4, radius: 6 }))

  // Two 5.25" floppy drive bays on the right
  for (let i = 0; i < 2; i++) {
    const y = UNIT_H - 95 - i * 150
    g.add(box(600, 128, 40, dark,  { x: 330, y, z: UNIT_FRONT_Z + 6, radius: 4 }))           // bay recess
    g.add(box(520, 16, 8, rubber(), { x: 300, y: y - 22, z: UNIT_FRONT_Z + 26 }))            // disk slot
    g.add(box(42, 72, 22, beigeDark, { x: 560, y: y - 4, z: UNIT_FRONT_Z + 30, radius: 4 })) // door lever
    g.add(box(60, 10, 4, emissive(0x3aff5a, 1.2), { x: 100, y: y + 40, z: UNIT_FRONT_Z + 27 })) // activity LED
  }

  // Power LED + key lock + badge on the left
  g.add(box(70, 20, 6, emissive(0xff3b2f, 1.8), { x: -560, y: UNIT_H - 95, z: UNIT_FRONT_Z + 20 }))
  g.add(cylinder(26, 26, 10, chrome(), { x: -420, y: UNIT_H - 95, z: UNIT_FRONT_Z + 20, rx: Math.PI / 2 }))
  g.add(box(10, 3, 12, dark, { x: -420, y: UNIT_H - 95, z: UNIT_FRONT_Z + 26 }))

  const badge = new THREE.MeshStandardMaterial({ map: labelTexture(['ILLUMINATI', 'PERSONAL COMPUTER 84'], { w: 512, h: 128, bg: '#bdb193', fg: '#3a3127', font: 'bold 38px "Helvetica Neue", Arial, sans-serif' }), roughness: 0.6 })
  g.add(plane(420, 105, badge, { x: -520, y: 110, z: UNIT_FRONT_Z + 17 }))

  // Side vents (grooves)
  for (let i = 0; i < 14; i++) {
    const z = -620 + i * 42
    g.add(box(8, 230, 16, dark, { x: -UNIT_W / 2 - 1, y: UNIT_H / 2, z }))
    g.add(box(8, 230, 16, dark, { x:  UNIT_W / 2 + 1, y: UNIT_H / 2, z }))
  }
  // Rear connectors
  g.add(box(900, 180, 20, dark, { y: 160, z: UNIT_BACK_Z - 4 }))
  return g
}

// ── CRT monitor ─────────────────────────────────────────────────────────────
function createMonitor() {
  const beige     = plastic(PALETTE.beige)
  const beigeDark = plastic(PALETTE.beigeDark)
  const dark      = plastic(PALETTE.plasticDark, { roughness: 0.7 })

  // Everything attached to the screen is tilted with it so the bezel hugs the
  // CSS3D iframe exactly.
  const tilted = group([], { x: SCREEN_POS.x, y: SCREEN_POS.y, z: SCREEN_POS.z, rx: SCREEN_TILT })
  tilted.name = 'monitor_tilted'

  // Bezel: rounded rectangle with a rounded hole, extruded with a chamfer.
  // ExtrudeGeometry grows the body by bevelSize, so the contours are pre-shrunk.
  const BEVEL = 24, BEVEL_T = 28, DEPTH = 96
  const outerW = 1560, outerH = 1340
  const shape = roundedRectShape(outerW - BEVEL * 2, outerH - BEVEL * 2, 70)
  shape.holes.push(roundedRectPath(SCREEN_W + 4 + BEVEL * 2, SCREEN_H + 4 + BEVEL * 2, 48))
  const bezelGeo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL_T, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 12,
  })
  const bezel = new THREE.Mesh(bezelGeo, beige)
  bezel.castShadow = bezel.receiveShadow = true
  tilted.add(bezel)

  // CRT tube body, tapering toward the back
  tilted.add(frustumBox(outerW, outerH, 1040, 900, 880, beige, { z: -30 }))
  tilted.add(box(720, 620, 240, beigeDark, { z: -30 - 880 - 110, radius: 30 }))
  for (let i = 0; i < 7; i++) tilted.add(box(620, 10, 14, dark, { y: -200 + i * 60, z: -30 - 880 - 232 }))

  // Bottom bezel band details: badge, LED, knobs, post-it
  const badge = new THREE.MeshStandardMaterial({ map: labelTexture(['ILLUMINATI  ·  CRT-1084'], { w: 768, h: 96, bg: '#d9ceb2', fg: '#4a4034', font: 'bold 40px "Helvetica Neue", Arial, sans-serif' }), roughness: 0.6 })
  tilted.add(plane(420, 52, badge, { x: -500, y: -596, z: DEPTH + BEVEL_T + 1 }))
  tilted.add(box(44, 16, 6, emissive(0x3aff5a, 1.6), { x: 470, y: -596, z: DEPTH + BEVEL_T + 1 }))
  tilted.add(cylinder(22, 22, 26, beigeDark, { x: 560, y: -596, z: DEPTH + BEVEL_T + 8, rx: Math.PI / 2 }))
  tilted.add(cylinder(22, 22, 26, beigeDark, { x: 625, y: -596, z: DEPTH + BEVEL_T + 8, rx: Math.PI / 2 }))

  const postit = new THREE.MeshStandardMaterial({ map: labelTexture(['call', 'mom!'], { w: 256, h: 256, bg: '#fff176', fg: '#333', font: 'italic 60px "Marker Felt", "Comic Sans MS", cursive', align: 'center' }), roughness: 0.9 })
  tilted.add(plane(126, 126, postit, { x: 560, y: 592, z: DEPTH + BEVEL_T + 2, rz: -0.08 }))

  // CRT overlay drawn over the iframe (scanlines, vignette, phosphor tint)
  const crtMat = new THREE.ShaderMaterial({
    vertexShader: crtVert,
    fragmentShader: crtFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime:  { value: 0 },
      uTint:  { value: new THREE.Color(0xffb347) },
      uLines: { value: 300 },
    },
  })
  const overlay = plane(SCREEN_W, SCREEN_H, crtMat, { z: 5, castShadow: false, receiveShadow: false })
  overlay.name = 'crt_overlay'
  tilted.add(overlay)

  // Tilt/swivel stand (world space, sits on the system unit)
  const stand = group([], { y: UNIT_TOP_Y })
  stand.add(box(980, 100, 880, beige,     { y: 50,  z: 110, radius: 16 }))
  stand.add(box(660, 240, 560, beigeDark, { y: 200, z: 60,  radius: 22 }))

  const g = group([tilted, stand])
  g.name = 'monitor'
  return { group: g, crtMat }
}

// ── Mouse + pad ─────────────────────────────────────────────────────────────
function createMouse() {
  const beige     = plastic(PALETTE.beige)
  const beigeDark = plastic(PALETTE.beigeDark)
  const g = group([], { x: 920, y: DESK_Y, z: 1450 })
  g.name = 'mouse'
  g.add(box(560, 8, 460, plastic(0x3b2a4a, { roughness: 0.95 }), { y: 4, z: -20, radius: 4 }))
  g.add(box(300, 100, 440, beige, { y: 58, radius: 30 }))
  g.add(box(128, 14, 160, beigeDark, { x: -70, y: 108, z: -120, radius: 4 }))
  g.add(box(128, 14, 160, beigeDark, { x:  70, y: 108, z: -120, radius: 4 }))
  return g
}

// ── Cables ──────────────────────────────────────────────────────────────────
function createCables() {
  const cable = rubber()
  const g = new THREE.Group()
  g.name = 'cables'
  const back = UNIT_BACK_Z - 10

  // Keyboard (coiled) — around the left of the case to the back
  g.add(coiledTube([
    new THREE.Vector3(-900, DESK_Y + 30, 1000),
    new THREE.Vector3(-1080, DESK_Y + 22, 500),
    new THREE.Vector3(-1080, DESK_Y + 22, -250),
    new THREE.Vector3(-900, DESK_Y + 80, -760),
    new THREE.Vector3(-560, DESK_Y + 170, back),
  ], { coilRadius: 28, turns: 30, radius: 9, coilStart: 0.12, coilEnd: 0.8 }, cable))

  // Mouse — down the right side
  g.add(tube([
    new THREE.Vector3(920, DESK_Y + 40, 1230),
    new THREE.Vector3(1010, DESK_Y + 12, 700),
    new THREE.Vector3(1010, DESK_Y + 12, -150),
    new THREE.Vector3(960, DESK_Y + 60, -740),
    new THREE.Vector3(600, DESK_Y + 170, back),
  ], 9, cable, { seg: 80 }))

  // Monitor video cable from the rear bump down to the case
  g.add(tube([
    new THREE.Vector3(120, 640, -990),
    new THREE.Vector3(180, 300, -1180),
    new THREE.Vector3(260, -160, -1060),
    new THREE.Vector3(300, DESK_Y + 170, back),
  ], 12, cable, { seg: 60 }))

  // Power cable to the floor and off to the left
  g.add(tube([
    new THREE.Vector3(-300, DESK_Y + 170, back),
    new THREE.Vector3(-360, DESK_Y - 400, -1040),
    new THREE.Vector3(-420, -1900, -1180),
    new THREE.Vector3(-470, -2975, -1320),
    new THREE.Vector3(-2200, -2975, -1650),
    new THREE.Vector3(-4600, -2975, -1850),
  ], 12, cable, { seg: 90 }))
  return g
}

export function createComputer() {
  const monitor = createMonitor()
  const g = group([createSystemUnit(), monitor.group, createMouse(), createCables()])
  g.name = 'computer'
  return {
    group: g,
    tick(elapsed) { monitor.crtMat.uniforms.uTime.value = elapsed },
  }
}
