# Autonomous stage handoff protocol

This protocol is mandatory for
[engine improvement through Bounce Run](./engine-game-development-plan.md). Each semantic
stage runs in a separate sub-agent with only the context required for that stage.

## Orchestrator rules

1. One stage equals one bounded sub-agent assignment.
2. Give the sub-agent only:
   - this protocol;
   - the relevant architecture section;
   - the exact milestone section and acceptance criteria;
   - narrow source entrypoints discovered for that stage;
   - the latest handoff, if this is a continuation.
3. Do not paste the full prior conversation or ask a stage agent to load the whole repo.
4. Fundamental dependency stages are sequential. Parallel work is allowed only when file
   ownership and public contracts do not overlap.
5. A code stage ends with targeted checks, a clean consistency check for affected consumers,
   one or more granular local commits, and a handoff.
6. The orchestrator reviews the diff, checks acceptance evidence, and records the completed
   commit before dispatching the dependent stage.
7. Never push, open a PR, rewrite history, or silently overwrite user changes.

## Context rollover rule

When an available context indicator reaches 80%, the active agent must stop expanding the
scope and create a handoff while it can still do so accurately. If no numeric indicator is
available, hand off when the remaining context is unlikely to cover implementation,
verification, and reporting safely.

A rollover is not a blocked result. Commit only completed, verified increments. A fresh
sub-agent continues unfinished work from the handoff and the same branch. Do not leave a
breaking transition half-applied merely to meet the context threshold; make the last safe
savepoint earlier.

## Handoff file location

Use:

```text
docs/handoffs/<stage-id>-<sequence>.md
```

Handoff files are operational records. Keep the latest useful handoff while the stage is
active. The final stage handoff becomes part of the milestone evidence; obsolete rollover
handoffs may be consolidated by a later documentation-only commit.

## Required template

```markdown
# Handoff: <stage id and title>

## Objective

<One paragraph.>

## Scope and acceptance criteria

- [ ] ...

## Required context

- `docs/...`
- `packages/...`

## Decisions and invariants

- ...

## Completed

- ...

## Files changed

- `path`: reason

## Local commits

- `<hash>` — `<message>`

## Verification evidence

- `<command>` — pass/fail and relevant result
- Browser check — URL/build and observed result

## Current repository state

- Branch: `engine-improvement-based-on-game-creation`
- HEAD: `<hash>`
- Worktree: clean / exact uncommitted files and why

## Remaining work

- ...

## Risks and open defects

- ...

## Exact next action

<A concrete first action for the next agent.>

## Context exclusions

- <Files/subsystems the next agent does not need to read>
```

## Stage completion report

The stage agent reports:

- outcome first;
- commit hashes;
- changed files;
- verification commands and results;
- browser evidence where relevant;
- remaining risks;
- exact handoff path.

“Tests pass” without command names or “implemented” without acceptance evidence is not a
valid handoff.
