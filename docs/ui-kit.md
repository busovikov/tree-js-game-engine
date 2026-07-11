# UI Kit — Editor Architecture

> How the @haku editor UI works, component patterns, and task recipes for agents.

---

## Where it lives

| What | Path |
| ---- | ---- |
| **UI kit (all React UI)** | `packages/editor/src/` |
| Reusable field/dialog components | `packages/editor/src/components/` |
| Docked panels | `packages/editor/src/panels/` |
| Layout shell | `packages/editor/src/EditorLayout.tsx`, `EditorApp.tsx` |
| Co-located styles | `*.css` next to each component/panel |
| Multi-edit helpers | `packages/editor/src/inspector/` |
| Viewport gizmos (not React) | `packages/editor/src/viewport/` |
| Collider wireframe preview | `viewport/scene-collider-gizmos.ts` — green wireframe on selected entity with `Collider` |
| Dev shell (mount point) | `apps/editor/src/main.tsx` |

**There is no separate `@haku/ui` package** — editor UI lives inside `@haku/editor`.

---

## Documentation

| Doc | Path | Contents |
| --- | ---- | -------- |
| **This file** | [`docs/ui-kit.md`](./ui-kit.md) | Components, patterns, do/don't |
| Architecture | [`docs/architecture.md`](./architecture.md) | Editor data flow |
| Edge cases | [`docs/edge-cases.md`](./edge-cases.md) | Empty states, validation |
| Links / API | [`docs/links.md`](./links.md) | Read/write rules, exports |

**Storybook: not configured.** There is no `storybook` script, config, or stories in this repo.

### How to preview UI (instead of Storybook)

```bash
pnpm --filter @haku/editor-app dev
```

Open the editor in browser — all components render in context (Hierarchy, Inspector, Viewport, dialogs). For isolated field work, temporarily mount the component in a panel or use React DevTools.

---

## Component catalog (existing)

### Layout & shell

| Component | File | Role |
| --------- | ---- | ---- |
| `EditorApp` | `EditorApp.tsx` | Root: menus, shortcuts, dialogs |
| `EditorLayout` | `EditorLayout.tsx` | `react-resizable-panels` dock layout |
| `ViewportTabsShell` | `ViewportTabsShell.tsx` | Scene / Game tab switcher |
| `MenuBar` | `components/MenuBar.tsx` | File / Edit / View dropdowns |

### Panels

| Component | File | Role |
| --------- | ---- | ---- |
| `HierarchyPanel` | `panels/HierarchyPanel.tsx` | Entity tree, drag-reparent |
| `HierarchyToolsPanel` | `panels/HierarchyToolsPanel.tsx` | Transform tool sidebar |
| `InspectorPanel` | `panels/InspectorPanel.tsx` | Selection properties orchestrator |
| `ViewportPanel` | `panels/ViewportPanel.tsx` | Canvas + engine lifecycle |
| `AssetBrowserPanel` | `panels/AssetBrowserPanel.tsx` | Asset tree, import, open scene |

### Inspector fields (reuse first)

| Component | File | Use for |
| --------- | ---- | ------- |
| `NumberField` | `components/NumberField.tsx` | Any numeric property |
| `DraggableNumberLabel` | `components/DraggableNumberLabel.tsx` | Scrub label (used by NumberField) |
| `SchemaFields` | `components/SchemaFields.tsx` | Simple Zod-driven components |
| `TransformFields` | `components/TransformFields.tsx` | Transform (Euler UI) |
| `CameraFields` | `components/CameraFields.tsx` | Camera component |
| `LightFields` | `components/LightFields.tsx` | Light component |
| `LightTemperatureSlider` | `components/LightTemperatureSlider.tsx` | Light color temperature |
| `MeshRendererFields` | `components/MeshRendererFields.tsx` | Mesh geometry + asset |
| `MaterialPropertiesPanel` | `components/MaterialPropertiesPanel.tsx` | Material registry fields |
| `TagFields` | `components/TagFields.tsx` | Tag component |
| `ColliderFields` | `components/ColliderFields.tsx` | Collider shape, size, static toggle |
| `InspectorComponentSection` | `components/InspectorComponentSection.tsx` | Collapsible component block wrapper |
| `AngleRangeSlider` | `components/AngleRangeSlider.tsx` | Spot light angles |

### Dialogs & menus

