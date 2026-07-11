import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  driveSmoke,
  openTargetSceneViaDemoMenu,
  routeTargetAssetsForDemoScene,
} from '../helpers/target-project.js'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.14')

test.describe('T01.14 vehicle wheel/body visual fit', () => {
  test.beforeEach(async ({ page }) => {
    await routeTargetAssetsForDemoScene(page)
  })

  test('play mode shows fitted wheels at contact points', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })
    const shot = (name: string) => join(artifactsDir, name)

    await openTargetSceneViaDemoMenu(page)
    await page.locator('.haku-hierarchy-row', { hasText: 'Vehicle' }).click()
    await page.screenshot({ path: shot('01-scene-vehicle-selected.png') })

    await driveSmoke(page, 2500)
    await page.screenshot({ path: shot('02-play-mode-wheel-sync.png') })

    await expect(page.getByRole('button', { name: /Stop|Play/ })).toBeVisible()
  })
})
