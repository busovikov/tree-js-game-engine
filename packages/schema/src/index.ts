import { z } from 'zod'
import {
  HEMISPHERE_LIGHT_DEFAULT_GROUND_COLOR,
  HEMISPHERE_LIGHT_DEFAULT_SKY_COLOR,
  LIGHT_DEFAULT_LOCAL_POSITION,
  LIGHT_DEFAULT_TARGET_POSITION,
} from './light-defaults.js'

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
export type Vec3 = z.infer<typeof Vec3Schema>

export const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export type Quat = z.infer<typeof QuatSchema>

export const EntityRefSchema = z.object({ $ref: z.string().regex(/^entity:[0-9a-f-]+$/i) })
export const AssetRefSchema = z.object({ $ref: z.string().regex(/^asset:.+/) })
export const PrefabRefSchema = z.object({ $ref: z.string().regex(/^prefab:.+/) })

export type EntityRef = z.infer<typeof EntityRefSchema>
export type AssetRef = z.infer<typeof AssetRefSchema>
export type PrefabRef = z.infer<typeof PrefabRefSchema>

export const TransformSchema = z.object({
  position: Vec3Schema.default([0, 0, 0]),
  rotation: QuatSchema.default([0, 0, 0, 1]),
  scale: Vec3Schema.default([1, 1, 1]),
})
export type Transform = z.infer<typeof TransformSchema>

export const CameraSchema = z.object({
  fov: z.number().default(60),
  near: z.number().default(0.1),
  far: z.number().default(1000),
  ortho: z.boolean().optional(),
  orthoSize: z.number().optional(),
})
export type Camera = z.infer<typeof CameraSchema>

export const LightTypeSchema = z.enum(['directional', 'point', 'spot', 'hemisphere'])

const LightBaseSchema = z.object({
  color: z.string().default('#ffffff'),
  intensity: z.number().default(1),
  colorTemperature: z.number().min(1000).max(12000).optional(),
  castShadow: z.boolean().default(false),
  shadowMapSize: z.number().int().positive().optional(),
  shadowBias: z.number().optional(),
  shadowNormalBias: z.number().optional(),
})

export const DirectionalLightDataSchema = LightBaseSchema.extend({
  type: z.literal('directional'),
  /** Local offset of the light source (Three.js DirectionalLight.position). */
  localPosition: Vec3Schema.default(LIGHT_DEFAULT_LOCAL_POSITION),
  /** Local aim point (Three.js DirectionalLight.target.position). */
  targetPosition: Vec3Schema.default(LIGHT_DEFAULT_TARGET_POSITION),
})

export const PointLightDataSchema = LightBaseSchema.extend({
  type: z.literal('point'),
  distance: z.number().min(0).default(10),
  decay: z.number().min(0).default(2),
})

export const SpotLightDataSchema = LightBaseSchema.extend({
  type: z.literal('spot'),
  distance: z.number().min(0).default(15),
  decay: z.number().min(0).default(2),
  localPosition: Vec3Schema.default(LIGHT_DEFAULT_LOCAL_POSITION),
  targetPosition: Vec3Schema.default(LIGHT_DEFAULT_TARGET_POSITION),
  outerAngle: z.number().min(1).max(179).optional(),
  innerAngle: z.number().min(0).max(179).optional(),
  /** @deprecated use outerAngle */
  angle: z.number().min(1).max(179).optional(),
  /** @deprecated use innerAngle/outerAngle */
  penumbra: z.number().min(0).max(1).optional(),
}).transform((data) => {
  const outerAngle = Math.min(179, Math.max(1, data.outerAngle ?? data.angle ?? 45))
  const legacyInner =
    data.innerAngle ??
    (data.penumbra !== undefined || data.angle !== undefined
      ? outerAngle * (1 - (data.penumbra ?? 0))
      : outerAngle * 0.5)
  const innerAngle = Math.min(outerAngle, Math.max(0, legacyInner))

  return {
    type: 'spot' as const,
    color: data.color,
    intensity: data.intensity,
    colorTemperature: data.colorTemperature,
    distance: data.distance,
    decay: data.decay,
    outerAngle,
    innerAngle,
    localPosition: data.localPosition ?? LIGHT_DEFAULT_LOCAL_POSITION,
    targetPosition: data.targetPosition ?? LIGHT_DEFAULT_TARGET_POSITION,
    castShadow: data.castShadow,
    shadowMapSize: data.shadowMapSize,
    shadowBias: data.shadowBias,
    shadowNormalBias: data.shadowNormalBias,
  }
})

