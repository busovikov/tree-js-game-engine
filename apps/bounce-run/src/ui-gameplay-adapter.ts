import type {
  UIDocument,
  UIRuntimeEvent,
  UIRuntimeTarget,
  UIService,
} from '@haku/ui'
import type { BounceRunSessionState } from './session-runtime.js'

export interface BounceRunHUDSnapshot {
  readonly status: BounceRunSessionState
  readonly score: number
  readonly bestScore: number
  readonly progress: number
}

export interface BounceRunUITargets {
  readonly statusText?: UIRuntimeTarget
  readonly scoreText?: UIRuntimeTarget
  readonly bestScoreText?: UIRuntimeTarget
  readonly progress?: UIRuntimeTarget
}

export type BounceRunUIRuntimeEvent = UIRuntimeEvent & { readonly bindingName: string }
export type BounceRunUIEventListener = (event: BounceRunUIRuntimeEvent) => void

export interface BounceRunUIGameplayAdapter {
  updateHud(snapshot: BounceRunHUDSnapshot): void
  subscribe(listener: BounceRunUIEventListener): () => void
  dispose(): void
}

export function createBounceRunUIGameplayAdapter(options: {
  readonly ui: Pick<UIService, 'setText' | 'setValue' | 'subscribe'>
  readonly document: UIDocument
  readonly targets?: BounceRunUITargets
}): BounceRunUIGameplayAdapter {
  const targets = { ...options.targets, ...resolveBounceRunUITargets(options.document) }
  const eventNames = new Map(options.document.events.map((event) => [event.id, event.name]))
  const listeners = new Set<BounceRunUIEventListener>()
  let disposed = false
  const unsubscribeUI = options.ui.subscribe((event) => {
    if (event.documentId !== options.document.id || event.bindingId === undefined) return
    const bindingName = eventNames.get(event.bindingId)
    if (bindingName === undefined) return
    for (const listener of listeners) listener({ ...event, bindingName })
  })

  return {
    updateHud: (snapshot) => {
      if (disposed) throw new Error('Bounce Run UI gameplay adapter is disposed')
      validateScore(snapshot.score, 'score')
      validateScore(snapshot.bestScore, 'best score')
      if (!Number.isFinite(snapshot.progress) || snapshot.progress < 0 || snapshot.progress > 1) {
        throw new Error('Bounce Run HUD progress must be a finite number from 0 to 1')
      }

      if (targets.statusText !== undefined) {
        options.ui.setText(
          { document: options.document.id, element: targets.statusText },
          snapshot.status,
        )
      }
      if (targets.scoreText !== undefined) {
        options.ui.setText(
          { document: options.document.id, element: targets.scoreText },
          `Score ${snapshot.score}`,
        )
      }
      if (targets.bestScoreText !== undefined) {
        options.ui.setText(
          { document: options.document.id, element: targets.bestScoreText },
          `Best ${snapshot.bestScore}`,
        )
      }
      if (targets.progress !== undefined) {
        options.ui.setValue(
          { document: options.document.id, element: targets.progress },
          snapshot.progress,
        )
      }
    },
    subscribe: (listener) => {
      if (disposed) throw new Error('Bounce Run UI gameplay adapter is disposed')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      unsubscribeUI()
      listeners.clear()
    },
  }
}

const TARGET_NAMES = {
  statusText: 'Session status',
  scoreText: 'Score',
  bestScoreText: 'Best score',
  progress: 'Route progress',
} as const satisfies Record<keyof BounceRunUITargets, string>

export function resolveBounceRunUITargets(document: UIDocument): BounceRunUITargets {
  return {
    statusText: resolveNamedTarget(document, TARGET_NAMES.statusText, 'text'),
    scoreText: resolveNamedTarget(document, TARGET_NAMES.scoreText, 'text'),
    bestScoreText: resolveNamedTarget(document, TARGET_NAMES.bestScoreText, 'text'),
    progress: resolveNamedTarget(document, TARGET_NAMES.progress, 'progress'),
  }
}

function resolveNamedTarget(
  document: UIDocument,
  name: string,
  expectedType: 'text' | 'progress',
): UIRuntimeTarget | undefined {
  const matches = document.elements.filter((element) => element.name === name)
  if (matches.length > 1) throw new Error(`Bounce Run UI target name is ambiguous: ${name}`)
  const element = matches[0]
  if (!element) return undefined
  if (element.type !== expectedType) {
    throw new Error(`Bounce Run UI target ${name} must be a ${expectedType}`)
  }
  return element.id
}

function validateScore(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Bounce Run HUD ${label} must be a non-negative safe integer`)
  }
}
