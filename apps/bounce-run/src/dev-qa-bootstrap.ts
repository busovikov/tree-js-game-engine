import { createImmutableJsonSnapshot, type ISystem } from '@haku/core'
import type { InputActionMapSnapshot } from '@haku/engine'
import {
  createBounceRunQaHarness,
  type BounceRunQaDiagnosticInput,
  type BounceRunQaFixedTickSample,
  type BounceRunQaSubscriptionPort,
} from './qa-harness.js'
import {
  createBounceRunObservationSnapshot,
  type BounceRunObservationSources,
} from './qa-observations.js'
import { serializeBounceRunBugReport, type BounceRunSessionOutcome } from './qa-report.js'

export const BOUNCE_RUN_DEV_QA_GLOBAL = '__HAKU_BOUNCE_RUN_QA_V1__' as const
export const BOUNCE_RUN_CONSOLE_COLLECTOR_SENTINEL = 'hakuBounceRunConsoleCollector' as const
export const BOUNCE_RUN_FETCH_COLLECTOR_SENTINEL = 'hakuBounceRunFetchCollector' as const
export const BOUNCE_RUN_DOM_BRIDGE_SENTINEL = 'hakuBounceRunQaDomBridge' as const

interface SubscriptionSource<T> {
  readonly port: BounceRunQaSubscriptionPort<T>
  emit(value: T): void
  clear(): void
}

export interface BounceRunDevQaOptions {
  readonly seed: number
  readonly systemHost: Readonly<{
    add(system: ISystem): void
    remove(system: ISystem): void
  }>
  readonly actions: Readonly<{
    read(): InputActionMapSnapshot
    setLateral(value: number | null): void
    start(): void
    pause(): void
    resume(): void
    restart(): void
  }>
  readonly observations: BounceRunObservationSources
}

export interface BounceRunDevQaInstallation {
  dispose(): void
}

/** Installs the removable, versioned browser bridge only from the Vite DEV branch. */
export function installBounceRunDevQa(options: BounceRunDevQaOptions): BounceRunDevQaInstallation {
  const fixedTicks = createSubscriptionSource<BounceRunQaFixedTickSample>()
  const runtime = createSubscriptionSource<BounceRunQaDiagnosticInput>()
  const consoleDiagnostics = createSubscriptionSource<BounceRunQaDiagnosticInput>()
  const network = createSubscriptionSource<BounceRunQaDiagnosticInput>()
  const harness = createBounceRunQaHarness({
    seed: options.seed,
    fixedDelta: options.observations.scheduler.fixedTimestep,
    fixedTicks: fixedTicks.port,
    observations: {
      read(localTick) {
        return createBounceRunObservationSnapshot({
          ...options.observations,
          scheduler: {
            tickNumber: localTick,
            fixedTimestep: options.observations.scheduler.fixedTimestep,
            metrics: () => options.observations.scheduler.metrics(),
          },
        })
      },
    },
    diagnostics: { runtime: runtime.port, console: consoleDiagnostics.port, network: network.port },
  })
  const domBridge = createQaDomBridge(harness, options.actions)

  const tickSystem: ISystem = {
    phase: 'FixedGameplay',
    localOrder: 10_000,
    update() {
      fixedTicks.emit({
        schedulerTick: options.observations.scheduler.tickNumber,
        actions: options.actions.read(),
        state: { velocity: [...options.observations.ball.velocity()] },
      })
      domBridge.render()
    },
  }
  options.systemHost.add(tickSystem)

  const disposeBrowserDiagnostics = installBrowserDiagnostics({
    runtime: runtime.emit,
    console: consoleDiagnostics.emit,
    network: network.emit,
  })
  const bridge = Object.freeze({
    version: 1 as const,
    actions: Object.freeze({
      start() {
        harness.resetSession()
        options.actions.start()
      },
      pause: options.actions.pause,
      resume: options.actions.resume,
      restart() {
        harness.resetSession()
        options.actions.restart()
      },
      setLateral: options.actions.setLateral,
    }),
    qa: Object.freeze({
      snapshot: () => harness.snapshot(),
      resetSession: () => harness.resetSession(),
      createSessionReport: (outcome: BounceRunSessionOutcome) =>
        harness.createSessionReport(outcome),
      createBugReport: (input: Parameters<typeof harness.createBugReport>[0]) =>
        harness.createBugReport(input),
    }),
  })
  const globalWindow = window as unknown as Record<string, unknown>
  Object.defineProperty(globalWindow, BOUNCE_RUN_DEV_QA_GLOBAL, {
    configurable: true,
    enumerable: false,
    value: bridge,
    writable: false,
  })

  let disposed = false
  return Object.freeze({
    dispose() {
      if (disposed) return
      disposed = true
      if (globalWindow[BOUNCE_RUN_DEV_QA_GLOBAL] === bridge) {
        Reflect.deleteProperty(globalWindow, BOUNCE_RUN_DEV_QA_GLOBAL)
      }
      domBridge.dispose()
      disposeBrowserDiagnostics()
      options.systemHost.remove(tickSystem)
      harness.dispose()
      fixedTicks.clear()
      runtime.clear()
      consoleDiagnostics.clear()
      network.clear()
    },
  })
}