export const HemisphereLightDataSchema = LightBaseSchema.omit({ castShadow: true }).extend({
  type: z.literal('hemisphere'),
  skyColor: z.string().default(HEMISPHERE_LIGHT_DEFAULT_SKY_COLOR),
  groundColor: z.string().default(HEMISPHERE_LIGHT_DEFAULT_GROUND_COLOR),
})

export const LightSchema = z.union([
  DirectionalLightDataSchema,
  PointLightDataSchema,
  SpotLightDataSchema,
  HemisphereLightDataSchema,
])
export type Light = z.infer<typeof LightSchema>

/** Editor/range visualization when distance is 0 (infinite in Three.js). */
export function lightDisplayDistance(light: Light): number {
  if (light.type === 'directional' || light.type === 'hemisphere') return 2
  const distance = light.distance ?? 0
  return distance > 0 ? distance : 5
}

export type SpotLight = Extract<Light, { type: 'spot' }>

export function spotToThreeCone(spot: SpotLight): { angleRad: number; penumbra: number } {
  const angleRad = (spot.outerAngle * Math.PI) / 180
  const penumbra =
    spot.outerAngle > 0 ? Math.min(1, Math.max(0, 1 - spot.innerAngle / spot.outerAngle)) : 0
  return { angleRad, penumbra }
}

export {
  HEMISPHERE_LIGHT_DEFAULT_GROUND_COLOR,
  HEMISPHERE_LIGHT_DEFAULT_SKY_COLOR,
  LIGHT_DEFAULT_LOCAL_POSITION,
  LIGHT_DEFAULT_TARGET_POSITION,
} from './light-defaults.js'
export {
  LIGHT_TEMPERATURE_DEFAULT,
  LIGHT_TEMPERATURE_MAX,
  LIGHT_TEMPERATURE_MIN,
  kelvinToHex,
  kelvinToRgb,
  resolveLightColor,
} from './light-color.js'

import { MeshRendererSchema } from './mesh.js'
import { StaticSchema } from './static.js'
import { TagSchema } from './tag.js'
import { RenderingLayersSchema } from './rendering-layers.js'
import { RenderTextureSchema } from './render-texture.js'

export { TagSchema, type Tag } from './tag.js'
export { StaticSchema, type Static } from './static.js'

export {
  GEOMETRY_PARAM_SPECS,
  MESH_GEOMETRY_TYPES,
  MESH_GEOMETRY_TYPE_LABELS,
  MESH_PRIMITIVE_GEOMETRY_TYPES,
  MeshGeometryTypeSchema,
  MeshRendererSchema,
  defaultGeometryParams,
  meshRendererKey,
  normalizeMeshRenderer,
  type GeometryParamSpec,
  type MeshGeometryType,
  type MeshRenderer,
} from './mesh.js'

export {
  MATERIAL_PROPERTY_SPECS,
  MATERIAL_TYPE_LABELS,
  MATERIAL_TYPE_SCHEMAS,
  MATERIAL_TYPES,
  MaterialTypeSchema,
  MeshMaterialSchema,
  StandardMaterialSchema,
  BasicMaterialSchema,
  PhysicalMaterialSchema,
  defaultMaterialProperties,
  normalizeMeshMaterial,
  switchMaterialType,
  type MaterialPropertyKind,
  type MaterialPropertySpec,
  type MaterialType,
  type MeshMaterial,
  type StandardMaterial,
} from './material.js'

export const ScriptRefSchema = z.object({
  path: z.string(),
})
export type ScriptRef = z.infer<typeof ScriptRefSchema>

export const PrefabInstanceSchema = z.object({
  prefabId: z.string(),
  overrides: z.record(z.record(z.unknown())).optional(),
})
export type PrefabInstance = z.infer<typeof PrefabInstanceSchema>

export const RenderModeSchema = z.enum(['mesh', 'instanced', 'batched', 'sprite-atlas'])
export type RenderMode = z.infer<typeof RenderModeSchema>

export const RenderPrototypeSchema = z.object({
  id: z.string(),
  mode: RenderModeSchema,
  sourceAsset: z.string(),
})
export type RenderPrototype = z.infer<typeof RenderPrototypeSchema>

