/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createPlaySandbox,
  type PlaySandboxFrame,
  type PlaySandboxMessagePort,
} from './play-sandbox.js'

class FakePort implements PlaySandboxMessagePort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly messages: unknown[] = []
  closed = false

  postMessage(message: unknown): void {
    this.messages.push(message)
  }

  start(): void {}

  close(): void {
    this.closed = true
  }

  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

function createHarness() {
  const host = document.createElement('div')
  const frame = document.createElement('iframe') as PlaySandboxFrame
  const runtimePort = new FakePort()
  const transferPort = new FakePort()
  const postMessage = vi.fn()
  Object.defineProperty(frame, 'contentWindow', {
    value: { postMessage },
    configurable: true,
  })
  const createFrame = vi.fn(() => frame)
  const createChannel = vi.fn(() => ({ port1: runtimePort, port2: transferPort }))

  return {
    host,
    frame,
    runtimePort,
    transferPort,
    postMessage,
    createFrame,
    createChannel,
  }
}

describe('disposable Play sandbox', () => {
  it('uses an opaque-origin iframe and a dedicated channel with only serialized runtime data', () => {
    const harness = createHarness()
    const capabilities = { audio: { enabled: true }, labels: ['score'] }

    const session = createPlaySandbox({
      trustMode: 'local-trusted',
      bundle: 'globalThis.hakuStarted = true',
      approvedCapabilities: capabilities,
      host: harness.host,
      createFrame: harness.createFrame,
      createChannel: harness.createChannel,
      timeoutMs: 1_000,
    })
    harness.frame.dispatchEvent(new Event('load'))

    expect(harness.frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(harness.frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(harness.postMessage).toHaveBeenCalledWith(
      { type: 'haku-play:connect' },
      '*',
      [harness.transferPort],
    )
    expect(harness.runtimePort.messages).toEqual([
      {
        type: 'haku-play:start',
        bundle: 'globalThis.hakuStarted = true',
        capabilities,
      },
    ])
    expect(harness.runtimePort.messages[0]).not.toHaveProperty('document')
    expect(harness.runtimePort.messages[0]).not.toHaveProperty('fileHandle')
    expect(session.frame).toBe(harness.frame)
    session.dispose()
  })

  it('rejects untrusted code and non-serializable capability data before creating a frame', () => {
    const harness = createHarness()

    expect(() =>
      createPlaySandbox({
        trustMode: 'imported-untrusted',
        bundle: 'throw new Error("must not execute")',
        approvedCapabilities: {},
        host: harness.host,
        createFrame: harness.createFrame,
        createChannel: harness.createChannel,
      }),
    ).toThrow('Imported untrusted code cannot run in Play.')
    expect(() =>
      createPlaySandbox({
        trustMode: 'local-trusted',
        bundle: 'export {}',
        approvedCapabilities: { file: document.body },
        host: harness.host,
        createFrame: harness.createFrame,
        createChannel: harness.createChannel,
      }),
    ).toThrow('Play capability data must contain only serializable values.')
    expect(harness.createFrame).not.toHaveBeenCalled()
    expect(harness.createChannel).not.toHaveBeenCalled()
  })

  it.each([
    ['success', { type: 'haku-play:success' }],
    ['crash', { type: 'haku-play:crash', message: 'boom' }],
  ])('closes and removes the sandbox after %s without touching editor state', async (_, message) => {
    const harness = createHarness()
    const editorState = { revision: 7, selection: ['entity-a'] }
    const before = structuredClone(editorState)
    const session = createPlaySandbox({
      trustMode: 'built-in',
      bundle: 'export {}',
      approvedCapabilities: {},
      host: harness.host,
      createFrame: harness.createFrame,
      createChannel: harness.createChannel,
      timeoutMs: 1_000,
    })
    harness.frame.dispatchEvent(new Event('load'))

    harness.runtimePort.receive(message)
    await expect(session.completion).resolves.toMatchObject(message)

    expect(harness.host.contains(harness.frame)).toBe(false)
    expect(harness.runtimePort.closed).toBe(true)
    expect(harness.transferPort.closed).toBe(true)
    expect(editorState).toEqual(before)
  })

  it('destroys a runaway sandbox on timeout without touching editor state', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    const editorState = { revision: 7, selection: ['entity-a'] }
    const before = structuredClone(editorState)
    const session = createPlaySandbox({
      trustMode: 'local-trusted',
      bundle: 'while (true) {}',
      approvedCapabilities: {},
      host: harness.host,
      createFrame: harness.createFrame,
      createChannel: harness.createChannel,
      timeoutMs: 250,
    })
    harness.frame.dispatchEvent(new Event('load'))

    await vi.advanceTimersByTimeAsync(250)

    await expect(session.completion).resolves.toEqual({
      type: 'haku-play:timeout',
      message: 'Play exceeded the 250ms timeout.',
    })
    expect(harness.host.contains(harness.frame)).toBe(false)
    expect(harness.runtimePort.closed).toBe(true)
    expect(harness.transferPort.closed).toBe(true)
    expect(editorState).toEqual(before)
    vi.useRealTimers()
  })
})