| Component | File | Role |
| --------- | ---- | ---- |
| `RenderSettingsDialog` | `components/RenderSettingsDialog.tsx` | Render settings modal |
| `RenderSettingsTabs` | `components/render-settings/RenderSettingsTabs.tsx` | Tabs inside dialog |
| `ModelPickerDialog` | `components/ModelPickerDialog.tsx` | Pick glTF model asset |
| `EntityCreateMenu` | `components/EntityCreateMenu.tsx` | Create entity / primitive / light |
| `HierarchyFilterBar` | `components/HierarchyFilterBar.tsx` | Hierarchy search/filter |

### Hooks & utils (UI-related)

| Module | File | Role |
| ------ | ---- | ---- |
| `use-number-scrub` | `components/use-number-scrub.ts` | Pointer scrub for numbers |
| `multi-edit` | `inspector/multi-edit.ts` | Mixed-value merge for multi-select |
| `model-picker-utils` | `components/model-picker-utils.ts` | Model list helpers |

### CSS class systems (use these, don't invent new)

| Prefix / class | File | Scope |
| -------------- | ---- | ----- |
| `haku-*` | `editor-layout.css`, `inspector-panel.css`, … | Layout, panels, inspector |
| `mesh-field*` | `mesh-renderer-fields.css` | Numeric/text inspector fields |
| `menu-bar*` | `menu-bar.css` | Menu dropdowns |
| `haku-model-picker*` | `model-picker-dialog.css` | Model picker dialog |
| `haku-resize-handle*` | `editor-layout.css` | Panel resize handles |

---

## Components to use (required)

When building editor UI, **start from these** — do not rebuild equivalents:

| Need | Use |
| ---- | --- |
| Number input in inspector | `NumberField` |
| Multi-select mixed values | `NumberField` with `mixed` + `inspector/multi-edit.ts` |
| New simple component fields | `SchemaFields` (or extend `*Fields.tsx` pattern) |
| Material properties | `MaterialPropertiesPanel` + schema registry |
| Collapsible component block | `InspectorComponentSection` |
| Scene mutation | `commitSceneEdit` — not direct store write |
| Panel layout | `EditorLayout` + `react-resizable-panels` |
| Dropdown menu | `MenuBar` pattern (`menu-bar__*`) |
| Modal dialog | `RenderSettingsDialog` / `ModelPickerDialog` as reference |
| Entity creation | `EntityCreateMenu` + `world-commands.ts` |
| Collider authoring | `ColliderFields` + `commitSceneEdit`; viewport preview via `SceneColliderGizmos` |
| Empty state copy | Match existing: `Select an entity`, `No entities — click +` |

---

## Forbidden — do not use or build from scratch

| ❌ Forbidden | ✅ Use instead |
| ------------ | -------------- |
| **MUI, Ant Design, Chakra, Radix, shadcn** | Existing `haku-*` / `mesh-field*` CSS + components above |
| **Tailwind CSS** | Co-located CSS files, match design tokens below |
| **React Three Fiber (R3F)** | `@haku/engine` in `ViewportPanel` `useEffect` |
| **Raw `<input type="number">` in inspector** | `NumberField` |
| **Custom modal/dialog framework** | Copy `RenderSettingsDialog` / `ModelPickerDialog` pattern |
| **Custom panel splitter** | `react-resizable-panels` via `EditorLayout` |
| **Global CSS-in-JS (styled-components, emotion)** | Co-located `*.css` imports |
| **Direct Zustand mutation for user edits** | `commitSceneEdit` |
| **Three.js objects in React state** | Engine backend only |
| **New UI package outside `@haku/editor`** | Keep all editor UI in `packages/editor/` |
| **Storybook-only components** | No Storybook — components must work in editor app |

**Rule:** if a component already exists in the catalog above, **extend it** — do not duplicate with a new name.

---

## Stack

| Layer | Technology |
| ----- | ---------- |
| UI framework | React 18 + TypeScript |
| State | Zustand (`useEditorStore`) |
| Layout | `react-resizable-panels` |
| Styling | Co-located CSS files, BEM-like `haku-*` / `mesh-field*` classes |
| 3D viewport | `@haku/engine` in `useEffect` — gizmos via Three.js addons in editor only |

**No UI framework** (MUI, Tailwind, etc.) — custom dark-theme CSS.

---

## App structure

