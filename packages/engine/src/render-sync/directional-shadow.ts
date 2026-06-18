import type { ShadowSettings } from '@haku/schema'
import * as THREE from 'three'
import { getDirectionalLightWorldDirection } from './apply-directional-light.js'

const _dir = new THREE.Vector3()
const _anchor = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _trueUp = new THREE.Vector3()
const _lightLocal = new THREE.Vector3()
const _targetLocal = new THREE.Vector3()
const _quat = new THREE.Quaternion()

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

export interface CameraShadowAnchorConfig {
  groundPlaneY: number
  maxDistanceFactor: number
  fallbackDistanceFactor: number
}

export function shadowAnchorConfigFromSettings(
  shadows: Pick<
    ShadowSettings,
    'anchorGroundY' | 'anchorMaxDistanceFactor' | 'anchorFallbackDistanceFactor'
  >,
): CameraShadowAnchorConfig {
  return {
    groundPlaneY: shadows.anchorGroundY,
    maxDistanceFactor: shadows.anchorMaxDistanceFactor,
    fallbackDistanceFactor: shadows.anchorFallbackDistanceFactor,
  }
}

/**
 * Configure a directional light's shadow volume.
 *
 * Direction comes from the light's configured local pose (position → target)
 * after the entity transform. The shadow rig recentres the orthographic volume
 * on `anchor` while preserving that direction so shading is unchanged.
 */
export function updateDirectionalShadowRig(
  light: THREE.DirectionalLight,
  config: DirectionalShadowConfig,
): void {
  const parent = light.parent
  if (!parent) return

  parent.updateWorldMatrix(true, false)
  getDirectionalLightWorldDirection(light, _dir)

  _anchor.copy(config.anchor ?? ORIGIN)
  if (config.mapSize && config.mapSize > 0) {
    snapAnchorToTexelGrid(_anchor, _dir, config.size, config.mapSize)
  }

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
 * Centre point of the shadow volume for a camera-following directional light.
 * Uses render-settings anchor parameters — no magic numbers in engine code.
 */
export function computeCameraShadowAnchor(
  camera: THREE.Camera,
  size: number,
  anchorConfig: CameraShadowAnchorConfig,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const forward = _dir.set(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(_quat)).normalize()
  camera.getWorldPosition(out)

  const maxDistance = size * anchorConfig.maxDistanceFactor
  const hitsGround = forward.y < -1e-4
  const groundDistance = hitsGround
    ? (anchorConfig.groundPlaneY - out.y) / forward.y
    : Number.NaN
  const distance =
    Number.isFinite(groundDistance) && groundDistance > 0
      ? Math.min(groundDistance, maxDistance)
      : size * anchorConfig.fallbackDistanceFactor
  out.addScaledVector(forward, distance)
  return out
}
