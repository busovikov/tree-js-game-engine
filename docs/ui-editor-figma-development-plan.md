# Figma-like UI Editor Development Plan

## Status and execution rule

This document defines the strictly sequential program for turning the existing `@haku/ui`
document editor into a production-capable visual authoring MVP. It is the decision source for
this program. A milestone may start only after the preceding milestone has its acceptance
criteria and evidence recorded. Each implementation milestone ends in a reviewable commit.

Breaking changes are intentional. When a serialized UI contract changes, every repository
consumer, fixture, built-in UI asset, editor command, service, and runtime renderer must move to
the new contract in the same milestone. Do not add a version adapter, dual reader/writer, legacy
fallback, migration command, deprecated alias, or compatibility layer.

Before and after every milestone, run `git status --short`. The following pre-existing user work
is protected and outside this program:

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`

Do not read, edit, delete, format, stage, or commit those paths. Stage milestone files with
explicit pathspecs; never use `git add .` or `git add -A`. If an implementation milestone needs a
runtime UI fixture, create a new, separately named test fixture outside the protected paths until
the owner explicitly authorizes changes there.

## Product goal

Give a game creator a fast, spatial UI workflow that feels familiar to users of modern design
tools: the Layers tree and canvas are two views of one hierarchy; frames define responsive
layout; elements can be created where the user is working; and selection, move, resize, reorder,
reparent, snapping, components, and property editing are direct and undoable.

The author must be able to build and maintain a complete game HUD or menu without hand-editing
JSON. The saved `UIDocument` is the source used by the production renderer. Preview and runtime
must therefore agree on hierarchy, layout, styling, state, accessibility, and event semantics.

“Figma-like” describes interaction principles, not a visual clone. The editor keeps the @haku
dark UI, existing controls, command history, project service, and package boundaries.

### Success measures

- A new user can create a responsive HUD, populate it with the required primitives/widgets,
  reorganize it, preview it at multiple viewport sizes, and save it without editing JSON.
- Any selectable rendered node maps to exactly one Layers entry and vice versa, including nodes
  inside an editable component master.
- Common authoring actions—create, select, move, resize, reorder, reparent, duplicate, delete,
  undo, redo, pan, zoom, and fit—are available from canvas and keyboard where appropriate.
- The same React-free renderer used by a game supplies the editor preview; editor overlays never
  enter serialized UI or the production package.
- Bounce Run's HUD and one menu/overlay state are authored with the resulting system and expose
  the gaps that matter in a real game.

## Non-goals

- Copying Figma branding, appearance, file format, plugin model, collaboration, multiplayer
  cursors, comments, branching, or cloud storage.
- A general-purpose vector illustration tool, Bézier/path editor, image editor, or typography
  engine.
- Arbitrary HTML/CSS/JavaScript authoring, embedded React components, or runtime React.
- Full design-token/theme-variable authoring, variants, conditional component properties, data
  binding, list virtualization, or repeaters in the MVP.
- Responsive breakpoint scripting. The MVP uses deterministic frame layout, sizing, and
  constraints at any viewport size.
- Animation timelines, transitions, or visual event-graph authoring. Runtime events are exposed
  so gameplay code/graphs can react, but graph integration beyond the existing service boundary
  is a follow-up.
- Preserving schema version 1 or automatically upgrading old documents. Repository-owned
  consumers change atomically; external migration is deliberately deferred until a public
  compatibility policy exists.

## Baseline and gaps

The current baseline is useful but narrow:

- `UIDocumentSchema` strictly validates a single rooted tree and rejects duplicate, missing,
  multiply-parented, cyclic, and unreachable elements.
- The four element types are `container`, `text`, `button`, and `image`.
- Containers render as DOM flex boxes with row/column direction, optional wrapping,
  justification, alignment, and a scalar gap.
- Sizing already represents non-negative pixel numbers, percentages, and `auto`, with min/max,
  grow, shrink, and basis. Anchors already produce absolute positioning. Styles cover the first
  set of text, background, border, opacity, cursor, padding/margin, and image-fit properties.
- `UIDocumentInstance` is React-free, renders native DOM, resolves texture assets, supports
  visibility/enabled/text runtime state, and emits button activation.
- Editor mutations replace a strictly parsed asset through a workspace `CommandBus`; selection
  and desktop preview presets stay editor-only.
- The authoring UI offers a click-only tree, four add buttons, a small inspector, and production
  preview. It has no tree DnD, direct canvas manipulation, insertion markers, guides, snapping,
  component instances, or cursor-aware creation.
- The preview is permanently `scale(0.5)` with top-left origin. The UI tab occupies only the
  center viewport while scene Hierarchy, tools, Inspector, and Asset Browser remain around it.
- Width and height fields coerce every non-number, including `100%` and `auto`, to `0`, so the
  inspector can silently destroy valid sizing intent.

The program extends these foundations; it does not introduce a second renderer or a parallel UI
document model.

## Product interaction contract

### One hierarchy, two surfaces

Layers order is paint/layout order. The canvas and Layers panel share selection, hover, rename,
visibility, lock state, parentage, and sibling order. Reordering or reparenting in either surface
updates the same serialized child list through one command. There is no editor-only hierarchy.

A Frame is the root-capable container and the boundary for free positioning, clipping,
scrolling, layout, and constraints. “Container” remains the user-facing generic Frame preset;
the serialized kind is `frame` so root and nested containers have identical semantics.

### Canvas navigation and editing modes

- The canvas has its own pan/zoom transform. Documents open centered with `Fit` when they do not
  have a saved editor view; no hard-coded preview scale is applied.
- Zoom range is 10%–800%. Trackpad/pointer zoom is anchored under the cursor. Middle-drag or
  Space+drag pans. `1` resets to 100%, `Shift+1` fits the root, and `Shift+2` fits selection.
- Edit mode uses the production renderer beneath editor-only hit targets, selection outlines,
  handles, guides, and insertion markers. Preview mode disables editing overlays and lets native
  controls receive input. Escape returns to Edit mode.
- Click selects the topmost unlocked element; repeated modified click cycles overlapping
  ancestors. Double-click descends into a frame or component master. Shift-click toggles
  multi-selection only when the operation has a well-defined common coordinate space.
- Drag moves free-positioned elements. Resize handles update the selected dimension mode to
  Fixed unless the user holds the modifier that explicitly edits constraints. Auto-layout
  children reorder by drag and resize only along dimensions whose sizing mode permits it.
- Arrow keys nudge by 1 px and Shift+Arrow by 10 px. All pointer drags are previews until pointer
  up, then commit as one undo step. Escape cancels the in-progress gesture without a command.

### Creation rule

Creation is deterministic and never defaults silently to the document root when a better local
context exists:

1. If the user invokes a tool over an unlocked Frame, create in that Frame at the pointer.
2. Otherwise, if the selected element is a Frame, create in the selected Frame.
3. Otherwise, create in the selected element's nearest unlocked Frame parent.
4. If there is no selection, create in the root Frame.

In a free-layout Frame, store pointer-relative `x/y`. In an auto-layout Frame, show an insertion
marker and insert at that sibling index; pointer coordinates do not become serialized offsets.
Keyboard/palette creation without a pointer inserts after the selected sibling or at the end of
the chosen Frame. Creating an Image opens the existing project asset picker instead of asking for
a UUID.

### End-to-end author workflows

#### Create and frame a new UI

1. Open the UI workspace. Scene panels are replaced by UI Layers, the UI canvas, and UI
   Inspector; the global menu remains available.
2. Create/open a UI asset and choose a preview size or enter a custom root size.
3. The root Frame appears centered at fit zoom. The creator may add nested Frames at the cursor,
   rename them inline, and set free, horizontal, vertical, or grid layout.
4. Save writes one strictly validated document and refreshes project dependencies.

#### Build a responsive group

1. Select a Frame and enable horizontal, vertical, grid, or wrapped auto layout.
2. Set four-sided padding, row/column gap, distribution, cross-axis alignment, wrapping, and
   clipping/overflow.
3. Set each child's width and height independently to Hug, Fill, or Fixed, including unit and
   min/max bounds.
4. Resize the parent or switch preview dimensions. Canvas and runtime preview produce the same
   result without changing serialized values.

#### Select and directly manipulate

1. Click a rendered element or its Layers row; both surfaces select the same ID.
2. Drag/resize with live overlays. Nearby edges, centers, gaps, and parent padding produce guides
   and snapping; holding the platform modifier temporarily disables snapping.
3. Commit once on pointer up. Inspector fields update without coercing `%`, Hug, Fill, or Auto to
   pixels. Undo restores the whole prior operation.

#### Reorder and reparent

1. Drag one or more Layers rows or canvas selections.
2. Valid Frames highlight and a before/inside/after insertion marker identifies the exact target.
3. Cycles, locked parents, moving the root, and cross-scope component moves are rejected before
   mutation. Dropping into free layout converts coordinates to the new parent's space; dropping
   into auto layout clears free placement and adopts flow order.
4. The move is one undoable command and preserves relative order for multi-selection.

#### Create and reuse a component

1. Select a valid subtree and choose Create component. It becomes a named component master in
   the document's Components collection.
2. Insert instances from the palette at the pointer/selected parent. Instances inherit master
   hierarchy, layout, styles, content, accessibility, and behavior bindings.
3. Override allowed values on an instance. Reset override restores the master value. Structural
   editing happens only in the master; Detach creates concrete elements with fresh IDs.
4. Editing the master updates every instance immediately in editor preview and runtime.

#### Wire and verify runtime behavior

1. Define named document events and bind supported widget event slots in Inspector.
2. Toggle Preview, use controls with mouse and keyboard, and inspect a visible event log with
   element ID, binding ID, event type, and scalar value.
3. Gameplay subscribes through `UIDocumentInstance`; runtime state changes never mutate the
   serialized authoring asset.

#### Dogfood in Bounce Run

1. Build a HUD with score/progress, controls/status, and responsive Frames.
2. Build at least one interactive menu or overlay using form widgets and events.
3. Exercise it at the supported desktop presets and a narrow custom viewport.
4. Record every authoring workaround as a failure against this MVP, fix it in the owning
   milestone, and retain the project as browser regression coverage.

## Required element and runtime semantics

The model distinguishes primitives from widgets. A primitive provides display/layout semantics
and has no user-managed value. A widget owns a typed runtime value or activation behavior and
uses a native semantic DOM control where one exists. Serialized values are initial/default
values; instance values live in `UIDocumentInstance` state and are reset when the instance is
destroyed or explicitly reset.

All elements share `id`, optional `name`, `visible`, `enabled`, sizing, placement/constraints,
style, accessibility, and event bindings allowed for that kind. Layer lock is persisted in the
editor's per-asset workspace metadata, not in runtime UI JSON. Runtime `enabled: false` uses native
`disabled` for form controls and `inert` for non-controls. Hidden uses native `hidden`. Focused
controls must retain state and focus across unrelated runtime state updates; a full document
replacement may remount.

| Element           | Class                      | Runtime DOM and semantics                                                                               | Value and emitted events                                                                                       |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Frame / Container | Primitive                  | `div`; free/auto layout, clipping and overflow; root establishes the positioned containing block        | No value; optional `focus`/`blur` only when explicitly focusable                                               |
| Text              | Primitive                  | `span` or semantic text role; preserves configured wrapping/alignment                                   | Mutable string through `setText`; no user event                                                                |
| Image             | Primitive                  | `img` through required asset resolver; explicit alt text and object fit                                 | No value; `load`/`error` remain DOM details, not game events in MVP                                            |
| Button            | Widget                     | Native `button type="button"`                                                                           | No persistent value; emits `activate` with no value                                                            |
| Shape / Rectangle | Primitive                  | Non-interactive `div` with fill, stroke, radius, opacity; rectangle only in MVP                         | No value or event unless explicitly made focusable/activatable later                                           |
| Text Input        | Widget                     | Native single-line `input`; supports placeholder, required, read-only, max length, input mode           | String; emits `input` on each user edit, `change` on commit, `submit` on Enter when bound, plus `focus`/`blur` |
| Text Area         | Widget                     | Native `textarea`; configurable rows, placeholder, required, read-only, max length, resize policy       | String; emits `input`, `change`, `focus`, `blur`; Enter inserts newline and does not submit                    |
| Checkbox          | Widget                     | Native checkbox with label association                                                                  | Boolean; emits `change` after state changes, value is the new boolean                                          |
| Radio             | Widget                     | Native radio; serialized `group` and string `optionValue`; same-group radios are exclusive per instance | Selected option string or `null`; newly selected radio emits `change` with its `optionValue`                   |
| Toggle / Switch   | Widget                     | Native checkbox semantics with `role="switch"`; visual track/thumb are renderer-owned                   | Boolean; emits `change` with the new boolean                                                                   |
| Select            | Widget                     | Native `select` with serialized ordered options `{value,label,disabled}` and optional placeholder       | String or `null`; emits `change` with selected value                                                           |
| Slider            | Widget                     | Native `input type="range"`; finite min/max/step and initial value validated together                   | Finite number; emits `input` while dragging and `change` on commit                                             |
| Progress          | Widget (read-only)         | Native `progress`; finite min/max/value or indeterminate                                                | Number or `null` for indeterminate; runtime-settable, no user event                                            |
| Divider           | Primitive                  | Separator element with orientation, thickness, and style; semantic `role="separator"`                   | No value or event                                                                                              |
| Spacer            | Primitive                  | Layout-only element with sizing and no painted content; `aria-hidden="true"`                            | No value or event                                                                                              |
| Scroll Container  | Primitive container        | `div` with explicit x/y overflow policy, clipping, and child hierarchy                                  | Scroll offset is ephemeral instance state; optional throttled `scroll` event is out of MVP                     |
| List              | Primitive container preset | Semantic list container with ordered static children; layout/scroll behavior uses Frame rules           | No data binding/repeater/value in MVP; children remain normal selectable elements                              |

“List” is deliberately a semantic/static container primitive, not a data-driven widget. `frame`,
`scroll-container`, and `list` are distinct serialized container kinds, while Divider, Spacer,
and Rectangle are distinct leaf kinds because their Inspector, accessibility, hit testing, and
default sizing differ even when the renderer can implement them with small DOM primitives.

### Runtime value and event API

Replace the activation-only event surface with a discriminated runtime contract:

```ts
type UIEventType = 'activate' | 'input' | 'change' | 'submit' | 'focus' | 'blur'
type UIValue = string | number | boolean | null

