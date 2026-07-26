import { z } from 'zod'

export declare const AssetIdBrand: unique symbol
export declare const AssetTypeIdBrand: unique symbol

export type AssetId = string & { readonly [AssetIdBrand]: true }
export type AssetTypeId = string & { readonly [AssetTypeIdBrand]: true }

export const AssetIdSchema = z.string().uuid().transform((value) => value as AssetId)
export const AssetTypeIdSchema = z.string().uuid().transform((value) => value as AssetTypeId)

export function assetId(value: string): AssetId {
  return AssetIdSchema.parse(value)
}

export function assetTypeId(value: string): AssetTypeId {
  return AssetTypeIdSchema.parse(value)
}

export interface AssetRef<TType extends AssetTypeId = AssetTypeId> {
  readonly $ref: AssetId
  readonly type?: TType
}

export const AssetRefSchema = z.object({
  $ref: AssetIdSchema,
  type: AssetTypeIdSchema.optional(),
}) as unknown as z.ZodType<AssetRef>

export function assetRef<TType extends AssetTypeId>(
  id: AssetId,
  type?: TType,
): AssetRef<TType> {
  return type === undefined ? { $ref: id } : { $ref: id, type }
}
