import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  forwardDriveDelta,
  readVehicleMetrics,
  settlePlayMode,
} from '../helpers/vehicle-metrics.js'
import { openTargetProject, targetProjectPath } from '../helpers/target-project.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.12')

test.describe('T01.12 vehicle physics rework', () => {
  test('implicit chassis collider, forward drive, steer', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    const scenePath = join(
      targetProjectPath(),
      'public/assets/scenes/playground.scene.json',
    )
    const scene = JSON.parse(readFileSync(scenePath, 'utf8')) as {
      entities: Array<{ name: string; components: Array<{ type: string }> }>
    }
    const vehicle = scene.entities.find((entity) => entity.name === 'Vehicle')
    expect(vehicle).toBeTruthy()
    expect(vehicle!.components.some((component) => component.type === 'Collider')).toBe(false)
    expect(vehicle!.components.some((component) => component.type === 'Vehicle')).toBe(true)

    await openTargetProject(page)
    await settlePlayMode(page, 1500)

    const before = await readVehicleMetrics(page)
    expect(before).not.toBeNull()
    expect(before!.allWheelsGrounded).toBe(true)
    if (before!.chassisAboveGround != null) {
      expect(before!.chassisAboveGround).toBeGreaterThanOrEqual(0.35)
      expect(before!.chassisAboveGround).toBeLessThanOrEqual(1.6)
    }

    await page.screenshot({ path: shot('02-play-settled.png') })

    await page.keyboard.down('w')
    await page.waitForTimeout(2500)
    await page.keyboard.up('w')
    await page.waitForTimeout(400)

    const afterDrive = await readVehicleMetrics(page)
    expect(afterDrive).not.toBeNull()
    await page.screenshot({ path: shot('03-play-forward-drive.png') })

    const forwardDelta = forwardDriveDelta(before!, afterDrive!)
    expect(forwardDelta).toBeGreaterThan(2)

    await page.keyboard.down('a')
    await page.keyboard.down('w')
    await page.waitForTimeout(2000)
    await page.keyboard.up('a')
    await page.keyboard.up('w')
    await page.waitForTimeout(400)
    await page.screenshot({ path: shot('04-play-steer-a-held.png') })

    await page.getByRole('button', { name: /Stop/ }).click()
    await page.waitForTimeout(500)
    await page.locator('.haku-hierarchy-row', { hasText: 'Vehicle' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: shot('01-editor-chassis-gizmo.png') })
  })
})
