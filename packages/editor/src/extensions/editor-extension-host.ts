import { z } from 'zod'
import { entityId, type ComponentDefinition } from '@haku/core'
import type { BrowserProjectTrustMode } from '@haku/build'
import { commitSceneEdit } from '../commands/scene-history.js'
import { useEditorStore } from '../store/editor-store.js'

const Vec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])

export const GizmoPrimitiveSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('line'),
      from: Vec3Schema,
      to: Vec3Schema,
      color: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('sphere'),
      center: Vec3Schema,
      radius: z.number().finite().nonnegative(),
      color: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('box'),
      center: Vec3Schema,
      size: Vec3Schema,
      color: z.string().min(1),
    })
    .strict(),
])

export type GizmoPrimitive = z.infer<typeof GizmoPrimitiveSchema>

export interface GizmoProviderContext {
  readonly entityId: string
  readonly componentType: string
  readonly data: Readonly<Record<string, unknown>>
}

export interface GizmoProvider {
  draw(context: GizmoProviderContext): readonly GizmoPrimitive[]
}

export interface GizmoComponentEdit {
  readonly entityId: string
  readonly componentType: string
  readonly patch: Readonly<Record<string, unknown>>
}

export type EditorExtensionResolution =
  | { readonly status: 'none'; readonly inert: true }
  | {
      readonly status: 'unresolved'
      readonly inert: true
      readonly message: string
    }
  | {
      readonly status: 'ready'
      readonly inert: false
      readonly bundle: unknown
    }

export async function resolveEditorExtension(
  component: ComponentDefinition,
  trustMode: BrowserProjectTrustMode,
  loadBundle: () => Promise<unknown>,
): Promise<EditorExtensionResolution> {
  if (!component.editorExtension) return { status: 'none', inert: true }
  if (trustMode === 'imported-untrusted') {
    return {
      status: 'unresolved',
      inert: true,
      message: `Editor extension for ${component.name} is unresolved because this project is untrusted.`,
    }
  }
  return {
    status: 'ready',
    inert: false,
    bundle: await loadBundle(),
  }
}

export function validateGizmoPrimitives(
  primitives: readonly GizmoPrimitive[],
): readonly GizmoPrimitive[] {
  return z.array(GizmoPrimitiveSchema).parse(primitives)
}

export function createExampleSpeedGizmoProvider(): GizmoProvider {
  return {
    draw(context) {
      const speed = context.data.speed
      const primitives = [
        {
          kind: 'sphere' as const,
          center: [0, 0, 0] as [number, number, number],
          radius: typeof speed === 'number' && Number.isFinite(speed) ? Math.abs(speed) : 0,
          color: '#58a6ff',
        },
      ]
      return validateGizmoPrimitives(primitives)
    },
  }
}

export function applyGizmoComponentEdit(edit: GizmoComponentEdit): void {
  const currentWorld = useEditorStore.getState().world
  if (!currentWorld) throw new Error('No scene loaded')
  const id = entityId(edit.entityId)
  const component = currentWorld.getComponentDefinition(id, edit.componentType)
  if (!component) {
    throw new Error(`Unknown gizmo component type: ${edit.componentType}`)
  }

  commitSceneEdit((draft) => {
    const current = draft.world.getComponent(id, component)
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Entity ${edit.entityId} does not have component ${edit.componentType}`)
    }
    const next = component.schema.parse({
      ...current,
      ...edit.patch,
    })
    draft.world.addComponent(id, component, next)
  })
}
