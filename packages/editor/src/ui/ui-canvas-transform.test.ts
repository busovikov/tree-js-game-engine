import { describe, expect, it } from 'vitest'
import {
  canvasPointToDocument,
  fitCanvasBounds,
  fitCanvasView,
  panCanvasView,
  resizeCanvasView,
  setCanvasZoom,
} from './ui-canvas-transform.js'

describe('UI canvas transform', () => {
  it('centers and fits the complete root with bounded zoom', () => {
    expect(fitCanvasView({ width: 1000, height: 800 }, { width: 1280, height: 720 }, 32)).toEqual({
      scale: 0.73125,
      x: 32,
      y: 136.75,
    })
    expect(fitCanvasView({ width: 100, height: 100 }, { width: 1, height: 1 }, 0).scale).toBe(8)
    expect(
      fitCanvasView({ width: 100, height: 100 }, { width: 10000, height: 10000 }, 0).scale,
    ).toBe(0.1)
  })

  it('maps 100% to exactly one CSS pixel per document pixel', () => {
    const view = setCanvasZoom({ scale: 0.5, x: 250, y: 200 }, 1, { x: 500, y: 400 })

    expect(view).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('preserves the document point under the canvas center across resize', () => {
    const resized = resizeCanvasView(
      { scale: 0.5, x: 100, y: 50 },
      { width: 1000, height: 800 },
      { width: 1200, height: 700 },
    )

    expect(resized).toEqual({ scale: 0.5, x: 200, y: 0 })
  })

  it('pans in canvas pixels and converts pointer coordinates to document space', () => {
    const view = panCanvasView({ scale: 2, x: 100, y: 50 }, { x: -20, y: 30 })

    expect(view).toEqual({ scale: 2, x: 80, y: 80 })
    expect(canvasPointToDocument({ x: 280, y: 180 }, view)).toEqual({ x: 100, y: 50 })
  })

  it('fits an arbitrary selection bounds under the cursor-independent canvas padding', () => {
    const fitted = fitCanvasBounds(
      { width: 1000, height: 800 },
      { x: 400, y: 200, width: 200, height: 100 },
      40,
    )

    expect(fitted.scale).toBeCloseTo(4.6)
    expect(fitted.x).toBeCloseTo(-1800)
    expect(fitted.y).toBeCloseTo(-750)
  })
})
