import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const artifactsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'review-artifacts', 'T01.4')

test.describe('editor collider workflow', () => {
  test('add Collider component and save demo scene', async ({ page }) => {
    mkdirSync(artifactsDir, { recursive: true })

    await page.goto('/')

    await expect(page.getByText('@haku Editor')).toBeVisible()

    await page.getByRole('button', { name: 'File' }).click()
    await page.getByRole('menuitem', { name: 'Demo Scene' }).click()

    await expect(page.getByText('public/assets/scenes/menu.scene.json')).toBeVisible({ timeout: 15_000 })

    const hierarchyRow = page.locator('.haku-hierarchy-row').first()
    await expect(hierarchyRow).toBeVisible({ timeout: 15_000 })
    await hierarchyRow.click()

    await page.getByTestId('add-component-collider').click()
    await expect(page.getByText('Shape')).toBeVisible()

    const shot = (name: string) => join(artifactsDir, name)

    await page.screenshot({ path: shot('01-collider-inspector.png') })

    await page.getByLabel('Collider static').uncheck()

    await page.getByRole('button', { name: 'File' }).click()
    await page.getByRole('menuitem', { name: 'Save' }).click()

    await page.getByRole('button', { name: /Play/ }).click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: shot('02-play-mode-physics.png') })

    await expect(page.getByText('public/assets/scenes/menu.scene.json')).toBeVisible()
  })
})