interface UIRuntimeEvent {
  type: UIEventType
  documentId: AssetId
  elementId: UIElementId
  bindingId?: UIEventId
  value?: UIValue
}
```

Element schemas expose only valid binding slots—for example Button has `activate`, Slider has
`input` and `change`, and Progress has none. A binding references a declared document event whose
payload kind must match the slot (`none`, `string`, `number`, or `boolean`; nullable Select/Radio
uses the matching scalar kind and omits dispatch when clearing an optional selection unless a
specific clear binding is configured in a later version). Schema validation rejects missing or
type-incompatible event definitions.

`UIDocumentInstance` exposes typed `getValue`, `setValue`, and `resetValue` only for value-bearing
widgets, plus the existing visibility/enabled/text operations. Programmatic `setValue` updates
DOM and state but does not emit a user event. User input updates state before dispatch. Unknown
IDs, unsupported operations, invalid values, and unavailable asset resolvers throw explicit
errors; no service operation silently no-ops.

## Serialized model version 2

Milestone 1 replaces schema version 1 outright. The following decisions are normative; exact
TypeScript names may be refined without weakening them.

### Document structure

```ts
interface UIDocumentV2 {
  schemaVersion: 2
  id: AssetId
  name: string
  root: UIElementId
  elements: UIElement[]
  components: UIComponentDefinition[]
  events: UIEventDefinition[]
  themes: UITheme[]
  defaultTheme?: UIThemeId
}

