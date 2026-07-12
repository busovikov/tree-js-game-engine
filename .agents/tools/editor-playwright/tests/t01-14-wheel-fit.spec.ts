import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openTargetProject } from '../helpers/target-project.js'
import { assertM1VehicleMetrics, forwardDriveDelta, readVehicleMetrics, settlePlayMode } from '../helpers/vehicle-metrics.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.14')

test.describe('T01.14 vehicle wheel/body visual fit', () => {
  test('play mode shows fitted wheels at contact points', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    await openTargetProject(page)
    await page.locator('.haku-hierarchy-row', { hasText: 'Vehicle' }).click()
    await page.screenshot({ path: shot('01-scene-vehicle-selected.png') })

    await settlePlayMode(page, 1500)
    const before = await readVehicleMetrics(page)
    expect(before).not.toBeNull()

    await page.keyboard.down('w')
    await page.waitForTimeout(2500)
    await page.keyboard.up('w')
    await page.waitForTimeout(400)

    const after = await readVehicleMetrics(page)
    expect(after).not.toBeNull()
    await page.screenshot({ path: shot('02-play-mode-wheel-sync.png') })

    const driveDelta = forwardDriveDelta(before!, after!)
    const check = assertM1VehicleMetrics(before!, driveDelta)
    expect(check.ok, check.failures.join('; ')).toBe(true)
  })
})
