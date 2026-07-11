import { readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import type { Page, Route } from '@playwright/test'

const DEFAULT_TARGET = '/Users/pavel/work/tmp-js-game-project'

export function targetProjectPath(): string {
  return process.env.HAKU_TARGET_PATH ?? DEFAULT_TARGET
}

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

function fulfillFromTarget(route: Route, targetPath: string, assetsRelative: string): boolean {
  const filePath = join(targetPath, 'public/assets', assetsRelative)
  try {
    if (!statSync(filePath).isFile()) return false
    const body = readFileSync(filePath)
    const ext = extname(filePath).toLowerCase()
    void route.fulfill({
      status: 200,
      contentType: MIME[ext] ?? 'application/octet-stream',
      body,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Intercept `/assets/*` fetches so Demo Scene loads the target M1 scene + GLBs.
 * Maps demo entry `menu.scene.json` → target `playground.scene.json`.
 */
export async function routeTargetAssetsForDemoScene(page: Page, targetPath = targetProjectPath()): Promise<void> {
  await page.route('**/assets/**', async (route) => {
    const url = new URL(route.request().url())
    const pathname = url.pathname

    if (pathname === '/assets/manifest.json') {
      const manifest = readFileSync(join(targetPath, 'public/assets/manifest.json'))
      await route.fulfill({ status: 200, contentType: 'application/json', body: manifest })
      return
    }

    if (pathname === '/assets/scenes/menu.scene.json') {
      const scene = readFileSync(join(targetPath, 'public/assets/scenes/playground.scene.json'))
      await route.fulfill({ status: 200, contentType: 'application/json', body: scene })
      return
    }

    const assetsRelative = pathname.replace(/^\/assets\//, '')
    if (assetsRelative && fulfillFromTarget(route, targetPath, assetsRelative)) {
      return
    }

    await route.continue()
  })
}

/** File → Demo Scene with target assets routed (tier B assemble). */
export async function openTargetSceneViaDemoMenu(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByText('@haku Editor').waitFor({ state: 'visible' })

  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: 'Demo Scene' }).click()

  await page.getByText('public/assets/scenes/menu.scene.json').waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByText('Vehicle').first().waitFor({ state: 'visible', timeout: 60_000 })
}

/** Enter play mode and hold W for drive smoke (tier C). */
export async function driveSmoke(page: Page, ms = 2500): Promise<void> {
  await page.getByRole('button', { name: /Play/ }).click()
  await page.waitForTimeout(800)
  await page.keyboard.down('w')
  await page.waitForTimeout(ms)
  await page.keyboard.up('w')
  await page.waitForTimeout(400)
}

export function targetAssetExists(relativePath: string, targetPath = targetProjectPath()): boolean {
  const full = join(targetPath, 'public/assets', relativePath)
  try {
    return statSync(full).isFile()
  } catch {
    return false
  }
}