```
EditorApp
├── MenuBar                    File / Edit / View menus
├── RenderSettingsDialog       Modal (View → Render Settings)
└── EditorLayout
    ├── HierarchyPanel         Entity tree + filter
    ├── HierarchyToolsPanel    Transform tool buttons (sidebar)
    ├── ViewportTabsShell      Scene | Game tabs → ViewportPanel
    ├── AssetBrowserPanel      Asset tree + import
    └── InspectorPanel         Selection properties
```

Entry: `packages/editor/src/EditorApp.tsx`  
Shell app: `apps/editor/src/main.tsx` mounts `<EditorApp />`

---

## Layout system

`EditorLayout.tsx` — horizontal split: **Hierarchy | Center | Inspector**

Center column — vertical split: **Viewport | Assets**

```tsx
<PanelGroup direction="horizontal" autoSaveId="haku-editor-panels-h">
  <Panel> Hierarchy + Tools </Panel>
  <Panel> Viewport / Assets (nested vertical PanelGroup) </Panel>
  <Panel> Inspector </Panel>
</PanelGroup>
```

CSS: `editor-layout.css`, `viewport-tabs.css`

Panel shell class: `haku-panel-shell` — flex column, min-height 0, border `#333`.

---

## Design tokens (de facto)

| Token | Value | Usage |
| ----- | ----- | ----- |
| App background | `#1a1a2e` | Layout root |
| Panel border | `#333` | Panel shells |
| Panel alt bg | `#22222c` | Tool sidebar |
| Accent | `#3d5afe` | Resize handle hover, selection |
| Text primary | `#eee` / `#ddd` | Labels, menu |
| Text muted | `#aaa` / `#666` | Hints, disabled |
| Dropdown bg | `#1e1e28` | Menu dropdowns |
| Input bg | dark inline styles / `.mesh-field__input` | Inspector fields |
| Font size | 12–13px | Fields, menus |

No centralized token file — match existing CSS when adding components.

---

## State management (Zustand)

Store: `packages/editor/src/store/editor-store.ts`

### Key state slices

| Field | Purpose |
| ----- | ------- |
| `world` | Current `IWorld` instance |
| `sceneDocument` | Serializable scene (save source) |
| `worldRevision` | Incremented on every world commit — viewport watches this |
| `selection` | `EntityId[]` |
| `mode` | `'edit' \| 'play'` |
| `transformTool` | `'translate' \| 'rotate' \| 'scale' \| 'hand'` |
| `gizmoSpace` | `'local' \| 'world'` |
| `activeViewportTab` | `'scene' \| 'game'` |
| `projectRoot`, `scenePath` | Open project context |
| `commandRevision` | Bumped after undo/redo — menu refresh |

### Selector pattern

```tsx
// Good — granular subscription
const selection = useEditorStore((s) => s.selection)

// Bad — re-render on any store change
const store = useEditorStore()
```

Heavy panels use `memo()`. Viewport does **not** subscribe to inspector field-level state.

---

## Mutation flow (critical)

All user edits that change the scene:

```
User interaction
  → commitSceneEdit((draft) => { /* mutate draft.world + draft.sceneDocument */ })
  → SceneEditCommand → globalCommandBus
  → store update + worldRevision++
  → ViewportPanel useEffect → engine.setWorld(world)
```

Alternative for atomic ops: implement `Command` class, call `globalCommandBus.execute(cmd)`.

**Files:**
- `commands/scene-history.ts` — `commitSceneEdit`, `captureSceneSnapshot`
- `commands/command-bus.ts` — undo/redo stack
- `commands/world-commands.ts` — create entity, prefab, duplicate
- `commands/hierarchy-commands.ts` — delete, reparent

---

## Inspector architecture

`InspectorPanel.tsx` orchestrates; sub-components per component type.

### Component routing

| Component | UI module |
| --------- | --------- |
| Transform | `TransformFields.tsx` (Euler UI → quaternion) |
| Camera | `CameraFields.tsx` |
| Light | `LightFields.tsx` + `LightTemperatureSlider.tsx` |
| MeshRenderer | `MeshRendererFields.tsx` → `MaterialPropertiesPanel.tsx` |
| Tag | `TagFields.tsx` |
| ScriptRef | `SchemaFields.tsx` (generic) |

Hidden from add menu but present: `Tag`, `Static`. Transform always shown.

### InspectorComponentSection

Wrapper for collapsible component blocks — `InspectorComponentSection.tsx` + `inspector-component-section.css`.

Props: title, enabled toggle, onRemove, collapsed state.

### Multi-edit

When `selection.length > 1`:
- `multi-edit.ts` merges values; `null` = mixed → show `—`
- `NumberField` accepts `mixed` prop
- Header: `"N entities selected"`