function createQaDomBridge(
  harness: ReturnType<typeof createBounceRunQaHarness>,
  actions: BounceRunDevQaOptions['actions'],
): {
  render(): void
  dispose(): void
} {
  const host = document.createElement('aside')
  host.setAttribute('aria-label', 'Bounce Run QA')
  host.dataset.hakuBounceRunQa = 'v1'
  Object.assign(host.style, {
    background: 'rgba(8, 12, 20, 0.88)',
    bottom: '8px',
    color: '#dce9ff',
    display: 'flex',
    font: '12px/1.4 monospace',
    gap: '6px',
    left: '8px',
    padding: '6px 8px',
    position: 'fixed',
    zIndex: '2147483647',
  })
  const status = document.createElement('output')
  status.dataset.qaStatus = 'v1'
  const artifact = document.createElement('script')
  artifact.type = 'application/json'
  artifact.dataset.qaArtifact = 'v1'

  const resetButton = createQaButton('Reset QA session')
  const rightButton = createQaButton('Hold right action')
  const releaseButton = createQaButton('Release lateral action')
  const sessionButton = createQaButton('Create QA session report')
  const bugButton = createQaButton('Create QA bug report')
  const onReset = (): void => {
    harness.resetSession()
    artifact.textContent = ''
    render()
  }
  const createSession = () => {
    const snapshot = harness.snapshot()
    const report = harness.createSessionReport(outcomeFor(snapshot.lastObservation?.session.state))
    artifact.textContent = JSON.stringify(report)
    status.dataset.artifactKind = 'session'
    render()
    return report
  }
  const onSession = (): void => {
    createSession()
  }
  const onRight = (): void => actions.setLateral(1)
  const onRelease = (): void => actions.setLateral(null)
  const onBug = (): void => {
    const session = createSession()
    const bug = harness.createBugReport({
      session,
      defect: {
        code: 'browser.smoke',
        title: 'Browser QA smoke evidence',
        summary: 'Dev-only browser evidence captured for investigation.',
      },
      rootCause: {
        status: 'unknown',
        category: 'browser-smoke',
        summary: 'Root cause is intentionally unclassified by the collection harness.',
        assertionCodes: [],
      },
    })
    artifact.textContent = new TextDecoder().decode(serializeBounceRunBugReport(bug))
    status.dataset.artifactKind = 'bug'
    render()
  }
  resetButton.addEventListener('click', onReset)
  rightButton.addEventListener('click', onRight)
  releaseButton.addEventListener('click', onRelease)
  sessionButton.addEventListener('click', onSession)
  bugButton.addEventListener('click', onBug)
  host.append(status, resetButton, rightButton, releaseButton, sessionButton, bugButton, artifact)
  document.body.append(host)

  function render(): void {
    const snapshot = harness.snapshot()
    const x = snapshot.lastObservation?.ball.position[0]
    const state = snapshot.lastObservation?.session.state ?? 'none'
    status.textContent = `QA ticks ${snapshot.tickCount} · diagnostics ${snapshot.diagnostics.length} · state ${state} · x ${x?.toFixed(3) ?? 'n/a'}`
  }
  render()

  return {
    render,
    dispose() {
      resetButton.removeEventListener('click', onReset)
      rightButton.removeEventListener('click', onRight)
      releaseButton.removeEventListener('click', onRelease)
      sessionButton.removeEventListener('click', onSession)
      bugButton.removeEventListener('click', onBug)
      host.remove()
    },
  }
}

