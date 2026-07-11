import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

const DEFAULT_TARGET = '/Users/pavel/work/tmp-js-game-project'

export function targetProjectPath(): string {
  return process.env.HAKU_TARGET_PATH ?? DEFAULT_TARGET
}

/** Open target project via dev-server flow (AD-09 — no Demo Scene hack). */
export async function openTargetProject(page: Page): Promise<void> {
  await page.goto('/?hakuOpenTarget=1')
  await page.getByText('@haku Editor').waitFor({ state: 'visible' })

  await page
    .getByText('public/assets/scenes/playground.scene.json')
    .waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByText('Vehicle').first().waitFor({ state: 'visible', timeout: 60_000 })
}

/** @deprecated Use openTargetProject — Demo Scene asset interception removed (AD-09). */
export async function routeTargetAssetsForDemoScene(_page: Page, _targetPath?: string): Promise<void> {
  // No-op: target project is opened via HAKU_TARGET_PATH dev server plugin.
}

/** @deprecated Use openTargetProject — Demo Scene asset interception removed (AD-09). */
export async function openTargetSceneViaDemoMenu(page: Page): Promise<void> {
  await openTargetProject(page)
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

/** Read target entry scene JSON from disk (Playwright assertions). */
export function readTargetEntryScenePath(targetPath = targetProjectPath()): string {
  const manifest = JSON.parse(
    readFileSync(join(targetPath, 'haku.project.json'), 'utf8'),
  ) as { entryScene: string }
  return manifest.entryScene
}