---

## Field components (reuse these)

### NumberField

`components/NumberField.tsx`

- Label with drag-to-scrub via `DraggableNumberLabel`
- CSS: `mesh-field`, `mesh-field__label`, `mesh-field__input`
- Mixed state: empty input + `--mixed` class

### SchemaFields

Generic Zod-driven fields for simple components — iterates `coreComponentSchemas[componentId].shape`.

Use for new simple components before building dedicated UI.

### MaterialPropertiesPanel

Registry-driven from `@haku/schema/material.ts`:
- `MATERIAL_TYPES`, `MATERIAL_TYPE_LABELS`
- `MATERIAL_PROPERTY_SPECS` — kind: `color` | `number` | `boolean`
- Type switch calls `switchMaterialType()`

---

## Viewport architecture

`ViewportPanel.tsx` — largest integration point.

### Lifecycle

```tsx
useEffect(() => {
  const engine = new Engine({ canvas, ... })
  engine.start()
  return () => engine.dispose()
}, []) // once

useEffect(() => {
  engine.setWorld(world) // or loadWorld on scene change
}, [world, worldRevision, sceneDocument])
```

**Never** store Three.js objects in React state.

### Editor-only viewport modules

| Module | Role |
| ------ | ---- |
| `viewport-orbit.ts` | OrbitControls wrapper |
| `viewport-camera-look.ts` | Fly/look mode |
| `transform-gizmo-config.ts` | TransformControls setup |
| `scene-selection-outline.ts` | Selection highlight |
| `scene-light-gizmos.ts` | Light helpers |
| `scene-camera-gizmos.ts` | Camera frustum |
| `scene-aabb-gizmos.ts` | Bounding boxes |
| `shadow-volume-gizmos.ts` | Shadow frustum preview |
| `focus-selection.ts` | Frame selected object |
| `transform-tool-shortcuts.ts` | W/E/R/Q keyboard |

Gizmo writes: `commitTransformChange()` in `scene-history.ts`.

### Picking

Engine exposes `pickEntityAt` / `pickEntitiesInRect`. Viewport handles click + marquee → `selectEntity()`.

---

## Hierarchy

`HierarchyPanel.tsx` — virtual list from `hierarchy-list.ts`.

- Filter: `HierarchyFilterBar.tsx` + `entity-filter.ts`
- Drag-reparent: `hierarchy-drag.ts`
- Create menu: `EntityCreateMenu.tsx` → `world-commands.ts`

`HierarchyToolsPanel.tsx` — icon buttons for translate/rotate/scale/hand, gizmo local/world, snap, AABB toggle.

---

## Asset browser

`AssetBrowserPanel.tsx` — three-column project asset explorer via `projectService`.

| Column | Role |
| ------ | ---- |
| **Tree (left)** | Lazy-loaded folder tree from `assetsRoot`; click to navigate |
| **Quick actions (middle)** | Narrow icon strip (same pattern as `HierarchyToolsPanel`); context pictograms for selected file/folder |
| **File list (right)** | Files and folders in the current directory |

**Layout (top → bottom):** search bar (project-wide file search) → resizable columns (tree toolbar + tree | fixed quick-action icons | file list + path footer).

**Search:** matches file names across the whole project. Tree shows only folders that contain matches (ancestors expanded). File list shows matching **files** in the selected folder only. If the selected folder has no matches, selection jumps to the first folder that does.

**Tree toolbar:** `+` menu (New Folder, Import), Go Up, Refresh — pictogram buttons above the folder tree.

**Quick actions:** Rename, Duplicate, type-specific actions, shell actions — narrow icon strip (fixed width; tree/files columns resize via handles on both sides).

**File list footer:** editable path + copy pictogram at the bottom of the file column.

**Quick actions by type:**
- All files / folders → Rename, Duplicate (button + ⌘D when panel focused)
- Model / prefab → Assign to Entity (requires hierarchy selection)
- Scene (`.scene.json`) → Open Scene
- Native/playground → Show in Finder, Open in Terminal (disabled for in-memory projects; playground dev server required for shell integration)

**Keyboard:** ⌘D duplicates the selected asset when the asset panel is focused — entity duplicate is suppressed in that context.

**CSS:** `asset-browser-panel.css` (`haku-asset-browser__*`)

---

## Menu bar

`MenuBar.tsx` + `menu-bar.css`

