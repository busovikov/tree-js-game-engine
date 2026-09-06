# UI-M6 Chrome acceptance evidence

Dates: 2026-09-04 and 2026-09-06

Browser: user's Chrome extension session at `http://localhost:5176/` and
`http://127.0.0.1:5176/`.

Scratch invariant: the built-in `builtin:m10b-runtime-hud.ui.json` remained in memory, displayed a
dirty marker, and kept Save disabled. No project or UI JSON was saved.

## Component creation and ownership

- The accessible Create component dialog opened with `Card Source`, submitted without a native
  prompt, and produced a component master plus the original instance.
- The master contains `Card Label` and `Card Action`; a second instance was placed under the
  document root.
- First instance ID/path: `31da7092-dedc-438d-833a-85248e0c0f71`.
- Second instance ID/path: `218d4703-4e36-450c-b630-47cb5923367f`.
- `Card Action` source ID: `e603522d-14e0-4799-b299-7ac86e6cf8d3`.
- Entering the master from the second owner displayed `Inspecting Card Source source through
instance path 218d4703-4e36-450c-b630-47cb5923367f`.

## Overrides and history

The second instance's `Card Action` received these allowed overrides:

- Text: `Launch`
- Text color: `#fef3c7`
- Fill: `#b45309`
- Opacity: `0.82`
- Accessible label: `Launch secondary card`
- Accessible description: `Runs the nested card action`

The Inspector showed Name, Text, Style, and Accessibility indicators. Reset Name changed
`Secondary Action` to `Card Action`; Undo restored `Secondary Action`; Redo restored `Card Action`.
Reset all removed the Launch appearance and accessibility values from the second instance; Undo
restored them; Redo removed them again. A final Undo restored the overrides for subsequent checks.

The built-in declares no compatible document events, so its Activate/Input/Change/Submit selectors
were authoritatively disabled. Event-binding behavior remains covered by the focused M6 tests; the
browser run did not fabricate an event or edit JSON to bypass that precondition.

## Master editing and invalidation

- Converted the master from vertical to horizontal auto layout and edited padding, column gap,
  distribution, alignment, fill, and four corner radii.
- Edited `Card Label` text and typography, then converted it to absolute placement.
- Added a nested free-layout `Card Slot` and `Card Badge`; edited Right/Bottom constraints, fixed
  sizing, and fill.
- Added `Card Input` with its required accessible label. Source ID:
  `b0df03e6-1d66-4f38-a9cc-2ed9c3b86746`.
- The second input carried owner path `218d4703-4e36-450c-b630-47cb5923367f`. Its live runtime value
  changed from the authored override `seed` to `live-state` and survived a compatible master edit.
- Editing master `Card Action` from `Button` to `Run` refreshed the first instance while the second
  retained its `Launch` override.
- Deleting the overridden `Card Input` was rejected with `Invalid UI component master edit ...
Unknown overridden UI element`. The element remained. Undo immediately reverted the preceding
  valid `Run` edit and Redo restored it, proving the rejected edit added no history entry.

## Nested instance locator

Duplicating the master created `Card Source 2`. An instance of it was placed inside the original
master's `Card Slot`.

- Nested instance ID: `314e980f-f229-4ed6-8bbd-a9ca7efca8c4`.
- Nested button source ID: `0d058a4b-ea2b-4481-9fbb-a094e1ff12ac`.
- First outer runtime path:
  `31da7092-dedc-438d-833a-85248e0c0f71/314e980f-f229-4ed6-8bbd-a9ca7efca8c4`.
- Second outer runtime path:
  `218d4703-4e36-450c-b630-47cb5923367f/314e980f-f229-4ed6-8bbd-a9ca7efca8c4`.

The second nested button was clicked in Preview through that exact full path. No event entry was
expected because the built-in exposes no compatible declared event.

## Detach

Before detach, selection was the overridden second instance
`218d4703-4e36-450c-b630-47cb5923367f`. Detach preserved the effective Launch appearance,
accessibility, nested content, and authored input value while recursively materializing concrete
content with fresh IDs and no source/path attributes:

- Detached root: `0765d3eb-aa2a-4f7d-a2cd-d39b675b2629`
- Detached Launch button: `82d0f803-8755-4927-90fe-773027148d9e`
- Detached nested Run button: `c093ca1c-f392-4cec-bdf9-2fb0fe452bdd`
- Detached inputs: `7fc996da-0211-4301-a1f7-e43ba55dcc07` and
  `346217e2-b850-4fe9-8920-421b4f060483`

Undo restored exact selection `218d4703-4e36-450c-b630-47cb5923367f` and its instance source/path.
Redo restored exact detached-root selection `0765d3eb-aa2a-4f7d-a2cd-d39b675b2629` and the same fresh
Launch child ID `82d0f803-8755-4927-90fe-773027148d9e`.

