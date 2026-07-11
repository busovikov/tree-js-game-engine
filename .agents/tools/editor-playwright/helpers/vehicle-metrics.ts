import type { Page } from '@playwright/test'

export interface VehiclePlaytestMetrics {
  vehicleName: string
  chassisPosition: [number, number, number]
  chassisRotation: [number, number, number, number]
  wheelLocalPositions: Array<[number, number, number]>
  wheelGrounded: boolean[]
  allWheelsGrounded: boolean
  maxWheelHorizontalOffset: number
  maxWheelVerticalOffset: number
  chassisAboveGround: number | null
  forwardDriveDeltaZ: number | null
}

const FORWARD_LOCAL: [number, number, number] = [0, 0, 1]

function rotateVec3ByQuat(
  v: [number, number, number],
  q: [number, number, number, number],
): [number, number, number] {
  const [x, y, z] = v
  const [qx, qy, qz, qw] = q
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

export async function readVehicleMetrics(page: Page): Promise<VehiclePlaytestMetrics | null> {
  return page.evaluate(() => window.__HAKU_PLAYTEST?.getVehicleMetrics() ?? null)
}

export async function settlePlayMode(page: Page, ms = 1200): Promise<void> {
  await page.getByRole('button', { name: /Play/ }).click()
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(ms / 20)
    const metrics = await readVehicleMetrics(page)
    if (metrics?.allWheelsGrounded) {
      return
    }
  }
}

export function forwardDriveDelta(
  before: VehiclePlaytestMetrics,
  after: VehiclePlaytestMetrics,
): number {
  const delta: [number, number, number] = [
    after.chassisPosition[0] - before.chassisPosition[0],
    after.chassisPosition[1] - before.chassisPosition[1],
    after.chassisPosition[2] - before.chassisPosition[2],
  ]
  const forward = rotateVec3ByQuat(FORWARD_LOCAL, before.chassisRotation)
  return forward[0] * delta[0] + forward[1] * delta[1] + forward[2] * delta[2]
}

export function assertM1VehicleMetrics(
  metrics: VehiclePlaytestMetrics,
  forwardDriveDeltaZ: number,
): { ok: boolean; failures: string[] } {
  const failures: string[] = []

  if (!metrics.allWheelsGrounded) {
    failures.push(`allWheelsGrounded=false (${JSON.stringify(metrics.wheelGrounded)})`)
  }
  if (metrics.maxWheelHorizontalOffset > 1.85) {
    failures.push(
      `maxWheelHorizontalOffset=${metrics.maxWheelHorizontalOffset.toFixed(3)} > 1.85`,
    )
  }
  if (metrics.maxWheelVerticalOffset > 1.2) {
    failures.push(
      `maxWheelVerticalOffset=${metrics.maxWheelVerticalOffset.toFixed(3)} > 1.2`,
    )
  }
  if (
    metrics.chassisAboveGround != null &&
    (metrics.chassisAboveGround < -0.2 || metrics.chassisAboveGround > 1.6)
  ) {
    failures.push(
      `chassisAboveGround=${metrics.chassisAboveGround.toFixed(3)} outside 0.35..1.6`,
    )
  }
  if (forwardDriveDeltaZ < 2) {
    failures.push(
      `forwardDriveDeltaZ=${forwardDriveDeltaZ.toFixed(3)} < 2 (backward or stuck)`,
    )
  }

  return { ok: failures.length === 0, failures }
}

declare global {
  interface Window {
    __HAKU_PLAYTEST?: {
      getVehicleMetrics(): VehiclePlaytestMetrics | null
    }
  }
}
