import type { Light, SpotLight } from '@haku/schema'
import { lightDisplayDistance } from '@haku/schema'

function pushSegment(
  out: number[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): void {
  out.push(ax, ay, az, bx, by, bz)
}

function spotSpherePoint(radius: number, fullAngleDeg: number, phi: number): [number, number, number] {
  const halfRad = (fullAngleDeg * Math.PI) / 360
  const sinT = Math.sin(halfRad)
  const cosT = Math.cos(halfRad)
  return [radius * sinT * Math.cos(phi), radius * sinT * Math.sin(phi), -radius * cosT]
}

function addSphereLatitudeCircle(
  out: number[],
  radius: number,
  fullAngleDeg: number,
  segments = 36,
): void {
  for (let i = 0; i < segments; i++) {
    const phi0 = (i / segments) * Math.PI * 2
    const phi1 = ((i + 1) / segments) * Math.PI * 2
    const [x0, y0, z0] = spotSpherePoint(radius, fullAngleDeg, phi0)
    const [x1, y1, z1] = spotSpherePoint(radius, fullAngleDeg, phi1)
    pushSegment(out, x0, y0, z0, x1, y1, z1)
  }
}

function addApexMeridians(out: number[], radius: number, fullAngleDeg: number): void {
  for (let i = 0; i < 4; i++) {
    const phi = (i / 4) * Math.PI * 2
    const [x, y, z] = spotSpherePoint(radius, fullAngleDeg, phi)
    pushSegment(out, 0, 0, 0, x, y, z)
  }
}

function addSphereSectorMeridians(
  out: number[],
  radius: number,
  innerAngleDeg: number,
  outerAngleDeg: number,
  steps = 8,
): void {
  for (let i = 0; i < 4; i++) {
    const phi = (i / 4) * Math.PI * 2
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps
      const t1 = (s + 1) / steps
      const a0 = innerAngleDeg + (outerAngleDeg - innerAngleDeg) * t0
      const a1 = innerAngleDeg + (outerAngleDeg - innerAngleDeg) * t1
      const p0 = spotSpherePoint(radius, a0, phi)
      const p1 = spotSpherePoint(radius, a1, phi)
      pushSegment(out, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2])
    }
  }
}

/** Direction arrow along local -Z. */
export function buildDirectionalGizmoPositions(length: number): Float32Array {
  const out: number[] = []
  pushSegment(out, 0, 0, 0, 0, 0, -length)
  pushSegment(out, 0, 0, -length * 0.85, 0.08, 0, -length)
  pushSegment(out, 0, 0, -length * 0.85, -0.08, 0, -length)
  pushSegment(out, 0, 0, -length * 0.85, 0, 0.08, -length)
  pushSegment(out, 0, 0, -length * 0.85, 0, -0.08, -length)
  return new Float32Array(out)
}

/** Three orthogonal circles approximating range. */
export function buildPointGizmoPositions(radius: number, segments = 20): Float32Array {
  const out: number[] = []

  const addCircle = (axis: 'x' | 'y' | 'z') => {
    for (let i = 0; i < segments; i++) {
      const t0 = (i / segments) * Math.PI * 2
      const t1 = ((i + 1) / segments) * Math.PI * 2
      const c0 = Math.cos(t0)
      const s0 = Math.sin(t0)
      const c1 = Math.cos(t1)
      const s1 = Math.sin(t1)

      if (axis === 'x') pushSegment(out, 0, c0 * radius, s0 * radius, 0, c1 * radius, s1 * radius)
      if (axis === 'y') pushSegment(out, c0 * radius, 0, s0 * radius, c1 * radius, 0, s1 * radius)
      if (axis === 'z') pushSegment(out, c0 * radius, s0 * radius, 0, c1 * radius, s1 * radius, 0)
    }
  }

  addCircle('x')
  addCircle('y')
  addCircle('z')
  return new Float32Array(out)
}

export interface SpotGizmoGeometry {
  outer: Float32Array
  inner: Float32Array
}

/** Spot light as a sphere sector: outer cone ∩ sphere, inner cone boundary on sphere. */
export function buildSpotGizmoGeometry(
  radius: number,
  innerAngleDeg: number,
  outerAngleDeg: number,
): SpotGizmoGeometry {
  const outer: number[] = []
  const inner: number[] = []

  addApexMeridians(outer, radius, outerAngleDeg)
  addSphereLatitudeCircle(outer, radius, outerAngleDeg)
  addSphereSectorMeridians(outer, radius, innerAngleDeg, outerAngleDeg)

  if (innerAngleDeg > 0.5) {
    addSphereLatitudeCircle(inner, radius, innerAngleDeg, 40)
  }

  return {
    outer: new Float32Array(outer),
    inner: new Float32Array(inner),
  }
}

export function buildLightGizmoPositions(light: Light): Float32Array {
  switch (light.type) {
    case 'directional':
      return buildDirectionalGizmoPositions(lightDisplayDistance(light))
    case 'point':
      return buildPointGizmoPositions(lightDisplayDistance(light))
    case 'spot':
      return buildSpotGizmoGeometry(
        lightDisplayDistance(light),
        light.innerAngle,
        light.outerAngle,
      ).outer
  }
}

export function buildSpotLightGizmoGeometry(spot: SpotLight): SpotGizmoGeometry {
  const radius = lightDisplayDistance(spot)
  return buildSpotGizmoGeometry(radius, spot.innerAngle, spot.outerAngle)
}
