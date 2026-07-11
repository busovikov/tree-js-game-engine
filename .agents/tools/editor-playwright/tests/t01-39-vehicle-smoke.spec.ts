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

async function orbitChaseCamera(page: import('@playwright/test').Page): Promise<void> {
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  if (!box) return

  const centerX = box.x + box.width * 0.5
  const centerY = box.y + box.height * 0.45

  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX + 120, centerY - 40, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)
}

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

  test('play mode chase camera orbit during drive', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    await openTargetSceneViaDemoMenu(page)
    await page.getByRole('button', { name: /Play/ }).click()
    await page.waitForTimeout(800)

    await orbitChaseCamera(page)
    await page.screenshot({ path: shot('03-play-mode-chase-orbit.png') })

    await page.keyboard.down('w')
    await page.waitForTimeout(2000)
    await orbitChaseCamera(page)
    await page.screenshot({ path: shot('04-play-mode-drive-orbit.png') })
    await page.keyboard.up('w')

    await expect(page.getByRole('button', { name: /Stop|Play/ })).toBeVisible()
  })

  test('play mode fall respawn and manual R reset', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    await openTargetSceneViaDemoMenu(page)
    await page.getByRole('button', { name: /Play/ }).click()
    await page.waitForTimeout(800)

    await page.keyboard.down('w')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: shot('05-play-mode-drive-before-fall.png') })
    await page.keyboard.up('w')

    await page.keyboard.down('w')
    await page.waitForTimeout(4500)
    await page.screenshot({ path: shot('06-play-mode-fall-respawn.png') })
    await page.keyboard.up('w')
    await page.waitForTimeout(1500)

    await page.keyboard.press('r')
    await page.waitForTimeout(800)
    await page.screenshot({ path: shot('07-play-mode-manual-respawn.png') })

    await expect(page.getByRole('button', { name: /Stop|Play/ })).toBeVisible()
  })
})

test.describe('target project path', () => {
  test('HAKU_TARGET_PATH resolves', () => {
    expect(targetProjectPath()).toContain('tmp-js-game-project')
  })
})
