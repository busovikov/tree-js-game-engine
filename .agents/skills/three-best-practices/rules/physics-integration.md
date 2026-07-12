# Physics Integration

Guide to integrating physics engines with Three.js.

> **@haku monorepo:** Use **Rapier only** via `@haku/physics-rapier`. Custom raycast vehicles use `stepRaycastVehicle` on the abstract `@haku/physics` layer — see [`docs/links.md`](../../../../docs/links.md) § Rapier.

## Engine Comparison

| Engine | Language | Characteristics | Performance |
|--------|----------|-----------------|-------------|
| **Rapier** | Rust/WASM | Deterministic, modern | Very High |
| **Ammo.js** | C++/WASM | Bullet port, softbody support | Medium-High |

## Rapier (Recommended for 2025+)

### Setup

```bash
npm install @dimforge/rapier3d-compat
```

### Vite Configuration

```javascript
// vite.config.js
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default {
  plugins: [wasm(), topLevelAwait()]
};
```

### Basic Usage

```javascript
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

// Create rigid body
const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(0, 5, 0);
const rigidBody = world.createRigidBody(rigidBodyDesc);

// Add collider
const colliderDesc = RAPIER.ColliderDesc.ball(0.5);
world.createCollider(colliderDesc, rigidBody);

// Sync with Three.js mesh
function animate() {
  world.step();

  const position = rigidBody.translation();
  const rotation = rigidBody.rotation();

  mesh.position.set(position.x, position.y, position.z);
  mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}
```

### Collider Shapes

```javascript
RAPIER.ColliderDesc.ball(radius)
RAPIER.ColliderDesc.cuboid(hx, hy, hz)
RAPIER.ColliderDesc.capsule(halfHeight, radius)
RAPIER.ColliderDesc.cylinder(halfHeight, radius)
RAPIER.ColliderDesc.cone(halfHeight, radius)
RAPIER.ColliderDesc.convexHull(vertices)
RAPIER.ColliderDesc.trimesh(vertices, indices)
```

## Sync Pattern

### BAD - Bidirectional sync

```javascript
// Physics affects mesh
mesh.position.copy(body.position);
// Mesh affects physics (creates feedback loop)
body.position.copy(mesh.position);
```

### GOOD - Physics -> Visual only

```javascript
function syncPhysicsToMesh(body, mesh) {
  const t = body.translation();
  const r = body.rotation();
  mesh.position.set(t.x, t.y, t.z);
  mesh.quaternion.set(r.x, r.y, r.z, r.w);
}

// For kinematic bodies controlled by Three.js
function syncMeshToKinematic(mesh, body) {
  body.setTranslation(mesh.position, true);
  body.setRotation(mesh.quaternion, true);
}
```

## Best Practices

1. **Simple Shapes**: Use simple colliders (box, sphere) even for complex meshes

2. **Fixed Timestep**: Use fixed timestep for physics (1/60)
   ```javascript
   world.timestep = 1 / 60;
   world.step();
   ```

3. **Sleep**: Rapier sleeps inactive bodies automatically; wake with `body.wakeUp()` before teleporting or applying impulses

4. **Impulses at point**: Prefer `applyImpulseAtPoint` for wheel/suspension forces
   ```javascript
   body.applyImpulseAtPoint({ x: 0, y: impulse, z: 0 }, { x, y, z }, true);
   ```

5. **Sync Direction**: Always sync physics -> visual, not reverse

6. **Compound colliders**: Attach multiple colliders to one rigid body for chassis + corner spheres

## References

- [Rapier Documentation](https://rapier.rs/)
- [Three.js Rapier vehicle controller](https://threejs.org/examples/physics_rapier_vehicle_controller.html)
- [Isaac Mason custom raycast vehicle](https://sketches.isaacmason.com/sketch/rapier/custom-raycast-vehicle)
- [Three.js + Physics Examples](https://threejs.org/examples/?q=physics)
