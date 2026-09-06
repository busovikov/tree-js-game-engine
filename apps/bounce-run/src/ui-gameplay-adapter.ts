import type { AssetId } from '@haku/schema'
import type { UIEventListener, UIRuntimeTarget, UIService } from '@haku/ui'
import type { BounceRunSessionState } from './session-runtime.js'

export interface BounceRunHUDSnapshot {
  readonly status: BounceRunSessionState
  readonly score: number
  readonly bestScore: number
  readonly progress: number
}

export interface BounceRunUITargets {
  readonly statusText: UIRuntimeTarget
  readonly scoreText: UIRuntimeTarget
  readonly bestScoreText: UIRuntimeTarget
  readonly progress: UIRuntimeTarget
}

export interface BounceRunUIGameplayAdapter {
  updateHud(snapshot: BounceRunHUDSnapshot): void
  subscribe(listener: UIEventListener): () => void
  dispose(): void
}

export function createBounceRunUIGameplayAdapter(options: {
  readonly ui: Pick<UIService, 'setText' | 'setValue' | 'subscribe'>
  readonly document: AssetId
  readonly targets: BounceRunUITargets
}): BounceRunUIGameplayAdapter {
  const listeners = new Set<UIEventListener>()
  let disposed = false
  const unsubscribeUI = options.ui.subscribe((event) => {
    if (event.documentId !== options.document) return
    for (const listener of listeners) listener(event)
  })

  return {
    updateHud: (snapshot) => {
      if (disposed) throw new Error('Bounce Run UI gameplay adapter is disposed')
      validateScore(snapshot.score, 'score')
      validateScore(snapshot.bestScore, 'best score')
      if (!Number.isFinite(snapshot.progress) || snapshot.progress < 0 || snapshot.progress > 1) {
        throw new Error('Bounce Run HUD progress must be a finite number from 0 to 1')
      }

      options.ui.setText(
        { document: options.document, element: options.targets.statusText },
        snapshot.status,
      )
      options.ui.setText(
        { document: options.document, element: options.targets.scoreText },
        `Score ${snapshot.score}`,
      )
      options.ui.setText(
        { document: options.document, element: options.targets.bestScoreText },
        `Best ${snapshot.bestScore}`,
      )
      options.ui.setValue(
        { document: options.document, element: options.targets.progress },
        snapshot.progress,
      )
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

function validateScore(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Bounce Run HUD ${label} must be a non-negative safe integer`)
  }
}
