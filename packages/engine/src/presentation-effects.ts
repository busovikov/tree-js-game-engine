import type { EntityId, ISystem, IWorld } from '@haku/core'
import type { Vec3 } from '@haku/schema'
import * as THREE from 'three'

export type PresentationEffectKind = 'landing' | 'bonus' | 'fail'
export type PresentationEffectShape = 'ring' | 'spark' | 'pulse'

export interface PresentationBurstRequest {
  readonly kind: PresentationEffectKind
  readonly shape: PresentationEffectShape
  readonly position: Vec3
  readonly color: string
  readonly duration: number
  readonly size: number
  readonly owner?: EntityId | string
}

export interface PresentationEffectsBackendOptions {
  readonly burstCapacity: number
  readonly burstQueueCapacity: number
  readonly trailCapacity: number
  readonly trailSampleInterval: number
  readonly trailLifetime: number
}

export interface PresentationEffectEmissionMetrics {
  readonly landing: number
  readonly bonus: number
  readonly fail: number
}

export interface PresentationEffectsMetrics {
  readonly burstCapacity: number
  readonly trailCapacity: number
  readonly activeBursts: number
  readonly queuedBursts: number
  readonly trailPoints: number
  readonly ownedHandles: number
  readonly droppedBursts: number
  readonly renderObjects: number
  readonly emitted: PresentationEffectEmissionMetrics
  readonly disposed: boolean
}

export interface PresentationEffectsBackend {
  emit(request: PresentationBurstRequest): void
  sampleTrail(position: Vec3): void
  clearOwner(owner: EntityId | string): void
  reset(): void
  update(dt: number): void
  metrics(): PresentationEffectsMetrics
  dispose(): void
}

interface BurstSlot {
  active: boolean
  kind: PresentationEffectKind
  shape: PresentationEffectShape
  owner: string | null
  color: string
  x: number
  y: number
  z: number
  age: number
  duration: number
  size: number
}

interface TrailSlot {
  active: boolean
  x: number
  y: number
  z: number
  age: number
}

const DEFAULT_KIND: PresentationEffectKind = 'landing'
const DEFAULT_SHAPE: PresentationEffectShape = 'ring'

function createBurstSlot(): BurstSlot {
  return {
    active: false,
    kind: DEFAULT_KIND,
    shape: DEFAULT_SHAPE,
    owner: null,
    color: '#ffffff',
    x: 0,
    y: 0,
    z: 0,
    age: 0,
    duration: 1,
    size: 1,
  }
}

function createTrailSlot(): TrailSlot {
  return { active: false, x: 0, y: 0, z: 0, age: 0 }
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
}

