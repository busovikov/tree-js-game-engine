export type PlatformVisibility = 'visible' | 'hidden'
export type PlatformFocus = 'focused' | 'blurred'

export interface PlatformLifecycleState {
  visibility: PlatformVisibility
  focus: PlatformFocus
  paused: boolean
  pauseReasons: string[]
}

export interface PlatformCapabilities {
  lifecycle: boolean
  auth: boolean
  pause: boolean
  input: boolean
  audio: boolean
}

export type PlatformAuthState =
  | { status: 'anonymous' }
  | { status: 'authorized'; playerId?: string }

export interface PlatformAuthProvider {
  getState(): Promise<PlatformAuthState>
  requestAuthorization(): Promise<PlatformAuthState>
}

export interface PlatformAdapter {
  readonly auth?: PlatformAuthProvider
  queryCapabilities(): Promise<PlatformCapabilities>
  getLifecycleState(): PlatformLifecycleState
  subscribeLifecycle(
    listener: (state: PlatformLifecycleState) => void,
  ): () => void
  start(): void
  stop(): void
}

export interface PlatformRuntimeControls {
  setSimulationPaused?(paused: boolean): void | Promise<void>
  setInputEnabled?(enabled: boolean): void | Promise<void>
  setAudioPaused?(paused: boolean): void | Promise<void>
}

export interface PlatformDocumentTarget extends EventTarget {
  readonly visibilityState: string
  hasFocus?(): boolean
}

export interface BrowserPlatformAdapterOptions {
  documentTarget?: PlatformDocumentTarget
  windowTarget?: EventTarget
  auth?: PlatformAuthProvider
  controls?: PlatformRuntimeControls
}

export class BrowserPlatformAdapter implements PlatformAdapter {
  readonly auth: PlatformAuthProvider | undefined

  private readonly documentTarget: PlatformDocumentTarget | undefined
  private readonly windowTarget: EventTarget | undefined
  private readonly controls: PlatformRuntimeControls
  private readonly listeners = new Set<
    (state: PlatformLifecycleState) => void
  >()
  private readonly platformPauseReasons = new Set<string>()
  private state: PlatformLifecycleState
  private started = false
  private pendingControls: Promise<void> = Promise.resolve()
  private appliedSimulationPaused: boolean | undefined
  private appliedInputEnabled: boolean | undefined
  private appliedAudioPaused: boolean | undefined

  private readonly handleVisibility = (): void => {
    this.updateFromEnvironment()
  }

  private readonly handleFocus = (): void => {
    this.updateState({ focus: 'focused' })
  }

  private readonly handleBlur = (): void => {
    this.updateState({ focus: 'blurred' })
  }

  constructor(options: BrowserPlatformAdapterOptions = {}) {
    this.documentTarget =
      options.documentTarget
      ?? (typeof document === 'undefined' ? undefined : document)
    this.windowTarget =
      options.windowTarget
      ?? (typeof window === 'undefined' ? undefined : window)
    this.auth = options.auth
    this.controls = options.controls ?? {}
    this.state = this.readEnvironmentState()
  }

  async queryCapabilities(): Promise<PlatformCapabilities> {
    return {
      lifecycle: this.documentTarget !== undefined,
      auth: this.auth !== undefined,
      pause: this.controls.setSimulationPaused !== undefined,
      input: this.controls.setInputEnabled !== undefined,
      audio: this.controls.setAudioPaused !== undefined,
    }
  }

  getLifecycleState(): PlatformLifecycleState {
    return cloneState(this.state)
  }

