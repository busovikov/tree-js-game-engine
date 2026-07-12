import type { EntityId, IWorld, ISystem } from '@haku/core'
import {
  CameraComponent,
  PhysicsControllerComponent,
  TransformComponent,
} from '@haku/core'
import type { IPhysicsWorld, PhysicsBodyHandle, PhysicsJointHandle, Vec3 } from '@haku/physics'
import * as THREE from 'three'
import type { PhysicsWorldSystem } from './physics-world-system.js'

export interface PointerControlsSystemOptions {
  /** DOM element receiving pointer events (typically the play canvas). */
  pointerTarget?: HTMLElement
  /** Max raycast distance in meters. */
  maxDistance?: number
}

interface ActiveDrag {
  entityId: EntityId
  pointerBody: PhysicsBodyHandle
  joint: PhysicsJointHandle
  pointerId: number
}

/**
 * Isaac Mason pointer-controls — drag dynamic bodies with impulse joints.
 * Uses capture-phase listeners so draggable hits take priority over camera orbit.
 */
export class PointerControlsSystem implements ISystem {
  readonly order = 46

  private readonly physicsSystem: PhysicsWorldSystem
  private readonly maxDistance: number
  private pointerTarget: HTMLElement | null = null
  private activeDrag: ActiveDrag | null = null
  private sceneWorld: IWorld | null = null

  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event)
  private readonly onPointerMove = (event: PointerEvent) => this.handlePointerMove(event)
  private readonly onPointerUp = (event: PointerEvent) => this.handlePointerUp(event)

  constructor(
    physicsSystem: PhysicsWorldSystem,
    options: PointerControlsSystemOptions = {},
  ) {
    this.physicsSystem = physicsSystem
    this.maxDistance = options.maxDistance ?? 200
    this.pointerTarget = options.pointerTarget ?? null
  }

  attachPointerTarget(target: HTMLElement): void {
    this.detachPointerTarget()
    this.pointerTarget = target
    target.addEventListener('pointerdown', this.onPointerDown, { capture: true })
    target.addEventListener('pointermove', this.onPointerMove, { capture: true })
    target.addEventListener('pointerup', this.onPointerUp, { capture: true })
    target.addEventListener('pointercancel', this.onPointerUp, { capture: true })
  }

  detachPointerTarget(): void {
    if (!this.pointerTarget) {
      return
    }
    this.pointerTarget.removeEventListener('pointerdown', this.onPointerDown, { capture: true })
    this.pointerTarget.removeEventListener('pointermove', this.onPointerMove, { capture: true })
    this.pointerTarget.removeEventListener('pointerup', this.onPointerUp, { capture: true })
    this.pointerTarget.removeEventListener('pointercancel', this.onPointerUp, { capture: true })
    this.pointerTarget = null
  }

  update(world: IWorld, _dt: number): void {
    this.sceneWorld = world
  }

  dispose(): void {
    this.endDrag()
    this.detachPointerTarget()
    this.sceneWorld = null
  }

  private handlePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.activeDrag) {
      return
    }
    const world = this.physicsSystem.getPhysicsWorld()
    const target = this.pointerTarget
    const sceneWorld = this.sceneWorld
    if (!world || !target || !sceneWorld) {
      return
    }

    const hit = this.pickPhysics(event.clientX, event.clientY, target, world)
    if (!hit) {
      return
    }

    const { entityId, point, bodyHandle } = hit
    const controller = sceneWorld.getComponent(entityId, PhysicsControllerComponent)
    if (
      !controller ||
      controller.type !== 'pointer-controls' ||
      !controller.enabled ||
      !controller.draggable
    ) {
      return
    }

    const bodyTransform = world.getBodyTransform(bodyHandle)
    const localAnchor = this.worldPointToLocal(
      {
        position: [...bodyTransform.position] as Vec3,
        rotation: [
          bodyTransform.rotation[0],
          bodyTransform.rotation[1],
          bodyTransform.rotation[2],
          bodyTransform.rotation[3],
        ],
      },
      point,
    )
    const pointerBody = world.createPointerAnchorBody(point)
    world.setBodyTransform(pointerBody, {
      position: point,
      rotation: [0, 0, 0, 1],
    })

    const joint = world.createPointerJoint({
      kind: controller.constraintType,
      pointerBody,
      targetBody: bodyHandle,
      targetAnchorLocal: localAnchor,
      springStiffness: controller.springStiffness,
      springDamping: controller.springDamping,
      ropeLength: controller.ropeLength,
    })

    this.activeDrag = {
      entityId,
      pointerBody,
      joint,
      pointerId: event.pointerId,
    }
    target.setPointerCapture(event.pointerId)
    event.stopPropagation()
    event.preventDefault()
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.activeDrag || event.pointerId !== this.activeDrag.pointerId) {
      return
    }
    const world = this.physicsSystem.getPhysicsWorld()
    const target = this.pointerTarget
    if (!world || !target) {
      return
    }

    const ray = this.screenRay(event.clientX, event.clientY, target)
    if (!ray) {
      return
    }

    const dragDepth = this.readDragDepth(world, this.activeDrag.pointerBody)
    const point = this.pointOnRay(ray.origin, ray.direction, dragDepth)
    world.setBodyTransform(this.activeDrag.pointerBody, {
      position: point,
      rotation: [0, 0, 0, 1],
    })
    event.stopPropagation()
    event.preventDefault()
  }

  private handlePointerUp(event: PointerEvent): void {
    if (!this.activeDrag || event.pointerId !== this.activeDrag.pointerId) {
      return
    }
    this.endDrag()
    this.pointerTarget?.releasePointerCapture(event.pointerId)
    event.stopPropagation()
    event.preventDefault()
  }

  private endDrag(): void {
    const world = this.physicsSystem.getPhysicsWorld()
    if (!world || !this.activeDrag) {
      this.activeDrag = null
      return
    }
    world.removeJoint(this.activeDrag.joint)
    world.destroyBody(this.activeDrag.pointerBody)
    this.activeDrag = null
  }

  private pickPhysics(
    clientX: number,
    clientY: number,
    canvas: HTMLElement,
    physicsWorld: IPhysicsWorld,
  ): {
    entityId: EntityId
    bodyHandle: PhysicsBodyHandle
    point: Vec3
  } | null {
    const ray = this.screenRay(clientX, clientY, canvas)
    if (!ray) {
      return null
    }

    const hit = physicsWorld.raycast({
      origin: ray.origin,
      direction: ray.direction,
      maxDistance: this.maxDistance,
    })
    if (!hit) {
      return null
    }

    const entityId = this.physicsSystem.findEntityForBody(hit.body)
    if (!entityId) {
      return null
    }

    return {
      entityId,
      bodyHandle: hit.body,
      point: hit.point,
    }
  }

  private screenRay(
    clientX: number,
    clientY: number,
    canvas: HTMLElement,
  ): { origin: Vec3; direction: Vec3 } | null {
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    const camera = this.resolveCamera()
    if (!camera) {
      return null
    }

    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const threeCam = new THREE.PerspectiveCamera(
      camera.fov,
      rect.width / rect.height,
      camera.near,
      camera.far,
    )
    threeCam.position.set(camera.position[0], camera.position[1], camera.position[2])
    threeCam.quaternion.set(
      camera.rotation[0],
      camera.rotation[1],
      camera.rotation[2],
      camera.rotation[3],
    )
    threeCam.updateMatrixWorld(true)

    const origin = threeCam.position.clone()
    const direction = new THREE.Vector3(ndc.x, ndc.y, 0.5)
    direction.unproject(threeCam)
    direction.sub(origin).normalize()

    return {
      origin: [origin.x, origin.y, origin.z],
      direction: [direction.x, direction.y, direction.z],
    }
  }

  private resolveCamera(): {
    position: Vec3
    rotation: [number, number, number, number]
    fov: number
    near: number
    far: number
  } | null {
    const world = this.sceneWorld
    if (!world) {
      return null
    }
    for (const id of world.query(CameraComponent, TransformComponent)) {
      const camera = world.getComponent(id, CameraComponent)
      const transform = world.getComponent(id, TransformComponent)
      if (camera && transform && camera.enabled !== false) {
        return {
          position: transform.position as Vec3,
          rotation: transform.rotation as [number, number, number, number],
          fov: camera.fov,
          near: camera.near,
          far: camera.far,
        }
      }
    }
    return null
  }

  private worldPointToLocal(
    transform: { position: Vec3; rotation: [number, number, number, number] },
    worldPoint: Vec3,
  ): Vec3 {
    const dx = worldPoint[0] - transform.position[0]
    const dy = worldPoint[1] - transform.position[1]
    const dz = worldPoint[2] - transform.position[2]
    const [qx, qy, qz, qw] = transform.rotation
    const ix = -qx
    const iy = -qy
    const iz = -qz
    const iw = qw
    return [
      iw * dx + iy * dz - iz * dy,
      iw * dy + iz * dx - ix * dz,
      iw * dz + ix * dy - iy * dx,
    ]
  }

  private readDragDepth(physicsWorld: IPhysicsWorld, pointerBody: PhysicsBodyHandle): number {
    const camera = this.resolveCamera()
    const pointerTransform = physicsWorld.getBodyTransform(pointerBody)
    if (!camera) {
      return 5
    }
    const dx = pointerTransform.position[0] - camera.position[0]
    const dy = pointerTransform.position[1] - camera.position[1]
    const dz = pointerTransform.position[2] - camera.position[2]
    return Math.hypot(dx, dy, dz)
  }

  private pointOnRay(origin: Vec3, direction: Vec3, distance: number): Vec3 {
    return [
      origin[0] + direction[0] * distance,
      origin[1] + direction[1] * distance,
      origin[2] + direction[2] * distance,
    ]
  }
}
