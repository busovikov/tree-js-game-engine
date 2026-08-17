# Handoff: UI-M5 canvas overlay rollover

## Objective

Finish Milestone 5 acceptance from a verified editor-only canvas overlay implementation. Run the
deferred user-Chrome Inspector and responsive-canvas workflow, capture visual and computed-bounds
evidence, and close M5 only if the complete layout, sizing, constraints, styling, event, and overlay
surface matches runtime without console errors or protected-path writes.

## Scope and acceptance criteria

- [x] Expose strict Frame layout, sizing, bounds, constraints, and Flow/Absolute placement.
- [x] Expose lossless style, accessibility, widget value/options, and per-kind event bindings.
- [x] Reflect four padding inset edges from the selected measured Frame on the canvas.
- [x] Reflect row/column gaps only for applicable auto/grid layout and measured adjacent children.
- [x] Reflect the resolved canvas drag/create parent and insertion index with one exact marker.
- [x] Reflect distinct X/Y overflow boundaries from the selected Frame's serialized policies.
- [x] Keep layout and constraint overlays in document space under the existing canvas transform.
- [x] Omit overlays in Preview and when selection, bounds, or layout applicability is absent.
- [x] Keep overlays editor-only and absent from the UI asset and command history.
- [ ] Run final M5 user-Chrome acceptance and record screenshots, computed bounds, and console state.

## Required context

- `docs/ui-editor-figma-development-plan.md` — M5 and Definition of Done sections only.
- `docs/handoffs/UI-M5-ROLL-08.md`
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — overlay markup and canvas drag resolution only.
- `packages/editor/src/ui/ui-canvas-overlays.ts`
- `packages/editor/src/ViewportTabsShell.test.tsx` — overlay integration cases only.

## Decisions and invariants

- `deriveUISelectionOverlay` consumes the strict document, exact one-element selection, and the
  existing measured document-space bounds. It does not measure DOM or calculate runtime layout.
- Padding segments use the selected Frame's four serialized side values and measured rectangle.
- Horizontal/vertical gap markers use measured consecutive flow children. Grid markers preserve
  serialized grid positions and require both exact row/column neighbors to have measured bounds.
- Gap geometry shows measured space while `data-haku-ui-gap-value` preserves the serialized row or
  column gap responsible for the marker.
- `deriveUIInsertionOverlay` consumes the parent ID and insertion index already resolved by the
  canvas drag/create path. Horizontal layout uses X; vertical and grid preserve the existing Y-axis
  insertion rule. Free layout has no insertion marker.
- Overflow X is the measured bottom boundary and overflow Y is the measured right boundary. Axis
  and serialized `visible`/`hidden`/`auto`/`scroll` policy remain distinct in DOM and styling.
- The selection model owns the pre-existing free-placement constraint geometry too, so constraint
  anchors and new overlays share the same selection and measured-bounds guards.
- Overlay markup remains inside the existing transformed canvas content and existing Edit-only DOM
  layer. It is `aria-hidden`, pointer-inert, transient React state only, and never serialized.
- No browser acceptance, runtime renderer, declaration editing, M6, or protected asset work was
  entered in this slice.

## Completed

- Added RED then GREEN pure geometry coverage for padding, horizontal and grid gaps, missing
  measured grid neighbors, X/Y overflow policies, constraints, insertion positions, empty/multi
  selection, missing bounds, and free-layout inapplicability.
- Added RED then GREEN panel coverage for measured document-space markup, Edit/Preview gating,
  exact resolved insertion metadata, drag-end cleanup, and unchanged asset/history state.
- Added one pure editor overlay model shared by the new layout surface and existing constraint
  anchors.
- Added transient canvas insertion state populated by the existing creation-target resolver and
  cleared on drag end, drag leave, drop, and Preview entry.
- Added editor-only padding, gap, overflow, and insertion markup and axis/policy-specific styles.

## Files changed

- `packages/editor/src/ui/ui-canvas-overlays.ts`: derive selection and insertion overlay geometry
  solely from serialized intent and measured document-space bounds.
