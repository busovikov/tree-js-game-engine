export const UI_CANVAS_MIN_SCALE = 0.1
export const UI_CANVAS_MAX_SCALE = 8

export interface UICanvasSize {
  readonly width: number
  readonly height: number
}

export interface UICanvasPoint {
  readonly x: number
  readonly y: number
}

export interface UICanvasView {
  readonly scale: number
  readonly x: number
  readonly y: number
}

export interface UICanvasBounds extends UICanvasSize, UICanvasPoint {}

function clampScale(scale: number): number {
  return Math.min(UI_CANVAS_MAX_SCALE, Math.max(UI_CANVAS_MIN_SCALE, scale))
}

export function fitCanvasView(
  canvas: UICanvasSize,
  root: UICanvasSize,
  padding = 32,
): UICanvasView {
  const availableWidth = Math.max(0, canvas.width - padding * 2)
  const availableHeight = Math.max(0, canvas.height - padding * 2)
  const scale = clampScale(Math.min(availableWidth / root.width, availableHeight / root.height))
  return {
    scale,
    x: (canvas.width - root.width * scale) / 2,
    y: (canvas.height - root.height * scale) / 2,
  }
}

export function fitCanvasBounds(
  canvas: UICanvasSize,
  bounds: UICanvasBounds,
  padding = 32,
): UICanvasView {
  const fitted = fitCanvasView(canvas, bounds, padding)
  return {
    scale: fitted.scale,
    x: fitted.x - bounds.x * fitted.scale,
    y: fitted.y - bounds.y * fitted.scale,
  }
}

export function setCanvasZoom(
  view: UICanvasView,
  scale: number,
  anchor: UICanvasPoint,
): UICanvasView {
  const nextScale = clampScale(scale)
  const ratio = nextScale / view.scale
  return {
    scale: nextScale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  }
}

export function resizeCanvasView(
  view: UICanvasView,
  previous: UICanvasSize,
  next: UICanvasSize,
): UICanvasView {
  return {
    ...view,
    x: view.x + (next.width - previous.width) / 2,
    y: view.y + (next.height - previous.height) / 2,
  }
}

export function panCanvasView(view: UICanvasView, delta: UICanvasPoint): UICanvasView {
  return { ...view, x: view.x + delta.x, y: view.y + delta.y }
}

export function canvasPointToDocument(point: UICanvasPoint, view: UICanvasView): UICanvasPoint {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale }
}
