import { describe, expect, it } from 'vitest'
import { UIDocumentSchema, type UIDocument, type UIElementId } from '@haku/ui'
import {
  duplicateUISubtrees,
  moveUIElements,
  resolveUICreationTarget,
  type UIHierarchyBounds,
} from './ui-hierarchy-commands.js'

const ROOT = '14000000-0000-4000-8000-000000000001' as UIElementId
const FREE = '14000000-0000-4000-8000-000000000002' as UIElementId
const AUTO = '14000000-0000-4000-8000-000000000003' as UIElementId
const A = '14000000-0000-4000-8000-000000000004' as UIElementId
const B = '14000000-0000-4000-8000-000000000005' as UIElementId
const C = '14000000-0000-4000-8000-000000000006' as UIElementId
const D = '14000000-0000-4000-8000-000000000007' as UIElementId

const freePlacement = (x: number, y: number) => ({
  positioning: 'free' as const,
  x,
  y,
  horizontalConstraint: 'left' as const,
  verticalConstraint: 'top' as const,
  referenceWidth: 600,
  referenceHeight: 400,
})

function documentFixture(): UIDocument {
  return UIDocumentSchema.parse({
    schemaVersion: 2,
    id: '14000000-0000-4000-8000-000000000020',
    name: 'Hierarchy',
    root: ROOT,
    elements: [
      {
        id: ROOT,
        type: 'frame',
        children: [FREE, AUTO],
        layout: { mode: 'free' },
        sizing: {
          width: { mode: 'fixed', value: 1000, unit: 'px' },
          height: { mode: 'fixed', value: 800, unit: 'px' },
        },
      },
      {
        id: FREE,
        type: 'frame',
        children: [A, B],
        layout: { mode: 'free' },
        placement: freePlacement(100, 50),
        sizing: {
          width: { mode: 'fixed', value: 600, unit: 'px' },
          height: { mode: 'fixed', value: 400, unit: 'px' },
        },
      },
      {
        id: AUTO,
        type: 'frame',
        children: [C, D],
        layout: { mode: 'vertical' },
        placement: freePlacement(750, 100),
        sizing: {
          width: { mode: 'fixed', value: 200, unit: 'px' },
          height: { mode: 'fixed', value: 500, unit: 'px' },
        },
      },
      { id: A, type: 'text', text: 'A', placement: freePlacement(20, 30) },
      { id: B, type: 'text', text: 'B', placement: freePlacement(80, 90) },
      { id: C, type: 'text', text: 'C' },
      { id: D, type: 'text', text: 'D' },
    ],
    components: [
      {
        id: '14000000-0000-4000-8000-000000000030',
        name: 'Component',
        root: '14000000-0000-4000-8000-000000000031',
        elements: [
          {
            id: '14000000-0000-4000-8000-000000000031',
            type: 'frame',
            children: [],
            layout: { mode: 'vertical' },
          },
        ],
      },
    ],
  })
}

