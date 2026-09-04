# UI-M6 ROLL-09 Chrome acceptance evidence

Date: 2026-09-04

Browser: user's Chrome extension session at `http://localhost:5176/`.

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

## Browser blocker and fix

Duplicate produced the uniquely named `Card Source 2`. Invoking Rename opened the remaining legacy
native prompt. Chrome detected it as a prompt, but accepting it stalled browser control and reset the
control session; a fresh documented dialog recovery attempt also stalled. Chrome was not killed or
restarted, and no other browser surface was used.

The defect was reproduced by a focused failing test, then fixed by commit `9b2c2c9` with an
accessible validated in-editor Rename component dialog. Empty and duplicate names remain open with
an associated alert and no history; Escape and Cancel close without history; Enter/form submission
renames atomically; Undo/Redo is exact; `window.prompt` is never called.

No current wide/narrow screenshots or final console log were captured after the native prompt made
the tab modal. Existing partial pre-prompt evidence remains at
`docs/handoffs/evidence/UI-M6-card-source-before-native-prompt.jpg`.