Dropdown pattern: `menu-bar__menu` → trigger + `menu-bar__dropdown`.

Actions wired in `EditorApp.tsx`:
- Open / Create / Save project
- Undo / Redo (`globalCommandBus`)
- Play / Stop
- Render Settings dialog

---

## Render Settings UI

`RenderSettingsDialog.tsx` → `render-settings/RenderSettingsTabs.tsx`

Changes scene tab via `commitSceneEdit` on `sceneDocument.renderSettings`.

---

## CSS conventions

| Pattern | Example |
| ------- | ------- |
| Block | `.haku-inspector`, `.haku-hierarchy-tool` |
| Element | `.mesh-field__label`, `.menu-bar__item` |
| Modifier | `.haku-resize-handle--horizontal`, `.mesh-field__input--mixed` |
| Co-location | `ComponentName.tsx` + `component-name.css` in same folder |

Import CSS in the component file: `import './inspector-panel.css'`

---

## Task recipes

### Add collider to entity (mode B)

1. Select entity → Inspector → **Add Component** → **Collider**
2. Edit shape/size/static in `ColliderFields` (mutates via `commitSceneEdit`)
3. Viewport shows green wireframe bounds on selected entity (`SceneColliderGizmos`)
4. Save scene — verify `Collider` block in scene JSON; play mode uses Rapier sync (T01.8+)

### Add inspector field to existing component

1. Add field to Zod schema in `@haku/schema`
2. If Camera/Light/Mesh — edit dedicated `*Fields.tsx`
3. Else extend `SchemaFields` or add section in `InspectorPanel`
4. Wire `onChange` → `commitSceneEdit` updating both world component and `sceneDocument` entity record
5. If visual — ensure `RenderSyncSystem` reads new field

### Add new material property

1. Add to type schema in `material.ts`
2. Add to `MATERIAL_PROPERTY_SPECS`
3. Extend factory in `mesh-factory.ts`
4. `MaterialPropertiesPanel` auto-renders from registry — no panel change if spec added

### Add new panel

1. Create `panels/MyPanel.tsx` + CSS
2. Add to `EditorLayout.tsx` in appropriate `Panel`
3. Subscribe only to needed store slices
4. Wrap in `memo()`

### Add menu action

1. Add item in `MenuBar.tsx`
2. Handler in `EditorApp.tsx` (or extract hook if large)
3. Scene mutations → `commitSceneEdit` or command in `commands/`

### Add viewport overlay / gizmo

1. Create module under `viewport/`
2. Mark objects with `userData.hakuEditorOverlay = true` (excluded from game pick)
3. Add to `backend.threeScene` in ViewportPanel effect
4. Clean up on unmount / selection change
5. **Do not** add to `@haku/engine` public API unless needed at runtime

### Add keyboard shortcut

1. Register in `EditorApp.tsx` `useEffect` keydown handler (existing pattern)
2. Or extend `transform-tool-shortcuts.ts` for tool keys
3. Guard: `mode === 'edit'`, not typing in input (`event.target` check)

### Add undoable operation

```typescript
// Option A — scene edit
commitSceneEdit((draft) => {
  // mutate draft
})

// Option B — custom command
class MyCommand implements Command {
  execute() { ... }
  undo() { ... }
}
globalCommandBus.execute(new MyCommand())
useEditorStore.getState().bumpCommands()
```

---

## Performance checklist

- [ ] Panel wrapped in `memo()`
- [ ] Zustand selectors are narrow
- [ ] No Three.js in React state
- [ ] Engine created once per viewport mount
- [ ] Scene edits bump `worldRevision`, not per-keystroke without commit
- [ ] Heavy lists virtualized or filtered (`hierarchy-list.ts`)

---

## File map

```
packages/editor/src/
├── EditorApp.tsx              Root, menus, shortcuts
├── EditorLayout.tsx           Panel layout
├── ViewportTabsShell.tsx      Tab switcher
├── store/editor-store.ts      Zustand
├── commands/                  Undo, scene edits, world ops
├── panels/                    Hierarchy, Inspector, Viewport, Assets
├── components/                Reusable fields, dialogs, menus
├── viewport/                  Gizmos, camera, picking helpers
├── hierarchy/                 Tree list, drag, filter
├── inspector/                 Multi-edit helpers
├── selection/                 Selection utils
├── services/                  Project I/O
└── transform/                 Euler ↔ quaternion
```

See also: [architecture.md](./architecture.md), [edge-cases.md](./edge-cases.md).
