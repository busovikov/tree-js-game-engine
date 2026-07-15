/** Vertex/color buffers from backend debug rendering (e.g. Rapier `world.debugRender()`). */
export interface PhysicsDebugRenderBuffers {
  /** Flat xyz triplets — two consecutive points per line segment. */
  vertices: Float32Array
  /** Flat RGBA quads — one color per vertex. */
  colors: Float32Array
}