  subscribeLifecycle(
    listener: (state: PlatformLifecycleState) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started) return
    this.documentTarget?.addEventListener(
      'visibilitychange',
      this.handleVisibility,
    )
    this.windowTarget?.addEventListener('focus', this.handleFocus)
    this.windowTarget?.addEventListener('blur', this.handleBlur)
    this.started = true
    this.updateFromEnvironment(true)
  }

  stop(): void {
    if (!this.started) return
    this.documentTarget?.removeEventListener(
      'visibilitychange',
      this.handleVisibility,
    )
    this.windowTarget?.removeEventListener('focus', this.handleFocus)
    this.windowTarget?.removeEventListener('blur', this.handleBlur)
    this.started = false
    this.platformPauseReasons.clear()
    this.queueControls(false, true, false, true)
  }

  setPlatformPaused(reason: string, paused: boolean): void {
    const normalized = reason.trim()
    if (normalized.length === 0) {
      throw new TypeError('Platform pause reason must not be empty')
    }
    if (paused) this.platformPauseReasons.add(normalized)
    else this.platformPauseReasons.delete(normalized)
    this.updateState({})
  }

  settled(): Promise<void> {
    return this.pendingControls
  }

  private readEnvironmentState(): PlatformLifecycleState {
    const visibility: PlatformVisibility =
      this.documentTarget?.visibilityState === 'hidden' ? 'hidden' : 'visible'
    const focus: PlatformFocus =
      this.documentTarget?.hasFocus?.() === false ? 'blurred' : 'focused'
    return composeState(visibility, focus, this.platformPauseReasons)
  }

  private updateFromEnvironment(forceControls = false): void {
    const next = this.readEnvironmentState()
    this.applyState(next, forceControls)
  }

  private updateState(
    update: Partial<Pick<PlatformLifecycleState, 'visibility' | 'focus'>>,
  ): void {
    const next = composeState(
      update.visibility ?? this.state.visibility,
      update.focus ?? this.state.focus,
      this.platformPauseReasons,
    )
    this.applyState(next)
  }

  private applyState(
    next: PlatformLifecycleState,
    forceControls = false,
  ): void {
    const changed = !sameState(this.state, next)
    this.state = next
    this.queueControls(
      next.paused,
      !next.paused && next.focus === 'focused',
      next.paused,
      forceControls,
    )
    if (!changed) return
    for (const listener of this.listeners) listener(cloneState(next))
  }

  private queueControls(
    simulationPaused: boolean,
    inputEnabled: boolean,
    audioPaused: boolean,
    force: boolean,
  ): void {
    const operations: Array<() => void | Promise<void>> = []
    if (
      this.controls.setSimulationPaused !== undefined
      && (force || this.appliedSimulationPaused !== simulationPaused)
    ) {
      this.appliedSimulationPaused = simulationPaused
      operations.push(
        () => this.controls.setSimulationPaused!(simulationPaused),
      )
    }
    if (
      this.controls.setInputEnabled !== undefined
      && (force || this.appliedInputEnabled !== inputEnabled)
    ) {
      this.appliedInputEnabled = inputEnabled
      operations.push(() => this.controls.setInputEnabled!(inputEnabled))
    }
    if (
      this.controls.setAudioPaused !== undefined
      && (force || this.appliedAudioPaused !== audioPaused)
    ) {
      this.appliedAudioPaused = audioPaused
      operations.push(() => this.controls.setAudioPaused!(audioPaused))
    }
    if (operations.length === 0) return
    this.pendingControls = this.pendingControls.then(async () => {
      await Promise.all(operations.map(async (operation) => operation()))
    })
  }
}

function composeState(
  visibility: PlatformVisibility,
  focus: PlatformFocus,
  platformReasons: ReadonlySet<string>,
): PlatformLifecycleState {
  const pauseReasons = [
    ...(visibility === 'hidden' ? ['visibility'] : []),
    ...[...platformReasons]
      .sort((left, right) => left.localeCompare(right))
      .map((reason) => `platform:${reason}`),
  ]
  return {
    visibility,
    focus,
    paused: pauseReasons.length > 0,
    pauseReasons,
  }
}

function sameState(
  left: PlatformLifecycleState,
  right: PlatformLifecycleState,
): boolean {
  return left.visibility === right.visibility
    && left.focus === right.focus
    && left.paused === right.paused
    && left.pauseReasons.length === right.pauseReasons.length
    && left.pauseReasons.every(
      (reason, index) => reason === right.pauseReasons[index],
    )
}

function cloneState(state: PlatformLifecycleState): PlatformLifecycleState {
  return {
    ...state,
    pauseReasons: [...state.pauseReasons],
  }
}
