import { test, expect } from '@playwright/test'

test.describe('editor collider workflow', () => {
  test('add Collider component and save demo scene', async ({ page }) => {
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

    await page.getByLabel('Collider static').uncheck()

    await page.getByRole('button', { name: 'File' }).click()
    await page.getByRole('menuitem', { name: 'Save' }).click()

    await expect(page.getByText('public/assets/scenes/menu.scene.json')).toBeVisible()
  })
})
