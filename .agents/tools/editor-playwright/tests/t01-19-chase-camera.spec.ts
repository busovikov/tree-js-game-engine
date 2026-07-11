import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  openTargetSceneViaDemoMenu,
  routeTargetAssetsForDemoScene,
  targetAssetExists,
  targetProjectPath,
} from '../helpers/target-project.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.19')

test.describe('T01.19 Chase camera system', () => {
  test.beforeEach(async ({ page }) => {
    await routeTargetAssetsForDemoScene(page)
  })

  test('play mode chase camera orbit and boost FOV', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    expect(targetAssetExists('scenes/playground.scene.json')).toBe(true)

    await openTargetSceneViaDemoMenu(page)

    await page.getByRole('button', { name: /Play/ }).click()
    await page.waitForTimeout(800)

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
    await page.screenshot({ path: shot('01-play-orbit.png') })

    await page.keyboard.down('w')
    await page.keyboard.down('Shift')
    await page.waitForTimeout(2000)
    await page.screenshot({ path: shot('02-play-boost-drive.png') })
    await page.keyboard.up('Shift')
    await page.keyboard.up('w')

    await page.keyboard.down('w')
    await page.keyboard.down(' ')
    await page.waitForTimeout(1200)
    await page.screenshot({ path: shot('03-play-airborne.png') })
    await page.keyboard.up(' ')
    await page.keyboard.up('w')

    await expect(page.getByRole('button', { name: /Stop|Play/ })).toBeVisible()
  })
})

test.describe('target project path', () => {
  test('HAKU_TARGET_PATH resolves for T01.19', () => {
    expect(targetProjectPath()).toContain('tmp-js-game-project')
  })
})
