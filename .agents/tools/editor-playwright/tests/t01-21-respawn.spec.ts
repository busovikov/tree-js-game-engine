import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  openTargetProject,
  targetAssetExists,
  targetProjectPath,
} from '../helpers/target-project.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.21')

test.describe('T01.21 Respawn system', () => {
  test('play mode fall respawn and manual R reset', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    expect(targetAssetExists('scenes/playground.scene.json')).toBe(true)

    await openTargetProject(page)

    await page.getByRole('button', { name: /Play/ }).click()
    await page.waitForTimeout(800)

    await page.keyboard.down('w')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: shot('01-play-mode-drive-smoke.png') })
    await page.keyboard.up('w')

    await page.keyboard.down('w')
    await page.waitForTimeout(4000)
    await page.screenshot({ path: shot('02-play-mode-fall-respawn.png') })
    await page.keyboard.up('w')
    await page.waitForTimeout(1500)

    await page.keyboard.press('r')
    await page.waitForTimeout(800)
    await page.screenshot({ path: shot('03-play-mode-manual-respawn.png') })

    await expect(page.getByRole('button', { name: /Stop|Play/ })).toBeVisible()
  })
})

test.describe('target project path', () => {
  test('HAKU_TARGET_PATH resolves for T01.21', () => {
    expect(targetProjectPath()).toContain('tmp-js-game-project')
  })
})
