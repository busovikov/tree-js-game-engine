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
const NESTED_A = '25000000-0000-4000-8000-000000000007'
const NESTED_B = '25000000-0000-4000-8000-000000000008'
const LEAF_COMPONENT = '25000000-0000-4000-8000-000000000009'
const LEAF_ROOT = '25000000-0000-4000-8000-000000000010'
const THEME = '25000000-0000-4000-8000-000000000011'

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

function nestedThemeDocument(): UIDocument {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: DOCUMENT,
    name: 'Nested themed components',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [INSTANCE],
        layout: { mode: 'free' },
        sizing: {
          width: { mode: 'fixed', value: 800, unit: 'px' },
          height: { mode: 'fixed', value: 600, unit: 'px' },
        },
      },
      {
        id: INSTANCE,
        type: 'instance',
        component: COMPONENT,
        placement: {
          positioning: 'free',
          x: 37,
          y: 42,
          horizontalConstraint: 'left',
          verticalConstraint: 'top',
          referenceWidth: 800,
          referenceHeight: 600,
        },
        sizing: {
          width: { mode: 'fixed', value: 260, unit: 'px' },
          height: { mode: 'hug' },
        },
        style: { backgroundColor: '#222222' },
        accessibility: { description: 'Placed card' },
        overrides: {
          [CARD]: {
            style: { borderRadius: 9 },
            accessibility: { label: 'Overridden card' },
          },
          [NESTED_A]: { style: { color: '#0000ff' } },
        },
      },
    ],
    components: [
      {
        id: COMPONENT,
        name: 'Card',
        root: CARD,
        elements: [
          {
            id: CARD,
            type: 'frame',
            children: [NESTED_A, NESTED_B],
            layout: { mode: 'horizontal', columnGap: 4 },
            style: { backgroundColor: '#111111' },
            accessibility: { role: 'region', label: 'Card' },
          },
          {
            id: NESTED_A,
            type: 'instance',
            component: LEAF_COMPONENT,
            overrides: { [LEAF_ROOT]: { text: 'Retry' } },
          },
          { id: NESTED_B, type: 'instance', component: LEAF_COMPONENT },
        ],
      },
      {
        id: LEAF_COMPONENT,
        name: 'Label',
        root: LEAF_ROOT,
        elements: [{ id: LEAF_ROOT, type: 'text', text: 'Continue', style: { color: '#000000' } }],
      },
    ],
    themes: [
      {
        id: THEME,
        name: 'Game',
        styles: {
          [CARD]: { backgroundColor: '#333333', color: '#dddddd' },
          [LEAF_ROOT]: { color: '#ff0000', fontSize: 14 },
          [NESTED_A]: { color: '#00ff00' },
          [INSTANCE]: { backgroundColor: '#444444', opacity: 0.75 },
        },
      },
    ],
    defaultTheme: THEME,
  })
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
    expect(detached.asset.elements.find((element) => element.id === detached.rootId)).toMatchObject(
      {
        placement: { positioning: 'flow' },
      },
    )
  })

  it('detaches repeated nested instances with root overrides, free placement, and remapped themes', () => {
    const asset = nestedThemeDocument()
    const before = structuredClone(asset)
    const detached = detachUIComponentInstance(
      asset,
      INSTANCE as UIElementId,
      ids(
        '25000000-0000-4000-8000-000000000020',
        '25000000-0000-4000-8000-000000000021',
        '25000000-0000-4000-8000-000000000022',
      ),
    )

    expect(asset).toEqual(before)
    expect(detached.rootId).toBe('25000000-0000-4000-8000-000000000020')
    expect(detached.asset.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: detached.rootId,
          type: 'frame',
          children: [
            '25000000-0000-4000-8000-000000000021',
            '25000000-0000-4000-8000-000000000022',
          ],
          placement: expect.objectContaining({ positioning: 'free', x: 37, y: 42 }),
          sizing: expect.objectContaining({
            width: { mode: 'fixed', value: 260, unit: 'px' },
          }),
          style: expect.objectContaining({ backgroundColor: '#222222', borderRadius: 9 }),
          accessibility: expect.objectContaining({
            role: 'region',
            label: 'Overridden card',
            description: 'Placed card',
          }),
        }),
        expect.objectContaining({
          id: '25000000-0000-4000-8000-000000000021',
          type: 'text',
          text: 'Retry',
          style: expect.objectContaining({ color: '#0000ff' }),
        }),
        expect.objectContaining({
          id: '25000000-0000-4000-8000-000000000022',
          type: 'text',
          text: 'Continue',
          style: expect.objectContaining({ color: '#000000' }),
        }),
      ]),
    )
    expect(detached.asset.themes[0]?.styles).not.toHaveProperty(INSTANCE)
    expect(detached.asset.themes[0]?.styles[detached.rootId]).toMatchObject({
      backgroundColor: '#444444',
      color: '#dddddd',
      opacity: 0.75,
    })
    expect(detached.asset.themes[0]?.styles['25000000-0000-4000-8000-000000000021']).toMatchObject({
      color: '#00ff00',
      fontSize: 14,
    })
    expect(detached.asset.themes[0]?.styles['25000000-0000-4000-8000-000000000022']).toMatchObject({
      color: '#ff0000',
      fontSize: 14,
    })
    expect(new Set(detached.asset.elements.map((element) => element.id)).size).toBe(
      detached.asset.elements.length,
    )

    expect(() => detachUIComponentInstance(asset, INSTANCE as UIElementId, ids(LEAF_ROOT))).toThrow(
      'Duplicate generated UI element ID',
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

  it('rejects direct and indirect nested component insertion cycles before generating an ID', () => {
    const extracted = extractUIComponent(
      documentAsset(),
      CARD as UIElementId,
      'Card',
      ids(COMPONENT, INSTANCE),
    ).asset
    const dependentComponent = '25000000-0000-4000-8000-000000000030'
    const dependentRoot = '25000000-0000-4000-8000-000000000031'
    const dependentInstance = '25000000-0000-4000-8000-000000000032'
    const withDependency = UIDocumentSchema.parse({
      ...extracted,
      components: [
        ...extracted.components,
        {
          id: dependentComponent,
          name: 'Dependent',
          root: dependentRoot,
          elements: [
            {
              id: dependentRoot,
              type: 'frame',
              children: [dependentInstance],
              layout: { mode: 'vertical' },
            },
            {
              id: dependentInstance,
              type: 'instance',
              component: COMPONENT,
            },
          ],
        },
      ],
    })
    let generated = false
    const uuid = () => {
      generated = true
      return '25000000-0000-4000-8000-000000000033'
    }

    expect(() =>
      placeUIComponentInstance(extracted, COMPONENT, CARD as UIElementId, {}, uuid),
    ).toThrow(`UI component insertion cycle: ${COMPONENT} -> ${COMPONENT}`)
    expect(generated).toBe(false)
    expect(() =>
      placeUIComponentInstance(withDependency, dependentComponent, CARD as UIElementId, {}, uuid),
    ).toThrow(`UI component insertion cycle: ${COMPONENT} -> ${dependentComponent} -> ${COMPONENT}`)
    expect(generated).toBe(false)
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