function createQaButton(label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  return button
}

function outcomeFor(
  state: ReturnType<BounceRunObservationSources['session']['state']> | undefined,
): BounceRunSessionOutcome {
  return state === 'game-over' ? 'failed' : 'aborted'
}

function createSubscriptionSource<T>(): SubscriptionSource<T> {
  const listeners = new Set<(value: T) => void>()
  return {
    port: {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    emit(value) {
      for (const listener of listeners) listener(value)
    },
    clear() {
      listeners.clear()
    },
  }
}

function installBrowserDiagnostics(emitters: {
  readonly runtime: (input: BounceRunQaDiagnosticInput) => void
  readonly console: (input: BounceRunQaDiagnosticInput) => void
  readonly network: (input: BounceRunQaDiagnosticInput) => void
}): () => void {
  const onError = (event: ErrorEvent): void => {
    emitters.runtime({ category: 'window-error', message: boundedMessage(event.message) })
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    emitters.runtime({
      category: 'unhandled-rejection',
      message: boundedMessage(event.reason),
    })
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  const originalError = console.error
  const originalWarn = console.warn
  const hakuBounceRunConsoleCollector = (category: string, values: readonly unknown[]): void => {
    emitters.console({ category, message: boundedMessage(values) })
  }
  const errorWrapper: typeof console.error = (...values) => {
    hakuBounceRunConsoleCollector('error', values)
    originalError.apply(console, values)
  }
  const warnWrapper: typeof console.warn = (...values) => {
    hakuBounceRunConsoleCollector('warning', values)
    originalWarn.apply(console, values)
  }
  console.error = errorWrapper
  console.warn = warnWrapper

  const originalFetch = window.fetch
  const hakuBounceRunFetchCollector: typeof window.fetch = async (input, init) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    try {
      const response = await originalFetch.call(window, input, init)
      if (!response.ok) {
        emitters.network({
          category: 'http-error',
          message: `${method} ${response.url} returned ${response.status}`,
          context: { method, status: response.status, url: response.url },
        })
      }
      return response
    } catch (error) {
      emitters.network({
        category: 'fetch-error',
        message: `${method} request failed: ${boundedMessage(error)}`,
      })
      throw error
    }
  }
  window.fetch = hakuBounceRunFetchCollector

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
    if (console.error === errorWrapper) console.error = originalError
    if (console.warn === warnWrapper) console.warn = originalWarn
    if (window.fetch === hakuBounceRunFetchCollector) window.fetch = originalFetch
  }
}

function boundedMessage(value: unknown): string {
  let message: string
  try {
    message =
      typeof value === 'string'
        ? value
        : typeof value === 'object' && value !== null && 'message' in value
          ? String((value as { message?: unknown }).message)
          : JSON.stringify(createImmutableJsonSnapshot(value))
  } catch {
    message = String(value)
  }
  if (!message) message = 'Unknown browser diagnostic'
  return message.slice(0, 2_048)
}
