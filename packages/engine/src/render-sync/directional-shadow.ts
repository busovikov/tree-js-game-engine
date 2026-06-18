import * as THREE from 'three'

const _quat = new THREE.Quaternion()
const _dir = new THREE.Vector3()
const _anchor = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _trueUp = new THREE.Vector3()
const _lightLocal = new THREE.Vector3()
const _targetLocal = new THREE.Vector3()

const ORIGIN = new THREE.Vector3(0, 0, 0)

export interface DirectionalShadowConfig {
  /** Side length of the orthographic shadow volume in world units. */
  size: number
  /** Distance the shadow camera sits back along the light direction. */
  distance: number
  /**
   * World-space centre of the shadow volume. Defaults to the origin. Pass the
   * point the viewer is looking at to make shadows follow the camera.
   */
  anchor?: THREE.Vector3
  /**
   * Shadow-map resolution. When provided, the anchor is snapped to the texel
   * grid so shadow edges don't crawl as the volume moves.
   */
  mapSize?: number
  /** Near plane of the shadow camera. Defaults to 0.1. */
  near?: number
}

/**
 * Configure a directional light's shadow volume.
 *
 * In Three.js the directional shadow camera is placed at the light's world
 * position and aimed at its target (`src/lights/LightShadow.js`), so position
 * genuinely drives the shadowed region. A directional ("sun") light, however,
 * should derive its *direction* purely from rotation. This decouples the two:
 * direction comes from the light's orientation, while the shadow volume is a
 * fixed-size box centred on `anchor` (origin by default, or a camera-derived
 * point for camera-following shadows). The lit direction (target - position)
 * is preserved, so shading is unaffected.
 */
export function updateDirectionalShadowRig(
  light: THREE.DirectionalLight,
  config: DirectionalShadowConfig,
): void {
  const parent = light.parent
  if (!parent) return

  parent.updateWorldMatrix(true, false)
  light.getWorldQuaternion(_quat)

  // Light travel direction: local -Z rotated into world space (orientation only).
  _dir.set(0, 0, -1).applyQuaternion(_quat).normalize()

  _anchor.copy(config.anchor ?? ORIGIN)
  if (config.mapSize && config.mapSize > 0) {
    snapAnchorToTexelGrid(_anchor, _dir, config.size, config.mapSize)
  }

  // Camera sits back along -direction; both light and target move together so
  // the lit direction is unchanged but the shadow frustum centres on the anchor.
  _lightLocal.copy(_anchor).addScaledVector(_dir, -config.distance)
  _targetLocal.copy(_anchor)

  light.position.copy(parent.worldToLocal(_lightLocal))
  light.target.position.copy(parent.worldToLocal(_targetLocal))
  light.updateMatrixWorld(true)
  light.target.updateMatrixWorld(true)

  const camera = light.shadow.camera
  const half = config.size / 2
  camera.left = -half
  camera.right = half
  camera.top = half
  camera.bottom = -half
  camera.near = config.near ?? 0.1
  camera.far = config.distance * 2
  camera.updateProjectionMatrix()
}

/**
 * Snap the anchor onto the shadow map's texel grid within the light's view
 * plane. Without this, a moving shadow volume makes shadow edges shimmer/crawl
 * because each frame samples the scene at a slightly different sub-texel offset.
 */
function snapAnchorToTexelGrid(
  anchor: THREE.Vector3,
  dir: THREE.Vector3,
  size: number,
  mapSize: number,
): void {
  _up.set(0, 1, 0)
  if (Math.abs(dir.dot(_up)) > 0.99) _up.set(0, 0, 1)
  _right.crossVectors(_up, dir).normalize()
  _trueUp.crossVectors(dir, _right).normalize()

  const texel = size / mapSize
  const r = Math.round(anchor.dot(_right) / texel) * texel
  const u = Math.round(anchor.dot(_trueUp) / texel) * texel
  const f = anchor.dot(dir)

  anchor
    .copy(_right)
    .multiplyScalar(r)
    .addScaledVector(_trueUp, u)
    .addScaledVector(dir, f)
}

/**
 * Centre point of the shadow volume for a camera-following directional light:
 * a point ahead of the view camera along its look direction, so the area the
 * viewer is focused on is covered by the shadow frustum.
 */
export function computeCameraShadowAnchor(
  camera: THREE.Camera,
  size: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const forward = _dir.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_quat)).normalize()
  camera.getWorldPosition(out)
  out.addScaledVector(forward, size * 0.5)
  return out
}
