import { describe, expect, it } from 'vitest'
import {
  cycleCanvasHit,
  orderCanvasHits,
  reduceUISelection,
  type UICanvasHit,
} from './ui-canvas-selection.js'

const ROOT = 'root'
const FRAME = 'frame'
const BACK = 'back'
const FRONT = 'front'

describe('UI canvas hit ordering', () => {
  const hits: readonly UICanvasHit[] = [
    { id: ROOT, paintOrder: 0, depth: 0 },
    { id: FRAME, paintOrder: 1, depth: 1 },
    { id: BACK, paintOrder: 2, depth: 2 },
    { id: FRONT, paintOrder: 3, depth: 2 },
  ]

  it('orders the topmost deepest selectable renderer node first', () => {
    expect(orderCanvasHits(hits)).toEqual([FRONT, BACK, FRAME, ROOT])
  })

  it('excludes hidden and editor-locked elements while keeping disabled widgets selectable', () => {
    expect(
      orderCanvasHits([
        { id: 'hidden', paintOrder: 4, depth: 1, hidden: true },
        { id: 'locked', paintOrder: 3, depth: 1, editorLocked: true },
        { id: 'disabled', paintOrder: 2, depth: 1, disabled: true },
      ]),
    ).toEqual(['disabled'])
  })

  it('cycles overlaps deterministically from the current primary selection', () => {
    const ordered = orderCanvasHits(hits)
    expect(cycleCanvasHit(ordered, FRONT)).toBe(BACK)
    expect(cycleCanvasHit(ordered, ROOT)).toBe(FRONT)
    expect(cycleCanvasHit(ordered, 'missing')).toBe(FRONT)
  })
})

describe('UI selection reducer', () => {
  const parentById = new Map([
    [ROOT, null],
    [FRAME, ROOT],
    [BACK, FRAME],
    [FRONT, FRAME],
    ['other', ROOT],
  ])

  it('replaces selection for a normal click and toggles siblings for a modified click', () => {
    expect(reduceUISelection([BACK], { type: 'replace', id: FRONT }, parentById)).toEqual([FRONT])
    expect(reduceUISelection([BACK], { type: 'toggle', id: FRONT }, parentById)).toEqual([
      BACK,
      FRONT,
    ])
    expect(reduceUISelection([BACK, FRONT], { type: 'toggle', id: BACK }, parentById)).toEqual([
      FRONT,
    ])
  })

  it('rejects multi-selection without a common coordinate space', () => {
    expect(reduceUISelection([BACK], { type: 'toggle', id: 'other' }, parentById)).toEqual([
      'other',
    ])
  })

  it('restores a valid primary selection when replacement removes selected elements', () => {
    expect(
      reduceUISelection([BACK, FRONT], { type: 'reconcile', validIds: new Set([ROOT, FRONT]) }, parentById),
    ).toEqual([FRONT])
    expect(
      reduceUISelection([BACK], { type: 'reconcile', validIds: new Set([ROOT]), fallback: ROOT }, parentById),
    ).toEqual([ROOT])
  })
})
