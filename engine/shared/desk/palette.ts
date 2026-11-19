// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'

// ── 80s colour palette ──────────────────────────────────────────────────────
export const PALETTE = {
  // Beige computer plastics (IBM PC / Apple II era)
  beige:       0xd9ceb2,
  beigeDark:   0xbdb193,
  beigeDeep:   0x8f8468,
  cream:       0xefe7d2,
  keyBrown:    0x6e6253,
  keyLegend:   0x2b2622,

  // Furniture
  wood:        0xa8683a,
  woodDark:    0x5c3a1e,
  vinylOrange: 0xc7581c,
  chrome:      0xffffff,
  black:       0x161616,
  plasticDark: 0x2a2521,
  rubber:      0x1d1d1d,

  // Neon / synthwave
  neonPink:    0xff2fa0,
  neonCyan:    0x2ee6ff,
  neonPurple:  0x8a3dff,
  amber:       0xffb000,
  skyTop:      0x090118,
  skyMid:      0x3a0a63,
  horizon:     0xff5f8f,
  sunTop:      0xfff07a,
  sunBottom:   0xff2f8e,
  gridBase:    0x12042a,
}

const cache = new Map()

function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}

export function plastic(color, { roughness = 0.55, metalness = 0.0 } = {}) {
  return cached(`plastic:${color}:${roughness}:${metalness}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness }))
}

export function chrome() {
  return cached('chrome', () =>
    new THREE.MeshStandardMaterial({ color: PALETTE.chrome, roughness: 0.18, metalness: 1.0 }))
}

export function rubber() {
  return cached('rubber', () =>
    new THREE.MeshStandardMaterial({ color: PALETTE.rubber, roughness: 0.95, metalness: 0.0 }))
}

export function vinyl(color = PALETTE.vinylOrange) {
  return cached(`vinyl:${color}`, () =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 }))
}

export function emissive(color, intensity = 1.5) {
  return cached(`emissive:${color}:${intensity}`, () =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }))
}

export function glass() {
  return cached('glass', () =>
    new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.55 }))
}
