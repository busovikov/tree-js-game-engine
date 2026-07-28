import type { BrowserProjectTrustMode } from '@haku/build'

export type PlayCapabilityValue =
  | null
  | boolean
  | number
  | string
  | readonly PlayCapabilityValue[]
  | { readonly [key: string]: PlayCapabilityValue }

export interface PlaySandboxMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  postMessage(message: unknown): void
  start(): void
  close(): void
}

export type PlaySandboxFrame = HTMLIFrameElement

export type PlaySandboxResult =
  | { readonly type: 'haku-play:success' }
  | { readonly type: 'haku-play:crash'; readonly message: string }
  | { readonly type: 'haku-play:timeout'; readonly message: string }

export interface PlaySandboxSession {
  readonly frame: PlaySandboxFrame
  readonly completion: Promise<PlaySandboxResult>
  dispose(): void
}

export interface PlaySandboxOptions {
  readonly trustMode: BrowserProjectTrustMode
  readonly bundle: string
  readonly approvedCapabilities: Readonly<Record<string, PlayCapabilityValue>>
  readonly host?: Pick<HTMLElement, 'append' | 'contains'>
  readonly timeoutMs?: number
  readonly createFrame?: () => PlaySandboxFrame
  readonly createChannel?: () => {
    readonly port1: PlaySandboxMessagePort
    readonly port2: PlaySandboxMessagePort
  }
}

const PLAY_SANDBOX_DOCUMENT = `<!doctype html>
<html>
<body>
<script type="module">
window.addEventListener('message', (connectEvent) => {
  if (connectEvent.data?.type !== 'haku-play:connect' || connectEvent.ports.length !== 1) return
  const port = connectEvent.ports[0]
  port.onmessage = async (startEvent) => {
    if (startEvent.data?.type !== 'haku-play:start') return
    let moduleUrl
    try {
      moduleUrl = URL.createObjectURL(new Blob([startEvent.data.bundle], { type: 'text/javascript' }))
      await import(moduleUrl)
      port.postMessage({ type: 'haku-play:success' })
    } catch (error) {
      port.postMessage({
        type: 'haku-play:crash',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      if (moduleUrl) URL.revokeObjectURL(moduleUrl)
    }
  }
  port.start()
}, { once: true })
</script>
</body>
</html>`

function isSerializableCapability(value: unknown, seen: Set<object>): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)

  if (Array.isArray(value)) {
    return value.every((item) => isSerializableCapability(item, seen))
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(value).every((item) => isSerializableCapability(item, seen))
}

function cloneCapabilities(
  capabilities: Readonly<Record<string, PlayCapabilityValue>>,
): Readonly<Record<string, PlayCapabilityValue>> {
  if (!isSerializableCapability(capabilities, new Set())) {
    throw new Error('Play capability data must contain only serializable values.')
  }
  return JSON.parse(JSON.stringify(capabilities)) as Readonly<
    Record<string, PlayCapabilityValue>
  >
}

function isPlaySandboxResult(value: unknown): value is Exclude<PlaySandboxResult, {
  type: 'haku-play:timeout'
}> {
  if (!value || typeof value !== 'object' || !('type' in value)) return false
  if (value.type === 'haku-play:success') return true
  return (
    value.type === 'haku-play:crash' &&
    'message' in value &&
    typeof value.message === 'string'
  )
}

export function createPlaySandbox(options: PlaySandboxOptions): PlaySandboxSession {
  if (options.trustMode === 'imported-untrusted') {
    throw new Error('Imported untrusted code cannot run in Play.')
  }
  const capabilities = cloneCapabilities(options.approvedCapabilities)
  const timeoutMs = options.timeoutMs ?? 10_000
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Play timeout must be a positive finite number.')
  }

  const host = options.host ?? document.body
  const frame =
    options.createFrame?.() ?? (document.createElement('iframe') as PlaySandboxFrame)
  const channel = options.createChannel?.() ?? new MessageChannel()
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('title', 'Haku Play sandbox')
  frame.srcdoc = PLAY_SANDBOX_DOCUMENT

  let settled = false
  let resolveCompletion!: (result: PlaySandboxResult) => void
  const completion = new Promise<PlaySandboxResult>((resolve) => {
    resolveCompletion = resolve
  })

  const dispose = () => {
    clearTimeout(timer)
    channel.port1.close()
    channel.port2.close()
    frame.remove()
  }
  const finish = (result: PlaySandboxResult) => {
    if (settled) return
    settled = true
    dispose()
    resolveCompletion(result)
  }
  const timer = setTimeout(() => {
    finish({
      type: 'haku-play:timeout',
      message: `Play exceeded the ${timeoutMs}ms timeout.`,
    })
  }, timeoutMs)

  channel.port1.onmessage = (event: MessageEvent<unknown>) => {
    if (isPlaySandboxResult(event.data)) finish(event.data)
  }
  channel.port1.start()
  frame.addEventListener(
    'load',
    () => {
      frame.contentWindow?.postMessage(
        { type: 'haku-play:connect' },
        '*',
        [channel.port2 as Transferable],
      )
      channel.port1.postMessage({
        type: 'haku-play:start',
        bundle: options.bundle,
        capabilities,
      })
    },
    { once: true },
  )
  host.append(frame)

  return { frame, completion, dispose }
}
