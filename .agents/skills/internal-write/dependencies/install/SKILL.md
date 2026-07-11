---
name: write-dependencies-install
description: >-
  Prepare batch: install deps and build per README/CI for stacks present. Used by @git-review §3.
  Destructive cleans require user confirm per read-safety-structured-qa.
---
# Internal: Install dependencies (prepare)

**Library.** Single **Prepare** batch for **`@git-review`**: install/build so format, lint, and tests can run.
**Safety gate:** When the agent executes network installs or destructive cleans, require **Goal + structured confirm** via **[`read-safety-skill-safety`](../../../internal/read/safety/skill-safety/SKILL.md)** and **[`read-safety-structured-qa`](../../../internal/read/safety/structured-qa/SKILL.md)** before execution.
**Master-confirm rule:** **`SKIP_QA_*`** and **`SKIP_QA_WRITE`** do not bypass session-level confirm for destructive cleans or agent-run install/write actions.

## Language interaction policy

Always apply [`read-safety-language-interaction-rules`](../../../read/safety/language-interaction-rules/SKILL.md) first. Use English by default for all assistant output, including AskQuestion prompts/options, unless the user explicitly requests another full-language response.

## Commands (by stack — minimal defaults)

When the user will run commands themselves, print the exact block(s). When executing as agent, use **in README order** when documented; else:

- **Node:** Lockfile-first (`npm ci`, `yarn install --frozen-lockfile`, `pnpm install --frozen-lockfile`) else `npm install` / `yarn` / `pnpm`; respect workspaces.
- **Python:** `pip install -e .`, `uv sync`, `poetry install`, `pip install -r requirements.txt`, … per `pyproject.toml` / README.
- **Rust:** `cargo fetch` / `cargo build` as needed for Clippy/tests.
- **Go:** `go mod download`; `go build ./...` if required.
- **Ruby / JVM / .NET:** follow README.

**Before** `rm -rf node_modules`, full venv wipe, or similar: **structured confirm** (**[`read-safety-skill-safety`](../../../internal/read/safety/skill-safety/SKILL.md)** destructive-install row + **[`read-safety-structured-qa`](../../../internal/read/safety/structured-qa/SKILL.md)** **§3a**)—not chat-only yes/no.

---

## Do not

- Run format, lint, or test **as verification**—that is **[`write-quality-evaluate`](../evaluate/SKILL.md)**.
- Commit or push.

## See also

- **[`read-config-configuration`](../../internal/read/config/configuration/SKILL.md)** — next step: resolve evaluate commands.
