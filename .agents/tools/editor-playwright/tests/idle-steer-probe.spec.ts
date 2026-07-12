import { test, expect } from '@playwright/test'
import { openTargetProject } from '../helpers/target-project.js'
import {
  vehicleLogFlagged,
  vehicleLogSamples,
  waitForVehicleLogLines,
} from '../helpers/vehicle-log-file.js'

test('steer only at standstill — no physics shake', async ({ page }) => {
  await openTargetProject(page)
  await page.getByRole('button', { name: /Play/ }).click()
  await page.waitForTimeout(1500)
  await page.locator('canvas').first().click({ position: { x: 400, y: 300 } })

  // Steer left 4s without throttle
  await page.keyboard.down('a')
  await page.waitForTimeout(4000)
  await page.keyboard.up('a')
  await page.waitForTimeout(500)

  // Steer right 4s without throttle
  await page.keyboard.down('d')
  await page.waitForTimeout(4000)
  await page.keyboard.up('d')
  await page.waitForTimeout(1500)

  const records = await waitForVehicleLogLines(5, { timeoutMs: 15_000 })
  const samples = vehicleLogSamples(records)
  const flagged = vehicleLogFlagged(records)
  const last = samples.at(-1)

  const steerInputSamples = samples.filter((s) => s.snapshot.drive.steer !== 0)

  console.log('=== IDLE STEER ===', {
    samples: samples.length,
    steerInputSamples: steerInputSamples.length,
    flagged: flagged.length,
    last: last
      ? {
          speed: last.summary.speedKmh,
          x: last.snapshot.position[0].toFixed(2),
          z: last.snapshot.position[2].toFixed(2),
          flSteer: last.snapshot.wheels[0]?.steering,
          driverSteer: last.snapshot.drive.currentSteer,
          flags: last.summary.flags,
        }
      : null,
  })

  expect(flagged.length).toBe(0)
  expect(steerInputSamples.length).toBeGreaterThan(2)

  for (const sample of steerInputSamples) {
    expect(Number(sample.summary.speedKmh)).toBeLessThan(8)
    expect(Math.abs(sample.snapshot.wheels[0]?.steering ?? 0)).toBeLessThan(0.05)
    expect(Math.abs(sample.snapshot.drive.currentSteer)).toBeGreaterThan(0.1)
  }

  if (last) {
    expect(Math.abs(last.snapshot.position[0])).toBeLessThan(1)
    expect(Math.abs(last.snapshot.position[2] - 5)).toBeLessThan(1.5)
  }
})
