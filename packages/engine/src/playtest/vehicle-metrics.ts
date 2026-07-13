import type { IWorld } from '@haku/core'
import { ColliderComponent, TransformComponent } from '@haku/core'

/**
 * Probes the top Y of the nearest static box collider under `(x, z)`.
 * Used by the vehicle debug snapshot to estimate ride height. Kept internal to
 * `playtest/` — the former public "playtest metrics" API had no consumers after
 * the Playwright harness was removed and was dropped (architecture audit §2).
 */
export function estimateGroundTopY(world: IWorld, x: number, z: number): number | null {
  let best: number | null = null

  for (const id of world.query(TransformComponent, ColliderComponent)) {
    const collider = world.getComponent(id, ColliderComponent)
    const transform = world.getComponent(id, TransformComponent)
    if (!collider || !transform || collider.shape !== 'box' || !collider.isStatic) {
      continue
    }

    const [ex, ey, ez] = transform.position as [number, number, number]
    const [, oy] = collider.offset as [number, number, number]
    const [hx, hy, hz] = collider.halfExtents as [number, number, number]

    if (x < ex - hx || x > ex + hx || z < ez - hz || z > ez + hz) {
      continue
    }

    const top = ey + oy + hy
    if (best === null || top > best) {
      best = top
    }
  }

  return best
}
