interface PlaygroundViewportEngine {
  backend: {
    setViewportMode(mode: 'view'): void
    resize(width: number, height: number): void
  }
}

interface CanvasSize {
  clientWidth: number
  clientHeight: number
}

interface ResizeEventTarget {
  addEventListener(type: 'resize', listener: () => void): void
  removeEventListener(type: 'resize', listener: () => void): void
}

export function configurePlaygroundViewport(
  engine: PlaygroundViewportEngine,
  canvas: CanvasSize,
  resizeTarget: ResizeEventTarget = window,
): () => void {
  engine.backend.setViewportMode('view')

  const resize = () => {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      engine.backend.resize(canvas.clientWidth, canvas.clientHeight)
    }
  }

  resize()
  resizeTarget.addEventListener('resize', resize)
  return () => resizeTarget.removeEventListener('resize', resize)
}
