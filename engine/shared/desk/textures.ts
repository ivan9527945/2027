// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'
import { seededRandom, valueNoise2D } from './primitives'
import { QUALITY } from './quality'

// All textures in the retro scene are painted at runtime on <canvas>, so the
// variant ships with zero image downloads.

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

// Low tier: a canvas larger than 512 px is copied to one half the size and the
// original is emptied on the spot. A quarter of the memory, both for the canvas
// (which stays alive as the texture's source) and for the GPU copy; on a phone
// frame the difference cannot be seen.
function sized(canvas) {
  const s = QUALITY.textureScale
  if (s >= 1 || Math.max(canvas.width, canvas.height) <= 512) return canvas
  const [c, ctx] = makeCanvas(Math.max(1, Math.round(canvas.width * s)), Math.max(1, Math.round(canvas.height * s)))
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, c.width, c.height)
  canvas.width = canvas.height = 0
  return c
}

function toTexture(canvas, { repeat = [1, 1], anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(sized(canvas))
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = anisotropy
  t.needsUpdate = true
  return t
}

// ── Wood grain (desk top) ───────────────────────────────────────────────────
export function woodTexture({ base = '#a8683a', dark = '#5e381c', size = 1024 } = {}) {
  const [c, ctx] = makeCanvas(size, size)
  const rnd = seededRandom(7)

  const grad = ctx.createLinearGradient(0, 0, 0, size)
  grad.addColorStop(0, base)
  grad.addColorStop(1, shade(base, -12))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)

  // Grain lines
  for (let i = 0; i < 180; i++) {
    const y0  = rnd() * size
    const amp = 6 + rnd() * 18
    const f   = 0.004 + rnd() * 0.008
    const ph  = rnd() * 100
    ctx.beginPath()
    for (let x = 0; x <= size; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.3
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.strokeStyle = `rgba(60,28,10,${0.08 + rnd() * 0.18})`
    ctx.lineWidth   = 0.8 + rnd() * 2.2
    ctx.stroke()
  }
  // Knots
  for (let i = 0; i < 3; i++) {
    const kx = rnd() * size, ky = rnd() * size
    for (let r = 60; r > 4; r -= 7) {
      ctx.beginPath()
      ctx.ellipse(kx, ky, r * 1.6, r, 0.3, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(50,22,8,${0.12})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
  ctx.fillStyle = dark
  ctx.globalAlpha = 0.06
  for (let i = 0; i < 600; i++) ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 20 + rnd() * 80)
  ctx.globalAlpha = 1
  return toTexture(c, { repeat: [2, 1] })
}

// ── Keyboard legend atlas (16×16 cells) ────────────────────────────────────
// Returns { texture, cell(index) → [u0, v0, u1, v1] }
export const ATLAS_CELLS = 16

export function keycapAtlas(keys, { cream = '#efe7d2', brown = '#6e6253' } = {}) {
  const size = 2048
  const cell = size / ATLAS_CELLS
  const [c, ctx] = makeCanvas(size, size)
  ctx.fillStyle = cream
  ctx.fillRect(0, 0, size, size)

  const drawCell = (index, bg, text, fg, wide) => {
    const col = index % ATLAS_CELLS, row = Math.floor(index / ATLAS_CELLS)
    const x = col * cell, y = row * cell
    ctx.fillStyle = bg
    ctx.fillRect(x, y, cell, cell)
    // subtle top highlight
    const g = ctx.createLinearGradient(0, y, 0, y + cell)
    g.addColorStop(0, 'rgba(255,255,255,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0.10)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, cell, cell)
    if (!text) return
    ctx.fillStyle = fg
    const len  = text.length
    const px   = len > 4 ? 30 : len > 2 ? 40 : 54
    ctx.font = `bold ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + cell / 2, y + cell / 2 + 2, wide ? cell - 16 : cell - 24)
  }

  // index 0 = plain cream, 1 = plain brown (used for key sides)
  drawCell(0, cream, '', '', false)
  drawCell(1, brown, '', '', false)
  keys.forEach((k, i) => {
    const idx = i + 2
    drawCell(idx, k.dark ? brown : cream, k.label, k.dark ? cream : '#2b2622', k.w > 1)
    k.atlas = idx
  })

  const tex = toTexture(c)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  const cellUV = index => {
    const col = index % ATLAS_CELLS, row = Math.floor(index / ATLAS_CELLS)
    const pad = 0.004
    return [
      col / ATLAS_CELLS + pad,
      1 - (row + 1) / ATLAS_CELLS + pad,
      (col + 1) / ATLAS_CELLS - pad,
      1 - row / ATLAS_CELLS - pad,
    ]
  }
  return { texture: tex, cellUV }
}

// ── Simple text label (badges, floppy labels, cassette) ────────────────────
export function labelTexture(lines, { w = 512, h = 256, bg = '#f4f0e4', fg = '#2b2622', stripe = null, font = 'bold 44px "Helvetica Neue", Arial, sans-serif', align = 'left' }: { w?: number; h?: number; bg?: string; fg?: string; stripe?: string | null; font?: string; align?: CanvasTextAlign } = {}) {
  const [c, ctx] = makeCanvas(w, h)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  if (stripe) {
    ctx.fillStyle = stripe
    ctx.fillRect(0, 0, w, h * 0.18)
  }
  ctx.fillStyle = fg
  ctx.font = font
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const x = align === 'center' ? w / 2 : 28
  const lh = h / (lines.length + 1)
  lines.forEach((t, i) => ctx.fillText(t, x, lh * (i + 1) + (stripe ? h * 0.08 : 0), w - 56))
  const tex = toTexture(c)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Memphis-pattern rug ─────────────────────────────────────────────────────
export function memphisTexture({ size = 1024 } = {}) {
  const [c, ctx] = makeCanvas(size, size)
  const rnd = seededRandom(1986)
  ctx.fillStyle = '#1a1038'
  ctx.fillRect(0, 0, size, size)
  const cols = ['#ff2fa0', '#2ee6ff', '#ffd23f', '#8a3dff', '#ffffff']

  // squiggles
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = cols[Math.floor(rnd() * cols.length)]
    ctx.lineWidth = 4 + rnd() * 4
    ctx.lineCap = 'round'
    const x0 = rnd() * size, y0 = rnd() * size
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    for (let k = 1; k <= 5; k++) ctx.lineTo(x0 + k * 18, y0 + (k % 2 ? -14 : 14))
    ctx.stroke()
  }
  // dots
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]
    ctx.beginPath()
    ctx.arc(rnd() * size, rnd() * size, 3 + rnd() * 5, 0, Math.PI * 2)
    ctx.fill()
  }
  // triangles & bars
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]
    const x = rnd() * size, y = rnd() * size, s = 24 + rnd() * 40
    ctx.globalAlpha = 0.85
    if (rnd() > 0.5) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.lineTo(x + s / 2, y - s); ctx.closePath(); ctx.fill()
    } else {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * Math.PI); ctx.fillRect(-s, -5, s * 2, 10); ctx.restore()
    }
    ctx.globalAlpha = 1
  }
  return toTexture(c, { repeat: [3, 2] })
}

// ── Lined notepad ───────────────────────────────────────────────────────────
export function notepadTexture() {
  const [c, ctx] = makeCanvas(512, 680)
  ctx.fillStyle = '#f5de5a'
  ctx.fillRect(0, 0, 512, 680)
  ctx.strokeStyle = 'rgba(40,80,200,0.45)'
  ctx.lineWidth = 2
  for (let y = 90; y < 680; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke() }
  ctx.strokeStyle = 'rgba(220,40,60,0.6)'
  ctx.beginPath(); ctx.moveTo(60, 0); ctx.lineTo(60, 680); ctx.stroke()
  ctx.fillStyle = '#2a2a4a'
  ctx.font = 'italic 26px "Comic Sans MS", "Marker Felt", cursive'
  const notes = ['TODO:', '- fix padding 4px', '- ship portfolio', '- golf @ 6am', '- call back PM']
  notes.forEach((t, i) => ctx.fillText(t, 80, 116 + i * 34))
  const tex = toTexture(c)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Speaker grille ──────────────────────────────────────────────────────────
export function grilleTexture() {
  const [c, ctx] = makeCanvas(256, 256)
  ctx.fillStyle = '#1b1b1b'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = '#050505'
  for (let y = 8; y < 256; y += 16) for (let x = 8; x < 256; x += 16) {
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill()
  }
  return toTexture(c, { repeat: [3, 3] })
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, (n >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount))
  return `rgb(${r},${g},${b})`
}

// ── Checkerboard tile (surreal plain) ──────────────────────────────────────
export function checkerTexture({ cells = 8, light = '#efe9dc', dark = '#1f2230', size = 1024 } = {}) {
  const [c, ctx] = makeCanvas(size, size)
  const cell = size / cells
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    ctx.fillStyle = (x + y) % 2 ? dark : light
    ctx.fillRect(x * cell, y * cell, cell, cell)
  }
  const tex = toTexture(c, { anisotropy: 16 })
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}

// ── Clock face ─────────────────────────────────────────────────────────────
export function clockFaceTexture({ hands = true } = {}) {
  const [c, ctx] = makeCanvas(1024, 1024)
  ctx.fillStyle = '#f7f1df'
  ctx.fillRect(0, 0, 1024, 1024)
  ctx.translate(512, 512)
  ctx.strokeStyle = '#2a2622'
  ctx.lineWidth = 10
  ctx.beginPath(); ctx.arc(0, 0, 470, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#2a2622'
  ctx.font = 'bold 86px "Times New Roman", serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    ctx.fillText(roman[i], Math.cos(a) * 380, Math.sin(a) * 380)
    for (let m = 0; m < 5; m++) {
      const b = a + (m / 60) * Math.PI * 2
      ctx.lineWidth = m === 0 ? 8 : 3
      ctx.beginPath(); ctx.moveTo(Math.cos(b) * 440, Math.sin(b) * 440); ctx.lineTo(Math.cos(b) * (m === 0 ? 400 : 420), Math.sin(b) * (m === 0 ? 400 : 420)); ctx.stroke()
    }
  }
  const hand = (len, w, ang) => {
    ctx.lineWidth = w; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len); ctx.stroke()
  }
  if (hands) {
    hand(230, 22, -Math.PI / 2 + (11 / 12) * Math.PI * 2 + 0.08)  // ~11:11
    hand(330, 14, -Math.PI / 2 + (11 / 60) * Math.PI * 2)
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill()
  }
  const tex = toTexture(c)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Sky-with-clouds texture for a "sky sphere" object ──────────────────────
export function cloudSphereTexture() {
  const [c, ctx] = makeCanvas(1024, 512)
  const rnd = seededRandom(99)
  const g = ctx.createLinearGradient(0, 0, 0, 512)
  g.addColorStop(0, '#2b6fd0'); g.addColorStop(1, '#a9d0ff')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 1024, y = 120 + rnd() * 330, s = 30 + rnd() * 50
    for (let k = 0; k < 7; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.75 + rnd() * 0.25})`
      ctx.beginPath(); ctx.arc(x + (k - 3) * s * 0.7, y + (rnd() - 0.5) * s * 0.5, s * (0.6 + rnd() * 0.6), 0, Math.PI * 2); ctx.fill()
    }
  }
  return toTexture(c)
}

// ── Wood colour + bump pair (same grain so highlights follow the texture) ──
export function woodMaps({ base = '#a8683a', size = 1024 } = {}) {
  const rnd = seededRandom(7)
  const [c, ctx] = makeCanvas(size, size)
  const [b, bctx] = makeCanvas(size, size)

  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, base)
  grad.addColorStop(0.5, shade(base, 10))
  grad.addColorStop(1, shade(base, -14))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  bctx.fillStyle = '#808080'
  bctx.fillRect(0, 0, size, size)

  // long grain streaks
  for (let i = 0; i < 260; i++) {
    const y0  = rnd() * size
    const amp = 4 + rnd() * 14
    const f   = 0.003 + rnd() * 0.007
    const ph  = rnd() * 100
    const alpha = 0.06 + rnd() * 0.2
    const lw = 0.6 + rnd() * 2.4
    const path = () => {
      ctx.beginPath(); bctx.beginPath()
      for (let x = 0; x <= size; x += 6) {
        const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.7 + ph * 2) * amp * 0.35
        if (x === 0) { ctx.moveTo(x, y); bctx.moveTo(x, y) } else { ctx.lineTo(x, y); bctx.lineTo(x, y) }
      }
    }
    path()
    ctx.strokeStyle = `rgba(58,26,8,${alpha})`; ctx.lineWidth = lw; ctx.stroke()
    bctx.strokeStyle = `rgba(${rnd() > 0.5 ? 40 : 200},${rnd() > 0.5 ? 40 : 200},${rnd() > 0.5 ? 40 : 200},${alpha * 0.9})`; bctx.lineWidth = lw; bctx.stroke()
  }
  // cathedral figure (arched grain)
  for (let k = 0; k < 2; k++) {
    const cx = rnd() * size, cy = rnd() * size
    for (let r = 40; r < 700; r += 22 + rnd() * 10) {
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 2.4, r * 0.5, 0, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(50,22,8,${0.05 + rnd() * 0.06})`; ctx.lineWidth = 1.2; ctx.stroke()
      bctx.beginPath(); bctx.ellipse(cx, cy, r * 2.4, r * 0.5, 0, 0, Math.PI * 2)
      bctx.strokeStyle = 'rgba(40,40,40,0.18)'; bctx.lineWidth = 1.2; bctx.stroke()
    }
  }
  // pores
  ctx.globalAlpha = 0.08; ctx.fillStyle = '#3a1a08'
  for (let i = 0; i < 1200; i++) ctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 10 + rnd() * 60)
  ctx.globalAlpha = 1
  bctx.globalAlpha = 0.25; bctx.fillStyle = '#404040'
  for (let i = 0; i < 1200; i++) bctx.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 2, 10 + rnd() * 60)
  bctx.globalAlpha = 1

  const map  = toTexture(c, { repeat: [2, 1], anisotropy: 16 })
  const bump = toTexture(b, { repeat: [2, 1], anisotropy: 16 })
  bump.colorSpace = THREE.NoColorSpace
  return { map, bump }
}

// ── Leather / vinyl grain bump ─────────────────────────────────────────────
export function leatherBump({ size = 512 } = {}) {
  const rnd = seededRandom(31)
  const [c, ctx] = makeCanvas(size, size)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 9000; i++) {
    const v = 90 + Math.floor(rnd() * 80)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.beginPath()
    ctx.ellipse(rnd() * size, rnd() * size, 2 + rnd() * 4, 1.5 + rnd() * 3, rnd() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  // creases
  ctx.strokeStyle = 'rgba(60,60,60,0.35)'
  for (let i = 0; i < 60; i++) {
    ctx.lineWidth = 0.8 + rnd() * 1.2
    ctx.beginPath()
    let x = rnd() * size, y = rnd() * size
    ctx.moveTo(x, y)
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; ctx.lineTo(x, y) }
    ctx.stroke()
  }
  const tex = toTexture(c, { repeat: [3, 3] })
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

// ── Marble checkerboard: colour + roughness maps ────────────────────────────
export function marbleCheckerMaps({ cells = 8, size = 2048 } = {}) {
  const rnd = seededRandom(1931)
  const [c, ctx] = makeCanvas(size, size)
  const [r, rctx] = makeCanvas(size, size)
  const cell = size / cells

  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const dark = (x + y) % 2 === 1
    const X = x * cell, Y = y * cell
    ctx.save(); ctx.beginPath(); ctx.rect(X, Y, cell, cell); ctx.clip()
    if (dark) {
      ctx.fillStyle = `rgb(${26 + rnd() * 6},${28 + rnd() * 6},${40 + rnd() * 8})`
      ctx.fillRect(X, Y, cell, cell)
      // faint lighter veins
      for (let i = 0; i < 5; i++) vein(ctx, X, Y, cell, `rgba(120,130,160,${0.08 + rnd() * 0.1})`, rnd)
    } else {
      ctx.fillStyle = `rgb(${236 + rnd() * 10},${231 + rnd() * 8},${219 + rnd() * 8})`
      ctx.fillRect(X, Y, cell, cell)
      for (let i = 0; i < 7; i++) vein(ctx, X, Y, cell, `rgba(120,110,100,${0.12 + rnd() * 0.18})`, rnd)
      for (let i = 0; i < 3; i++) vein(ctx, X, Y, cell, `rgba(170,150,130,${0.08 + rnd() * 0.1})`, rnd, 6)
    }
    ctx.restore()
    // grout line
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 3
    ctx.strokeRect(X + 1.5, Y + 1.5, cell - 3, cell - 3)
    // roughness: polished light tiles, matte dark ones
    const rough = dark ? 150 : 70
    rctx.fillStyle = `rgb(${rough},${rough},${rough})`
    rctx.fillRect(X, Y, cell, cell)
  }
  const map = toTexture(c, { anisotropy: 16 })
  const roughness = toTexture(r, { anisotropy: 16 })
  roughness.colorSpace = THREE.NoColorSpace
  return { map, roughness }
}

function vein(ctx, X, Y, cell, style, rnd, width = 1.5) {
  ctx.strokeStyle = style
  ctx.lineWidth = width * (0.5 + rnd())
  ctx.beginPath()
  let x = X + rnd() * cell, y = Y + rnd() * cell
  ctx.moveTo(x, y)
  for (let k = 0; k < 8; k++) {
    const nx = x + (rnd() - 0.5) * cell * 0.45, ny = y + (rnd() - 0.5) * cell * 0.45
    ctx.quadraticCurveTo(x + (rnd() - 0.5) * 80, y + (rnd() - 0.5) * 80, nx, ny)
    x = nx; y = ny
  }
  ctx.stroke()
}

// ── Travertine / limestone (buildings): colour + bump + roughness ──────────
export function stoneMaps({ size = 1024, base = [222, 212, 192] } = {}) {
  const rnd = seededRandom(404)
  const [c, ctx] = makeCanvas(size, size)
  const [b, bctx] = makeCanvas(size, size)
  const [r, rctx] = makeCanvas(size, size)
  const [br, bg, bb] = base
  ctx.fillStyle = `rgb(${br},${bg},${bb})`; ctx.fillRect(0, 0, size, size)
  bctx.fillStyle = '#8c8c8c'; bctx.fillRect(0, 0, size, size)
  rctx.fillStyle = '#d0d0d0'; rctx.fillRect(0, 0, size, size)

  // soft mottling
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size, rad = 20 + rnd() * 90
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    const dv = (rnd() - 0.5) * 26
    g.addColorStop(0, `rgba(${br + dv},${bg + dv},${bb + dv * 0.8},0.35)`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // horizontal strata (travertine bedding)
  for (let y = 0; y < size; y += 18 + rnd() * 40) {
    const alpha = 0.04 + rnd() * 0.09
    ctx.fillStyle = `rgba(120,100,70,${alpha})`
    ctx.fillRect(0, y, size, 2 + rnd() * 5)
    bctx.fillStyle = `rgba(60,60,60,${alpha * 2})`
    bctx.fillRect(0, y, size, 2 + rnd() * 4)
  }
  // pores / pits
  for (let i = 0; i < 700; i++) {
    const x = rnd() * size, y = rnd() * size, w = 1.5 + rnd() * 6, h = 1 + rnd() * 2.5
    ctx.fillStyle = `rgba(90,70,45,${0.15 + rnd() * 0.3})`
    ctx.beginPath(); ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); ctx.fill()
    bctx.fillStyle = `rgba(20,20,20,${0.5 + rnd() * 0.4})`
    bctx.beginPath(); bctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); bctx.fill()
    rctx.fillStyle = 'rgba(255,255,255,0.6)'
    rctx.beginPath(); rctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2); rctx.fill()
  }
  // fine grain
  ctx.globalAlpha = 0.025
  for (let i = 0; i < 4000; i++) { ctx.fillStyle = rnd() > 0.5 ? '#fff' : '#000'; ctx.fillRect(rnd() * size, rnd() * size, 2, 2) }
  ctx.globalAlpha = 1
  const map = toTexture(c, { anisotropy: 16 })
  const bump = toTexture(b, { anisotropy: 16 }); bump.colorSpace = THREE.NoColorSpace
  const roughness = toTexture(r, { anisotropy: 16 }); roughness.colorSpace = THREE.NoColorSpace
  return { map, bump, roughness }
}

// ── Mountain rock (used with vertex colours for snow / scree) ───────────────
export function rockMaps({ size = 1024 } = {}) {
  const rnd = seededRandom(808)
  const [c, ctx] = makeCanvas(size, size)
  const [b, bctx] = makeCanvas(size, size)
  ctx.fillStyle = '#b9b2a6'; ctx.fillRect(0, 0, size, size)
  bctx.fillStyle = '#808080'; bctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * size, y = rnd() * size, rad = 10 + rnd() * 70
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    const v = 150 + rnd() * 90
    g.addColorStop(0, `rgba(${v},${v - 8},${v - 20},0.5)`); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // cracks / strata lines
  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = `rgba(40,35,30,${0.08 + rnd() * 0.18})`
    bctx.strokeStyle = `rgba(30,30,30,${0.2 + rnd() * 0.3})`
    const lw = 0.8 + rnd() * 2
    ctx.lineWidth = lw; bctx.lineWidth = lw
    let x = rnd() * size, y = rnd() * size
    ctx.beginPath(); bctx.beginPath(); ctx.moveTo(x, y); bctx.moveTo(x, y)
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.3) * 50; y += (rnd() - 0.5) * 24; ctx.lineTo(x, y); bctx.lineTo(x, y) }
    ctx.stroke(); bctx.stroke()
  }
  ctx.globalAlpha = 0.08
  for (let i = 0; i < 8000; i++) { ctx.fillStyle = rnd() > 0.5 ? '#fff' : '#000'; ctx.fillRect(rnd() * size, rnd() * size, 2, 2) }
  ctx.globalAlpha = 1
  bctx.globalAlpha = 0.3
  for (let i = 0; i < 8000; i++) { bctx.fillStyle = rnd() > 0.5 ? '#fff' : '#000'; bctx.fillRect(rnd() * size, rnd() * size, 2, 2) }
  bctx.globalAlpha = 1
  const map = toTexture(c, { anisotropy: 16 })
  const bump = toTexture(b, { anisotropy: 16 }); bump.colorSpace = THREE.NoColorSpace
  return { map, bump }
}

// ── Eye of Providence (transparent): triangle, eye, glory rays ──────────────
export function eyeOfProvidenceTexture({ size = 1024, gold = '#e9c35a', dark = '#2a2114', rays = true, triangle = true } = {}) {
  const [c, ctx] = makeCanvas(size, size)
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2, cy = size * 0.56
  if (rays) {
    ctx.save(); ctx.translate(cx, cy)
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      const len = size * (i % 2 ? 0.36 : 0.47)
      ctx.strokeStyle = `rgba(255,220,120,${i % 2 ? 0.35 : 0.6})`
      ctx.lineWidth = i % 2 ? 4 : 7
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * size * 0.2, Math.sin(a) * size * 0.2); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke()
    }
    ctx.restore()
  }
  if (triangle) {
    ctx.lineWidth = 26; ctx.strokeStyle = gold; ctx.lineJoin = 'round'
    ctx.fillStyle = 'rgba(40,30,18,0.92)'
    ctx.beginPath(); ctx.moveTo(cx, cy - size * 0.28); ctx.lineTo(cx + size * 0.3, cy + size * 0.2); ctx.lineTo(cx - size * 0.3, cy + size * 0.2); ctx.closePath()
    ctx.fill(); ctx.stroke()
  }
  // eye
  const ey = cy + size * 0.02
  ctx.fillStyle = '#f4efe2'; ctx.strokeStyle = dark; ctx.lineWidth = 14
  ctx.beginPath(); ctx.moveTo(cx - size * 0.2, ey); ctx.quadraticCurveTo(cx, ey - size * 0.15, cx + size * 0.2, ey); ctx.quadraticCurveTo(cx, ey + size * 0.15, cx - size * 0.2, ey); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#3b6fb0'; ctx.beginPath(); ctx.arc(cx, ey, size * 0.075, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#0d0d12'; ctx.beginPath(); ctx.arc(cx, ey, size * 0.038, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - size * 0.022, ey - size * 0.024, size * 0.014, 0, Math.PI * 2); ctx.fill()
  // lashes
  ctx.strokeStyle = dark; ctx.lineWidth = 6
  for (let i = -3; i <= 3; i++) { const x = cx + i * size * 0.05; const y0 = ey - size * 0.15 + Math.abs(i) * size * 0.017; ctx.beginPath(); ctx.moveTo(x, y0 + 8); ctx.lineTo(x + i * 3, y0 - size * 0.035); ctx.stroke() }
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Square & Compasses with G (transparent) ────────────────────────────────
export function squareCompassTexture({ size = 1024, color = '#e9c35a', withG = true } = {}) {
  const [c, ctx] = makeCanvas(size, size)
  ctx.clearRect(0, 0, size, size)
  const cx = size / 2
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  // compasses: two legs from a top hinge
  ctx.lineWidth = size * 0.045
  const hx = cx, hy = size * 0.12
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx - size * 0.34, size * 0.88); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(cx + size * 0.34, size * 0.88); ctx.stroke()
  ctx.beginPath(); ctx.arc(hx, hy, size * 0.06, 0, Math.PI * 2); ctx.fill()
  // square: an L below, arms rising
  ctx.lineWidth = size * 0.045
  ctx.beginPath(); ctx.moveTo(cx - size * 0.42, size * 0.42); ctx.lineTo(cx, size * 0.78); ctx.lineTo(cx + size * 0.42, size * 0.42); ctx.stroke()
  // thin inner lines for a tool look
  ctx.strokeStyle = '#8c6d1f'; ctx.lineWidth = size * 0.012
  ctx.beginPath(); ctx.moveTo(cx - size * 0.38, size * 0.44); ctx.lineTo(cx, size * 0.74); ctx.lineTo(cx + size * 0.38, size * 0.44); ctx.stroke()
  if (withG) {
    ctx.fillStyle = color
    ctx.font = `bold ${size * 0.26}px "Times New Roman", Georgia, serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('G', cx, size * 0.52)
  }
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Globes for the twin pillars ────────────────────────────────────────────
export function terrestrialGlobeTexture() {
  const rnd = seededRandom(1717)
  const [c, ctx] = makeCanvas(1024, 512)
  ctx.fillStyle = '#2f5d8a'; ctx.fillRect(0, 0, 1024, 512)
  ctx.fillStyle = '#9a8b5a'
  for (let i = 0; i < 9; i++) {
    const x = rnd() * 1024, y = 80 + rnd() * 350
    ctx.beginPath(); ctx.moveTo(x, y)
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const r = 60 + rnd() * 110; ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 0.7) }
    ctx.closePath(); ctx.fill()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5
  for (let i = 0; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(i * 1024 / 12, 0); ctx.lineTo(i * 1024 / 12, 512); ctx.stroke() }
  for (let i = 0; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * 512 / 6); ctx.lineTo(1024, i * 512 / 6); ctx.stroke() }
  return toTexture(c)
}
export function celestialGlobeTexture() {
  const rnd = seededRandom(2727)
  const [c, ctx] = makeCanvas(1024, 512)
  ctx.fillStyle = '#121a33'; ctx.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 700; i++) { const s = rnd(); ctx.fillStyle = `rgba(255,245,210,${0.4 + s * 0.6})`; ctx.beginPath(); ctx.arc(rnd() * 1024, rnd() * 512, 0.8 + s * 2.2, 0, Math.PI * 2); ctx.fill() }
  ctx.strokeStyle = 'rgba(233,195,90,0.55)'; ctx.lineWidth = 1.5
  for (let i = 0; i < 24; i++) { ctx.beginPath(); let x = rnd() * 1024, y = rnd() * 512; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 120; y += (rnd() - 0.5) * 80; ctx.lineTo(x, y) } ctx.stroke() }
  ctx.strokeStyle = 'rgba(233,195,90,0.35)'
  for (let i = 0; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(i * 1024 / 12, 0); ctx.lineTo(i * 1024 / 12, 512); ctx.stroke() }
  return toTexture(c)
}

