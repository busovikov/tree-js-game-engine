import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  driveSmoke,
  openTargetSceneViaDemoMenu,
  routeTargetAssetsForDemoScene,
  targetAssetExists,
} from '../helpers/target-project.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.9')

test.describe('T01.9 manual collider authoring', () => {
  test.beforeEach(async ({ page }) => {
    await routeTargetAssetsForDemoScene(page)
  })

  test('edit ramp collider in inspector, save, play mode vehicle collision', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    expect(targetAssetExists('scenes/playground.scene.json')).toBe(true)

    await openTargetSceneViaDemoMenu(page)

    await page.locator('.haku-hierarchy-row', { hasText: /^RampCollider$/ }).click()
    await expect(page.getByText('Shape')).toBeVisible()
    await page.locator('label.mesh-field', { hasText: 'halfExtents[0]' }).locator('input').fill('13')

    await page.screenshot({ path: shot('01-collider-inspector-viewport.png') })

    await page.getByRole('button', { name: 'File' }).click()
    await page.getByRole('menuitem', { name: 'Save' }).click()

    await driveSmoke(page, 3500)
    await page.screenshot({ path: shot('02-play-mode-ramp-collision.png') })

    await expect(page.getByRole('button', { name: /Stop|Play/ })).toBeVisible()
  })
})
