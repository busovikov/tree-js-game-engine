---
name: write-quality-documentation
description: >-
  Sharpen existing docs/** (wiki sections, docs/** indexes, optional slimmer domain layouts on other repos),
  minimal root README.md, and legacy paths if present. Runs after green evaluate when a quality pass requests §8a doc
  polish. Does not create new doc pages.
---
# Internal: Project documentation (`write-quality-documentation`)

**Library.** Single **batch** for post-evaluate **§8a**: after **[`write-quality-evaluate`](../evaluate/SKILL.md)** succeeds, **edit existing** markdown only.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Do

1. **Repo root** — Target **open** project (not necessarily cursor-skills).
2. **Inventory** — Always: **minimal** root **`README.md`**, **`docs/**`**. Include **existing** paths only: **`docs/README.md`** (simple repos may use **only** this file under **`docs/`**); if present, also profile wiki dirs (**`docs/architecture/`**, **`docs/organization/`**, **`docs/domains/`**, **`docs/workflows/`**, **`docs/data/`**, **`docs/conventions/`**, **`docs/operations/`**, **`docs/api/`**, **`docs/services/`**). If legacy **`skills/**/README.md`** (other repos) or root **`USER_GUIDE.md`** / **`REFERENCE.md`** still exist, include only when present—this pack keeps **no** README under **`skills/`** when mirror policy applies. **Do not** **create** new **`docs/`** pages here. If **no** **`docs/`** hub exists, point the user to **`read-repo-layout`** / **`read-docs-readme-tree`**—**`@git-docs`** does not create new pages.
3. **Sharpen** — Patch in place: commands, lists, links, **colored** mermaid; match **current** tree, CI, and **`write-quality-evaluate`**. **Implicit markdown conventions (no user citation required)** — apply together with this step whenever the file has **`## Contents`**, **overview** prose, **tables**, or **mermaid**: **`read-docs-index`** (numbered lists; **no** index tables), **`read-docs-explanation`** (explanation sections), **`read-docs-table`** (reference tables: sort + largest-row callout), **`read-docs-graphs`** (when to diagram + palette), **`read-docs-exemplars`** (tone/rubric), **`read-docs-readme-root`** (minimal root README when path is repo root), **`read-repo-layout`** (hub vs mirror). **Do not** duplicate long prose from those libraries in chat—open the linked **`SKILL.md`** when needed.
4. **Do not** use this library for structural doc-tree reshaping—only in-place edits on existing paths.

---

## Do not

- **Create** new `.md` files (including scaffold / “missing page” fills).
- Run if Evaluate **failed**.
- `git commit` / `git push`.

---

## Verification

- [ ] Only existing paths were modified.
- [ ] Docs match repo + checks; **`## Contents`** avoids markdown **tables** for pure indexes; **reference tables** follow **`read-docs-table`** when edited.

---

## Notes

- Prefer **mermaid** in `.md` for flowcharts (**`skills/internal/read/workflow/doc-graphs/diagrams/`** + **`read-docs-graphs`**).
- **`SKILL.md`** conventions: keep **`name`** / **`description`** accurate; link delegates instead of duplicating command fences.

## See also

- [`read-docs-readme-tree`](../../read/readme-tree/SKILL.md) — read-only mirror bootstrap + checklist
- [`read-repo-layout`](../../internal/read/repo/layout/SKILL.md)
- [`write-quality-evaluate`](../evaluate/SKILL.md)
