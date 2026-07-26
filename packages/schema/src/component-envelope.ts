import { z } from 'zod'

export type ComponentTypeId = string

export const ComponentTypeIdSchema = z
  .string()
  .uuid()

export function componentTypeId<T extends string>(value: T): T {
  return ComponentTypeIdSchema.parse(value) as T
}

export const ComponentRecordSchema = z.object({
  type: ComponentTypeIdSchema,
  data: z.record(z.unknown()),
})
export type ComponentRecord = z.infer<typeof ComponentRecordSchema>
