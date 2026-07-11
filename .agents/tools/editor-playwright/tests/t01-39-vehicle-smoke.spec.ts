import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  driveSmoke,
  openTargetSceneViaDemoMenu,
  routeTargetAssetsForDemoScene,
  targetAssetExists,
  targetProjectPath,
} from '../helpers/target-project.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.39')

test.describe('T01.39 M1 vehicle smoke scene', () => {
  test.beforeEach(async ({ page }) => {
    await routeTargetAssetsForDemoScene(page)
  })

  test('loads target scene, enters play mode, WASD drive smoke', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    expect(targetAssetExists('models/rc-level.glb')).toBe(true)
    expect(targetAssetExists('models/base.glb')).toBe(true)
    expect(targetAssetExists('scenes/playground.scene.json')).toBe(true)

    await openTargetSceneViaDemoMenu(page)

    await page.locator('.haku-hierarchy-row', { hasText: 'Vehicle' }).click()
    await expect(page.getByText('Vehicle', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: shot('01-scene-vehicle-selected.png') })

    await driveSmoke(page, 3000)
    await page.screenshot({ path: shot('02-play-mode-drive-smoke.png') })

    await expect(page.getByRole('button', { name: /Stop|Play/ })).toBeVisible()
  })
})

test.describe('target project path', () => {
  test('HAKU_TARGET_PATH resolves', () => {
    expect(targetProjectPath()).toContain('tmp-js-game-project')
  })
})
