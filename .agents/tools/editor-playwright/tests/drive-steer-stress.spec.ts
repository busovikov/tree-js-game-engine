import { test, expect } from '@playwright/test'
import { openTargetProject } from '../helpers/target-project.js'
import {
  readVehicleLogFile,
  vehicleLogFlagged,
  vehicleLogSamples,
  waitForVehicleLogLines,
} from '../helpers/vehicle-log-file.js'

test('long drive + steer stress — read instability from project log file', async ({ page }) => {
  await openTargetProject(page)
  await page.getByRole('button', { name: /Play/ }).click()
  await page.waitForTimeout(1500)
  await page.locator('canvas').first().click({ position: { x: 400, y: 300 } })

  // Long forward
  await page.keyboard.down('w')
  await page.waitForTimeout(5000)

  // Alternate steer 4s each side (user scenario)
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.down('a')
    await page.waitForTimeout(4000)
    await page.keyboard.up('a')
    await page.keyboard.down('d')
    await page.waitForTimeout(4000)
    await page.keyboard.up('d')
  }

  await page.keyboard.up('w')
  await page.waitForTimeout(2000)

  const records = await waitForVehicleLogLines(8, { timeoutMs: 20_000 })
  const samples = vehicleLogSamples(records)
  const flagged = vehicleLogFlagged(records)
  const last = samples.at(-1)

  const pick = (s: (typeof samples)[number]) => ({
    t: s.t,
    z: +s.snapshot.position[2].toFixed(2),
    x: +s.snapshot.position[0].toFixed(2),
    y: +s.summary.y,
    speed: +s.summary.speedKmh,
    steer: +s.snapshot.drive.currentSteer.toFixed(3),
    ef: s.snapshot.drive.engineForce,
    w: s.summary.wheels,
    flags: s.summary.flags,
  })

  console.log('=== STRESS LOG FILE ===', {
    lines: records.length,
    samples: samples.length,
    flagged: flagged.length,
    last: last ? pick(last) : null,
  })
  console.log('=== FLAGGED SAMPLES ===', flagged.slice(0, 20).map(pick))
  console.log('=== LATE SAMPLES ===', samples.slice(-12).map(pick))

  expect(samples.length).toBeGreaterThan(2)

  if (last) {
    const y = Number(last.summary.y)
    if (y > 8) {
      throw new Error(`Vehicle launched too high: y=${y.toFixed(2)}`)
    }
    const speed = Number(last.summary.speedKmh)
    if (speed > 120) {
      throw new Error(`Vehicle speed runaway: ${speed.toFixed(1)} km/h`)
    }
  }
})
