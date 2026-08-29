# Handoff: UI-M6 component-master edit scope and strict session commands rollover 03

## Objective

Continue Milestone 6 from the explicit, editor-only component-master session model into the
Components authoring panel surface, without entering M7 or touching protected playground and
Bounce Run user files.

## Scope and acceptance criteria

- [x] Add a discriminated document versus component-master edit scope to `UIAuthoringSession`.
- [x] Enter a component master at its root or a validated source element and exit to the owning or
      top-level document instance selection.
- [x] Keep document and component selection unambiguous through exit and exact Undo/Redo.
- [x] Reconcile selection only against the active scope and keep scope/selection out of UI JSON.
- [x] Route component-master Inspector and structural session edits through strict whole-document
      replacement without creating structural instance overrides.
- [x] Reject master type, option, range, and event changes that invalidate any instance override
      before asset or command-history mutation.
- [ ] Build and verify the remaining Components collection, navigation, indicators, safeguards,
      and browser workflow.

## Required context

- `docs/ui-editor-figma-development-plan.md` — component workflow, Milestone 6, and Definition of
  Done sections only.
- `docs/stage-handoff.md`
- `docs/handoffs/UI-M6-ROLL-03.md`
- `packages/editor/src/ui/ui-authoring-session.ts` — exported edit scope, component navigation,
  hierarchy/selection getters, and component command entrypoints only.
- `packages/editor/src/ui/ui-authoring-session.test.ts` — component-scope tests only.
- `packages/editor/src/ui/UIDocumentEditorPanel.tsx` — next slice may now open only its session
  selectors, Layers, palette, Inspector dispatch, and preview-instance lifecycle regions.

## Decisions and invariants

- `UIEditScope` is editor-only and discriminates `{ type: 'document' }` from
  `{ type: 'component'; componentId }`; it never enters `UIDocument` or saved JSON.
- Entering a master selects its root by default or a validated source ID when supplied. Exit
  restores the selected owning instance, or the first top-level document instance of that master
  when navigation began elsewhere.
- Replacement commands retain their originating edit scope. Undo/Redo applies their selection only
  when that scope is still active; undoing a master edit after exit therefore cannot leak a source
  ID into document selection.
- If the active component disappears during reconciliation, the session unwinds a valid return
  context and ultimately falls back to document root. Locks are filtered against globally unique
  document and component source IDs.
- `hierarchy`, `select`, `toggleSelection`, and lock lookup operate only on the active edit tree.
- Component source IDs remain globally unique. Document-scope structural attempts against a source
  ID reject as unknown; structural overrides are never synthesized.
- Component-master add/create/remove/move/duplicate/place and Inspector patches produce a complete
  candidate `UIDocument` and pass `UIDocumentSchema` before one replacement command enters history.
- Full source replacement exists for deliberate kind changes. Validation reports all relevant
  strict-schema diagnostics and rejects invalid existing text/value/event overrides atomically.
- The session owns authored assets, scope, selection, and history; it does not own mounted
  `UIDocumentInstance` runtime values or focus. Type-valid runtime-state preservation must be
  implemented at the preview lifecycle boundary in the next panel/runtime-integration slice.

## Completed

- Added RED scope tests before implementation for create component, enter master, root and
  descendant selection, exit, Undo/Redo, unknown component/source rejection, and serialization
  exclusion.
- Added component navigation with nested return contexts and active-tree hierarchy/selection
  semantics.
- Tagged strict replacement commands by edit scope and made active-scope reconciliation immune to
  stale source selections after exit.
- Added RED component-master edit tests before implementation for Inspector patching, structural
  creation, exact active-scope Undo/Redo, and invalidating kind changes.
- Extended session creation and structure commands to component scope while retaining global-ID,
  cycle, and strict-tree validation from the existing pure transforms.
- Added full component-source replacement plus atomic diagnostics across all document and nested
  instances.
- Covered invalid type/text, event slot, select option, and slider range edits, unchanged command
  state on rejection, source-only structure, and document selection stability when master commands
  are undone/redone after exit.
- Did not open or change `UIDocumentEditorPanel.tsx`, run a browser, touch `@haku/ui`, or enter M7.

## Files changed

