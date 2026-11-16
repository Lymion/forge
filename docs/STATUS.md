# STATUS

## Phase 0 — CLI spike: DONE (with caveats)

Done:
- `scripts/spike.mjs` (prompt on stdin, `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` deleted from env).
- All fixtures captured in `fixtures/` (basic, tool, resume, denied, agent, error, direct, pick, plus plugin / default-settings for skill loading). All non-empty.
- `docs/cli-notes.md` answers all 8 items, plus direct-mode, picker and a "spec says → reality" table.

Verified by: real `claude` 2.1.325 runs, `--model haiku`, `--setting-sources project,local`, `apiKeySource: none`.

Not done / deviations:
- **Ran on Linux (cloud container), not Windows 11.** Item 6 (how to launch the `.cmd` shim from Node) is unverified; re-check on Windows before Phase 3.
- Per-agent `model` in `--agents` is inconclusive (parent and scout were both haiku). Re-test with a sonnet parent.
- `--append-system-prompt-file` not listed in `--help`; treated as absent.
- No app code, no `npm` scripts yet, so `npm run typecheck` / `npm test` do not exist (they come in Phase 1).

Next: Phase 1. The user should read `docs/cli-notes.md` first.
