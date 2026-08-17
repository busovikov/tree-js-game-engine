/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { TEXTURE_ASSET_TYPE, assetId, assetRef } from '@haku/assets'
import {
  UIDocumentInstance,
  UIDocumentSchema,
  UIService,
  UI_DOCUMENT_ASSET_DESCRIPTOR,
} from './index.js'

const ROOT = '11000000-0000-4000-8000-000000000001'
const LABEL = '11000000-0000-4000-8000-000000000002'
const BUTTON = '11000000-0000-4000-8000-000000000003'
const IMAGE = '11000000-0000-4000-8000-000000000004'
const EVENT = '11000000-0000-4000-8000-000000000005'
const THEME = '11000000-0000-4000-8000-000000000006'
const DOCUMENT = '11000000-0000-4000-8000-000000000007'
const TEXTURE = '11000000-0000-4000-8000-000000000008'
const PANEL_A = '11000000-0000-4000-8000-000000000009'
const PANEL_B = '11000000-0000-4000-8000-000000000010'
const MISSING = '11000000-0000-4000-8000-000000000011'

function uiDocument() {
  return UIDocumentSchema.parse({
    schemaVersion: 1,
    id: DOCUMENT,
    name: 'Runtime HUD',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'container',
        children: [LABEL, BUTTON, IMAGE],
        layout: { direction: 'row', align: 'center', justify: 'space-between', gap: 8 },
        sizing: { width: '100%', height: 80 },
      },
      {
        id: LABEL,
        type: 'text',
        text: 'Score 0',
        anchors: { left: 12, top: 8 },
        accessibility: { live: 'polite' },
      },
      {
        id: BUTTON,
        type: 'button',
        text: 'Continue',
        activateEvent: EVENT,
        accessibility: { label: 'Continue game' },
      },
      {
        id: IMAGE,
        type: 'image',
        source: assetRef(assetId(TEXTURE), TEXTURE_ASSET_TYPE),
        alt: 'Golden star',
        style: { objectFit: 'contain' },
      },
    ],
    events: [{ id: EVENT, name: 'continue', payload: 'none' }],
    themes: [
      {
        id: THEME,
        name: 'Gold',
        styles: {
          [LABEL]: { color: '#ffd54a', fontSize: 24 },
          [BUTTON]: { backgroundColor: '#24344f', borderRadius: 6 },
        },
      },
    ],
    defaultTheme: THEME,
  })
}

describe('UI document schema and DOM behavior', () => {
  it('rejects duplicate, unreachable, and unknown hierarchy references', () => {
    const invalid = {
      schemaVersion: 1,
      id: DOCUMENT,
      name: 'Invalid',
      root: ROOT,
      elements: [
        { id: ROOT, type: 'container', children: [BUTTON] },
        { id: BUTTON, type: 'button', text: 'One' },
        { id: BUTTON, type: 'text', text: 'Duplicate' },
        { id: LABEL, type: 'text', text: 'Unreachable' },
      ],
    }

    const result = UIDocumentSchema.safeParse(invalid)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(
        /Duplicate UI element ID|unreachable/,
      )
    }
  })

  it.each([
    {
      name: 'missing-child',
      elements: [{ id: ROOT, type: 'container', children: [MISSING] }],
      message: /Unknown UI child/,
    },
    {
      name: 'multiply-parented',
      elements: [
        { id: ROOT, type: 'container', children: [PANEL_A, PANEL_B] },
        { id: PANEL_A, type: 'container', children: [LABEL] },
        { id: PANEL_B, type: 'container', children: [LABEL] },
        { id: LABEL, type: 'text', text: 'Shared' },
      ],
      message: /already has parent/,
    },
    {
      name: 'cyclic',
      elements: [
        { id: ROOT, type: 'container', children: [PANEL_A] },
        { id: PANEL_A, type: 'container', children: [ROOT] },
      ],
      message: /UI hierarchy cycle/,
    },
  ])('rejects a $name strict tree', ({ elements, message }) => {
    const result = UIDocumentSchema.safeParse({
      schemaVersion: 1,
      id: DOCUMENT,
      name: 'Invalid tree',
      root: ROOT,
      elements,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join('\n')).toMatch(message)
    }
  })

  it('renders semantic elements, themes, anchors, accessibility, events, and interaction states', () => {
    const host = document.createElement('div')
    const listener = vi.fn()
    const instance = new UIDocumentInstance(uiDocument(), {
      assets: { resolve: () => '/assets/star.png' },
    })
    instance.subscribe(listener)
    instance.mount(host)

    const root = instance.getElement(ROOT)
    const label = instance.getElement(LABEL)
    const button = instance.getElement(BUTTON) as HTMLButtonElement
    const image = instance.getElement(IMAGE) as HTMLImageElement
    expect(root?.style.display).toBe('flex')
    expect(root?.style.width).toBe('100%')
    expect(label?.style.position).toBe('absolute')
    expect(label?.style.color).toBe('#ffd54a')
    expect(label?.getAttribute('aria-live')).toBe('polite')
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('aria-label')).toBe('Continue game')
    expect(image.alt).toBe('Golden star')
    expect(image.src).toContain('/assets/star.png')

    button.click()
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'activate', elementId: BUTTON, eventId: EVENT }),
    )

    instance.setText(LABEL, 'Score 10')
    instance.setVisible(IMAGE, false)
    instance.setEnabled(BUTTON, false)
    expect(instance.getElement(LABEL)?.textContent).toBe('Score 10')
    expect(instance.getElement(IMAGE)?.hidden).toBe(true)
    expect((instance.getElement(BUTTON) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires an image resolver instead of leaking asset paths into the document', () => {
    const instance = new UIDocumentInstance(uiDocument())
    expect(() => instance.mount(document.createElement('div'))).toThrow(
      `UI image ${IMAGE} requires an asset resolver`,
    )
  })

  it('reports image references through the UI asset descriptor closure', () => {
    expect(UI_DOCUMENT_ASSET_DESCRIPTOR.dependencies(uiDocument())).toEqual([
      assetRef(assetId(TEXTURE), TEXTURE_ASSET_TYPE),
    ])
  })
})

describe('UIService', () => {
  it('is the public mutation and event boundary for mounted UI documents', () => {
    const service = new UIService()
    const event = vi.fn()
    const host = document.createElement('div')
    service.register(uiDocument())
    service.mount(assetId(DOCUMENT), host, {
      assets: { resolve: () => '/assets/star.png' },
    })
    service.subscribe(event)

    service.setText({ document: assetId(DOCUMENT), element: LABEL }, 'Score 25')
    service.setVisible({ document: assetId(DOCUMENT), element: IMAGE }, false)
    service.setEnabled({ document: assetId(DOCUMENT), element: BUTTON }, true)
    ;(service.require(assetId(DOCUMENT)).getElement(BUTTON) as HTMLButtonElement).click()

    expect(service.require(assetId(DOCUMENT)).getElement(LABEL)?.textContent).toBe('Score 25')
    expect(service.require(assetId(DOCUMENT)).getElement(IMAGE)?.hidden).toBe(true)
    expect(event).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: DOCUMENT, elementId: BUTTON }),
    )
    service.destroy(assetId(DOCUMENT))
    expect(host.childElementCount).toBe(0)
  })
})
