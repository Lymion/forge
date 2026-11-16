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

## PHASE 0 CAPTURES (2026-11-16, Claude Code 2.1.325, model `claude-haiku-5-5`)

**Caveat:** Phase 0 was run in a **Linux cloud container**, not on the user's Windows 11 machine.
Everything about stream shapes, flags and permissions is real captured output (see `fixtures/`), but
item 6 (Windows launch) could not be verified here and must be re-checked on Windows. Auth in the
container showed `apiKeySource: "none"` with both key variables stripped.

All fixtures: `--model haiku --setting-sources project,local` (except `error`, `plugin`'s second twin
`default-settings`). Produced by `scripts/spike.mjs` (prompt on stdin, key env vars deleted).

### Spec 02-architecture "Not verified" items
1. **Stream shapes** (`basic.jsonl`). Top-level `type` values seen: `active_goal`, `autocompact_state`
   (both new, before init), `system` (subtypes `init`, `status`, `post_turn_summary`, `permission_denied`,
   `task_started`, `task_progress`, `task_updated`, `task_summary`, `task_notification`,
   `background_tasks_changed`, `thinking_tokens`), `stream_event` (wraps raw API events:
   `message_start`, `content_block_start/delta/stop`, `message_delta`, `message_stop`; text arrives as
   `event.delta.type == "text_delta"` with `.text`), `assistant` (full message, `message.content[]`),
   `user` (tool results: `message.content[].type == "tool_result"`, plus `tool_use_result`),
   `rate_limit_event`, `result`. Unknown types must map to `raw`. Every event carries `session_id`;
   subagent events have `parent_tool_use_id` set.
2. **Tool names** (init `tools`, 38 by default with project,local): `Task` (subagent), `Bash`, `Edit`,
   `Read`, `Write`, `WebSearch`, `Skill`, `ToolSearch`, `Workflow`, plus Cron*, Artifact*, etc. No `Glob`/`Grep`/
   `WebFetch` in the default list here, but `--tools "Read,Glob,Grep,Edit,Write"` produced a working `Glob` (`direct.jsonl`).
   Always build tool lists from the init event.
3. **`Edit(.forge/**)`** (`denied.jsonl`): `.forge/in.txt` created, `out.txt` NOT created. Denial shows as
   `system:permission_denied` (fields `tool_name`, `tool_use_id`, `decision_reason`, `message`), a `user`
   `tool_result` starting "Permission for this tool use was denied…", and `result.permission_denials[]`
   (`tool_name`, `tool_use_id`, `tool_input`). Exit 0, `is_error: false`. (Alternatives not re-tried; already verified earlier.)
4. **System prompt files:** `claude --help` lists only `--system-prompt <prompt>` and
   `--append-system-prompt <prompt>`; its text mentions `--system-prompt[-file]` / `--append-system-prompt[-file]`
   but they are not listed as options. Unverified → use the bundled plugin for role text, or short `--append-system-prompt`.
5. **Hide user skills:** VERIFIED earlier. Re-confirmed here: default settings → 45 skills, 1 MCP server, extra plugins; project,local → 22, 0 MCP, built-in plugins only (`plugin.jsonl` vs `default-settings.jsonl`).
6. **Windows launch:** NOT VERIFIED (Linux run). `spike.mjs` uses `shell: true` on win32. Re-check on Windows.
7. **Context/rate-limit fields:** `result.modelUsage[model].contextWindow` (1,000,000) and `maxOutputTokens`;
   `autocompact_state` event gives `effective_window` and `threshold`. Rate limits via `rate_limit_event` (see above).
8. **`--agents <file>`:** accepted as a path; the `scout` agent ran (`task_started.subagent_type == "scout"`, `result.subagent_stats.by_type`).
   Whether the per-agent `model` is honoured is **inconclusive**: both parent and scout were haiku, so `modelUsage` lists one model. Re-test with parent `--model sonnet`.

### Other captures
- **Resume** (`resume.jsonl`): `--resume <session_id>` worked; model recalled the first turn. Result carries the same session id.
- **Error** (`error.jsonl`): `--model not-a-model` → **exit 1**, stderr `[claude-code:unrecognized_model] {...}`; stdout still has
  a `result` with `subtype: "success"` but `is_error: true`, `api_error_status: 404`, `terminal_reason: "api_error"`. Check `is_error`, not `subtype`.
- **Direct mode** (`direct.jsonl`): `--tools "Read,Glob,Grep,Edit,Write" --permission-mode acceptEdits --permission-prompts none`: edit happened
  (`HELLO beta gamma`); the model still attempted `Bash`, got `<tool_use_error>No such tool available: Bash`, and said so; no `permission_denials` entry.
- **Picker** (`pick.json`): output is one JSON object; answer in `structured_output`. Haiku filled `skills` with descriptive phrases, not index names, so
  the Phase 11 prompt must say "return skill ids exactly as listed" and validate against the index.
- **Plugin skills** (`plugin.jsonl`): `--plugin-dir` skills appear as `<plugin>:<skill>` (`spikeplug:dummy`) in init `skills`, also with `--setting-sources project,local`; auth works.
- Result extra fields: `terminal_reason`, `api_error_status`, `subagent_stats`, `total_cost_usd`, `num_turns`.

### Spec says → reality
| Spec | Reality |
|---|---|
| Unknown event types rare | New top-level types exist (`active_goal`, `autocompact_state`); treat unknown as `raw` |
| Errors show as non-success subtype | `subtype` stays `success`; use `is_error` + exit code + `api_error_status` |
| `--append-system-prompt-file` may exist | Not listed in `--help` |
| Scout tools include `WebFetch` | `WebFetch` absent from this version's tool list |

