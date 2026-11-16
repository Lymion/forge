# CLI notes — facts from real runs

Started 2026-11-16 on this machine, Claude Code 2.1.325, Windows 11, subscription login, all
runs with `--model haiku`. Phase 0 adds to this file; it does not need to redo what is marked VERIFIED.

## VERIFIED

### Executable
`where claude` → `C:\Users\<user>\AppData\Roaming\npm\claude` (npm shim; there is a `claude.cmd`
beside it). From Node, spawn needs the `.cmd` with `shell: true`, or resolve the real entry. Still to settle in Phase 0.

### Auth
With `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` unset, the init event reports
`"apiKeySource": "none"` and the run succeeds on the subscription.

### 1. User-level skills CAN be hidden: `--setting-sources project,local`

| | default | `--setting-sources project,local` |
|---|---|---|
| skills in init event | 144 | 21 (built-ins only) |
| slash commands | 180 | 57 |
| plugins | 6 (incl. user-installed) | 4 (built-in `cc-plugin-*`) |
| MCP servers | 7 (claude.ai connectors: Gmail, Drive, Docs…) | 0 |
| tools | ~90 (incl. ~60 `mcp__…`) | 29 |
| first-turn cache write | 19,929 tokens | 5,292 tokens |
| auth | works | works |

So every FORGE session passes `--setting-sources project,local`. The skill picker's choice is
then the whole non-built-in skill list. Side effects to design for: the user's global settings,
hooks, global `CLAUDE.md` memory and claude.ai connectors do not load. That is wanted for token
cost; MCP servers the user enables in FORGE come back through `--mcp-config`.

### 2. PLAN can be limited to writing inside `.forge/`
Flags: `--tools "Read,Write,Edit" --allowedTools "<rule>" --permission-prompts none`, prompt asked
for `out.txt` and `.forge/in.txt`.

| rule | `out.txt` | `.forge/in.txt` |
|---|---|---|
| `Edit(.forge/**)` | denied | created |
| `Edit(/.forge/**)` | denied | created |
| `Write(.forge/**)` | denied | **denied** (wrong: do not use) |

Use `Edit(.forge/**)`; it covers the Write tool too. A denial appears in two places:
- a `tool_result` whose text starts `Permission for this tool use was denied. It requires approval, and this session has no approval surface…`
- the result event's `permission_denials: [{ tool_name, tool_use_id, tool_input }]`. Build the denied cards from this array.

### 3. Skill-picker call works
`--tools "" --no-session-persistence --output-format json --json-schema '<schema>'` is accepted.
The output is one JSON object; the parsed answer is in **`structured_output`** (an object), and
`result` holds the same thing as a JSON string. Read `structured_output`.
Measured: 2.1 s, 4,809 input tokens (cache write on first call), 191 output tokens, with a 3-line index.
`--tools ""` is accepted (no tools). `--effort low` is accepted.

### Other facts seen in these runs
- Stream line types: `system:init`, `assistant`, `user` (tool results), `rate_limit_event`,
  `system:post_turn_summary`, `result:success`; with user settings loaded also
  `system:hook_started` / `system:hook_response`. Treat unknown types as `raw`.
- The subagent tool is named **`Task`** in this version.
- The default tool list has `WebSearch` but **no `WebFetch`**. SCOUT's tool list must be built
  from the init event, not assumed.
- **Real rate-limit data exists.** `rate_limit_event.rate_limit_info.unifiedWindows` gives
  `five_hour` and `seven_day`, each `{ utilization (0–1), resetsAt (unix s), status }`. The status
  line and Usage tab show these real numbers; no estimate is needed.
- Result event fields used by FORGE: `usage.{input_tokens, output_tokens, cache_read_input_tokens,
  cache_creation_input_tokens}`, `total_cost_usd`, `duration_ms`, `num_turns`, `permission_denials`,
  `is_error`, `subtype`, `session_id`, `modelUsage`.
- Init event fields used: `session_id`, `model`, `tools`, `skills`, `plugins`, `mcp_servers`, `agents`.

## NOT YET VERIFIED (Phase 0)
Partial-message event shape (`--include-partial-messages`), `--resume` behaviour, `--agents` with a
per-agent model, `--plugin-dir` skills showing in the init event together with
`--setting-sources project,local`, BUILD direct-mode flags, error exit shape, how to launch from
Node on Windows, whether `--append-system-prompt-file` exists, context-window fields.
