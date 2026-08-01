import { createImmutableJsonSnapshot } from '@haku/core'

export const BOUNCE_RUN_BROWSER_WORKFLOW_STEPS = [
  'start',
  'keyboard-input',
  'pause-stability',
  'resume',
  'game-over',
  'restart',
  'resize',
  'diagnostics',
] as const

export const BOUNCE_RUN_ALLOWED_RAPIER_WARNING =
  'using deprecated parameters for the initialization function; pass a single object instead'

export type BounceRunBrowserWorkflowStepId = (typeof BOUNCE_RUN_BROWSER_WORKFLOW_STEPS)[number]
export type BounceRunBrowserWorkflowStepStatus = 'passed' | 'failed' | 'blocked'
export type BounceRunBrowserWorkflowMode = 'development' | 'production'

export interface BounceRunBrowserWorkflowStep {
  readonly id: BounceRunBrowserWorkflowStepId
  readonly status: BounceRunBrowserWorkflowStepStatus
  readonly evidence: readonly string[]
}

export interface BounceRunBrowserWorkflowRun {
  readonly mode: BounceRunBrowserWorkflowMode
  readonly qaHooks: 'present' | 'absent'
  readonly steps: readonly BounceRunBrowserWorkflowStep[]
  readonly diagnostics: Readonly<{
    allowedWarnings: readonly string[]
    unexpectedConsole: readonly string[]
    failedNetworkRequests: readonly string[]
  }>
}

export interface BounceRunBrowserWorkflowReport {
  readonly version: 1
  readonly scenario: 'bounce-run-critical-workflow'
  readonly browser: Readonly<{
    name: 'Chrome'
    connection: 'extension'
    automation: 'tab.playwright'
    separateKeyDownUpAvailable: boolean
  }>
  readonly officialSources: readonly string[]
  readonly limitations: readonly string[]
  readonly runs: readonly BounceRunBrowserWorkflowRun[]
}

const MAX_DIAGNOSTICS = 32
const MAX_EVIDENCE_PER_STEP = 12
const MAX_LIMITATIONS = 8
const MAX_SOURCES = 8
const MAX_TEXT_LENGTH = 512

/** Validates, clones, and deeply freezes deterministic browser-agent workflow evidence. */
export function createBounceRunBrowserWorkflowReport(
  input: BounceRunBrowserWorkflowReport,
): BounceRunBrowserWorkflowReport {
  if (input.version !== 1 || input.scenario !== 'bounce-run-critical-workflow') {
    throw new Error('Unsupported Bounce Run browser workflow report')
  }
  if (
    input.browser.name !== 'Chrome' ||
    input.browser.connection !== 'extension' ||
    input.browser.automation !== 'tab.playwright' ||
    typeof input.browser.separateKeyDownUpAvailable !== 'boolean'
  ) {
    throw new Error('Browser workflow evidence must come from Chrome extension tab.playwright')
  }

  validateTextList('officialSources', input.officialSources, 1, MAX_SOURCES)
  for (const source of input.officialSources) {
    if (!source.startsWith('https://playwright.dev/docs/')) {
      throw new Error('officialSources must contain only official Playwright documentation URLs')
    }
  }
  validateTextList('limitations', input.limitations, 0, MAX_LIMITATIONS)

  if (input.runs.length !== 2) {
    throw new Error('Browser workflow report must contain development and production runs')
  }
  const expectedModes = ['development', 'production'] as const
  input.runs.forEach((run, index) => validateRun(run, expectedModes[index]))

  return createImmutableJsonSnapshot(input) as BounceRunBrowserWorkflowReport
}

function validateRun(
  run: BounceRunBrowserWorkflowRun,
  expectedMode: BounceRunBrowserWorkflowMode,
): void {
  if (run.mode !== expectedMode) {
    throw new Error('Browser workflow runs must use development then production order')
  }
  const expectedHooks = run.mode === 'development' ? 'present' : 'absent'
  if (run.qaHooks !== expectedHooks) {
    throw new Error(`${run.mode} browser workflow QA hooks must be ${expectedHooks}`)
  }
  if (
    run.steps.length !== BOUNCE_RUN_BROWSER_WORKFLOW_STEPS.length ||
    run.steps.some((step, index) => step.id !== BOUNCE_RUN_BROWSER_WORKFLOW_STEPS[index])
  ) {
    throw new Error(`${run.mode} browser workflow steps must use the canonical order`)
  }
  for (const step of run.steps) {
    if (!['passed', 'failed', 'blocked'].includes(step.status)) {
      throw new Error(`Invalid browser workflow status for ${step.id}`)
    }
    validateTextList(`${run.mode}.${step.id}.evidence`, step.evidence, 1, MAX_EVIDENCE_PER_STEP)
  }
  validateTextList('allowedWarnings', run.diagnostics.allowedWarnings, 0, MAX_DIAGNOSTICS)
  if (
    run.diagnostics.allowedWarnings.some((warning) => warning !== BOUNCE_RUN_ALLOWED_RAPIER_WARNING)
  ) {
    throw new Error('Only the exact known Rapier initialization warning may be allowed')
  }
  validateTextList('unexpectedConsole', run.diagnostics.unexpectedConsole, 0, MAX_DIAGNOSTICS)
  validateTextList(
    'failedNetworkRequests',
    run.diagnostics.failedNetworkRequests,
    0,
    MAX_DIAGNOSTICS,
  )
}

function validateTextList(
  label: string,
  values: readonly string[],
  minimum: number,
  maximum: number,
): void {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    throw new Error(`${label} must contain ${minimum}-${maximum} entries`)
  }
  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
      throw new Error(`${label} entries must be 1-${MAX_TEXT_LENGTH} characters`)
    }
  }
}