// ── Leather book cover with gold emblem ────────────────────────────────────
export function bookCoverTexture(title = 'MORALS AND DOGMA') {
  const [c, ctx] = makeCanvas(512, 680)
  ctx.fillStyle = '#3b1f16'; ctx.fillRect(0, 0, 512, 680)
  const rnd = seededRandom(55)
  ctx.globalAlpha = 0.12
  for (let i = 0; i < 3000; i++) { ctx.fillStyle = rnd() > 0.5 ? '#000' : '#8a5a40'; ctx.fillRect(rnd() * 512, rnd() * 680, 2, 2) }
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#d9b14a'; ctx.lineWidth = 6; ctx.strokeRect(28, 28, 456, 624); ctx.lineWidth = 2; ctx.strokeRect(44, 44, 424, 592)
  ctx.fillStyle = '#d9b14a'; ctx.font = 'bold 40px "Times New Roman", serif'; ctx.textAlign = 'center'
  const words = title.split(' ')
  words.forEach((w, i) => ctx.fillText(w, 256, 140 + i * 48))
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Pyramid base inscription ────────────────────────────────────────────────
export function inscriptionTexture(text = 'MDCCLXXVI') {
  const [c, ctx] = makeCanvas(1024, 256)
  ctx.clearRect(0, 0, 1024, 256)
  ctx.fillStyle = 'rgba(60,45,25,0.85)'
  ctx.font = 'bold 150px "Times New Roman", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 512, 128)
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Plain embossed leather cover (no emblem) ────────────────────────────────
export function plainBookCoverTexture(lines = ['EUCLID', 'ELEMENTS']) {
  const [c, ctx] = makeCanvas(512, 680)
  ctx.fillStyle = '#2e2a26'; ctx.fillRect(0, 0, 512, 680)
  const rnd = seededRandom(66)
  ctx.globalAlpha = 0.14
  for (let i = 0; i < 4000; i++) { ctx.fillStyle = rnd() > 0.5 ? '#000' : '#6b5a48'; ctx.fillRect(rnd() * 512, rnd() * 680, 2, 2) }
  ctx.globalAlpha = 1
  ctx.strokeStyle = 'rgba(190,160,100,0.55)'; ctx.lineWidth = 3; ctx.strokeRect(36, 36, 440, 608)
  ctx.fillStyle = 'rgba(200,170,110,0.8)'; ctx.font = '36px "Times New Roman", serif'; ctx.textAlign = 'center'
  lines.forEach((t, i) => ctx.fillText(t, 256, 300 + i * 52))
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Horizontal mist band (soft on all edges) ───────────────────────────────
export function mistTexture({ seed = 3, w = 1024, h = 256 } = {}) {
  const { fbm } = valueNoise2D(seed)
  const [c, ctx] = makeCanvas(w, h)
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h
    const edgeX = Math.min(1, Math.min(u, 1 - u) * 4)
    const edgeY = Math.min(1, Math.min(v, 1 - v) * 3.2)
    const n = fbm(u * 6 + seed, v * 2.5, 4)
    let a = edgeX * edgeY * (0.35 + n * 0.9)
    a = Math.max(0, Math.min(1, a))
    const i = (y * w + x) * 4
    d[i] = 235; d[i + 1] = 242; d[i + 2] = 252; d[i + 3] = 255 * a * a
  }
  ctx.putImageData(img, 0, 0)
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Soft glowing disc (distant planet / lamp halo) ─────────────────────────
export function discTexture({ color = [255, 120, 80], size = 256, soft = 0.25 } = {}) {
  const [c, ctx] = makeCanvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  const [r, gg, b] = color
  g.addColorStop(0, `rgba(${r},${gg},${b},1)`)
  g.addColorStop(1 - soft, `rgba(${r},${gg},${b},0.9)`)
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`)
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size)
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── VHS tape label ─────────────────────────────────────────────────────────
export function vhsLabelTexture(lines, { accent = '#f5d400' } = {}) {
  const [c, ctx] = makeCanvas(512, 128)
  ctx.fillStyle = '#f2eee4'; ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 512, 18); ctx.fillRect(0, 110, 512, 18)
  ctx.fillStyle = '#2b2622'; ctx.font = 'bold 34px "Courier New", monospace'; ctx.textBaseline = 'middle'
  lines.forEach((t, i) => ctx.fillText(t, 20, 46 + i * 38, 472))
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

// ── Image file as a sRGB texture (poster / magazine cover) ─────────────────
export function imageTexture(url) {
  const tex = new THREE.TextureLoader().load(url)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 16
  return tex
}

// ── Tileable vertical rain streaks (alpha only; for rain veils and wet glass) ──
export function rainStreakTexture({ seed = 7, w = 512, h = 1024, density = 90, bright = 240 } = {}) {
  const rnd = seededRandom(seed)
  const [c, ctx] = makeCanvas(w, h)
  ctx.clearRect(0, 0, w, h)
  for (let i = 0; i < density; i++) {
    const x = rnd() * w, len = 120 + rnd() * 520, y0 = rnd() * h
    const a = 0.15 + rnd() * 0.55, lw = 1 + rnd() * 2.2
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len)
    g.addColorStop(0, `rgba(${bright},${bright},${bright},0)`)
    g.addColorStop(0.5, `rgba(${bright},${bright},${bright},${a})`)
    g.addColorStop(1, `rgba(${bright},${bright},${bright},0)`)
    ctx.strokeStyle = g; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + len); ctx.stroke()
    // wrap vertically so the texture tiles
    ctx.beginPath(); ctx.moveTo(x, y0 - h); ctx.lineTo(x, y0 - h + len); ctx.stroke()
  }
  const tex = toTexture(c)
  tex.premultiplyAlpha = false
  return tex
}

// ── Vertical light shaft: bright at the top, fading to nothing, soft sides ──
export function shaftTexture({ w = 128, h = 1024, seed = 4 } = {}) {
  const { fbm } = valueNoise2D(seed)
  const [c, ctx] = makeCanvas(w, h)
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h
    const side = Math.pow(Math.sin(u * Math.PI), 1.6)
    const fall = Math.pow(1 - v, 1.4) * Math.min(1, v * 5)        // soft at the top too (no hard cut against the sky)
    const n = 0.7 + 0.3 * fbm(u * 3 + seed, v * 6, 3)
    const a = side * fall * n
    const i = (y * w + x) * 4
    d[i] = 255; d[i + 1] = 244; d[i + 2] = 222; d[i + 3] = 255 * a
  }
  ctx.putImageData(img, 0, 0)
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.premultiplyAlpha = false
  return tex
}

// ── A pale moon with craters and one thin, lit crack across it ──────────────
export function moonTexture({ size = 1024, seed = 90 } = {}) {
  const rnd = seededRandom(seed)
  const [c, ctx] = makeCanvas(size, size)
  const cx = size / 2, R = size * 0.46
  const g = ctx.createRadialGradient(cx * 0.8, cx * 0.8, R * 0.1, cx, cx, R)
  g.addColorStop(0, '#e9e6de'); g.addColorStop(0.75, '#cfccc4'); g.addColorStop(1, '#9d9a94')
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cx, R, 0, Math.PI * 2); ctx.fill()
  // maria
  ctx.globalAlpha = 0.22; ctx.fillStyle = '#6f7078'
  for (let i = 0; i < 7; i++) { const a = rnd() * Math.PI * 2, r = rnd() * R * 0.6; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, R * (0.12 + rnd() * 0.2), R * (0.08 + rnd() * 0.16), rnd() * 3, 0, Math.PI * 2); ctx.fill() }
  ctx.globalAlpha = 1
  // craters
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * R * 0.92, cr = 4 + rnd() * rnd() * 36
    const x = cx + Math.cos(a) * r, y = cx + Math.sin(a) * r
    ctx.fillStyle = 'rgba(70,72,80,0.35)'; ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, cr, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke()
  }
  // the crack: a jagged lit seam — something is lit inside
  ctx.strokeStyle = 'rgba(255,214,150,0.9)'; ctx.lineWidth = 2.5; ctx.shadowColor = 'rgba(255,200,120,0.9)'; ctx.shadowBlur = 14
  ctx.beginPath(); let x = cx - R * 0.55, y = cx + R * 0.1; ctx.moveTo(x, y)
  for (let i = 0; i < 14; i++) { x += R * 0.08; y += (rnd() - 0.5) * R * 0.1; ctx.lineTo(x, y) }
  ctx.stroke(); ctx.shadowBlur = 0
  // soft limb
  ctx.globalCompositeOperation = 'destination-in'
  const m = ctx.createRadialGradient(cx, cx, R * 0.9, cx, cx, R)
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = m; ctx.fillRect(0, 0, size, size)
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.premultiplyAlpha = false
  return tex
}

// ── Long soft contrail band, ragged, fading at both ends (alpha) ───────────
export function trailTexture({ w = 1024, h = 64, seed = 5 } = {}) {
  const { fbm } = valueNoise2D(seed)
  const [c, ctx] = makeCanvas(w, h)
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h
    const core = Math.pow(Math.sin(v * Math.PI), 1.4)
    const rag = 0.6 + 0.4 * fbm(u * 40 + seed, v * 3, 3)
    const ends = Math.min(1, u * 14) * Math.min(1, (1 - u) * 3)
    const a = core * rag * ends * (0.75 + 0.25 * (1 - u))
    const i = (y * w + x) * 4
    d[i] = 246; d[i + 1] = 248; d[i + 2] = 252; d[i + 3] = 255 * Math.max(0, Math.min(1, a))
  }
  ctx.putImageData(img, 0, 0)
  const tex = toTexture(c); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.premultiplyAlpha = false
  return tex
}
