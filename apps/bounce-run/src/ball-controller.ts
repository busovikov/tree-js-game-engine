export type Velocity3 = readonly [number, number, number]

export interface BallControlStep {
  readonly velocity: Velocity3
  readonly lateralInput: number
  readonly landed: boolean
  readonly dt: number
  readonly forwardSpeed: number
  readonly lateralSpeed: number
  readonly lateralResponsiveness: number
  readonly bounceHeight: number
  readonly gravity: number
}

export function bounceVelocityForHeight(bounceHeight: number, gravity: number): number {
  assertPositiveFinite('bounceHeight', bounceHeight)
  assertPositiveFinite('gravity', gravity)
  return Math.sqrt(2 * gravity * bounceHeight)
}

export function applyBallControlStep(step: BallControlStep): Velocity3 {
  assertPositiveFinite('dt', step.dt)
  assertPositiveFinite('forwardSpeed', step.forwardSpeed)
  assertPositiveFinite('lateralSpeed', step.lateralSpeed)
  assertPositiveFinite('lateralResponsiveness', step.lateralResponsiveness)
  const lateralInput = Math.max(-1, Math.min(1, step.lateralInput))
  const lateralTarget = lateralInput * step.lateralSpeed
  const response = 1 - Math.exp(-step.lateralResponsiveness * step.dt)
  const lateral = Math.max(
    -step.lateralSpeed,
    Math.min(step.lateralSpeed, step.velocity[0] + (lateralTarget - step.velocity[0]) * response),
  )
  return [
    lateral,
    step.landed ? bounceVelocityForHeight(step.bounceHeight, step.gravity) : step.velocity[1],
    step.forwardSpeed,
  ]
}

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`)
  }
}