function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite`)
}

function ownerValue(owner: EntityId | string | undefined): string | null {
  if (typeof owner === 'string') return owner
  return owner?.value ?? null
}

/**
 * Allocation-stable bounded implementation shared by headless tests and the Three renderer.
 * Requests enter a fixed ring and active slots reuse the oldest visual when saturated.
 */
export class HeadlessPresentationEffectsBackend implements PresentationEffectsBackend {
  protected readonly bursts: BurstSlot[]
  protected readonly queued: BurstSlot[]
  protected readonly trail: TrailSlot[]
  protected readonly options: PresentationEffectsBackendOptions

  private queueRead = 0
  private queueWrite = 0
  private queueCount = 0
  private trailWrite = 0
  private sampleElapsed = 0
  private hasPreviousSample = false
  private previousX = 0
  private previousY = 0
  private previousZ = 0
  private pendingSample = false
  private sampleX = 0
  private sampleY = 0
  private sampleZ = 0
  private droppedBursts = 0
  private landingEmitted = 0
  private bonusEmitted = 0
  private failEmitted = 0
  private isDisposed = false

  constructor(options: PresentationEffectsBackendOptions) {
    requirePositiveInteger(options.burstCapacity, 'Burst capacity')
    requirePositiveInteger(options.burstQueueCapacity, 'Burst queue capacity')
    requirePositiveInteger(options.trailCapacity, 'Trail capacity')
    requirePositiveFinite(options.trailSampleInterval, 'Trail sample interval')
    requirePositiveFinite(options.trailLifetime, 'Trail lifetime')
    this.options = { ...options }
    this.bursts = Array.from({ length: options.burstCapacity }, createBurstSlot)
    this.queued = Array.from({ length: options.burstQueueCapacity }, createBurstSlot)
    this.trail = Array.from({ length: options.trailCapacity }, createTrailSlot)
  }

  emit(request: PresentationBurstRequest): void {
    this.requireLive()
    requirePositiveFinite(request.duration, 'Burst duration')
    requirePositiveFinite(request.size, 'Burst size')
    if (!request.position.every(Number.isFinite)) throw new Error('Burst position must be finite')
    if (this.queueCount === this.queued.length) {
      this.droppedBursts += 1
      return
    }
    const slot = this.queued[this.queueWrite]!
    this.copyRequest(slot, request)
    slot.active = true
    this.queueWrite = (this.queueWrite + 1) % this.queued.length
    this.queueCount += 1
    if (request.kind === 'landing') this.landingEmitted += 1
    else if (request.kind === 'bonus') this.bonusEmitted += 1
    else this.failEmitted += 1
  }

  sampleTrail(position: Vec3): void {
    this.requireLive()
    if (!position.every(Number.isFinite)) throw new Error('Trail position must be finite')
    this.sampleX = position[0]
    this.sampleY = position[1]
    this.sampleZ = position[2]
    this.pendingSample = true
  }

  clearOwner(owner: EntityId | string): void {
    const target = ownerValue(owner)
    for (let index = 0; index < this.bursts.length; index += 1) {
      const slot = this.bursts[index]!
      if (slot.active && slot.owner === target) this.deactivateBurst(index)
    }
    for (const slot of this.queued) {
      if (slot.active && slot.owner === target) slot.owner = null
    }
  }

  reset(): void {
    for (let index = 0; index < this.bursts.length; index += 1) this.deactivateBurst(index)
    for (const slot of this.queued) slot.active = false
    for (const slot of this.trail) slot.active = false
    this.queueRead = 0
    this.queueWrite = 0
    this.queueCount = 0
    this.trailWrite = 0
    this.sampleElapsed = 0
    this.hasPreviousSample = false
    this.pendingSample = false
    this.onTrailChanged()
  }

  update(dt: number): void {
    this.requireLive()
    const delta = Number.isFinite(dt) && dt > 0 ? dt : 0
    if (delta > 0) {
      for (let index = 0; index < this.bursts.length; index += 1) {
        const slot = this.bursts[index]!
        if (!slot.active) continue
        slot.age += delta
        if (slot.age >= slot.duration) this.deactivateBurst(index)
        else this.onBurstUpdated(index, slot)
      }
      for (const slot of this.trail) {
        if (!slot.active) continue
        slot.age += delta
        if (slot.age >= this.options.trailLifetime) slot.active = false
      }
    }
    this.drainBurstQueue()
    if (delta > 0 && this.pendingSample) this.advanceTrail(delta)
    if (delta > 0) this.onTrailChanged()
  }

  metrics(): PresentationEffectsMetrics {
    let activeBursts = 0
    let trailPoints = 0
    let ownedHandles = 0
    for (const slot of this.bursts) {
      if (!slot.active) continue
      activeBursts += 1
      if (slot.owner !== null) ownedHandles += 1
    }
    for (const slot of this.queued) {
      if (slot.active && slot.owner !== null) ownedHandles += 1
    }
    for (const slot of this.trail) if (slot.active) trailPoints += 1
    return {
      burstCapacity: this.bursts.length,
      trailCapacity: this.trail.length,
      activeBursts,
      queuedBursts: this.queueCount,
      trailPoints,
      ownedHandles,
      droppedBursts: this.droppedBursts,
      renderObjects: this.renderObjectCount(),
      emitted: {
        landing: this.landingEmitted,
        bonus: this.bonusEmitted,
        fail: this.failEmitted,
      },
      disposed: this.isDisposed,
    }
  }

  dispose(): void {
    if (this.isDisposed) return
    this.reset()
    this.isDisposed = true
    this.onDisposed()
  }

  protected onBurstActivated(_index: number, _slot: BurstSlot): void {}
  protected onBurstUpdated(_index: number, _slot: BurstSlot): void {}
  protected onBurstDeactivated(_index: number): void {}
  protected onTrailChanged(): void {}
  protected onDisposed(): void {}
  protected renderObjectCount(): number {
    return 0
  }

  private drainBurstQueue(): void {
    while (this.queueCount > 0) {
      const queued = this.queued[this.queueRead]!
      let targetIndex = this.bursts.findIndex((slot) => !slot.active)
      if (targetIndex < 0) {
        targetIndex = 0
        for (let index = 1; index < this.bursts.length; index += 1) {
          if (this.bursts[index]!.age > this.bursts[targetIndex]!.age) targetIndex = index
        }
        this.deactivateBurst(targetIndex)
      }
      const target = this.bursts[targetIndex]!
      this.copySlot(target, queued)
      target.active = true
      target.age = 0
      queued.active = false
      this.queueRead = (this.queueRead + 1) % this.queued.length
      this.queueCount -= 1
      this.onBurstActivated(targetIndex, target)
    }
  }

  private advanceTrail(delta: number): void {
    if (!this.hasPreviousSample) {
      this.insertTrail(this.sampleX, this.sampleY, this.sampleZ)
      this.hasPreviousSample = true
      this.previousX = this.sampleX
      this.previousY = this.sampleY
      this.previousZ = this.sampleZ
      this.sampleElapsed = 0
      this.pendingSample = false
      return
    }
    this.sampleElapsed += delta
    const rawSteps = Math.floor(this.sampleElapsed / this.options.trailSampleInterval)
    const steps = Math.min(rawSteps, this.trail.length)
    for (let index = 1; index <= steps; index += 1) {
      const alpha = index / Math.max(steps, 1)
      this.insertTrail(
        this.previousX + (this.sampleX - this.previousX) * alpha,
        this.previousY + (this.sampleY - this.previousY) * alpha,
        this.previousZ + (this.sampleZ - this.previousZ) * alpha,
      )
    }
    if (rawSteps > 0) this.sampleElapsed %= this.options.trailSampleInterval
    this.previousX = this.sampleX
    this.previousY = this.sampleY
    this.previousZ = this.sampleZ
    this.pendingSample = false
  }

  private insertTrail(x: number, y: number, z: number): void {
    const slot = this.trail[this.trailWrite]!
    slot.active = true
    slot.x = x
    slot.y = y
    slot.z = z
    slot.age = 0
    this.trailWrite = (this.trailWrite + 1) % this.trail.length
  }

  private deactivateBurst(index: number): void {
    const slot = this.bursts[index]!
    if (!slot.active) return
    slot.active = false
    slot.owner = null
    this.onBurstDeactivated(index)
  }

  private copyRequest(slot: BurstSlot, request: PresentationBurstRequest): void {
    slot.kind = request.kind
    slot.shape = request.shape
    slot.owner = ownerValue(request.owner)
    slot.color = request.color
    slot.x = request.position[0]
    slot.y = request.position[1]
    slot.z = request.position[2]
    slot.age = 0
    slot.duration = request.duration
    slot.size = request.size
  }

  private copySlot(target: BurstSlot, source: BurstSlot): void {
    target.kind = source.kind
    target.shape = source.shape
    target.owner = source.owner
    target.color = source.color
    target.x = source.x
    target.y = source.y
    target.z = source.z
    target.duration = source.duration
    target.size = source.size
  }

  private requireLive(): void {
    if (this.isDisposed) throw new Error('Presentation effects backend is disposed')
  }
}

export class PresentationEffectsService implements ISystem {
  readonly phase = 'Presentation' as const
  readonly localOrder = -100

  constructor(private readonly backend: PresentationEffectsBackend) {}

  emit(request: PresentationBurstRequest): void {
    this.backend.emit(request)
  }

  sampleTrail(position: Vec3): void {
    this.backend.sampleTrail(position)
  }

  clearOwner(owner: EntityId | string): void {
    this.backend.clearOwner(owner)
  }

  reset(): void {
    this.backend.reset()
  }

  update(_world: IWorld, dt: number): void {
    this.backend.update(dt)
  }

  metrics(): PresentationEffectsMetrics {
    return this.backend.metrics()
  }

  dispose(): void {
    this.backend.dispose()
  }
}

export interface ThreePresentationEffectsOptions extends PresentationEffectsBackendOptions {
  readonly trailColor: string
  readonly trailPointSize: number
}

/** Three-owned bounded presentation objects. Apps provide only typed requests and styling data. */
export class ThreePresentationEffectsBackend extends HeadlessPresentationEffectsBackend {
  private readonly group = new THREE.Group()
  private readonly burstMeshes: THREE.Mesh[]
  private readonly geometries: Record<PresentationEffectShape, THREE.BufferGeometry>
  private readonly materials: Record<PresentationEffectKind, THREE.MeshBasicMaterial>
  private readonly trailPositions: Float32Array
  private readonly trailGeometry: THREE.BufferGeometry
  private readonly trailMaterial: THREE.PointsMaterial
  private readonly trailPoints: THREE.Points
  private released = false

  constructor(
    private readonly scene: THREE.Scene,
    options: ThreePresentationEffectsOptions,
  ) {
    super(options)
    requirePositiveFinite(options.trailPointSize, 'Trail point size')
    this.group.name = 'HakuPresentationEffects'
    this.geometries = {
      ring: new THREE.TorusGeometry(1, 0.11, 6, 18),
      spark: new THREE.OctahedronGeometry(1, 0),
      pulse: new THREE.IcosahedronGeometry(1, 1),
    }
    this.materials = {
      landing: createBurstMaterial('#79ecff'),
      bonus: createBurstMaterial('#ffd84d'),
      fail: createBurstMaterial('#ff5b72'),
    }
    this.burstMeshes = this.bursts.map(() => {
      const mesh = new THREE.Mesh(this.geometries.ring, this.materials.landing)
      mesh.visible = false
      mesh.frustumCulled = true
      this.group.add(mesh)
      return mesh
    })
    this.trailPositions = new Float32Array(options.trailCapacity * 3)
    this.trailGeometry = new THREE.BufferGeometry()
    this.trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage),
    )
    this.trailGeometry.setDrawRange(0, 0)
    this.trailMaterial = new THREE.PointsMaterial({
      color: options.trailColor,
      size: options.trailPointSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.trailPoints = new THREE.Points(this.trailGeometry, this.trailMaterial)
    this.trailPoints.frustumCulled = false
    this.group.add(this.trailPoints)
    this.scene.add(this.group)
  }

  protected override onBurstActivated(index: number, slot: BurstSlot): void {
    const mesh = this.burstMeshes[index]!
    const material = this.materials[slot.kind]
    material.color.set(slot.color)
    mesh.geometry = this.geometries[slot.shape]
    mesh.material = material
    mesh.position.set(slot.x, slot.y, slot.z)
    mesh.rotation.set(slot.shape === 'ring' ? Math.PI / 2 : 0, 0, 0)
    mesh.scale.setScalar(slot.size * 0.35)
    mesh.visible = true
  }

  protected override onBurstUpdated(index: number, slot: BurstSlot): void {
    const mesh = this.burstMeshes[index]!
    const progress = slot.age / slot.duration
    mesh.scale.setScalar(slot.size * (0.35 + progress * 1.25))
    mesh.rotation.y = progress * Math.PI
  }

  protected override onBurstDeactivated(index: number): void {
    this.burstMeshes[index]!.visible = false
  }

  protected override onTrailChanged(): void {
    let visible = 0
    for (const slot of this.trail) {
      if (!slot.active) continue
      const offset = visible * 3
      this.trailPositions[offset] = slot.x
      this.trailPositions[offset + 1] = slot.y
      this.trailPositions[offset + 2] = slot.z
      visible += 1
    }
    this.trailGeometry.setDrawRange(0, visible)
    const position = this.trailGeometry.getAttribute('position')
    position.needsUpdate = true
  }

  protected override renderObjectCount(): number {
    return this.released ? 0 : this.burstMeshes.length + 1
  }

  protected override onDisposed(): void {
    if (this.released) return
    this.released = true
    this.scene.remove(this.group)
    this.trailGeometry.dispose()
    this.trailMaterial.dispose()
    for (const geometry of Object.values(this.geometries)) geometry.dispose()
    for (const material of Object.values(this.materials)) material.dispose()
    this.group.clear()
  }
}

function createBurstMaterial(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}