- `packages/editor/src/ui/ui-authoring-session.ts`: discriminated edit scope, master enter/exit,
  scoped selection/hierarchy/reconciliation, component structural creation/removal targeting,
  strict Inspector/master replacement, and override-invalidation diagnostics.
- `packages/editor/src/ui/ui-authoring-session.test.ts`: navigation, rejection, serialization,
  structural/Inspector history, cross-scope Undo/Redo, and override invalidation coverage.
- `docs/handoffs/UI-M6-ROLL-03.md`: this rollover record.

## Local commits

- `32bd3eb` — `Add component master edit scope`
- `883732b` — `Edit component masters through strict session commands`
- The documentation commit containing this handoff follows the implementation commits.

## Verification evidence

- RED scope run: `pnpm exec vitest run packages/editor/src/ui/ui-authoring-session.test.ts
--reporter=dot` — 3 failures because `enterComponentMaster` and `editScope` did not exist.
- First focused GREEN: the same command — pass, 1 file / 22 tests.
- First full editor: `pnpm --filter @haku/editor test` — pass, 54 files / 321 tests.
- RED master-edit run: the same focused command — 2 failures because component-source Inspector
  update and full master replacement entrypoints did not exist.
- Final focused: the same command — pass, 1 file / 25 tests.
- Final full editor: `pnpm --filter @haku/editor test` — pass, 54 files / 324 tests.
- `pnpm --filter @haku/editor typecheck` — pass.
- `pnpm --filter @haku/editor build` — pass.
- Targeted ESLint over both implementation/test files — pass.
- Targeted Prettier check over both implementation/test files — pass.
- `git diff --check` over both implementation/test files — pass.
- `@haku/ui` checks — not run because no UI package file changed.
- Browser check — intentionally not run; panel/browser work was excluded from this session slice.

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- Implementation HEAD before this documentation commit: `883732b`
- Worktree before this handoff contained only protected user work outside commits:
  `M apps/bounce-run/tsconfig.json`, `M apps/playground/haku.project.json`,
  `?? apps/bounce-run/.haku/`, and `?? apps/playground/public/assets/ui/`.

## Remaining work

- Add the Components collection and instance palette with empty state, create/place, duplicate,
  rename, and referenced-master delete safeguards.
- Wire master enter/exit, breadcrumb, source selection, instance badges, descendant inspection,
  override indicators, per-field/reset-all actions, and Detach to the session API.
- Ensure instance-descendant structural actions visibly redirect to or require master scope.
- Preserve mounted preview widget runtime values and focus when a master replacement remains
  type-valid; reject invalidating authored candidates before preview refresh.
- Add panel tests for navigation, safeguards, disabled/error copy, override/reset, and exact
  command grouping.
- Run the complete M6 browser workflow only after the panel surface is green. M6 remains incomplete.

## Risks and open defects

- `UIDocumentEditorPanel.tsx` has not consumed `editScope`; the current UI therefore cannot yet
  expose the session functionality delivered here.
- The panel's preview-instance lifecycle was intentionally not inspected. A full document
  replacement may remount today, so type-valid runtime value/focus preservation is not yet proven.
- Full source replacement is intentionally low-level. The panel must present guarded, typed field
  adapters and actionable diagnostics rather than exposing arbitrary element-kind replacement.
- Component delete/rename/duplicate safeguards and history commands remain unimplemented.

## Exact next action

Write a failing `UIDocumentEditorPanel` test that creates or opens a component instance, enters its
master from the instance badge/action, proves the breadcrumb and Layers tree use
`session.editScope` plus `session.hierarchy()`, selects a source descendant, and exits back to the
owning document instance without adding editor scope to saved JSON. Then wire the narrow panel
selectors and navigation controls to `enterComponentMaster` / `exitComponentMaster`; route
Inspector patches through `session.updateElement`, show the atomic override-invalidation
diagnostic, and add a preview refresh contract that preserves type-valid widget state and focus.
Do not begin the broader palette/safeguard/browser workflow until this entry slice is GREEN.

## Context exclusions

- `apps/playground/haku.project.json`
- `apps/playground/public/assets/ui/**`
- `apps/bounce-run/tsconfig.json`
- `apps/bounce-run/.haku/**`
- M7 Bounce Run dogfood, M8 graph wiring, M9 stabilization, scene/engine/physics/audio systems, and
  unrelated editor panels.
