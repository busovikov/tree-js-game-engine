import { z } from 'zod'
import { ComponentRecordSchema } from './component-envelope.js'
import { AssetRefSchema } from './assets.js'

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
export type Vec3 = z.infer<typeof Vec3Schema>

export const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export type Quat = z.infer<typeof QuatSchema>

export const EntityRefSchema = z.object({ $ref: z.string().regex(/^entity:[0-9a-f-]+$/i) })

export type EntityRef = z.infer<typeof EntityRefSchema>

export {
  AssetIdSchema,
  AssetRefSchema,
  AssetTypeIdSchema,
  assetId,
  assetRef,
  assetTypeId,
  type AssetId,
  type AssetRef,
  type AssetTypeId,
} from './assets.js'

export const TransformSchema = z.object({
  position: Vec3Schema.default([0, 0, 0]),
  rotation: QuatSchema.default([0, 0, 0, 1]),
  scale: Vec3Schema.default([1, 1, 1]),
})
export type Transform = z.infer<typeof TransformSchema>

export const ComponentEnabledSchema = z.boolean().default(true)

export { TagSchema, type Tag } from './tag.js'
export { StaticSchema, type Static } from './static.js'

export {
  PhysicsMaterialSchema,
  PhysicsMaterialCombineSchema,
  type PhysicsMaterial,
  type PhysicsMaterialCombine,
} from './physics-material.js'

export {
  PhysicsProjectSettingsSchema,
  MAX_PHYSICS_LAYERS,
  DEFAULT_PHYSICS_MATERIAL_ID,
  defaultPhysicsLayerNames,
  defaultLayerCollisionMatrix,
  defaultPhysicsMaterials,
  defaultPhysicsProjectSettings,
  bakeLayerCollisionGroups,
  setLayerCollisionSymmetric,
  resolveColliderPhysicsMaterial,
  isValidPhysicsLayer,
  type PhysicsProjectSettings,
} from './physics-project-settings.js'

export {
  physicsMaterialCombineToRapier,
  type RapierMaterialCombineRule,
} from './physics-material-combine.js'

export const ScriptRefSchema = z.object({
  path: z.string(),
  enabled: ComponentEnabledSchema,
})
export type ScriptRef = z.infer<typeof ScriptRefSchema>

export const PrefabInstanceSchema = z.object({
  prefab: AssetRefSchema,
  overrides: z.record(z.record(z.unknown())).optional(),
})
export type PrefabInstance = z.infer<typeof PrefabInstanceSchema>

export const RenderModeSchema = z.enum(['mesh', 'instanced', 'batched', 'sprite-atlas'])
export type RenderMode = z.infer<typeof RenderModeSchema>

export const RenderPrototypeSchema = z.object({
  id: z.string(),
  mode: RenderModeSchema,
  sourceAsset: AssetRefSchema,
})
export type RenderPrototype = z.infer<typeof RenderPrototypeSchema>

export {
  ComponentRecordSchema,
  ComponentTypeIdSchema,
  componentTypeId,
  type ComponentRecord,
  type ComponentTypeId,
} from './component-envelope.js'

export const EntityRecordSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  parent: z.string().uuid().nullable(),
  components: z.array(ComponentRecordSchema),
})
export type EntityRecord = z.infer<typeof EntityRecordSchema>

export const PrefabDefinitionSchema = z.object({
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
import {
  PhysicsProjectSettingsSchema,
  defaultPhysicsProjectSettings,
} from './physics-project-settings.js'

export const SceneDocumentSchema = z.preprocess(
  (input) => {
    if (typeof input !== 'object' || input === null) return input
    let next = input as Record<string, unknown>
    if (!('renderSettings' in next)) {
      next = { ...next, renderSettings: defaultRenderSettings() }
    }
    if (!('physicsSettings' in next)) {
      next = { ...next, physicsSettings: defaultPhysicsProjectSettings() }
    }
    return next
  },
  z.object({
    schemaVersion: z.literal(1),
    metadata: SceneMetadataSchema,
    entities: z.array(EntityRecordSchema),
    prototypes: z.record(RenderPrototypeSchema).default({}),
    renderSettings: RenderSettingsSchema.default({}),
    physicsSettings: PhysicsProjectSettingsSchema.default({}),
  }),
)
export type SceneDocument = z.infer<typeof SceneDocumentSchema>

export { DEFAULT_ASSETS_DIR, projectPathToUrl, relativeToAssetsDir } from './paths.js'

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

export function validateSceneDocument(data: unknown): SceneDocument {
  return SceneDocumentSchema.parse(data)
}

export { isComponentEnabled, withComponentEnabled } from './component-enabled.js'
