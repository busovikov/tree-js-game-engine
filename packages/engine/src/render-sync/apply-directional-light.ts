import type { Vec3 } from '@haku/schema'
import * as THREE from 'three'

/** Apply serialized local pose to a Three.js directional light. */
export function applyDirectionalLightPose(
  light: THREE.DirectionalLight,
  localPosition: Vec3,
  targetPosition: Vec3,
): void {
  light.position.set(localPosition[0], localPosition[1], localPosition[2])
  light.target.position.set(targetPosition[0], targetPosition[1], targetPosition[2])
}

/** Apply serialized local pose to a Three.js spot light. */
export function applySpotLightPose(
  light: THREE.SpotLight,
  localPosition: Vec3,
  targetPosition: Vec3,
): void {
  light.position.set(localPosition[0], localPosition[1], localPosition[2])
  light.target.position.set(targetPosition[0], targetPosition[1], targetPosition[2])
}

/**
 * World-space travel direction of a directional light from its configured pose
 * (local position → target), after the parent entity transform.
 */
export function getDirectionalLightWorldDirection(
  light: THREE.DirectionalLight,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const lightPos = new THREE.Vector3()
  const targetPos = new THREE.Vector3()
  light.getWorldPosition(lightPos)
  light.target.getWorldPosition(targetPos)
  return out.subVectors(targetPos, lightPos).normalize()
}
