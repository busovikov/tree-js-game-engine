/** Local-space position of a directional / spot light relative to its entity. */
export type Vec3 = [number, number, number]

/** Local-space position of a directional / spot light relative to its entity. */
export const LIGHT_DEFAULT_LOCAL_POSITION: Vec3 = [0, 0, 0]

/**
 * Local-space aim point for directional / spot lights relative to its entity.
 * Together with {@link LIGHT_DEFAULT_LOCAL_POSITION} this defines the lit
 * direction before the entity transform is applied.
 */
export const LIGHT_DEFAULT_TARGET_POSITION: Vec3 = [0, 0, -1]

/** Default sky tint for hemisphere lights (serialized, editor-visible). */
export const HEMISPHERE_LIGHT_DEFAULT_SKY_COLOR = '#87ceeb'

/** Default ground tint for hemisphere lights (serialized, editor-visible). */
export const HEMISPHERE_LIGHT_DEFAULT_GROUND_COLOR = '#3d2817'