export const ComponentRecordSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()),
})
export type ComponentRecord = z.infer<typeof ComponentRecordSchema>

export const EntityRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parent: z.string().uuid().nullable(),
  components: z.array(ComponentRecordSchema),
})
export type EntityRecord = z.infer<typeof EntityRecordSchema>

export const PrefabDefinitionSchema = z.object({
  id: z.string(),
  entities: z.array(EntityRecordSchema),
})
export type PrefabDefinition = z.infer<typeof PrefabDefinitionSchema>

export const SceneMetadataSchema = z.object({
  name: z.string(),
  /** Entity id of the active game camera (must have a Camera component). */
  activeCameraId: z.string().nullable().optional(),
})
export type SceneMetadata = z.infer<typeof SceneMetadataSchema>

import { RenderSettingsSchema, defaultRenderSettings } from './render-settings.js'

export const SceneDocumentSchema = z.preprocess((input) => {
  if (typeof input !== 'object' || input === null) return input
  if (!('renderSettings' in input)) {
    return { ...input, renderSettings: defaultRenderSettings() }
  }
  return input
}, z.object({
  schemaVersion: z.literal(1),
  metadata: SceneMetadataSchema,
  entities: z.array(EntityRecordSchema),
  prototypes: z.record(RenderPrototypeSchema).default({}),
  prefabs: z.record(PrefabDefinitionSchema).default({}),
  renderSettings: RenderSettingsSchema.default({}),
}))
export type SceneDocument = z.infer<typeof SceneDocumentSchema>

export const HakuProjectSchema = z.object({
  name: z.string(),
  entryScene: z.string(),
  assetsDir: z.string().default('public/assets'),
  scriptsDir: z.string().default('scripts'),
})
export type HakuProject = z.infer<typeof HakuProjectSchema>

export {
  DEFAULT_ASSETS_DIR,
  projectPathToUrl,
  relativeToAssetsDir,
} from './paths.js'

export {
  EditorProjectSettingsSchema,
  EditorCameraStateSchema,
  SceneEditorStateSchema,
  ViewportTabSchema,
  EDITOR_PROJECT_SETTINGS_PATH,
  defaultEditorProjectSettings,
  defaultSceneEditorState,
  type EditorProjectSettings,
  type EditorCameraState,
  type SceneEditorState,
  type ViewportTab,
} from './editor-project-settings.js'

export { listCameraEntityIds, resolveActiveCameraId } from './scene-camera.js'

export {
  RenderSettingsSchema,
  RenderSettingsFeaturesSchema,
  defaultRenderSettings,
  isFeatureActive,
  resolveShadowSettings,
  SHADOW_QUALITY_PRESETS,
  type RenderSettings,
  type RenderSettingsFeatures,
  type ShadowQuality,
  type ShadowSettings,
  type ToneMappingType,
  type PostEffect,
  type PostProcessingProfile,
} from './render-settings.js'

export {
  RenderingLayersSchema,
  RENDER_LAYER_DEFAULT,
  RENDER_LAYER_TRANSPARENT,
  RENDER_LAYER_EDITOR_GIZMO,
  RENDER_LAYER_PICKING,
  RENDER_LAYER_DEBUG,
  layerBit,
  hasLayer,
  defaultCameraLayerMask,
  type RenderingLayers,
} from './rendering-layers.js'

export {
  RenderTextureSchema,
  RenderTextureUpdateModeSchema,
  type RenderTexture,
  type RenderTextureUpdateMode,
} from './render-texture.js'

export const CORE_COMPONENT_IDS = [
  'Transform',
  'Camera',
  'Light',
  'MeshRenderer',
  'ScriptRef',
  'PrefabInstance',
  'Tag',
  'Static',
  'RenderingLayers',
  'RenderTexture',
] as const

export type CoreComponentId = (typeof CORE_COMPONENT_IDS)[number]

export const coreComponentSchemas = {
  Transform: TransformSchema,
  Camera: CameraSchema,
  Light: LightSchema,
  MeshRenderer: MeshRendererSchema,
  ScriptRef: ScriptRefSchema,
  PrefabInstance: PrefabInstanceSchema,
  Tag: TagSchema,
  Static: StaticSchema,
  RenderingLayers: RenderingLayersSchema,
  RenderTexture: RenderTextureSchema,
} as const

export function validateSceneDocument(data: unknown): SceneDocument {
  return SceneDocumentSchema.parse(data)
}
