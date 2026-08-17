/**
 * @vitest-environment happy-dom
 */
import { TEXTURE_ASSET_TYPE, assetId, assetRef } from '@haku/assets'
import { describe, expect, it, vi } from 'vitest'
import {
  UIDocumentInstance,
  UIDocumentSchema,
  UIService,
  UI_DOCUMENT_ASSET_DESCRIPTOR,
} from './index.js'

const ROOT = '23000000-0000-4000-8000-000000000001'
const TEXT = '23000000-0000-4000-8000-000000000002'
const BUTTON = '23000000-0000-4000-8000-000000000003'
const IMAGE = '23000000-0000-4000-8000-000000000004'
const EVENT = '23000000-0000-4000-8000-000000000005'
const DOCUMENT = '23000000-0000-4000-8000-000000000006'
const TEXTURE = '23000000-0000-4000-8000-000000000007'

function uiDocument() {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: DOCUMENT,
    name: 'Runtime boundary',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [TEXT, BUTTON, IMAGE],
        layout: { mode: 'horizontal', alignment: 'center', distribution: 'space-between', columnGap: 8 },
        sizing: { width: { mode: 'fixed', value: 800, unit: 'px' }, height: { mode: 'fixed', value: 80, unit: 'px' } },
      },
      { id: TEXT, type: 'text', text: 'Score 0' },
      { id: BUTTON, type: 'button', text: 'Continue', events: { activate: EVENT }, accessibility: { label: 'Continue game' } },
      { id: IMAGE, type: 'image', source: assetRef(assetId(TEXTURE), TEXTURE_ASSET_TYPE), alt: 'Golden star' },
    ],
    events: [{ id: EVENT, name: 'continue', payload: 'none' }],
    components: [],
    themes: [],
  })
}

describe('v2 runtime behavior', () => {
  it('translates free constraints and explicit auto-layout absolute positioning', () => {
    const freeChild = '23000000-0000-4000-8000-000000000010'
    const absoluteChild = '23000000-0000-4000-8000-000000000011'
    const autoFrame = '23000000-0000-4000-8000-000000000012'
    const asset = UIDocumentSchema.parse({
      schemaVersion: 2,
      id: '23000000-0000-4000-8000-000000000013',
      name: 'Constraints',
      root: ROOT,
      elements: [
        { id: ROOT, type: 'frame', children: [freeChild, autoFrame], layout: { mode: 'free' }, sizing: { width: { mode: 'fixed', value: 400, unit: 'px' }, height: { mode: 'fixed', value: 300, unit: 'px' } } },
        { id: freeChild, type: 'rectangle', sizing: { width: { mode: 'fixed', value: 100, unit: 'px' }, height: { mode: 'fixed', value: 40, unit: 'px' } }, placement: { positioning: 'free', x: 20, y: 30, horizontalConstraint: 'right', verticalConstraint: 'top-bottom', referenceWidth: 400, referenceHeight: 300 } },
        { id: autoFrame, type: 'frame', children: [absoluteChild], layout: { mode: 'vertical' }, placement: { positioning: 'free', x: 0, y: 0, horizontalConstraint: 'left', verticalConstraint: 'top', referenceWidth: 400, referenceHeight: 300 } },
        { id: absoluteChild, type: 'text', text: 'Overlay', placement: { positioning: 'absolute', right: 5, bottom: 6 } },
      ],
    })
    const instance = new UIDocumentInstance(asset)
    instance.mount(document.createElement('div'))

    expect(instance.getElement(freeChild)?.style).toMatchObject({ position: 'absolute', right: '280px', top: '30px', bottom: '230px' })
    expect(instance.getElement(absoluteChild)?.style).toMatchObject({ position: 'absolute', right: '5px', bottom: '6px' })
  })

  it('reports asset references and requires resolver failures before host mutation', () => {
    expect(UI_DOCUMENT_ASSET_DESCRIPTOR.dependencies(uiDocument())).toEqual([
      assetRef(assetId(TEXTURE), TEXTURE_ASSET_TYPE),
    ])
    const host = document.createElement('div')
    host.textContent = 'unchanged'
    expect(() => new UIDocumentInstance(uiDocument()).mount(host)).toThrow(/requires an asset resolver/)
    expect(host.textContent).toBe('unchanged')
  })
})

describe('UIService v2 boundary', () => {
  it('owns explicit mounted mutations, typed values, events, and destruction', () => {
    const service = new UIService()
    const listener = vi.fn()
    const host = document.createElement('div')
    service.register(uiDocument())
    service.mount(assetId(DOCUMENT), host, { assets: { resolve: () => '/star.png' } })
    service.subscribe(listener)

    service.setText({ document: assetId(DOCUMENT), element: TEXT }, 'Score 25')
    ;(service.require(assetId(DOCUMENT)).getElement(BUTTON) as HTMLButtonElement).click()
    expect(service.require(assetId(DOCUMENT)).getElement(TEXT)?.textContent).toBe('Score 25')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ bindingId: EVENT, elementId: BUTTON }))

    service.destroy(assetId(DOCUMENT))
    expect(host.childElementCount).toBe(0)
    expect(() => service.require(assetId(DOCUMENT))).toThrow(/not mounted/)
  })

  it('rejects duplicate registration, unknown mount, unsupported targets, and double mount', () => {
    const service = new UIService()
    service.register(uiDocument())
    expect(() => service.register(uiDocument())).toThrow(/already registered/)
    expect(() => service.mount(assetId('23000000-0000-4000-8000-000000000099'), document.createElement('div'))).toThrow(/Unknown UI document/)
    service.mount(assetId(DOCUMENT), document.createElement('div'), { assets: { resolve: () => '/star.png' } })
    expect(() => service.mount(assetId(DOCUMENT), document.createElement('div'))).toThrow(/already mounted/)
    expect(() => service.setText({ document: assetId(DOCUMENT), element: IMAGE }, 'bad')).toThrow(/does not contain text/)
    expect(() => service.setVisible({ document: assetId(DOCUMENT), element: '23000000-0000-4000-8000-000000000098' }, true)).toThrow(/Unknown UI element/)
  })
})
