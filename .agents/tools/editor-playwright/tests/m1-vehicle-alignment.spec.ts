import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertM1VehicleMetrics, forwardDriveDelta, readVehicleMetrics, settlePlayMode } from '../helpers/vehicle-metrics.js'
import { openTargetProject } from '../helpers/target-project.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'M1')

test.describe('M1 vehicle alignment (mandatory before Review)', () => {
  test('wheels grounded, attached, forward drive', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    await openTargetProject(page)
    await settlePlayMode(page, 1500)

    const before = await readVehicleMetrics(page)
    expect(before, '__HAKU_PLAYTEST metrics missing — rebuild editor').not.toBeNull()

    await page.screenshot({ path: shot('01-play-settled.png') })

    expect(before!.allWheelsGrounded, `wheels not grounded: ${JSON.stringify(before!.wheelGrounded)}`).toBe(
      true,
    )
    expect(before!.maxWheelHorizontalOffset).toBeLessThanOrEqual(1.85)
    expect(before!.maxWheelVerticalOffset).toBeLessThanOrEqual(1.2)
    if (before!.chassisAboveGround != null) {
      expect(before!.chassisAboveGround).toBeGreaterThanOrEqual(0.35)
      expect(before!.chassisAboveGround).toBeLessThanOrEqual(1.6)
    }

    await page.keyboard.down('w')
    await page.waitForTimeout(2500)
    await page.keyboard.up('w')
    await page.waitForTimeout(400)

    const after = await readVehicleMetrics(page)
    expect(after).not.toBeNull()

    await page.screenshot({ path: shot('02-play-forward-drive.png') })

    const forwardDelta = forwardDriveDelta(before!, after!)
    const assertion = assertM1VehicleMetrics(before!, forwardDelta)
    expect(assertion.ok, assertion.failures.join('; ')).toBe(true)
  })
})
