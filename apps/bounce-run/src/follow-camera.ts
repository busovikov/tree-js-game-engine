export type CameraVector3 = readonly [number, number, number]

export interface FollowCameraPose {
  readonly position: CameraVector3
  readonly target: CameraVector3
}

export interface FollowCameraOptions {
  readonly followDistance?: number
  readonly followHeight?: number
  readonly lookAhead?: number
  readonly targetHeight?: number
  readonly positionResponsiveness?: number
  readonly targetResponsiveness?: number
}

const DEFAULT_OPTIONS = {
  followDistance: 9,
  followHeight: 5,
  lookAhead: 6,
  targetHeight: 1,
  positionResponsiveness: 7,
  targetResponsiveness: 10,
} as const

/**
 * Advances a forward-looking chase camera with frame-rate-independent damping.
 * The game travels along +Z, so the camera stays behind the tracked position.
 */
export function stepFollowCamera(
  pose: FollowCameraPose,
  trackedPosition: CameraVector3,
  dt: number,
  options: FollowCameraOptions = {},
): FollowCameraPose {
  assertPositiveFinite('dt', dt)
  assertFiniteVector('pose.position', pose.position)
  assertFiniteVector('pose.target', pose.target)
  assertFiniteVector('trackedPosition', trackedPosition)

  const resolved = { ...DEFAULT_OPTIONS, ...options }
  assertPositiveFinite('followDistance', resolved.followDistance)
  assertPositiveFinite('followHeight', resolved.followHeight)
  assertPositiveFinite('lookAhead', resolved.lookAhead)
  assertPositiveFinite('positionResponsiveness', resolved.positionResponsiveness)
  assertPositiveFinite('targetResponsiveness', resolved.targetResponsiveness)
  if (!Number.isFinite(resolved.targetHeight)) {
    throw new Error('targetHeight must be a finite number')
  }

  const desiredPosition: CameraVector3 = [
    trackedPosition[0],
    trackedPosition[1] + resolved.followHeight,
    trackedPosition[2] - resolved.followDistance,
  ]
  const desiredTarget: CameraVector3 = [
    trackedPosition[0],
    trackedPosition[1] + resolved.targetHeight,
    trackedPosition[2] + resolved.lookAhead,
  ]

  return {
    position: dampVector(pose.position, desiredPosition, resolved.positionResponsiveness, dt),
    target: dampVector(pose.target, desiredTarget, resolved.targetResponsiveness, dt),
  }
}

function dampVector(
  current: CameraVector3,
  target: CameraVector3,
  responsiveness: number,
  dt: number,
): CameraVector3 {
  const alpha = 1 - Math.exp(-responsiveness * dt)
  return [
    current[0] + (target[0] - current[0]) * alpha,
    current[1] + (target[1] - current[1]) * alpha,
    current[2] + (target[2] - current[2]) * alpha,
  ]
}

function assertFiniteVector(name: string, value: CameraVector3): void {
  if (value.some((axis) => !Number.isFinite(axis))) {
    throw new Error(`${name} must contain finite numbers`)
  }
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`)
  }
}
