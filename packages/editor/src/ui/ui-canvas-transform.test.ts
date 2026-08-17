import { describe, expect, it } from 'vitest'
import { fitCanvasView, resizeCanvasView, setCanvasZoom } from './ui-canvas-transform.js'

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
})
