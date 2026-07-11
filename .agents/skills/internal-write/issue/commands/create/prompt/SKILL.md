---
name: write-issue-commands-create-prompt
description: >-
  Read-only: gh issue create checklist and body-file patterns. Parent write-issue-commands.
---
# Issue create prompt

**Before mutation:** Goal + **AskQuestion** + Proceed ([`read-safety-structured-qa`](../../../internal/read/safety/structured-qa/SKILL.md)).

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../../../read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