- `packages/editor/src/ui/ui-canvas-overlays.test.ts`: cover geometry, applicability, and empty or
  partially measured cases.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx`: connect resolved drag state and render the
  pure model inside the existing Edit overlay layer.
- `packages/editor/src/ui/ui-document-editor-panel.css`: distinguish padding, gap, insertion, and
  X/Y overflow policy markers.
- `packages/editor/src/ViewportTabsShell.test.tsx`: prove panel markup, Preview absence, exact
  insertion metadata, constraint consistency, and no asset/history mutation.

## Local commits

- `0b82ef9` — `Visualize measured UI layout overlays`
- The documentation-only commit containing this rollover follows it.

## Verification evidence

- Initial RED focused run — pure suite could not load the intentionally missing production module;
  both new panel cases failed, while all 60 prior panel tests passed.
- Additional grid-neighbor RED — the missing measured second grid child incorrectly shifted the
  third child into a column pair before serialized-position preservation was implemented.
- `pnpm exec vitest run packages/editor/src/ui/ui-canvas-overlays.test.ts
packages/editor/src/ViewportTabsShell.test.tsx --reporter=dot` — 2 files, 67 tests passed.
- `pnpm --filter @haku/editor test` — 53 files, 308 tests passed.
- `pnpm --filter @haku/ui test` — 4 files, 33 tests passed.
- `pnpm --filter @haku/editor typecheck` and `pnpm --filter @haku/ui typecheck` — passed.
- `pnpm --filter @haku/editor build` and `pnpm --filter @haku/ui build` — passed.
- `pnpm exec eslint` on all four changed TypeScript/TSX files — passed.
- `pnpm exec prettier --check` on all five changed editor files — passed.
- Browser check — intentionally deferred to the exact next action below.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `0b82ef9`
- Overlay implementation scope is clean after its commit. Known protected user work remains outside
  reads and commands: `M apps/playground/haku.project.json` and
  `?? apps/playground/public/assets/ui/`.

## Remaining work

- Run the final M5 user-Chrome workflow below without reading or writing the protected playground
  project or UI asset paths.
- Record wide, desktop, and narrow screenshots plus computed Frame/child bounds, overlay positions,
  and a clean console.
- Exercise Undo for representative layout, sizing, constraint, style, widget, accessibility, and
  event edits and confirm Preview matches authored layout at every tested viewport.
- Only after all evidence is green, update the M5 acceptance record and hand off to M6. M5 is
  incomplete at this rollover.

## Risks and open defects

- Automated geometry and panel behavior are green, but visual contrast, line alignment at browser
  zoom levels, and live DOM measurement still require user-Chrome evidence.
- Grid insertion intentionally retains the existing non-horizontal Y-axis resolution rule. A
  different two-dimensional grid insertion design would be a separate authoring behavior change.
- Final M5 runtime/editor parity across wide, desktop, and narrow viewports has not yet been observed
  in Chrome.

## Exact next action

Start the editor app from the clean implementation HEAD with
`pnpm --filter @haku/editor-app dev --host 127.0.0.1`, then use the user's existing Chrome session to
open the printed local URL and run the final M5 acceptance against a writable scratch UI document
outside `apps/playground/haku.project.json` and `apps/playground/public/assets/ui/**`:

1. In Edit, select one measured Frame and set asymmetric padding `10/20/30/40`; confirm four inset
   edges align to computed content bounds at Fit and exact 100% zoom.
2. Switch the Frame through Horizontal, Vertical, and two-column Grid; set distinct row and column
   gaps, capture the applicable measured adjacent-child markers, and confirm missing/unmeasured or
   Absolute children do not create false markers.
3. Drag one palette item and one existing layer before, between, and after auto/grid children;
   capture the marker's parent/index, cancel once, drop once, and confirm the marker clears with no
   command on cancel and exactly one undoable command on drop.
4. Set Overflow X to Clip and Overflow Y to Scroll, then swap policies; confirm the bottom X and
   right Y boundaries remain visually distinct and match the Inspector values. Select a free child
   and confirm the existing horizontal/vertical constraint anchors remain aligned.
5. Enter Preview and confirm every editor overlay disappears. Return to Edit, build the M5
   responsive-workflow example entirely through Inspector, and capture screenshots plus computed
   Frame/child bounds at `1280×720`, `1440×900`, and a narrow custom viewport.
6. Exercise representative Undo/Redo and invalid numeric input, verify Preview/runtime bounds match
   authored Hug/Fill/Fixed, min/max, wrap, grid, constraints, and overflow behavior, and confirm the
   console has no unexpected errors or warnings.
7. Reset or close the scratch document without touching protected paths. Record URLs, viewport
   sizes, screenshots, computed bounds, console result, and reset state in the final M5 handoff.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- M6 components/instances, M7 dogfood, declaration authoring, production runtime renderer changes,
  engine/scene subsystems, and unrelated editor panels.
