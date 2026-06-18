import { z } from 'zod'

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])

export const EditorCameraStateSchema = z.object({
  position: Vec3Schema.default([0, 2, 5]),
  target: Vec3Schema.default([0, 0, 0]),
})
export type EditorCameraState = z.infer<typeof EditorCameraStateSchema>

export const ViewportTabSchema = z.enum(['scene', 'view'])
export type ViewportTab = z.infer<typeof ViewportTabSchema>

export const SceneEditorStateSchema = z.object({
  editorCamera: EditorCameraStateSchema.default({}),
  activeTab: ViewportTabSchema.default('scene'),
})
export type SceneEditorState = z.infer<typeof SceneEditorStateSchema>

export const EditorProjectSettingsSchema = z.object({
  version: z.literal(1).default(1),
  scenes: z.record(SceneEditorStateSchema).default({}),
})
export type EditorProjectSettings = z.infer<typeof EditorProjectSettingsSchema>

export const EDITOR_PROJECT_SETTINGS_PATH = '.haku/editor.json'

export function defaultEditorProjectSettings(): EditorProjectSettings {
  return EditorProjectSettingsSchema.parse({})
}

export function defaultSceneEditorState(): SceneEditorState {
  return SceneEditorStateSchema.parse({})
}
