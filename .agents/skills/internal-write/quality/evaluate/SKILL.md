---
name: write-quality-evaluate
description: >-
  Evaluate batch: run umbrella (if any), format (prefer fix/write), lint, test, coverage per configured stacks.
  Sole definition of which verify commands run—@git-review orchestrates; this library holds the matrix.
---
# Internal: Evaluate (format / lint / test / coverage)

**Library.** **§4–§7** analogue for **`@git-review`**: run checks after **[`write-dependencies-install`](../install-dependencies/SKILL.md)** using the command list from **[`read-config-configuration`](../../../internal/read/config/configuration/SKILL.md)**. **Intent:** leave the workspace **working and formatted**, not only report failures.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## 4. Umbrella (when defined)

If README/CI defines a **single** entry (`make check`, `npm run check`, `pnpm run validate`, `task check`, …): run **first**.

- Pass + covers analysis + tests (+ coverage if expected): may **skip** separate format/lint/test **unless** README/CI requires parity for separate steps. Still run **coverage-only** step when configuration says umbrella did not enforce it.
- **Fail:** report command and output; **do not** run **[`write-quality-documentation`](../documentation/SKILL.md)** until green.

---

## 5. Format (if umbrella did not cover or did not run)

Prettier, Ruff format, Black, `cargo fmt`, `gofmt`, … from `package.json` / config.

- Prefer **fix** (write) when the project defines it (`npm run format`, `ruff format` without `--review`, `cargo fmt` without `--review`, …) so sources end **formatted**.
- If only **check** mode exists (`prettier --review`, `cargo fmt --review`, …), run it; on failure, run the matching **fix** command from README or scripts when documented, then re-review.
- **Skip** if no formatter for that stack.

---

## 6. Lint

`cargo clippy`, `ruff check`, `flake8`, `eslint`, `golangci-lint`, `go vet`, … per stack **present**.

---

## 7. Test and coverage

### 7a. Tests

`npm test`, `pnpm test`, `cargo test`, `pytest`, `go test ./...`, … per stack.

**Docs-only:** skip §7a with reason; treat evaluate as passed for documentation step if format/lint skipped or passed.

### 7b. Coverage

Only if discovery found an expectation. Run documented script/Makefile/CI-local commands; report thresholds and artifacts.

---

## Do not

- Install deps (that was Prepare).
- **[`write-quality-documentation`](../documentation/SKILL.md)** — **`@git-review`** **§8a** runs it **after** green Evaluate; do **not** run it inside this skill.

## See also

- **`@git-review`** — orchestrator for **[`write-quality-evaluate`](../evaluate/SKILL.md)** §4–7.
