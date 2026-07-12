import { test, expect } from '@playwright/test'
import { openTargetProject } from '../helpers/target-project.js'
import {
  readVehicleLogFile,
  vehicleLogFlagged,
  vehicleLogSamples,
  waitForVehicleLogLines,
} from '../helpers/vehicle-log-file.js'

test('capture vehicle physics logs to target project file', async ({ page }) => {
  await openTargetProject(page)
  await page.getByRole('button', { name: /Play/ }).click()
  await page.waitForTimeout(2500)

  const records = await waitForVehicleLogLines(3, { timeoutMs: 15_000 })
  const samples = vehicleLogSamples(records)
  const flagged = vehicleLogFlagged(records)
  const snapshot = await page.evaluate(() => window.__HAKU_VEHICLE_DEBUG?.snapshot() ?? null)

  console.log('=== LOG FILE ===', {
    path: '.haku/vehicle-physics.ndjson',
    lineCount: records.length,
    sampleCount: samples.length,
    flaggedCount: flagged.length,
  })

  if (samples.length > 0) {
    console.log('=== SAMPLES (last 5) ===', samples.slice(-5).map((s) => ({
      t: s.t,
      y: s.summary.y,
      vy: s.summary.vy,
      speed: s.summary.speedKmh,
      flags: s.summary.flags,
    })))
  }

  if (flagged.length > 0) {
    console.log('=== FLAGGED ===', flagged.slice(0, 10).map((s) => ({
      t: s.t,
      flags: s.summary.flags,
    })))
  }

  if (snapshot) {
    console.log('=== LIVE SNAPSHOT ===', {
      y: snapshot.position[1],
      speedKmh: snapshot.speedKmh,
      grounded: snapshot.grounded,
    })
  }

  expect(records.some((r) => r.kind === 'session' && r.event === 'start')).toBe(true)
  expect(samples.length).toBeGreaterThan(0)
})
