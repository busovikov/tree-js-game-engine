// @vitest-environment happy-dom

import { assetId } from '@haku/schema'
import { UIDocumentSchema, UIService, type UIRuntimeEvent } from '@haku/ui'
import { describe, expect, it, vi } from 'vitest'
import {
  createBounceRunUIGameplayAdapter,
  resolveBounceRunUITargets,
} from './ui-gameplay-adapter.js'

const id = (value: number): string =>
  `b1700000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const DOCUMENT = assetId(id(1))
const ROOT = id(2)
const STATUS = id(3)
const SCORE = id(4)
const BEST = id(5)
const PROGRESS = id(6)
const START = id(7)
const MASTER_MUTED = id(8)
const MASTER_VOLUME = id(9)
const START_EVENT = id(20)
const MUTED_EVENT = id(21)
const VOLUME_EVENT = id(22)

function mountFixture() {
  const service = new UIService()
  const documentAsset = UIDocumentSchema.parse({
    schemaVersion: 2,
    id: DOCUMENT,
    name: 'Bounce Run adapter fixture',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [STATUS, SCORE, BEST, PROGRESS, START, MASTER_MUTED, MASTER_VOLUME],
        layout: { mode: 'vertical' },
      },
      { id: STATUS, type: 'text', name: 'Session status', text: 'start' },
      { id: SCORE, type: 'text', name: 'Score', text: 'Score 0' },
      { id: BEST, type: 'text', name: 'Best score', text: 'Best 0' },
      {
        id: PROGRESS,
        type: 'progress',
        name: 'Route progress',
        min: 0,
        max: 1,
        value: 0,
        accessibility: { label: 'Route progress' },
      },
      { id: START, type: 'button', text: 'Start', events: { activate: START_EVENT } },
      {
        id: MASTER_MUTED,
        type: 'switch',
        value: false,
        label: 'Mute audio',
        events: { change: MUTED_EVENT },
      },
      {
        id: MASTER_VOLUME,
        type: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        value: 0.8,
        accessibility: { label: 'Master volume' },
        events: { input: VOLUME_EVENT },
      },
    ],
    events: [
      { id: START_EVENT, name: 'start-session', payload: 'none' },
      { id: MUTED_EVENT, name: 'set-master-muted', payload: 'boolean' },
      { id: VOLUME_EVENT, name: 'set-master-volume', payload: 'number' },
    ],
  })
  service.register(documentAsset)
  const instance = service.mount(DOCUMENT, document.createElement('div'))
  const adapter = createBounceRunUIGameplayAdapter({
    ui: service,
    document: documentAsset,
  })
  return { adapter, instance, service }
}

describe('Bounce Run UI gameplay adapter', () => {
  it('updates status, score, best, and progress without emitting user events', () => {
    const { adapter, instance, service } = mountFixture()
    const listener = vi.fn()
    service.subscribe(listener)

    adapter.updateHud({ status: 'active', score: 12, bestScore: 40, progress: 0.35 })

    expect(instance.getElement(STATUS)?.textContent).toBe('active')
    expect(instance.getElement(SCORE)?.textContent).toBe('Score 12')
    expect(instance.getElement(BEST)?.textContent).toBe('Best 40')
    expect(instance.getValue(PROGRESS)).toBe(0.35)
    expect(listener).not.toHaveBeenCalled()
  })

  it('rejects an invalid snapshot before mutating any HUD target', () => {
    const { adapter, instance } = mountFixture()

    expect(() =>
      adapter.updateHud({ status: 'active', score: 12, bestScore: 40, progress: Number.NaN }),
    ).toThrow('Bounce Run HUD progress must be a finite number from 0 to 1')

    expect(instance.getElement(STATUS)?.textContent).toBe('start')
    expect(instance.getElement(SCORE)?.textContent).toBe('Score 0')
    expect(instance.getElement(BEST)?.textContent).toBe('Best 0')
    expect(instance.getValue(PROGRESS)).toBe(0)
  })

  it('forwards typed user events from its document exactly once and stops after disposal', () => {
    const { adapter, instance } = mountFixture()
    const events: Array<UIRuntimeEvent & { readonly bindingName: string }> = []
    adapter.subscribe((event) => events.push(event))

    instance.getElement(START)?.click()
    const volume = instance.getElement(MASTER_VOLUME) as HTMLInputElement
    volume.value = '0.4'
    volume.dispatchEvent(new Event('input', { bubbles: true }))

    expect(
      events.map(({ bindingId, bindingName, type, value }) => ({
        bindingId,
        bindingName,
        type,
        value,
      })),
    ).toEqual([
      {
        bindingId: START_EVENT,
        bindingName: 'start-session',
        type: 'activate',
        value: undefined,
      },
      {
        bindingId: VOLUME_EVENT,
        bindingName: 'set-master-volume',
        type: 'input',
        value: 0.4,
      },
    ])

    adapter.dispose()
    ;(instance.getElement(MASTER_MUTED) as HTMLInputElement).click()
    expect(events).toHaveLength(2)
  })

  it('keeps progress optional until the authored HUD adds its stable name', () => {
    const documentAsset = UIDocumentSchema.parse({
      schemaVersion: 2,
      id: DOCUMENT,
      name: 'Partial Bounce Run HUD',
      root: ROOT,
      elements: [
        {
          id: ROOT,
          type: 'frame',
          children: [STATUS, SCORE, BEST],
          layout: { mode: 'vertical' },
        },
        { id: STATUS, type: 'text', name: 'Session status', text: 'start' },
        { id: SCORE, type: 'text', name: 'Score', text: 'Score 0' },
        { id: BEST, type: 'text', name: 'Best score', text: 'Best 0' },
      ],
    })

    expect(resolveBounceRunUITargets(documentAsset)).toEqual({
      statusText: STATUS,
      scoreText: SCORE,
      bestScoreText: BEST,
      progress: undefined,
    })
  })
})
