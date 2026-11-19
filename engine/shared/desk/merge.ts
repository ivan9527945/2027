// 移植自 ~/worm/branded-website/src/scene/retro/（使用者自己的專案），只用在終章的電腦桌場景。
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Bakes the static meshes under `root` that look the same to the renderer into
// one mesh per look, so a model made of 20 parts costs 2–3 draw calls per pass
// (main, shadow map and floor mirror alike).
//
// Stay local to one object: weather.js clones materials per named object to wet
// it on its own, and its colliders are the bounds of those named objects.
//
// Left as they are: transparent parts (they need sorting), instanced meshes,
// multi-material meshes, mirrored transforms, named parts (code may look them
// up) and anything below a group with its own `userData.tick` (it may move).

// Materials are often separate instances with identical settings (`brass()`).
function materialSignature(m) {
  const parts = [m.type]
  for (const k of Object.keys(m).sort()) {
    if (k === 'uuid' || k === 'id' || k === 'name' || k === 'version' || k[0] === '_') continue
    const v = m[k]
    if (v == null || typeof v === 'function') continue
    if (v.isTexture) parts.push(`${k}=${v.uuid}`)
    else if (v.isColor) parts.push(`${k}=${v.getHex()}`)
    else if (v.isEuler || v.isVector2 || v.isVector3) parts.push(`${k}=${v.toArray().join()}`)
    else if (typeof v !== 'object') parts.push(`${k}=${v}`)
  }
  return parts.join(';')
}

const movesOnItsOwn = (o, root) => {
  for (let p = o; p && p !== root; p = p.parent) if (p.userData.tick) return true
  return false
}

export function mergeStaticMeshes(root) {
  root.updateWorldMatrix(true, true)
  const toLocal = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const batches = new Map()

  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.name || Array.isArray(o.material)) return
    if (o.material.transparent || o.matrixWorld.determinant() < 0 || movesOnItsOwn(o, root)) return
    const attrs = Object.keys(o.geometry.attributes).sort().join()
    const key = [materialSignature(o.material), o.castShadow, o.receiveShadow, o.layers.mask, o.renderOrder, attrs].join('|')
    if (!batches.has(key)) batches.set(key, [])
    batches.get(key).push(o)
  })

  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue
    const geos = meshes.map(o => {
      const g = o.geometry.clone()
      // mergeGeometries wants all indexed or none (RoundedBoxGeometry has no index)
      if (!g.index) g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i))
      return g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld))
    })
    const first = meshes[0]
    const merged = new THREE.Mesh(mergeGeometries(geos, false), first.material)
    merged.castShadow = first.castShadow
    merged.receiveShadow = first.receiveShadow
    merged.layers.mask = first.layers.mask
    merged.renderOrder = first.renderOrder
    geos.forEach(g => g.dispose())
    root.add(merged)
    for (const o of meshes) {
      // whatever hangs below a merged part keeps its place in the world
      for (const child of [...o.children]) if (!meshes.includes(child)) root.attach(child)
      o.removeFromParent()
      o.geometry.dispose()
    }
  }

  // groups that only existed to position merged parts
  const empty = []
  root.traverse(o => { if (o !== root && o.isGroup && !o.children.length) empty.push(o) })
  for (const o of empty) {
    for (let p = o; p !== root && !p.children.length;) { const up = p.parent; p.removeFromParent(); p = up }
  }
  return root
}
