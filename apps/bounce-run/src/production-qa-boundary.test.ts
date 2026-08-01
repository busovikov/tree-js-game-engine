import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = join(APP_ROOT, '../..')
const SOURCE_SENTINELS = [
  ['src/qa-harness.ts', 'haku:bounce-run:qa-harness:v1'],
  ['src/qa-report.ts', 'haku:bounce-run:qa-report:v1'],
  ['src/qa-observations.ts', 'haku:bounce-run:qa-observations:v1'],
  ['src/replay.ts', 'haku:bounce-run:qa-replay:v1'],
] as const
const PRODUCTION_EXCLUSIONS = [
  ...SOURCE_SENTINELS.map(([, sentinel]) => sentinel),
  '__HAKU_BOUNCE_RUN_QA_V1__',
  'hakuBounceRunConsoleCollector',
  'hakuBounceRunFetchCollector',
  'hakuBounceRunQaDomBridge',
] as const

describe('Bounce Run production QA boundary', () => {
  it('runs the real production build and excludes every authoritative dev QA sentinel', () => {
    const build = spawnSync('pnpm', ['--filter', '@haku/bounce-run', 'build'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0)

    const mainSource = readFileSync(join(APP_ROOT, 'src/main.ts'), 'utf8')
    const missingContracts: string[] = []
    if (!/if\s*\(import\.meta\.env\.DEV\)/.test(mainSource)) {
      missingContracts.push('main.ts static import.meta.env.DEV guard')
    }
    if (!/import\(['"]\.\/dev-qa-bootstrap\.js['"]\)/.test(mainSource)) {
      missingContracts.push('main.ts dynamic dev QA bootstrap import')
    }
    for (const [sourcePath, sentinel] of SOURCE_SENTINELS) {
      if (!readFileSync(join(APP_ROOT, sourcePath), 'utf8').includes(sentinel)) {
        missingContracts.push(`${sourcePath} sentinel ${sentinel}`)
      }
    }
    expect(missingContracts).toEqual([])

    const assetsDirectory = join(APP_ROOT, 'dist/assets')
    const productionJavaScript = readdirSync(assetsDirectory)
      .filter((name) => name.endsWith('.js'))
      .sort()
      .map((name) => readFileSync(join(assetsDirectory, name), 'utf8'))
      .join('\n')
    for (const sentinel of PRODUCTION_EXCLUSIONS) {
      expect(productionJavaScript, `production bundle contains ${sentinel}`).not.toContain(sentinel)
    }
  }, 60_000)
})
