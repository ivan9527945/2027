// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
import { PALETTE, plastic } from './palette'
import { group } from './primitives'
import { keycapAtlas } from './textures'

// IBM-PC-style layout: a 2-column function block on the left + a 15u main block.
const U      = 88    // key pitch
const CAP    = 78    // keycap footprint (1u)
const CAP_H  = 34
const ROWS   = 5

const D = true // dark (brown) keycap
// 每個鍵：[標籤, 寬度（單位鍵寬）, 深色鍵]
type KeyDef = [label: string, w?: number, dark?: boolean]
const MAIN_ROWS: KeyDef[][] = [
  [['ESC', 1, D], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8'], ['9'], ['0'], ['-'], ['='], ['BACK', 2, D]],
  [['TAB', 1.5, D], ['Q'], ['W'], ['E'], ['R'], ['T'], ['Y'], ['U'], ['I'], ['O'], ['P'], ['['], [']'], ['\\', 1.5, D]],
  [['CTRL', 1.75, D], ['A'], ['S'], ['D'], ['F'], ['G'], ['H'], ['J'], ['K'], ['L'], [';'], ['\''], ['ENTER', 2.25, D]],
  [['SHIFT', 2.25, D], ['Z'], ['X'], ['C'], ['V'], ['B'], ['N'], ['M'], [','], ['.'], ['/'], ['SHIFT', 2.75, D]],
  [['ALT', 1.5, D], ['', 8.5], ['CAPS', 1.5, D], ['←', 1, D], ['↓', 1, D], ['→', 1.5, D]],
]

function buildKeyList() {
  const keys = []
  // Function block
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < 2; c++) {
    keys.push({ label: `F${r * 2 + c + 1}`, w: 1, dark: true, row: r, x: (c + 0.5) * U })
  }
  const xMain = 2.5 * U
  MAIN_ROWS.forEach((row, r) => {
    let cursor = xMain
    for (const [label, w = 1, dark = false] of row) {
      keys.push({ label, w, dark, row: r, x: cursor + (w * U) / 2 })
      cursor += w * U
    }
  })
  return keys
}

export function createKeyboard({ x = -200, y = -450, z = 1280 } = {}) {
  const keys  = buildKeyList()
  const atlas = keycapAtlas(keys)

  const blockW   = 17.5 * U
  const caseW    = blockW + 100
  const caseD    = ROWS * U + 130
  const frontH   = 58, backH = 118
  const slope    = Math.atan((backH - frontH) / caseD)

  // ── Case: trapezoid profile (in YZ) extruded along X ──
  const prof = new THREE.Shape()
  prof.moveTo(-caseD / 2, 0)          // shape.x = −world z  (front)
  prof.lineTo( caseD / 2, 0)          // back
  prof.lineTo( caseD / 2, backH)
  prof.lineTo(-caseD / 2, frontH)
  prof.closePath()
  const caseGeo = new THREE.ExtrudeGeometry(prof, { depth: caseW, bevelEnabled: true, bevelThickness: 8, bevelSize: 8, bevelSegments: 2 })
  caseGeo.rotateY(Math.PI / 2)
  caseGeo.translate(-caseW / 2, 0, 0)
  const caseMesh = new THREE.Mesh(caseGeo, plastic(PALETTE.beige))
  caseMesh.castShadow = caseMesh.receiveShadow = true
  caseMesh.name = 'keyboard_case'

  // ── Keycaps: one merged geometry, legends from the canvas atlas ──
  const geos = []
  const plainCream = atlas.cellUV(0)
  const plainBrown = atlas.cellUV(1)
  for (const k of keys) {
    const w = k.w * U - (U - CAP)
    const geo = new THREE.BoxGeometry(w, CAP_H, CAP)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * 0.86); pos.setZ(i, pos.getZ(i) * 0.86) }
    }
    geo.computeVertexNormals()

    // BoxGeometry face order: +x, −x, +y, −y, +z, −z (4 verts each)
    const uv = geo.attributes.uv
    const side = k.dark ? plainBrown : plainCream
    const sc = [(side[0] + side[2]) / 2, (side[1] + side[3]) / 2]
    for (let i = 0; i < uv.count; i++) uv.setXY(i, sc[0], sc[1])
    const [u0, v0, u1, v1] = atlas.cellUV(k.atlas)
    uv.setXY(8,  u0, v1); uv.setXY(9,  u1, v1)
    uv.setXY(10, u0, v0); uv.setXY(11, u1, v0)

    const zLocal = -(50 + (ROWS - 1 - k.row + 0.5) * U)
    geo.translate(-blockW / 2 + k.x, CAP_H / 2 + 4, zLocal)
    geos.push(geo)
  }
  const capsGeo = BufferGeometryUtils.mergeGeometries(geos, false)
  const capsMat = new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.5, metalness: 0 })
  const caps = new THREE.Mesh(capsGeo, capsMat)
  caps.castShadow = caps.receiveShadow = true
  caps.name = 'keycaps'

  // Keys sit on the sloped top: pivot at the front-top edge, rotate so the back rises.
  const keysGroup = group([caps], { y: frontH, z: caseD / 2, rx: slope })

  const kb = group([caseMesh, keysGroup], { x, y, z })
  kb.name = 'keyboard'
  return kb
}
