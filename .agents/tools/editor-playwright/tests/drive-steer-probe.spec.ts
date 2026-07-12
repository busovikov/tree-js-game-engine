import { test } from '@playwright/test'
import { openTargetProject } from '../helpers/target-project.js'

function yawFromQuat(q: [number, number, number, number]): number {
  const [x, y, z, w] = q
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z))
}

test('drive forward and steer left/right — physics probe', async ({ page }) => {
  await openTargetProject(page)
  await page.getByRole('button', { name: /Play/ }).click()
  await page.waitForTimeout(1200)
  await page.locator('canvas').first().click({ position: { x: 400, y: 300 } })

  const samples: Array<{
    phase: string
    z: number
    x: number
    yaw: number
    speedKmh: number
    steer: number
    wheelRot: number[]
    engineForce: number
    wheelContact: string
  }> = []

  const sample = async (phase: string) => {
    const snap = await page.evaluate(() => {
      const s = window.__HAKU_VEHICLE_DEBUG?.snapshot()
      if (!s) return null
      return {
        position: s.position as [number, number, number],
        rotation: s.rotation as [number, number, number, number],
        speedKmh: s.speedKmh as number,
        steer: s.drive.currentSteer as number,
        engineForce: s.drive.engineForce as number,
        wheelContact: s.wheels.map((w) => (w.inContact ? 'G' : '-')).join(''),
        wheelRot: s.wheels.map((w) => w.rotation as number),
      }
    })
    if (!snap) return
    samples.push({
      phase,
      z: snap.position[2],
      x: snap.position[0],
      yaw: yawFromQuat(snap.rotation),
      speedKmh: snap.speedKmh,
      steer: snap.steer,
      wheelRot: snap.wheelRot,
      engineForce: snap.engineForce,
      wheelContact: snap.wheelContact,
    })
  }

  await sample('start')

  // Forward 4s
  await page.keyboard.down('w')
  await page.waitForTimeout(4000)
  await sample('forward_4s')

  // Steer left 3s (A)
  await page.keyboard.down('a')
  await page.waitForTimeout(3000)
  await sample('forward_left_3s')

  await page.keyboard.up('a')
  await page.waitForTimeout(500)

  // Steer right 3s (D)
  await page.keyboard.down('d')
  await page.waitForTimeout(3000)
  await sample('forward_right_3s')

  await page.keyboard.up('d')
  await page.keyboard.up('w')
  await page.waitForTimeout(400)
  await sample('stop')

  const start = samples[0]!
  const forward = samples.find((s) => s.phase === 'forward_4s')!
  const left = samples.find((s) => s.phase === 'forward_left_3s')!
  const right = samples.find((s) => s.phase === 'forward_right_3s')!

  console.log('=== DRIVE STEER SAMPLES ===', samples.map((s) => ({
    phase: s.phase,
    z: +s.z.toFixed(2),
    x: +s.x.toFixed(2),
    yaw: +s.yaw.toFixed(3),
    speed: +s.speedKmh.toFixed(1),
    steer: +s.steer.toFixed(3),
    ef: s.engineForce,
    contact: s.wheelContact,
    wheels: s.wheelRot.map((r) => +r.toFixed(2)),
  })))

  console.log('=== ASSERTIONS ===', {
    deltaZ: +(forward.z - start.z).toFixed(2),
    deltaX_left: +(left.x - forward.x).toFixed(2),
    deltaX_right: +(right.x - left.x).toFixed(2),
    yaw_left: +left.yaw.toFixed(3),
    yaw_right: +right.yaw.toFixed(3),
    wheelRotSpread: Math.max(...forward.wheelRot) - Math.min(...forward.wheelRot),
  })

  // Forward should move +Z
  if (forward.z - start.z < 0.2) {
    throw new Error(`Expected forward deltaZ >= 0.2, got ${(forward.z - start.z).toFixed(2)} ef=${forward.engineForce}`)
  }
  // Left steer should move -X (x clearly negative)
  if (left.x > -0.2) {
    throw new Error(`Expected left steer to reduce X, x=${left.x.toFixed(2)}`)
  }
  // Right steer should move +X relative to left phase
  if (right.x <= left.x + 0.2) {
    throw new Error(`Expected right steer to increase X, left.x=${left.x.toFixed(2)} right.x=${right.x.toFixed(2)}`)
  }
  // Avoid full spin-out: chassis yaw should stay bounded
  if (Math.abs(left.yaw) > 1.2) {
    throw new Error(`Left steer spun out: yaw=${left.yaw.toFixed(3)}`)
  }
})
