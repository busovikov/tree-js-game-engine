import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BOUNCE_RUN_BROWSER_WORKFLOW_STEPS,
  createBounceRunBrowserWorkflowReport,
} from './browser-workflow-report.js'

const RAPPIER_WARNING =
  'using deprecated parameters for the initialization function; pass a single object instead'

describe('Bounce Run browser workflow report', () => {
  it('validates the committed bounded browser-agent evidence', () => {
    const evidence = JSON.parse(
      readFileSync(
        new URL('../../../docs/evidence/m12-browser-workflow-report.v1.json', import.meta.url),
        'utf8',
      ),
    ) as Parameters<typeof createBounceRunBrowserWorkflowReport>[0]

    const report = createBounceRunBrowserWorkflowReport(evidence)

    expect(report.runs[0]?.steps.find((step) => step.id === 'keyboard-input')?.status).toBe(
      'blocked',
    )
    expect(report.runs[1]?.qaHooks).toBe('absent')
  })

  it('freezes one bounded development and production workflow matrix', () => {
    const report = createBounceRunBrowserWorkflowReport({
      version: 1,
      scenario: 'bounce-run-critical-workflow',
      browser: {
        name: 'Chrome',
        connection: 'extension',
        automation: 'tab.playwright',
        separateKeyDownUpAvailable: false,
      },
      officialSources: [
        'https://playwright.dev/docs/api/class-keyboard',
        'https://playwright.dev/docs/api/class-page#page-set-viewport-size',
        'https://playwright.dev/docs/api/class-page#page-event-console',
        'https://playwright.dev/docs/api/class-page#page-event-request-failed',
      ],
      limitations: ['The installed tab.playwright surface exposes locator.press only.'],
      runs: (['development', 'production'] as const).map((mode) => ({
        mode,
        qaHooks: mode === 'development' ? 'present' : 'absent',
        steps: BOUNCE_RUN_BROWSER_WORKFLOW_STEPS.map((id) => ({
          id,
          status: id === 'keyboard-input' ? 'blocked' : 'passed',
          evidence: [`${mode}:${id}`],
        })),
        diagnostics: {
          allowedWarnings: [RAPPIER_WARNING],
          unexpectedConsole: [],
          failedNetworkRequests: [],
        },
      })),
    })

    expect(report.runs.map((run) => run.mode)).toEqual(['development', 'production'])
    expect(report.runs[0]?.steps.map((step) => step.id)).toEqual(BOUNCE_RUN_BROWSER_WORKFLOW_STEPS)
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.runs[0]?.steps[0]?.evidence)).toBe(true)
  })

  it('rejects reordered steps and unbounded diagnostics', () => {
    const baseRun = {
      mode: 'development' as const,
      qaHooks: 'present' as const,
      steps: BOUNCE_RUN_BROWSER_WORKFLOW_STEPS.map((id) => ({
        id,
        status: 'passed' as const,
        evidence: ['ok'],
      })),
      diagnostics: {
        allowedWarnings: [RAPPIER_WARNING],
        unexpectedConsole: [],
        failedNetworkRequests: [],
      },
    }
    const base = {
      version: 1 as const,
      scenario: 'bounce-run-critical-workflow' as const,
      browser: {
        name: 'Chrome' as const,
        connection: 'extension' as const,
        automation: 'tab.playwright' as const,
        separateKeyDownUpAvailable: true,
      },
      officialSources: ['https://playwright.dev/docs/api/class-keyboard'],
      limitations: [],
      runs: [baseRun, { ...baseRun, mode: 'production' as const, qaHooks: 'absent' as const }],
    }

    expect(() =>
      createBounceRunBrowserWorkflowReport({
        ...base,
        runs: [{ ...baseRun, steps: [...baseRun.steps].reverse() }, base.runs[1]],
      }),
    ).toThrow('development browser workflow steps must use the canonical order')

    expect(() =>
      createBounceRunBrowserWorkflowReport({
        ...base,
        runs: [
          {
            ...baseRun,
            diagnostics: {
              ...baseRun.diagnostics,
              unexpectedConsole: Array.from({ length: 33 }, () => 'error'),
            },
          },
          base.runs[1],
        ],
      }),
    ).toThrow('unexpectedConsole must contain 0-32 entries')
  })
})
