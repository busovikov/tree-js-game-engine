---
name: internal-write
description: >-
  Internal mutating libraries for issue/PR commands, quality/dependency flows, and git workflow primitives.
---
# `skills/internal/write/`

Mutating internal libraries used by public `@gh-*` workflows.

## Write gate (required)

**Every** leaf under this tree runs **only after** the caller completes **`read-safety-structured-qa` §0 write gate** (**question** → **options** → **Proceed**). Write libraries **do not** invoke AskQuestion.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

