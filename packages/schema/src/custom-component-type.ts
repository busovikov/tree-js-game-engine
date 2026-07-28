import { z } from 'zod'
import { ComponentTypeIdSchema, type ComponentTypeId } from './component-envelope.js'

const FieldNameSchema = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
const InspectorLabelSchema = z.string().min(1).optional()
const SchedulerPhaseSchema = z.enum([
  'FrameInput',
  'AccumulateTime',
  'FixedInputSnapshot',
  'FixedPrePhysics',
  'PhysicsStep',
  'PostPhysics',
  'FixedGameplay',
  'FrameGameplay',
  'LateUpdate',
  'Presentation',
  'Render',
])

const NumberFieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('number'),
    default: z.number().finite(),
    inspector: z
      .object({
        label: InspectorLabelSchema,
        min: z.number().finite().optional(),
        max: z.number().finite().optional(),
        step: z.number().finite().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((field, context) => {
    const minimum = field.inspector?.min
    const maximum = field.inspector?.max
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Inspector min must be less than or equal to max',
        path: ['inspector', 'min'],
      })
    }
    if (
      (minimum !== undefined && field.default < minimum) ||
      (maximum !== undefined && field.default > maximum)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Field default must satisfy Inspector min/max',
        path: ['default'],
      })
    }
  })

const StringFieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('string'),
    default: z.string(),
    inspector: z
      .object({
        label: InspectorLabelSchema,
        placeholder: z.string().optional(),
        multiline: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict()

const BooleanFieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('boolean'),
    default: z.boolean(),
    inspector: z.object({ label: InspectorLabelSchema }).strict().optional(),
  })
  .strict()

const Vec2FieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('vec2'),
    default: z.tuple([z.number().finite(), z.number().finite()]),
    inspector: z.object({ label: InspectorLabelSchema }).strict().optional(),
  })
  .strict()

const Vec3FieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('vec3'),
    default: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    inspector: z.object({ label: InspectorLabelSchema }).strict().optional(),
  })
  .strict()

const ColorFieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('color'),
    default: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
    inspector: z.object({ label: InspectorLabelSchema }).strict().optional(),
  })
  .strict()

const EntityReferenceDefaultSchema = z
  .object({ $ref: z.string().regex(/^entity:[0-9a-f-]+$/i) })
  .strict()

const ComponentReferenceDefaultSchema = z
  .object({
    entity: EntityReferenceDefaultSchema,
    component: ComponentTypeIdSchema,
  })
  .strict()

const CustomAssetReferenceDefaultSchema = z
  .object({
    $ref: z.string().uuid(),
    type: z.string().uuid().optional(),
  })
  .strict()

const EntityReferenceFieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('entity-ref'),
    optional: z.boolean().default(true),
    default: EntityReferenceDefaultSchema.nullable().optional(),
    inspector: z.object({ label: InspectorLabelSchema }).strict().optional(),
  })
  .strict()

const AssetReferenceFieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('asset-ref'),
    assetType: z.string().uuid(),
    optional: z.boolean().default(true),
    default: CustomAssetReferenceDefaultSchema.nullable().optional(),
    inspector: z.object({ label: InspectorLabelSchema }).strict().optional(),
  })
  .strict()

const ComponentReferenceFieldSchema = z
  .object({
    name: FieldNameSchema,
    type: z.literal('component-ref'),
    componentType: ComponentTypeIdSchema.optional(),
    optional: z.boolean().default(true),
    default: ComponentReferenceDefaultSchema.nullable().optional(),
    inspector: z.object({ label: InspectorLabelSchema }).strict().optional(),
  })
  .strict()

export const CustomComponentFieldSchema = z.union([
  NumberFieldSchema,
  StringFieldSchema,
  BooleanFieldSchema,
  Vec2FieldSchema,
  Vec3FieldSchema,
  ColorFieldSchema,
  EntityReferenceFieldSchema,
  AssetReferenceFieldSchema,
  ComponentReferenceFieldSchema,
])

export const CustomComponentTypeAssetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: ComponentTypeIdSchema,
    name: z.string().trim().min(1),
    version: z.number().int().positive(),
    fields: z.array(CustomComponentFieldSchema),
    behaviorGraph: CustomAssetReferenceDefaultSchema.optional(),
    typescriptBehavior: z
      .object({
        exportName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
        domain: SchedulerPhaseSchema,
        query: z.array(ComponentTypeIdSchema),
        reads: z.array(z.string().min(1)),
        writes: z.array(z.string().min(1)),
        effects: z.array(z.string().min(1)),
        commands: z.array(z.enum(['add', 'set', 'remove'])),
      })
      .strict()
      .optional(),
    editorExtension: z
      .object({
        gizmoProvider: z.string().min(1).optional(),
        customWidget: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    inspector: z
      .object({
        category: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((asset, context) => {
    const names = new Set<string>()
    for (const [index, field] of asset.fields.entries()) {
      if (names.has(field.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate field: ${field.name}`,
          path: ['fields', index, 'name'],
        })
      }
      names.add(field.name)
      if (
        'optional' in field &&
        !field.optional &&
        (field.default === undefined || field.default === null)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Required reference field ${field.name} needs a default`,
          path: ['fields', index, 'default'],
        })
      }
    }
  })

export type CustomComponentField = z.output<typeof CustomComponentFieldSchema>
export type CustomComponentTypeAsset = z.input<typeof CustomComponentTypeAssetSchema>
export type ParsedCustomComponentTypeAsset = z.output<typeof CustomComponentTypeAssetSchema>
export type CustomComponentAssetReferenceField = Extract<
  CustomComponentField,
  { readonly type: 'asset-ref' }
>
export type CustomComponentComponentReference = {
  readonly entity: { readonly $ref: string }
  readonly component: ComponentTypeId
}