## Accessible component dialogs

Duplicate produced the uniquely named `Card Source 2`. Invoking Rename opened the remaining legacy
native prompt. Chrome detected it as a prompt, but accepting it stalled browser control and reset the
control session; a fresh documented dialog recovery attempt also stalled. Chrome was not killed or
restarted, and no other browser surface was used.

The defect was reproduced by a focused failing test, then fixed by commit `9b2c2c9` with an
accessible validated in-editor Rename component dialog. Empty and duplicate names remain open with
an associated alert and no history; Escape and Cancel close without history; Enter/form submission
renames atomically; Undo/Redo is exact; `window.prompt` is never called.

The fresh 2026-09-06 Chrome recheck recreated `Continue Source`, duplicated it as
`Continue Source 2`, and verified the dialog against the shipped UI:

- Empty submission stayed open with `UI component name cannot be empty`.
- Renaming to `Continue Source` stayed open with
  `UI component name must be unique: Continue Source`.
- Escape and Cancel each closed the dialog. In both cases, the next Undo removed the preceding
  component duplication and Redo restored it, proving cancellation added no history.
- Renaming to `Action Alternate` succeeded; Undo restored `Continue Source 2` and Redo restored
  `Action Alternate` exactly.

## Non-Frame master fix and cycle safeguards

Opening the Button-root `Continue Source` initially exposed a real browser defect: the Inspector
projection reparsed the component tree as a serialized document and failed the document-only Frame
root invariant. Focused Button/Text-root RED coverage reproduced the crash. Commit `9bb8a1b`
keeps component edit scope as an in-memory Inspector projection while preserving strict validation
for the real serialized document. A fresh Chrome tab then opened the Button-root master with scoped
Layers and Inspector without an error.

Two Frame-root masters provided browser-reachable cycle preconditions:

- Direct placement failed before mutation with
  `UI component insertion cycle: 8ef3b90d-f623-4e58-90ba-a1a8911ec4dc ->
8ef3b90d-f623-4e58-90ba-a1a8911ec4dc`.
- Placing `Frame Source 2` inside `Frame Source` succeeded as one command.
- The inverse placement failed before mutation with
  `UI component insertion cycle: db38519a-1adc-45b9-a64e-7cbc85f9582b ->
8ef3b90d-f623-4e58-90ba-a1a8911ec4dc ->
db38519a-1adc-45b9-a64e-7cbc85f9582b`.
- After each rejected placement, Undo/Redo targeted the preceding successful action. For the
  indirect case, Undo removed the legal nested instance and Redo restored it, proving rejection
  added no history.

## Final locator, layout, and console evidence

The final nested runtime DOM exposed:

- Outer Frame instance path `62e51749-fddc-41a3-b82a-50aace3bed96`, source
  `63ac1a22-94f5-42e9-bf5d-232d4a499c3a`.
- Nested Frame instance path
  `62e51749-fddc-41a3-b82a-50aace3bed96/3548fbd2-91d2-4763-9ce5-bc070e653d4d`, source
  `ee67f4f7-a696-4ba3-9166-6e1b73b7f72f`.
- Original Button instance path `2e84fccf-b8a3-4cb2-bc07-744058b1e7c7`, source
  `13000000-0000-4000-8000-000000000103`.

At a 1440 × 900 Chrome viewport, the editor workspace measured `1440 × 819.5`. At 480 × 720 it
measured `480 × 576`, with `clientWidth = scrollWidth = 480`. The temporary viewport override was
reset after capture. The fresh-tab warning/error console result was `[]`.

Screenshots:

- [`wide 1440 × 900`](./UI-M6-components-wide.jpg)
- [`narrow 480 × 720`](./UI-M6-components-narrow.jpg)

## Component deletion and history

The final fresh Chrome tab rebuilt a minimal Save-disabled scratch from the Runtime HUD button:
`Continue Source` remained referenced by the original document instance, while its duplicate was
renamed to the unreferenced `Action Alternate`. The latter's root source ID was
`c4305e34-9f50-4c88-a3b4-765bb5c30b5a`.

- Clicking only `Delete Action Alternate` while that master was the active edit scope rejected
  before mutation with `Cannot delete the active UI component master; return to the document first`.
- After returning to the document, clicking only `Delete Action Alternate` removed that master and
  left `Continue Source` present.
- Undo restored the same `Action Alternate` master/edit scope and exact root source ID
  `c4305e34-9f50-4c88-a3b4-765bb5c30b5a`; Redo removed it again.
- After Redo, local Undo was enabled, local Redo was disabled, Save remained disabled, and the fresh
  warning/error console result was `[]`.

The referenced `Continue Source` Delete control was not clicked. Its reference safeguard, exact
master/source identity restoration, and history behavior remain covered by the focused pure,
session, and panel tests. No scratch discard control was invoked, and no UI JSON was saved.
