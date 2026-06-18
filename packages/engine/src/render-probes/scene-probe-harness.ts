import { createRequire } from 'node:module'
import * as THREE from 'three'
import type { RenderSettings, SceneDocument } from '@haku/schema'
import { defaultRenderSettings } from '@haku/schema'
import { loadSceneDocument } from '@haku/serializer'
import { RenderSyncSystem } from '../render-sync/render-sync-system.js'
import { applyShadowSettings } from '../render/apply-render-settings.js'
import { applyToneMappingSettings } from '../render/apply-render-settings.js'

export interface ProbeCamera {
  position: [number, number, number]
  target: [number, number, number]
  fov?: number
}

export interface PixelProbe {
  id: string
  /** Normalized viewport coordinates 0..1 (origin top-left). */
  uv: [number, number]
}

export interface SyncedScene {
  scene: THREE.Scene
  sync: RenderSyncSystem
  world: ReturnType<typeof loadSceneDocument>
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer | null
  dispose: () => void
}

const require = createRequire(import.meta.url)

function createHeadlessRenderer(
  width: number,
  height: number,
): THREE.WebGLRenderer | null {
  try {
    const createContext = (
      require('gl') as (w: number, h: number, opts?: object) => WebGLRenderingContext
    )
    const context = createContext(width, height, { preserveDrawingBuffer: true })
    const canvas = {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      style: {},
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getContext: (type: string) =>
        type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl'
          ? context
          : null,
    } as unknown as HTMLCanvasElement

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context,
      antialias: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    return renderer
  } catch {
    return null
  }
}

export function loadSyncedScene(
  document: SceneDocument,
  cameraConfig: ProbeCamera,
  renderSettings: RenderSettings = document.renderSettings ?? defaultRenderSettings(),
  renderSize = 256,
): SyncedScene {
  const world = loadSceneDocument(document)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(renderSettings.background.color)

  const sync = new RenderSyncSystem(scene)
  sync.setRenderSettings(renderSettings)
  sync.attach(world)

  const camera = new THREE.PerspectiveCamera(
    cameraConfig.fov ?? 50,
    1,
    0.1,
    500,
  )
  camera.position.set(...cameraConfig.position)
  camera.lookAt(...cameraConfig.target)
  camera.updateMatrixWorld(true)

  const renderer = createHeadlessRenderer(renderSize, renderSize)
  if (renderer) {
    applyShadowSettings(renderer, renderSettings)
    applyToneMappingSettings(renderer, renderSettings)
    const ambient = renderSettings.ambient
    scene.add(new THREE.AmbientLight(ambient.color, ambient.intensity))
  }

  return {
    scene,
    sync,
    world,
    camera,
    renderer,
    dispose: () => {
      renderer?.dispose()
      sync.detach()
    },
  }
}

export function renderFrame(synced: SyncedScene, renderSettings: RenderSettings): void {
  synced.sync.setRenderSettings(renderSettings)
  synced.sync.update(synced.world)
  synced.scene.updateMatrixWorld(true)
  synced.sync.updateDirectionalShadowRigs(synced.camera)

  if (!synced.renderer) return
  applyShadowSettings(synced.renderer, renderSettings)
  synced.renderer.render(synced.scene, synced.camera)
}

export function readProbeRgb(
  renderer: THREE.WebGLRenderer,
  uv: [number, number],
): [number, number, number] {
  const gl = renderer.getContext()
  const width = gl.drawingBufferWidth
  const height = gl.drawingBufferHeight
  const x = Math.min(width - 1, Math.max(0, Math.round(uv[0] * (width - 1))))
  const y = Math.min(height - 1, Math.max(0, Math.round((1 - uv[1]) * (height - 1))))
  const buf = new Uint8Array(4)
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)
  return [buf[0], buf[1], buf[2]]
}

export function findDirectionalWorldDirection(scene: THREE.Scene): THREE.Vector3 | null {
  let dir: THREE.Vector3 | null = null
  scene.traverse((obj) => {
    if (dir || !(obj instanceof THREE.DirectionalLight)) return
    const lightPos = new THREE.Vector3()
    const targetPos = new THREE.Vector3()
    obj.getWorldPosition(lightPos)
    obj.target.getWorldPosition(targetPos)
    dir = targetPos.sub(lightPos).normalize()
  })
  return dir
}

/** Lambert term: `normal · direction_to_light`. */
export function directionalDiffuseAt(
  normal: THREE.Vector3,
  lightTravelDirection: THREE.Vector3,
): number {
  const toLight = lightTravelDirection.clone().negate()
  return Math.max(0, normal.dot(toLight))
}

export function hasWebGLProbes(): boolean {
  return createHeadlessRenderer(8, 8) !== null
}
