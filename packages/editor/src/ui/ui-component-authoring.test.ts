import { UIDocumentSchema, type UIDocument, type UIElementId } from '@haku/ui'
import { describe, expect, it } from 'vitest'
import {
  detachUIComponentInstance,
  extractUIComponent,
  placeUIComponentInstance,
  resetUIInstanceOverride,
  setUIInstanceOverride,
} from './ui-component-authoring.js'

const DOCUMENT = '25000000-0000-4000-8000-000000000001'
const ROOT = '25000000-0000-4000-8000-000000000002'
const CARD = '25000000-0000-4000-8000-000000000003'
const BUTTON = '25000000-0000-4000-8000-000000000004'
const COMPONENT = '25000000-0000-4000-8000-000000000005'
const INSTANCE = '25000000-0000-4000-8000-000000000006'

function documentAsset(): UIDocument {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: DOCUMENT,
    name: 'Components',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [CARD],
        layout: { mode: 'vertical' },
        sizing: {
          width: { mode: 'fixed', value: 800, unit: 'px' },
          height: { mode: 'fixed', value: 600, unit: 'px' },
        },
      },
      {
        id: CARD,
        type: 'frame',
        name: 'Card',
        children: [BUTTON],
        layout: { mode: 'vertical', rowGap: 8 },
        sizing: {
          width: { mode: 'fixed', value: 240, unit: 'px' },
          height: { mode: 'hug' },
        },
        style: { backgroundColor: '#123', padding: { top: 8, right: 8, bottom: 8, left: 8 } },
      },
      {
        id: BUTTON,
        type: 'button',
        name: 'Action',
        text: 'Continue',
        accessibility: { label: 'Continue' },
      },
    ],
  })
}

function ids(...values: string[]): () => string {
  return () => values.shift() ?? crypto.randomUUID()
}

describe('UI component authoring transforms', () => {
  it('extracts a subtree into a master and remaps its parent to an equivalent instance', () => {
    const result = extractUIComponent(
      documentAsset(),
      CARD as UIElementId,
      'Card',
      ids(COMPONENT, INSTANCE),
    )

    expect(result.componentId).toBe(COMPONENT)
    expect(result.instanceId).toBe(INSTANCE)
    expect(result.asset.elements.map((element) => element.id)).toEqual([ROOT, INSTANCE])
    expect(result.asset.elements[0]).toMatchObject({ children: [INSTANCE] })
    expect(result.asset.elements[1]).toMatchObject({
      id: INSTANCE,
      type: 'instance',
      component: COMPONENT,
      sizing: documentAsset().elements[1]!.sizing,
      placement: documentAsset().elements[1]!.placement,
      overrides: {},
    })
    expect(result.asset.components[0]).toMatchObject({
      id: COMPONENT,
      name: 'Card',
      root: CARD,
      elements: [
        expect.objectContaining({ id: CARD, children: [BUTTON] }),
        expect.objectContaining({ id: BUTTON, text: 'Continue' }),
      ],
    })
  })

  it('materializes allowed overrides and recursively detaches with globally fresh IDs', () => {
    const extracted = extractUIComponent(
      documentAsset(),
      CARD as UIElementId,
      'Card',
      ids(COMPONENT, INSTANCE),
    ).asset
    const overridden = setUIInstanceOverride(
      extracted,
      INSTANCE as UIElementId,
      BUTTON as UIElementId,
      {
        text: 'Retry',
        style: { color: '#f00' },
      },
    )
    const detached = detachUIComponentInstance(
      overridden,
      INSTANCE as UIElementId,
      ids('25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000011'),
    )

    expect(detached.rootId).toBe('25000000-0000-4000-8000-000000000010')
    expect(detached.asset.elements[0]).toMatchObject({
      children: ['25000000-0000-4000-8000-000000000010'],
    })
    expect(detached.asset.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '25000000-0000-4000-8000-000000000010',
          type: 'frame',
          children: ['25000000-0000-4000-8000-000000000011'],
          style: expect.objectContaining({ backgroundColor: '#123' }),
        }),
        expect.objectContaining({
          id: '25000000-0000-4000-8000-000000000011',
          type: 'button',
          text: 'Retry',
          style: expect.objectContaining({ color: '#f00' }),
        }),
      ]),
    )
    expect(new Set(detached.asset.elements.map((element) => element.id)).size).toBe(
      detached.asset.elements.length,
    )
  })

  it('resets one sparse override without changing neighboring instance values', () => {
    const extracted = extractUIComponent(
      documentAsset(),
      CARD as UIElementId,
      'Card',
      ids(COMPONENT, INSTANCE),
    ).asset
    const overridden = setUIInstanceOverride(
      extracted,
      INSTANCE as UIElementId,
      BUTTON as UIElementId,
      { text: 'Retry' },
    )

    const reset = resetUIInstanceOverride(
      overridden,
      INSTANCE as UIElementId,
      BUTTON as UIElementId,
    )

    expect(reset.elements.find((element) => element.id === INSTANCE)).toMatchObject({
      type: 'instance',
      overrides: {},
    })
    expect(() =>
      resetUIInstanceOverride(reset, INSTANCE as UIElementId, BUTTON as UIElementId),
    ).toThrow('No UI instance override')
  })

  it('places an instance at an exact auto-layout index and rejects generated ID collisions', () => {
    const extracted = extractUIComponent(
      documentAsset(),
      CARD as UIElementId,
      'Card',
      ids(COMPONENT, INSTANCE),
    ).asset
    const placed = placeUIComponentInstance(
      extracted,
      COMPONENT,
      ROOT as UIElementId,
      { index: 0 },
      ids('25000000-0000-4000-8000-000000000012'),
    )

    expect(placed.instanceId).toBe('25000000-0000-4000-8000-000000000012')
    expect(placed.asset.elements[0]).toMatchObject({
      children: ['25000000-0000-4000-8000-000000000012', INSTANCE],
    })
    expect(placed.asset.elements.at(-1)).toMatchObject({
      type: 'instance',
      component: COMPONENT,
      placement: { positioning: 'flow' },
    })

    expect(() =>
      placeUIComponentInstance(extracted, COMPONENT, ROOT as UIElementId, {}, ids(ROOT)),
    ).toThrow('Duplicate generated UI element ID')
  })

  it('rejects the document root and unknown component without mutating the input', () => {
    const asset = documentAsset()
    const before = structuredClone(asset)

    expect(() =>
      extractUIComponent(asset, ROOT as UIElementId, 'Root', ids(COMPONENT, INSTANCE)),
    ).toThrow('document root')
    expect(() =>
      placeUIComponentInstance(asset, COMPONENT, ROOT as UIElementId, {}, ids(INSTANCE)),
    ).toThrow('Unknown UI component')
    expect(asset).toEqual(before)
  })
})
