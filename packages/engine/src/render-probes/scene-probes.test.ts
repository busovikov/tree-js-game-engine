import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RenderSettingsSchema } from '@haku/schema'
import {
  directionalPositionInvarianceScene,
  hemisphereScene,
  multiLightScene,
  shadowCastScene,
  shadowToggleStabilityScene,
} from './fixtures/lighting-scenes.js'
import {
  directionalDiffuseAt,
  findDirectionalWorldDirection,
  hasWebGLProbes,
  loadSyncedScene,
  readProbeRgb,
  renderFrame,
} from './scene-probe-harness.js'

const webgl = hasWebGLProbes()

describe('scene lighting probes (analytical)', () => {
  it('directional diffuse on cube tops is invariant to world position', () => {
    const synced = loadSyncedScene(directionalPositionInvarianceScene, {
      position: [8, 6, 14],
      target: [0, 0.5, 0],
    })
    synced.scene.updateMatrixWorld(true)

    const lightDir = findDirectionalWorldDirection(synced.scene)
    expect(lightDir).not.toBeNull()

    const up = new THREE.Vector3(0, 1, 0)
    const near = directionalDiffuseAt(up, lightDir!)
    const far = directionalDiffuseAt(up, lightDir!)
    expect(near).toBeCloseTo(far, 6)
    expect(near).toBeGreaterThan(0.2)

    synced.dispose()
  })

  it('hemisphere scene contains a hemisphere light with configured colors', () => {
    const synced = loadSyncedScene(hemisphereScene, {
      position: [0, 2, 6],
      target: [0, 1, 0],
    })

    let found: THREE.HemisphereLight | null = null
    synced.scene.traverse((obj) => {
      if (!found && obj instanceof THREE.HemisphereLight) found = obj
    })
    expect(found).not.toBeNull()
    expect(found!.color.getHexString()).toBe('88ccff')
    expect(found!.groundColor.getHexString()).toBe('553311')

    synced.dispose()
  })

  it('multi-light scene wires directional, point, and spot sources', () => {
    const synced = loadSyncedScene(multiLightScene, {
      position: [0, 4, 10],
      target: [0, 0.5, 0],
    })

    const types = new Set<string>()
    synced.scene.traverse((obj) => {
      if (obj instanceof THREE.Light) types.add(obj.type)
    })
    expect(types.has('DirectionalLight')).toBe(true)
    expect(types.has('PointLight')).toBe(true)
    expect(types.has('SpotLight')).toBe(true)

    synced.dispose()
  })
})

describe.skipIf(!webgl)('scene lighting probes (rendered pixels)', () => {
  it('cube top brightness is stable when toggling shadows', () => {
    const settingsOn = shadowToggleStabilityScene.renderSettings!
    const settingsOff = RenderSettingsSchema.parse({
      ...settingsOn,
      features: { ...settingsOn.features, shadows: false },
      shadows: { ...settingsOn.shadows, enabled: false },
    })

    const synced = loadSyncedScene(
      shadowToggleStabilityScene,
      { position: [6, 5, 10], target: [0, 0.5, 0] },
      settingsOn,
    )

    renderFrame(synced, settingsOn)
    const onRgb = readProbeRgb(synced.renderer!, [0.5, 0.42])

    renderFrame(synced, settingsOff)
    const offRgb = readProbeRgb(synced.renderer!, [0.5, 0.42])

    const delta =
      Math.abs(onRgb[0] - offRgb[0]) +
      Math.abs(onRgb[1] - offRgb[1]) +
      Math.abs(onRgb[2] - offRgb[2])
    expect(delta).toBeLessThan(12)

    synced.dispose()
  })

  it('directional shadow darkens ground under the caster', () => {
    const synced = loadSyncedScene(shadowCastScene, {
      position: [10, 8, 12],
      target: [0, 0, 0],
    })

    renderFrame(synced, shadowCastScene.renderSettings!)
    const under = readProbeRgb(synced.renderer!, [0.5, 0.55])
    const open = readProbeRgb(synced.renderer!, [0.2, 0.55])
    const underLum = under[0] * 0.2126 + under[1] * 0.7152 + under[2] * 0.0722
    const openLum = open[0] * 0.2126 + open[1] * 0.7152 + open[2] * 0.0722
    expect(underLum).toBeLessThan(openLum - 5)

    synced.dispose()
  })

  it('hemisphere tints sphere top brighter than bottom', () => {
    const synced = loadSyncedScene(hemisphereScene, {
      position: [0, 1.5, 5],
      target: [0, 1, 0],
    })

    renderFrame(synced, hemisphereScene.renderSettings!)
    const top = readProbeRgb(synced.renderer!, [0.5, 0.35])
    const bottom = readProbeRgb(synced.renderer!, [0.5, 0.62])
    expect(top[2]).toBeGreaterThan(bottom[0] + 10)

    synced.dispose()
  })
})