interface UIComponentDefinition {
  id: UIComponentId
  name: string
  root: UIElementId
  elements: UIElement[]
}
```

Document elements form one strict tree rooted at `root`. Each component definition owns another
strict tree. Element IDs are globally unique across the document and all component definitions,
which keeps diagnostics, overrides, and runtime lookup deterministic. No element can be reachable
from more than one root. Component-to-component instance references must be acyclic.

An `instance` element refers to a component ID and stores sparse overrides keyed by the master
element ID. MVP overrides are limited to name/content/default value/visibility/enabled/style/
accessibility/event binding; layout structure, kind, and child order remain owned by the master.
Nested instances are allowed if the component dependency graph remains acyclic. Detach materializes
the effective subtree with fresh IDs and removes the instance.

At runtime, instance descendants are addressed by `{ instancePath, sourceElementId }`; a top-level
element keeps the simple element ID path. `data-haku-ui-id` must identify the selectable top-level
element, while instance descendants also expose their source ID and instance path for diagnostics.

### Hierarchy, layout, and placement

- Replace serialized `container` with `frame`; the root must be a Frame.
- A Frame has `layout.mode: 'free' | 'horizontal' | 'vertical' | 'grid'`.
- Auto layout stores four-sided padding, independent row/column gap, main-axis distribution,
  cross-axis alignment, wrap, and grid column count. Horizontal/vertical wrap and grid use the
  same ordered child list, so Layers order stays authoritative.
- Each dimension uses an explicit sizing union: Hug, Fill, or Fixed. Fixed stores a finite
  non-negative value and `px` or `%` unit. Optional min/max bounds use the same explicit unit and
  are schema-validated (`min <= max` when comparable). Root cannot use Fill or percentage sizing
  without a host size.
- Hug maps to content/intrinsic sizing; Fill consumes available auto-layout space; Fixed preserves
  the authored value. Invalid combinations are rejected or disabled in Inspector rather than
  serialized and guessed. In particular, Fill is not legal on a free-positioned axis.
- A child of a free Frame stores finite `x/y` placement plus horizontal and vertical constraints.
  Horizontal values are `left`, `right`, `left-right`, `center`, or `scale`; vertical values are
  `top`, `bottom`, `top-bottom`, `center`, or `scale`. The model stores the reference parent size
  needed for deterministic center/scale calculations. Constraints that require a finite parent
  design size are invalid until that size exists.
- A child of auto layout has no `x/y`; absolute-positioned exceptions use an explicit
  `positioning: 'absolute'` branch with offsets, never a hidden anchor side effect.
- Replace scalar padding/margin with four-sided values. Preserve strict image fit, typography,
  fill, stroke, per-corner radius, opacity, and overflow properties needed by the required types.
  Editor transforms, hover, selection, zoom, expanded Layers rows, guides, and viewport preset are
  never serialized in the runtime document.

The editor labels these concepts Hug, Fill, Fixed, constraints, and Auto layout. The renderer may
map them to flex/grid/absolute CSS, but CSS strings are not the serialized API.

### Strict validation

Version 2 validation rejects:

- invalid document/component trees, duplicate IDs, cycles, unknown children, unreachable nodes,
  instance cycles, invalid roots, or structural instance overrides;
- invalid sizing/layout combinations, non-finite geometry, incompatible bounds, invalid slider or
  progress ranges, duplicate Select option values, and inconsistent Radio groups;
- missing assets, components, themes, or event bindings, and event payload mismatches;
- interactive widgets without the accessible name/label relationship required by their native
  semantics;
- an Image without meaningful alt text unless explicitly marked decorative.

Runtime construction parses the complete document before mounting any DOM. Failure leaves the
host unchanged. Editor commands create a complete candidate, parse it, then replace the asset.

## Architecture boundaries

- `@haku/ui` owns version 2 schemas, layout semantics, DOM rendering, runtime values/events, and
  renderer tests. It stays React-free and editor-free.
- `@haku/editor` owns the dedicated React workspace, canvas transform, hit testing, overlays,
  Inspector, Layers, gestures, shortcuts, component authoring, selection, and UI command history.
- The editor preview mounts `UIDocumentInstance`; it does not recreate runtime elements in React.
  A narrow editor adapter exposes DOM bounds and runtime locators for overlays.
- Pointer/keyboard gesture state is ephemeral. Only the final valid document replacement enters
  `CommandBus`; one gesture equals one undo step.
- Project services retain strict create/open/save and dependency refresh. Built-in assets remain
  read-only. Save requires writable File System Access/dev-target storage.
- Production engine/playground consumers depend on `@haku/ui`, never `@haku/editor` or React.
- Shared geometry/layout helpers needed for deterministic tests belong in `@haku/ui`; React hooks,
  DOM overlay controllers, and editor view state stay in `@haku/editor`.

## Sequential milestones

### Milestone 0 — Baseline characterization and test harness

**Outcome:** lock current intended behavior and reproduce the known authoring failures before a
breaking schema change.

Work:

- Add focused schema/runtime/session tests for strict trees, current layout translation,
  selection, full-asset commands, save validation, and explicit failure behavior.
- Add failing regression tests demonstrating that `%`/`auto` cannot be round-tripped by the
  current Inspector model and that preview scaling is hard-coded.
- Establish browser fixture pages and stable `data-*` selectors for UI workspace evidence. Do not
  use the protected Bounce Run paths.
- Record before screenshots at default, zoomed, and narrow editor sizes.

Acceptance criteria:

- The intended baseline is green; the two known defects are represented by targeted failing tests
  or an isolated expected-failure characterization that is removed in the owning milestone.
- Browser fixture opens a strict four-element document through the real project/UI services and
  production renderer.
- `git status --short` proves protected files are unchanged by the milestone.

Evidence:

- TDD: focused `@haku/ui` and `@haku/editor` test commands with named cases and RED output for the
  defects.
- Browser: screenshot and interaction log for open/select/save plus current 0.5 top-left preview.

**Status (2026-08-17): complete.**

- TDD RED: `pnpm exec vitest run packages/editor/src/ViewportTabsShell.test.tsx -t
'round-trips|fits and centers'` reproduced `0` instead of `100%`, `0` instead of `auto`, and
  `0.5` instead of the desired fit scale. The two sizing cases remain milestone-owned
  `it.fails` tests for M5; the fixed-scale case was assigned to M2 by the later normative M2
  canvas-shell contract and is now a normal green regression.
- TDD GREEN: focused `@haku/ui` and `@haku/editor` package runs cover strict-tree rejection,
  layout-to-DOM translation, selection, atomic full-asset undo, save validation/I/O failure,
  the four-element fixture, and stable workspace selectors.
- Chrome: the real editor workspace opened `builtin:m10b-runtime-hud.ui.json`; default,
  1920 × 1080 preview-preset, and 900 × 700 narrow evidence confirms four elements, shared
  selection, disabled built-in Save, and the current `matrix(0.5)` / `0px 0px` transform with
  no console errors. Screenshots and the interaction log are recorded in
  [`handoffs/UI-M0-01.md`](./handoffs/UI-M0-01.md).

### Milestone 1 — Version 2 model, required elements, and React-free runtime

**Prerequisite:** Milestone 0 accepted.

**Outcome:** land the complete breaking runtime contract once, including every required element,
typed values/events, layout semantics, component definitions/instances, and strict validation.

Work:

- Write version 2 schema tests first for every accepted/rejected tree, type, sizing mode,
  constraint, binding, component cycle, override, and accessibility invariant.
- Replace version 1 schemas and renderer branches with version 2. Implement native DOM semantics,
  value APIs, event dispatch, frame layout, constraints, scroll/list semantics, and instance
  expansion.
- Update all non-protected repository consumers, editor session constructors, project services,
  examples, and fixtures in this same milestone. Delete version 1-only code; do not retain a
  reader or translator.
- Add renderer lifecycle tests for mount atomicity, focus/state preservation, destroy, assets,
  disabled/hidden behavior, themes, nested instances, and programmatic versus user-driven values.

Acceptance criteria:

- Only `schemaVersion: 2` parses. A version 1 document fails clearly.
- Every element in the required semantics table renders with correct native semantics and typed
  state/events without React.
- Layout and constraints match deterministic expected DOM styles/bounds for representative fixed,
  hug, fill, wrap, grid, min/max, and anchored cases.
- No repository-owned unprotected consumer emits or expects version 1.
- `@haku/ui` has no React/editor dependency; package-boundary checks pass.

Evidence:

- TDD: schema, runtime DOM, component-instance, event/value, asset-error, and package-boundary test
  output, with RED→GREEN commit notes.
- Browser: standalone runtime fixture exercises every widget by pointer and keyboard and displays
  its event/value log at wide and narrow host sizes.

**Status (2026-08-17): complete.**

- TDD RED→GREEN covers exact component-instance override value kind/range/options, legal event
  slots and payloads, native label/control association, and representative Hug, Fill, min/max,
  center, and scale layout behavior. `@haku/ui` passes 4 files / 25 tests plus typecheck/build.
- Every required kind renders through the public React-free runtime. Checkbox, Radio, and Switch
  use explicit native labels while runtime element and instance locators continue to resolve the
  associated control deterministically.
- The standalone playground acceptance entrypoint is excluded from the normal production bundle
  and disables `publicDir`. User Chrome at 1440 × 1000 and 760 × 900 verified pointer and keyboard
  value/event behavior with visible telemetry, responsive stacking, and no console warnings or
  errors. Evidence is recorded in
  [`handoffs/UI-M1-01.md`](./handoffs/UI-M1-01.md).
- The final consumer audit found no unprotected UI version 1 producer or reader. Remaining
  `schemaVersion: 1` matches are unrelated project, scene, graph, storage, or custom-component
  contracts plus the deliberate UI version 1 rejection test. Dependency-cruiser reports no new
  violations, and `@haku/ui` has no React or editor production dependency/import.

### Milestone 2 — Dedicated UI workspace shell

**Prerequisite:** Milestone 1 accepted.

**Outcome:** UI authoring owns the editor body instead of living inside the scene center panel.

Work:

- Route `EditorLayout` by active workspace. UI mode replaces scene Hierarchy/tools/Inspector and
  lower Asset Browser with a resizable Layers | Canvas | UI Inspector layout plus a compact,
  deliberate asset-picker entry point.
- Keep the global menu, project context, save/dirty state, build diagnostics, and workspace tabs.
- Move New/Open/Save, Undo/Redo, preview size, Edit/Preview, zoom, and fit into a coherent UI
  toolbar. Persist only editor view state in the editor workspace service, not UI JSON.
- Replace the fixed scale/top-left viewport with centered fit transform and resize-aware canvas.

Acceptance criteria:

- Entering UI shows no scene Hierarchy, scene tools, scene Inspector, or unrelated permanent Asset
  Browser around the UI canvas; leaving UI restores their previous panel layout.
- Root opens centered and fit, 100% is exact CSS pixel scale, and resize preserves the intended
  focal point.
- New/open/save/read-only/dirty/error states remain functional and accessible.
- The baseline fixed-scale regression is green and its expected-failure marker is removed.

Evidence:

- TDD: workspace routing, editor-state exclusion, dirty/read-only, and canvas transform unit tests.
- Browser: screenshots of Scene→UI→Scene, fit, 100%, resized window, and a built-in read-only save
  denial.

**Status (2026-08-17): complete.**

- TDD RED→GREEN covers whole-body workspace routing, scene layout restoration, the editor-only
  custom preview/mode contract, fit/clamp math, exact 100% scale, focal-point-preserving resize,
  toolbar controls, and built-in read-only Save. The fixed-scale regression is now a normal green
  test; the two M5 sizing `it.fails` cases are unchanged.
- UI owns a dedicated persisted `Layers | Canvas | UI Inspector` splitter while active. Scene
  Hierarchy/tools/Inspector and the permanent Asset Browser are absent; the latter is available
  only through the toolbar's compact on-demand asset dialog. Leaving UI restores the original
  scene splitter and workspace tabs remain available throughout.
- The canvas opens at centered Fit, supports 10%–800% zoom and exact 100%, preserves the centered
  root focal point across responsive resize, remeasures Fit directly, and combines
  `ResizeObserver` with window/visual-viewport lifecycle cleanup. Preview size and Edit/Preview
  mode remain editor-only and never enter serialized UI JSON.
- `@haku/editor` passes 48 files / 158 tests plus typecheck/build and affected-file lint. User
  Chrome verified Scene→UI→Scene, wide/narrow Fit, exact 100%, custom size controls,
  Preview→Escape, on-demand assets, disabled built-in Save, and zero console warnings/errors.
  Evidence and exact commands are recorded in [`handoffs/UI-M2-01.md`](./handoffs/UI-M2-01.md).

### Milestone 3 — Canvas selection, navigation, and direct manipulation

**Prerequisite:** Milestone 2 accepted.

**Outcome:** the canvas supports production-quality selection, pan/zoom/fit, free move, and resize.

Work:

- Implement renderer-node hit testing and a single selection model shared with Layers.
- Add pan/zoom/fit commands, edit/preview input routing, selection bounds, handles, cursor states,
  overlap traversal, and nested-frame entry.
- Implement free-layout move/resize gesture transactions with cancel, snapping, guides, constraints,
  min/max clamping, and one-command commit.
- Add edge/center/parent-padding/equal-gap snap candidates. Keep guides and gesture drafts
  editor-only.
- Preserve `%`, Hug, Fill, Fixed, and Auto intent in Inspector; never coerce a non-pixel dimension
  to zero. Dimension mode changes must be explicit.

Acceptance criteria:

- Canvas and Layers selection remain identical through click, modified click, keyboard, undo,
  deletion, and document replacement.
- Pan/zoom remains cursor-anchored and bounded; Fit root/selection and 100% shortcuts work.
- Move/resize is visually live, cancelable, snaps predictably, commits once, and survives undo/redo.
- Editing one dimension never rewrites the other or loses its unit/mode.
- Locked/hidden/disabled/overlapping elements follow documented hit-test behavior.

Evidence:

- TDD: transform math, hit ordering, selection reducer, gesture transaction, snap priority,
  constraint, and dimension round-trip tests, including `%`/Hug/Fill regression cases.
- Browser: recorded pointer flows for select/move/resize/cancel/undo, zoom under cursor, fit, and
  Edit↔Preview native widget interaction.

**Status (2026-08-17): complete.**

- TDD RED→GREEN covers renderer hit ordering, shared selection and replacement reconciliation,
  bounded transform math, cursor anchoring, gesture preview/commit/cancel, snap priority,
  constraints, clamping, and deliberate-axis sizing intent. The two M5 Inspector sizing
  `it.fails` cases remain unchanged.
- Edit mode provides renderer-backed hit targets, multi-selection, selection bounds and resize
  handles, live free/absolute move and resize, one-command commit, Escape restoration, arrow
  nudge, snapping guides, middle/Space pan routing, ordinary wheel/trackpad zoom, and exact
  100%/Fit root/Fit selection. Preview removes editing overlays and preserves native input.
- `@haku/editor` passes 50 files / 178 tests plus typecheck/build and affected-file lint. The
  focused M3 matrix passes 5 files / 39 tests.
- User Chrome verified direct selection, move/resize plus Undo, nudge plus Undo, all fit shortcuts,
  Edit↔Preview native widget input, wide/narrow layout, and zero console warnings/errors. A fresh
  ordinary wheel check changed scale from `0.7715576171875` to `0.942382601712301` while the
  document point under cursor drifted by only `-0.0000048916 px` horizontally and
  `0.0000597322 px` vertically; Preview wheel left the editor transform unchanged.
- Chrome could not preserve Space through its synthetic held-key drag, so active Space/middle pan
  remains covered by the pure transform test and existing React component routing rather than a
  new browser claim. Exact evidence, prior screenshots, commits, and the limitation are recorded
  in [`handoffs/UI-M3-01.md`](./handoffs/UI-M3-01.md).

### Milestone 4 — Layers DnD, palette, and context-aware creation

**Prerequisite:** Milestone 3 accepted.

**Outcome:** hierarchy editing is as capable and precise as canvas editing.

Work:

- Add expandable, keyboard-navigable Layers rows with icons, inline rename, visibility, lock,
  multi-selection, duplicate, and contextual delete.
- Implement pointer and keyboard reorder/reparent with before/inside/after insertion markers,
  auto-scroll, valid-target highlighting, cycle prevention, and coordinate conversion.
- Add searchable palette/tool shortcuts for every required kind and project-backed Image picking.
- Implement the deterministic cursor/selected-parent creation rule for canvas, palette, and
  keyboard insertion.

Acceptance criteria:

- Layers/canvas parentage and order never diverge; all structural mutations pass strict schema
  validation before commit.
- Root/cycle/cross-component/locked invalid drops are blocked with clear feedback and no command.
- Free→auto and auto→free reparenting yields documented placement/sizing, not stale anchors.
- Every required type can be created at the pointer or intended selected parent without a UUID
  prompt.
- DnD and create/delete/duplicate each form one undoable operation.

Evidence:

- TDD: hierarchy move matrix, insertion-index, multi-move order, coordinate conversion, invalid
  drops, creation target, and asset-picker result tests.
- Browser: Layers and canvas recordings for reorder, nested reparent, auto-scroll, invalid cycle,
  image creation, undo, and keyboard alternative.

### Milestone 5 — Complete layout, sizing, constraints, and styling Inspector

**Prerequisite:** Milestone 4 accepted.

**Outcome:** authors can express the version 2 layout model without JSON edits.

Work:

- Build Frame Inspector sections for Free/Horizontal/Vertical/Grid, wrap, columns, padding sides,
  row/column gap, distribution, alignment, clipping, and overflow.
- Build per-axis Hug/Fill/Fixed controls with `px/%`, min/max, invalid-state explanation, and
  explicit mode conversion.
- Add visual horizontal/vertical constraint controls and absolute-position opt-out for auto layout.
- Expose typography, fills, strokes, radius, opacity, image fit, widget options, and meaningful
  per-kind defaults using existing editor field conventions.
- Reflect guides, padding, gap, insertion positions, and overflow boundaries on canvas.

Acceptance criteria:

- Every serialized layout/sizing/constraint/style field needed by the MVP has an intentional UI;
  unsupported combinations cannot be committed.
- Switching layout mode has a documented, tested conversion that preserves current visual bounds
  as closely as possible and is fully undoable.
- Hug/Fill/Fixed, min/max, wrap, grid, constraints, and overflow match runtime at all preview sizes.
- Numeric scrub/input groups one continuous edit into one undo step and never produces NaN or
  invalid transient assets.

Evidence:

- TDD: field-model adapters, layout conversion, bounds, invalid combinations, command grouping,
  and strict serialization round-trip tests.
- Browser: build the responsive-workflow example entirely through Inspector, then compare wide,
  desktop, and narrow viewport screenshots plus computed bounds.

### Milestone 6 — Component masters and instances authoring

**Prerequisite:** Milestone 5 accepted.

**Outcome:** reusable UI has a clear master/instance workflow with safe overrides.

Work:

- Add Components collection, Create component, instance palette, master navigation, breadcrumb,
  instance badge, override indicators/reset, detach, duplicate, rename, and delete safeguards.
- Render instance descendants for inspection while maintaining explicit edit scope. Structural
  edits redirect to or enter the master.
- Ensure master changes update instances without losing instance state that remains type-valid;
  reject removal/change when an override becomes invalid until the command resolves it.
- Add nested-instance cycle checks and runtime locator diagnostics.

Acceptance criteria:

- A subtree becomes a master without changing its effective appearance; instances match it.
- Allowed overrides persist and reset; forbidden structural overrides cannot be produced.
- Detach creates a visually equivalent concrete subtree with globally fresh IDs.
- Nested instances work; direct and indirect cycles fail before mutation.
- Undo/redo covers create, master edit, override, reset, and detach as atomic user actions.

Evidence:

- TDD: extraction/remap, effective value resolution, override invalidation, detach, locator, nested
  instance, and cycle tests.
- Browser: create a button/card master, place multiple instances, override one, edit master, reset,
  detach, and verify runtime event source paths.

### Milestone 7 — Bounce Run HUD dogfood

**Prerequisite:** Milestone 6 accepted.

**Outcome:** prove the authoring MVP against a real game UI, not a synthetic component gallery.

Work:

- After explicit owner authorization for the target asset paths, author a Bounce Run score/status/
  progress HUD and one interactive menu or overlay using the editor only.
- Use nested Frames, at least two auto-layout modes, constraints, Hug/Fill/Fixed, one component with
  multiple instances, Image, Text, Button, Progress, and at least three input widgets across the
  HUD/menu proof.
- Wire runtime events to the existing game boundary and update runtime values from game state.
- Fix authoring/runtime gaps in their owning package rather than patching the dogfood asset JSON.

Acceptance criteria:

- The UI is created and subsequently edited without hand-editing its JSON.
- HUD remains legible and non-overlapping at 1280×720, 1440×900, 1920×1080, and one narrow custom
  viewport; game input and UI focus do not conflict.
- Score/progress updates are programmatic and event-free; interactive controls emit exactly the
  documented user events.
- Reload/save/play round-trips preserve the authored result and dependency manifest.
- If authorization for protected paths has not been granted, this milestone cannot start; a copy
  elsewhere is evidence only and does not satisfy dogfood acceptance.

Evidence:

- TDD: gameplay adapter/value update/event routing tests and a strict saved-asset parse.
- Browser: annotated screenshots and interaction recording for all four viewports, keyboard and
  pointer menu use, game-state updates, save/reload, and no console errors.

### Milestone 8 — Accessibility and complete keyboard authoring

**Prerequisite:** Milestone 7 accepted.

**Outcome:** both produced UI and the authoring workspace are usable without a pointer and expose
correct semantics.

Work:

- Finish accessible-name, description, role/live-region, decorative image, label association,
  focus order, and disabled/read-only authoring controls.
- Add keyboard paths for Layers navigation/reorder/reparent, palette creation, canvas selection/
  nudge/resize, zoom/fit, rename, duplicate, delete, parent/child traversal, component navigation,
  preview, save, undo, and redo.
- Prevent global shortcuts while typing or using a native widget. Make focus visible and return it
  predictably after dialogs, deletion, mode changes, and undo/redo.
- Run automated accessibility checks plus manual screen-reader/keyboard review of editor and
  runtime fixture.

Acceptance criteria:

- All essential MVP authoring workflows are keyboard-complete; DnD has an equivalent keyboard
  reorder/reparent operation.
- Native widgets expose correct label, role, state, value, and focus behavior. Decorative content
  is excluded and meaningful images require alt text.
- Editor focus is never trapped or lost after structural changes; shortcut conflicts have tests.
- Automated checks have no serious/critical violations in the fixture or dedicated workspace.

Evidence:

- TDD: shortcut guards, focus restoration, keyboard tree operations, accessible-name validation,
  and native semantics tests.
- Browser: keyboard-only recording, focus screenshots, accessibility tree capture, and automated
  audit report.

### Milestone 9 — Final stabilization and release evidence

**Prerequisite:** Milestone 8 accepted.

**Outcome:** close correctness, performance, resilience, and documentation gaps and declare the
authoring MVP complete.

Work:

- Run the full repository quality matrix and focused browser suite. Fix failures without broadening
  scope or adding compatibility.
- Stress large hierarchies, deep frames, many component instances, rapid undo/redo, continuous
  resize, document switching, invalid assets, missing image resolver/assets, and save failures.
- Profile render/selection/drag paths. Virtualize Layers only when measured thresholds require it;
  keep runtime updates narrow and preserve focused widget DOM.
- Update existing UI/editor/edge-case docs to describe the delivered model and workflow. Do not
  create parallel architecture pages.
- Remove expected-failure markers, temporary fixtures, debug controls, dead version 1 code, and
  stale screenshots.

Acceptance criteria:

- All Definition of Done checks below pass on a clean checkout except explicitly protected user
  work, which remains byte-for-byte outside the program's commits.
- No known data-loss, hierarchy divergence, runtime/editor layout mismatch, accessibility blocker,
  or silent error remains.
- Performance budgets are recorded and met for the agreed representative document; pointer drag
  remains responsive and does not create commands per frame.
- Final docs, browser evidence, and targeted/full command output are linked from the milestone
  handoff.

Evidence:

- TDD: complete focused and repository test/build/lint/type-check output, clean rerun, and no skipped
  MVP regression cases.
- Browser: final end-to-end recording from new document to Bounce Run Play, viewport matrix,
  accessibility audit, performance trace, error-state proof, and zero unexpected console errors.

## Definition of Done — full authoring MVP

The program is done only when all items are true:

### Model and runtime

- [ ] Version 2 is the sole accepted serialized contract; no version 1 compatibility path remains.
- [ ] Every required primitive/widget has strict schema, native React-free runtime semantics,
      typed initial/runtime value behavior, appropriate events, accessibility, and tests.
- [ ] Strict trees, Frames, auto layout, grid/wrap, padding/gaps/alignment, Hug/Fill/Fixed,
      min/max, constraints, overflow, components/instances, themes, and asset references render
      deterministically.
- [ ] Parse/mount/service failures are explicit and atomic; invalid data never partially mounts or
      silently mutates a document.
- [ ] Programmatic state updates do not emit user events; user events carry the documented element,
      binding, type, and scalar value.

### Authoring experience

- [ ] UI has a dedicated Layers | Canvas | Inspector workspace with no surrounding scene panels.
- [ ] Canvas supports centered fit, exact 100%, cursor-anchored pan/zoom, fit selection, edit/preview,
      hit selection, move, resize, guides, snapping, insertion markers, and cancelable gestures.
- [ ] Layers and canvas are one hierarchy with rename, visibility, lock, multi-select, reorder,
      reparent, duplicate, delete, and identical selection.
- [ ] Creation honors pointer/selected parent and auto-layout insertion index for every required
      type; Images use the project asset picker.
- [ ] Inspector exposes all MVP layout, sizing, constraints, style, accessibility, value, option,
      and event fields without lossy coercion.
- [ ] Components support masters, instances, allowed overrides/reset, nested acyclic instances,
      navigation, and detach.
- [ ] Every mutation is strictly validated and undoable; each gesture is one history operation.

### Product proof and quality

- [ ] Bounce Run HUD plus interactive menu/overlay are authored without JSON edits and work at all
      required viewport sizes.
- [ ] Essential authoring and produced-runtime workflows are keyboard accessible; automated and
      manual accessibility evidence has no blocking issue.
- [ ] Focus, game input, native controls, save/reload, missing assets, invalid documents, read-only
      projects, and service errors have explicit tested behavior.
- [ ] Focused package tests and the repository quality matrix pass; browser evidence covers all
      milestone workflows with no unexpected console errors.
- [ ] Editor-only React/interaction state is absent from UI JSON, and `@haku/ui` plus production
      consumers remain React/editor-free.
- [ ] Existing user changes in `apps/playground/haku.project.json` and
      `apps/playground/public/assets/ui/**` were never read, touched, staged, or committed without
      later explicit authorization.