describe('UI hierarchy commands', () => {
  it('preserves stable document order when moving multiple siblings at one insertion index', () => {
    const result = moveUIElements(documentFixture(), [D, C], {
      targetId: A,
      position: 'before',
    })

    expect(
      result.elements.find((element) => element.id === FREE && 'children' in element)?.children,
    ).toEqual([C, D, A, B])
  })

  it('preserves visual position when moving free to free parent coordinates', () => {
    const nested = UIDocumentSchema.parse({
      ...documentFixture(),
      elements: documentFixture().elements.map((element) =>
        element.id === B && element.type === 'text'
          ? {
              id: element.id,
              name: element.name,
              type: 'frame' as const,
              children: [],
              layout: { mode: 'free' as const },
              placement: element.placement,
              sizing: {
                width: { mode: 'fixed' as const, value: 200, unit: 'px' as const },
                height: { mode: 'fixed' as const, value: 150, unit: 'px' as const },
              },
            }
          : element,
      ),
    })

    const result = moveUIElements(nested, [A], { targetId: B, position: 'inside' })
    const moved = result.elements.find((element) => element.id === A)!

    expect(moved.placement).toEqual(
      expect.objectContaining({ positioning: 'free', x: -60, y: -60 }),
    )
  })

  it('clears free anchors for auto layout and does not alter flow placement on sibling reorder', () => {
    const intoAuto = moveUIElements(documentFixture(), [A], {
      targetId: C,
      position: 'before',
    })
    expect(intoAuto.elements.find((element) => element.id === A)?.placement).toEqual({
      positioning: 'flow',
    })

    const reordered = moveUIElements(intoAuto, [D], { targetId: C, position: 'before' })
    expect(reordered.elements.find((element) => element.id === D)?.placement).toEqual({
      positioning: 'flow',
    })
  })

  it('creates deterministic free placement without stale anchors when moving auto to free', () => {
    const bounds: UIHierarchyBounds = new Map([
      [C, { x: 760, y: 150, width: 120, height: 48 }],
      [FREE, { x: 100, y: 50, width: 600, height: 400 }],
    ])
    const result = moveUIElements(
      documentFixture(),
      [C],
      { targetId: FREE, position: 'inside' },
      { bounds },
    )
    const moved = result.elements.find((element) => element.id === C)!

    expect(moved.placement).toEqual({
      positioning: 'free',
      x: 660,
      y: 100,
      horizontalConstraint: 'left',
      verticalConstraint: 'top',
      referenceWidth: 600,
      referenceHeight: 400,
    })
  })

  it.each([
    ['root move', [ROOT], { targetId: FREE, position: 'inside' as const }, new Set<UIElementId>()],
    ['cycle', [FREE], { targetId: FREE, position: 'inside' as const }, new Set<UIElementId>()],
    ['locked destination', [A], { targetId: AUTO, position: 'inside' as const }, new Set([AUTO])],
    [
      'cross-component',
      [A],
      {
        targetId: '14000000-0000-4000-8000-000000000031' as UIElementId,
        position: 'inside' as const,
      },
      new Set<UIElementId>(),
    ],
  ])('rejects invalid %s moves before producing a candidate', (_name, ids, target, lockedIds) => {
    expect(() => moveUIElements(documentFixture(), ids, target, { lockedIds })).toThrow()
  })

  it('duplicates a complete subtree with fresh IDs and inserts it after the source', () => {
    const source = documentFixture()
    let sequence = 40
    const result = duplicateUISubtrees(
      source,
      [FREE],
      () => `14000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    )

    const root = result.asset.elements.find((element) => element.id === ROOT)
    expect(root && 'children' in root ? root.children : []).toEqual([FREE, result.ids[0], AUTO])
    expect(result.ids[0]).not.toBe(FREE)
    expect(result.asset.elements).toHaveLength(source.elements.length + 3)
    expect(() => UIDocumentSchema.parse(result.asset)).not.toThrow()
  })
})

describe('UI creation target', () => {
  it('uses pointer frame, selected frame, nearest unlocked frame, then root in that order', () => {
    const asset = documentFixture()
    expect(resolveUICreationTarget(asset, { pointerFrameId: AUTO, selectedId: A }).parentId).toBe(
      AUTO,
    )
    expect(resolveUICreationTarget(asset, { selectedId: FREE }).parentId).toBe(FREE)
    expect(resolveUICreationTarget(asset, { selectedId: A }).parentId).toBe(FREE)
    expect(
      resolveUICreationTarget(asset, { selectedId: A, lockedIds: new Set([FREE]) }).parentId,
    ).toBe(ROOT)
    expect(resolveUICreationTarget(asset, {}).parentId).toBe(ROOT)
  })

  it('inserts after the selected sibling or at an explicit auto-layout marker', () => {
    const asset = documentFixture()
    expect(resolveUICreationTarget(asset, { selectedId: C })).toMatchObject({
      parentId: AUTO,
      index: 1,
    })
    expect(
      resolveUICreationTarget(asset, { pointerFrameId: AUTO, insertionIndex: 0 }),
    ).toMatchObject({
      parentId: AUTO,
      index: 0,
    })
  })
})
