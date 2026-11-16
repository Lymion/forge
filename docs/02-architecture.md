# 02 — Architecture

## Stack

Install the latest stable of each at scaffold time and let `package.json` record the versions.

| Concern | Choice | Why |
|---|---|---|
| Shell | Electron, scaffolded with `electron-vite` (react-ts template) | Node child processes, PTY, and an embeddable browser in one runtime; all TypeScript |
| UI | React + TypeScript strict | |
| Styling | Tailwind CSS v4 with CSS variables from `03-design.md` | |
| State | Zustand (one store per feature) | |
| Validation | zod (IPC payloads, CLI events, config files) | |
| Terminal | `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-webgl` + `@lydell/node-pty` | The `@lydell` build ships prebuilt binaries, so no native compile on Windows |
| Markdown | `react-markdown` + `remark-gfm`; code highlighting with `shiki` (lazy) | |
| File watching | `chokidar` | |
| Motion | `motion` (only where `03-design.md` names an animation) | |
| Fonts | `@fontsource/jetbrains-mono` (bundled, no network) | |
| Dictation | `@huggingface/transformers` running Whisper in a Web Worker | Local, zero tokens |
| Tests | vitest | |
| Packaging | electron-builder (NSIS wizard) from Phase 1; `electron-updater` for updates in Phase 13 | See `06-desktop-app.md` |

Persistence is plain files under `app.getPath('userData')`; no database, no native SQLite module:

```
userData/
  config.json            settings (zod-validated, with defaults)
  projects.json          registered projects
  usage.jsonl            one line per finished turn (append-only)
  sessions/<projectId>/<role>/<sessionId>.jsonl   normalised transcript events
  skills/sources/<name>/                           git clones of skill sources
  skills/sessions/<sessionKey>/                    generated plugin dir per session (see Skills)
  tmp/                                             prompt/flag temp files, cleaned on quit
```

Writes to JSON files are atomic (write `*.tmp`, then rename).

## Processes

- **Main**: owns everything with side effects. Modules: `engine`, `pty`, `projects`, `skills`,
  `preview`, `usage`, `git`, `library`, `config`, `ipc`.
- **Preload (window)**: exposes `window.forge` through `contextBridge`. Typed from
  `src/shared/ipc.ts`. Request/response uses `ipcRenderer.invoke`; streams use
  `ipcRenderer.on` with a subscription id and an unsubscribe function.
- **Renderer**: React. Never touches Node.
- **Webview preload** (`src/preload/picker.ts`): injected into the Preview `<webview>` only.
  Implements element picking and talks to the host with `ipcRenderer.sendToHost`.

Every IPC channel is declared once in `src/shared/ipc.ts` as
`{ channel, request: zodSchema, response: zodSchema }`. Main registers handlers through one helper
that parses the request with the schema and rejects on failure.

## Engine: driving the `claude` CLI

### Verified facts (checked on this machine, Claude Code 2.1.325)

These flags exist in `claude --help`: `-p/--print`, `--output-format stream-json`,
`--input-format stream-json`, `--include-partial-messages`, `--verbose`, `--model <alias|id>`,
`--effort <low|medium|high|xhigh|max>`, `--permission-mode <acceptEdits|auto|bypassPermissions|manual|dontAsk|plan>`,
`--permission-prompts <host|none>`, `--tools <list>`, `--allowedTools`, `--disallowedTools`,
`--resume <id>`, `--session-id <uuid>`, `--fork-session`, `--append-system-prompt`,
`--agents <json-or-file>`, `--plugin-dir <path>` (repeatable), `--mcp-config`, `--strict-mcp-config`,
`--settings <file-or-json>`, `--setting-sources <user,project,local>`, `--add-dir`,
`--fallback-model`, `--autocompact`, `--exclude-dynamic-system-prompt-sections`.

`--bare` must **not** be used: it disables OAuth, which is the subscription login.

### Not verified — Phase 0 must establish these and write them to `docs/cli-notes.md`

`docs/cli-notes.md` already exists with items 3, 5 and 7 and the picker call VERIFIED by real runs
(2026-11-16). Phase 0 covers the rest and appends to that file.

1. Exact JSON shape of each stream-json line (init, assistant, user/tool-result, partial
   stream events, result). The shapes below are the expected ones, not confirmed.
2. Exact built-in tool names in this version (read them from the init event's tool list;
   the subagent tool may be `Agent` or `Task`).
3. Whether `--allowedTools "Edit(.forge/**)"` with `--permission-prompts none` allows writes
   inside `.forge/` and denies writes elsewhere, and what a denial looks like in the stream.
4. Whether a `--append-system-prompt-file` flag exists (`claude --help | findstr system-prompt`).
   If not, pass short text with `--append-system-prompt` and keep it free of quotes and newlines,
   or put role instructions in the bundled plugin instead.
5. Whether `--setting-sources project,local` hides skills in `~/.claude/skills` while
   subscription auth still works. The user already has ~100 skills there; if they cannot be
   hidden, a chat loads them on top of the skills the user chose. (VERIFIED: they can be hidden.)
6. How the resolved executable is launched on Windows (`where claude` → `.exe` or `.cmd`).
7. Whether the result event reports context-window usage and rate-limit information.
8. Whether `--agents` accepts a file path and honours a per-agent `model` field.

### Spawn model: one process per turn

Each user turn spawns a fresh process and resumes the session by id. No long-lived stdin stream.
This is simpler to cancel and cannot leave a hung session.

```
claude -p
  --output-format stream-json --verbose --include-partial-messages
  --model <role.model> --effort <role.effort>
  [--resume <sessionId>]                      (omitted on the first turn of a session)
  <role permission flags>                     (table below)
  --plugin-dir <userData/skills/sessions/<sessionKey>>   (skills picked for this session; see Skills)
  --plugin-dir <resources/forge-skills>
  [--agents <tmp file>]                       (PLAN only)
  [--append-system-prompt ...]                (per cli-notes.md)
  --exclude-dynamic-system-prompt-sections
  --setting-sources project,local            (VERIFIED: hides user skills, plugins and connectors; see cli-notes.md)
```

- `cwd` = project folder.
- `env` = `process.env` minus `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`.
- The prompt is written to **stdin**, then stdin is closed.
- stdout is split on `\n`; each non-empty line is `JSON.parse`d inside try/catch, validated by a
  permissive zod schema (`passthrough`), and mapped to an `EngineEvent`. Unknown line types are
  kept as `{ kind: 'raw' }` and logged, never thrown.
- stderr is collected; on non-zero exit an `error` event carries the last 2 KB of it.
- Cancel = `taskkill /PID <pid> /T /F`, then emit `turn-cancelled`.
- One running turn per (project, role). A second send while running is queued (max 1) or rejected.

### Role configuration (`src/shared/roles.ts`, user-editable in Settings)

| | SCOUT | PLAN | BUILD |
|---|---|---|---|
| `model` | `haiku` | `opus` | `sonnet` |
| `effort` | `low` | `high` | `medium` |
| `--tools` | `Read,Glob,Grep,WebSearch,WebFetch` | `Read,Glob,Grep,WebSearch,WebFetch,Write,Edit,<subagent tool>,Skill` | `Read,Glob,Grep,Edit,Write,Skill` (direct mode: no Bash, no PowerShell, no web) |
| `--permission-mode` | (default) | (default) | `acceptEdits` |
| `--allowedTools` | — | `Edit(.forge/**)` (exact rule syntax per cli-notes.md) | — |
| `--permission-prompts` | `none` | `none` | `none` |

Take the exact file-tool names from the init event recorded in `cli-notes.md` (if this CLI
version has other pure file-editing tools such as a multi-edit or notebook-edit tool, include
them for BUILD). With "Allow shell for BUILD" switched on for a project, BUILD's `--tools`
becomes `default` and the Bash allowlist below applies.

Aliases (`haiku`/`opus`/`sonnet`) are used so the roles track the newest model of each tier.
The user may pin full model ids in Settings.

Why `--permission-prompts none`: nothing ever blocks waiting for an answer. Anything not
pre-allowed is denied and reported. The app shows each denial as an inline card:
`✗ denied: Bash(npm install zod)` with **Allow once & retry** and **Always allow in this project**.
"Always allow" appends a pattern to `.forge/permissions.json`; retry re-sends
"The previous command is now permitted. Continue." to the same session.

Bash allowlist used only when "Allow shell for BUILD" is on: `Bash(npm run *)`, `Bash(npm test*)`,
`Bash(npx tsc*)`, `Bash(git status*)`, `Bash(git diff*)`, `Bash(git log*)`. Never pre-allow
`rm`, `git push`, `git reset`, or installers.

### Direct mode plumbing

- **`NEEDS:` lines.** After a BUILD turn, scan the final assistant text for lines matching
  `^NEEDS:\s+(.+)$`. Each becomes a card with the command and **Run in terminal** / **Skip**.
  Run executes it in a project PTY the user can see. When it exits, send BUILD one message:
  `NEEDS result: <command> → ok` or `→ failed (exit N)` plus the last 20 output lines.
  Never auto-run a `NEEDS:` command; it always takes a click.
- **Quiet checks** (`src/main/checks/`). Per project: `{ typecheck?, lint?, test? }` commands,
  detected from `package.json` scripts (`typecheck`, `lint`, `test`; else `npx tsc --noEmit` if a
  `tsconfig.json` exists), editable in project settings. Run with `execFile`/`spawn` (no model),
  5-minute timeout each. A reducer per tool turns output into `{ file, line, message }[]`
  (parsers for tsc, eslint, vitest/jest; unknown tools → last 40 lines). Unit-test the reducers
  with captured outputs. Result to BUILD on failure:

```
CHECKS FAILED (typecheck 3, test 1) — fix these, change nothing else:
src/a.ts:12 TS2345 Argument of type 'string' is not assignable to 'number'
…
```

  At most 40 lines; passing checks produce no message at all. After two failed fix attempts on
  the same step, stop and show the user the failures instead of looping.

PLAN gets one subagent, passed through `--agents`, so Opus delegates lookups instead of doing them:

```json
{ "scout": {
    "description": "Fast read-only lookup: find files, read code, search the web, summarise. Use for any search or reading task.",
    "prompt": "You are a scout. Answer with the minimum text needed: file paths with line numbers, short quotes, a 5-line summary. Never paste whole files.",
    "tools": ["Read", "Glob", "Grep", "WebSearch", "WebFetch"],
    "model": "haiku" } }
```

### Role instructions

Short, stable text (stable text keeps the prompt cache valid; never include dates or counters):

- **SCOUT**: "Read-only assistant. Be brief. Return paths with line numbers and short quotes, not
  whole files. When asked for a repo map, write the result as text for the app to save."
- **PLAN**: "You plan; you do not implement. You may only write inside `.forge/`. Delegate all
  searching and reading of more than two files to the `scout` subagent. Read `.forge/brief.md`
  and `.forge/map.md` first if present. For any UI, follow the `review-prototype` skill before
  writing `plan.md`. Write `plan.md` in the exact step format in the `forge-plan-format` skill.
  Keep replies short; put substance in the files."
- **BUILD**: "Implement exactly the step you are given from `.forge/plan.md`. Read
  `.forge/design.md` before UI work. Do not refactor outside the step's files. You have no shell.
  Change code only with the file tools. Prefer a targeted edit to rewriting a whole file. Find
  things with search before opening files, and do not re-read a file you just edited. The app
  runs typecheck, lint and tests for you and will send failures; do not ask to run them. If a
  command must be run (for example installing a package), end your reply with a line
  `NEEDS: <exact command>` and stop. When done, set the step's status to `done`, append to
  `.forge/progress.md`, and stop."

Because SCOUT has no write tool, the app saves SCOUT output to files itself (e.g. the repo map:
the app sends the request, captures the final text, writes `.forge/map.md`).

### `EngineEvent` (the only shape the renderer sees)

```ts
type EngineEvent =
  | { kind: 'session'; sessionId: string; model: string; tools: string[]; skills: string[] }
  | { kind: 'text-delta'; text: string }
  | { kind: 'thinking-delta'; text: string }
  | { kind: 'tool-start'; id: string; name: string; input: unknown; parentId?: string }
  | { kind: 'tool-end'; id: string; ok: boolean; output: string /* truncated to 4 KB */ }
  | { kind: 'denied'; tool: string; rule: string }
  | { kind: 'turn-result'; usage: TurnUsage; durationMs: number; numTurns: number }
  | { kind: 'turn-cancelled' }
  | { kind: 'error'; message: string; stderrTail?: string }
  | { kind: 'raw'; line: unknown };

type TurnUsage = { input: number; output: number; cacheRead: number; cacheWrite: number;
                   costUsdEquivalent?: number; contextPct?: number };
```

Expected source lines (confirm in Phase 0): `{"type":"system","subtype":"init","session_id",…}`,
`{"type":"assistant","message":{content:[text|thinking|tool_use…]}}`,
`{"type":"user","message":{content:[tool_result…]}}`,
`{"type":"stream_event","event":{…content_block_delta…}}`,
`{"type":"result","subtype":"success"|…,"usage":{…},"total_cost_usd",…}`.

The parser is a pure function `parseLine(line: string): EngineEvent[]` in
`src/main/engine/parse.ts`, unit-tested against the files in `fixtures/`.

Usage note: on a subscription `total_cost_usd` is an API-price equivalent, not a charge. Label
it "≈ API value" and treat tokens as the primary number.

### Build-step runner

"Run step S3" does, in order:

1. `git` checkpoint (see Git).
2. Start a **new** BUILD session (unless "continue previous session" is ticked).
3. Send: `Implement step S3 from .forge/plan.md. Read only that step, its dependencies' entries in .forge/progress.md, and .forge/design.md.`
4. On `turn-result`: handle any `NEEDS:` cards, then run quiet checks. On failure send the
   failure message to the same session (max two rounds).
5. **Start build** runs this whole procedure for every `todo` step in dependency order, one
   after another, without waiting for the user between steps. It pauses (and opens the tile that
   needs attention) on: a `NEEDS:` card, a denial, checks failing after two rounds, a budget
   stop, or the user pressing Stop. Resuming continues from the paused step. "Ask Opus" on a
   failed step sends PLAN: the step text, `git diff --stat`, and the failing lines.
6. Re-parse `plan.md`, refresh the Plan pane, show the diff summary
   (`git diff --stat` since the checkpoint) with **Keep** / **Undo step** (restore checkpoint).

## Tiling layout (`src/renderer/features/tiling/`)

- Model: a binary split tree. `Node = { kind:'split', dir:'row'|'col', ratio:number, a:Node, b:Node }
  | { kind:'leaf', pane: PaneId }`, `PaneId = 'session'|'preview'|'terminal'|'plan'|'library-browser'`.
  Pure functions, unit-tested: `rects(tree, bounds, gap) → Map<PaneId, Rect>`,
  `move(tree, pane, target, edge)`, `swap`, `close`, `open(pane)` (splits the focused leaf along
  its longer side), `setRatio`, `maximise` (a flag beside the tree, not a tree change).
- Rendering: every pane is `position:absolute` at its computed rect. Panes are **never
  unmounted or re-parented** when the layout changes (a `<webview>` reloads and xterm loses state
  if moved in the DOM); only their rect changes.
- Animation is FLIP on the pane frame: set the final `left/top/width/height` at once, apply the
  inverse `transform` (translate + scale from the old rect), then spring it to identity. Content
  resizes exactly once, at the start. Call xterm `fit()` and let the webview reflow at that
  moment, not per frame. Values in `03-design.md` §Tiling.
- Drag: grabbing a pane's title bar lifts it (see design). Drop zones on each other pane:
  left/right/top/bottom 25% bands = split on that side; centre = swap. A translucent ghost shows
  where it will land. Dividers between tiles are draggable to change `ratio` (min pane 280×200).
- Layout is saved per project in `projects.json`; the default for a new project is two tiles, `session | preview` at 42/58.
  The tile switch calls `toggle(pane)`: closing removes the leaf (the session tile cannot be closed);
  opening splits the largest non-session tile along its longer side. Presets (`two`, `all`,
  `review` = preview maximised) are command-palette commands only.

## PTY terminal

`PtyManager` spawns `powershell.exe` (fallback `cmd.exe`) with `cwd` = project folder through
node-pty; data flows over a stream IPC channel; resize is forwarded from the fit addon.
The main process keeps a 200-line ring buffer per terminal and scans output for
`https?://(localhost|127\.0\.0\.1):\d+` to offer "Open in Preview". Terminals are killed when the
project closes or the app quits.

"Send to session" on a text selection in the terminal inserts the selection (max 4 KB, tail kept)
into the composer inside a fenced block. This is how errors reach Claude without it re-running things.

## Preview and picker

- `<webview>` tag (`webviewTag: true` on the main window only), `partition="persist:preview"`,
  `nodeintegration` off, `contextIsolation` on, `preload` = built `picker.js`.
- Allowed navigation in the Preview pane: `http(s)://localhost|127.0.0.1` and `file://` paths
  inside the open project. Anything else opens in the Library browser (separate partition
  `persist:library`, no picker preload) or the system browser.
- Picker protocol (host ⇄ webview): host sends `picker:enable|disable`, `picker:pins` (to redraw);
  webview sends `picker:picked { selector, text, rect, tag }`.
  - `selector`: shortest unique CSS selector (prefer `#id`, then `[data-testid]`, then a
    tag/`:nth-of-type` path capped at 5 levels).
  - `text`: element `innerText`, whitespace-collapsed, first 80 chars.
  - Hover outline and pins are drawn inside the page in a shadow-DOM overlay with
    `pointer-events: none` except the pins.
- Reviews are stored at `.forge/reviews/<prototype-name>.json`:
  `{ target, createdAt, pins: [{ n, selector, text, note, cropPath?, reply?, resolved }] }`.
  The app writes `note`; PLAN writes `reply` and `resolved`. Re-read the file after each PLAN turn.
  Only unresolved pins are sent. Validate with zod; if PLAN leaves the file malformed, restore the
  app's last good copy and show PLAN's chat reply instead.
- **Live comments (default).** A comment is delivered the moment it is saved, not in a batch:
  - Target session idle → start a turn at once with that one comment (same format as below, one line).
  - Target session busy → the comment is queued; when the running turn ends, all queued comments
    go out together as the next turn, immediately. The pin shows `queued`, then `working…`.
  - While the turn streams, the pin's thread shows the reply as it is written, the preview
    hot-reloads on every file change (the watcher already does this), and the app re-shoots.
  - Each comment turn resumes the same session, so it reads from a warm cache; the cost of a
    one-line comment is mostly the edit it causes. A queue cap of 20 and a 400 ms debounce after
    the user stops typing in the pin's input keep it from firing on half-written notes
    (Enter saves at once).
  - A switch in the review strip chooses **Live** or **Batch**. Batch is the old behaviour:
    nothing is sent until **Send review**.
- Message format (one line per pin; in Live mode usually a single line):

```
REVIEW .forge/prototypes/home.html — 3 comments
1. [header nav a:nth-of-type(2)] "Pricing" → make this a pill button, same height as Sign in
2. [#hero h1] "Build faster" → too big on mobile, cap at 2 lines
3. [footer] → remove the newsletter form
Revise the prototype, or tell me which of these you disagree with and why.
```

- Optional crop: `webview.capturePage(rect)` → PNG in `.forge/reviews/`, referenced by path in the message.
- `chokidar` watches `.forge/prototypes/*.html`; add/change → open or reload in Preview, turn Comment mode on, then re-shoot.
- **Shots** (`src/main/preview/shots.ts`): a hidden offscreen `BrowserWindow` (no preload, no Node) loads the
  prototype by `file://` with query presets and captures PNGs: `state=full` at 1440×900, the same with
  `theme=dark`, 390×844, and each of `state=empty|loading|error`. Inject CSS to hide the Prototype bar
  (`.proto{display:none!important}`). Collect console errors per shot. Save to
  `.forge/prototypes/shots/<screen>/<preset>.png` (git-ignored). Shots are for the user; never attach
  them to a model turn automatically.

## Skills

- Sources are git repos cloned to `userData/skills/sources/<name>` with the system `git`
  (the user's credential helper handles the private repo). Default source:
  `https://github.com/Lymion/skills-collections`, skills at `plugins/haykal-skills/skills/*`.
  Clone/pull failures show the git stderr and a "Retry" button; the app works without skills.
- Index: for each `SKILL.md`, parse YAML frontmatter `name`, `description`; estimate tokens as
  `ceil((name.length + description.length) / 4)`.
  The folder name and the frontmatter `name` can differ (the folder `taste-skill` holds the skill
  named `design-taste-frontend`); index by folder, display the frontmatter name, match on either.
- **Skill selection is manual** (`src/main/skills/select.ts`). No model call.
  - `userData/skill-templates.json`: `[{ id, name, skills: string[] (folder names), builtIn: boolean }]`,
    seeded with the shipped templates in `01-product.md`. Built-in ones can be edited; "Reset" restores them.
  - Per role: `defaultTemplateId` (PLAN → *UI design*, BUILD → *Motion*, SCOUT → *None*).
  - A chat's selection = its template's skills plus or minus the user's ticks, stored with the session.
  - Before the first turn, materialise `userData/skills/sessions/<sessionKey>/` as a valid plugin:
    `.claude-plugin/plugin.json` (`{ "name": "forge-session", "version": "0.0.0" }`) and
    `skills/<folder>/` copied from the source (copy, not symlink; Windows symlinks need admin).
    The folder never changes for that session. Skip names missing from the source with a visible warning.
  - Changing skills after the first turn: default is to start a new chat with the new set; "Apply
    here" writes a new folder for the same session and warns that the cache resets.
  - Delete session skill folders with their session, and orphans on app start.
  - The verified Haiku structured-output call (cli-notes.md §3) is no longer used for skills; it
    remains the mechanism for Auto-route in Phase 11.
- The Skills screen shows templates (create, rename, edit, delete, set as a role's default), the
  full list with search, and for each open chat the loaded skills with estimated description tokens.
- **User-level skills.** The user also has ~120 skills in `~/.claude/skills`. VERIFIED: with
  `--setting-sources project,local` they do not load (144 → 21 skills, built-ins only), so the
  pick is the whole list. Settings has a switch "Load my global Claude settings" (off) for the
  rare session that needs them, with a note that it adds about 15k tokens to every session start.
- Some skills carry hooks or scripts that need a shell (for example `taste-skill` has a Stop hook
  that runs a Node script and needs Chrome). Show a "needs shell" badge on such skills (detect
  `hooks:` in frontmatter or a `scripts/` folder). They load fine for PLAN; in BUILD direct mode
  their scripts are run by the app only if the user clicks the resulting `NEEDS:` card.
- **Bundled plugin** `resources/forge-skills/` (always loaded), written in Phase 6:
  - `forge-plan-format` — the exact `plan.md` step format from `01-product.md`.
  - `review-prototype` — the user's skill adapted to FORGE. Fetch the original with
    `gh api "repos/Lymion/workflow-hub/contents/.claude/skills/review-prototype/SKILL.md?ref=claude/dazzling-rubin-tjxri3" --jq .content`
    (base64-decode it) and save it unchanged as `resources/forge-skills/skills/review-prototype/SOURCE.md`.
    Write `SKILL.md` beside it by applying the mapping table in `01-product.md` §Prototype review:
    keep the original wording for every rule the table marks as kept; replace steps 3–5 with what
    the app does and what PLAN must do (write replies into the review file); name no tool that the
    init event in `cli-notes.md` does not list. Because this copy is bundled and always loaded,
    exclude any same-named skill in synced sources from the skill list so two versions never load.

## Library

- `resources/registries.json`: `[{ id, name, homepage, kind: 'shadcn-registry', indexUrl, addCommand }]`.
  Ship shadcn/ui as the first entry. For every other candidate (Magic UI, Aceternity UI,
  React Bits, Origin UI, 21st.dev), Phase 8 must fetch the site's documented registry index; add
  the entry only if the index actually returns valid JSON, otherwise list the site under bookmarks.
  Do not invent URLs.
- Search = fetch each index once per day (cached in userData), filter client-side by name/description.
- **Add to project** runs the registry's documented command (shadcn: `npx shadcn@latest add <item>`)
  in a visible project terminal, so the user sees prompts and output.
- `resources/templates.json`: `[{ id, name, description, command }]` where `command` is the
  official scaffolder with a `{name}` placeholder. Verify each command's current form from the
  tool's own docs before shipping it.
- Docs-lookup MCP: Settings has an "MCP servers" list written to a file passed with
  `--mcp-config`. Ship it empty with one suggested entry (a documentation-lookup server such as
  Context7) that the user can enable. No server is on by default, because every MCP server's tool
  list costs context in every session.

## Git

Use the system `git` through `execFile` (no shell). If the project is not a repo, checkpoints are
disabled and the UI says why, with an "Initialise git" button.

- Checkpoint before a build step. It must include untracked files and must not move HEAD or
  add commits to the user's branch. Create a dangling commit object: `git add -A`,
  `git write-tree`, `git commit-tree <tree> -p HEAD -m "forge checkpoint S3"`, store the hash in
  `.forge/checkpoints.json`, then `git reset` (mixed) to put the index back. If the user had
  staged changes before the checkpoint, record that and warn that staging is not preserved.
  Test this sequence in a throwaway repo before wiring it to the UI.
- Undo step: `git restore --source=<hash> --staged --worktree -- .` then `git clean -fd` limited to
  files that did not exist in the checkpoint tree (compute the list from `git diff --name-status <hash>`).
  Show the file list and ask for confirmation first.
- Add `.forge/reviews/*.png` and `.forge/checkpoints.json` to the project's `.gitignore` (ask first).

## Usage ledger

On every `turn-result`, append to `usage.jsonl`:
`{ ts, projectId, role, model, sessionId, input, output, cacheRead, cacheWrite, costUsdEquivalent, durationMs }`.
Derived numbers (pure functions, unit-tested): tokens today, rolling 5-hour total,
cache-hit % = `cacheRead / (cacheRead + cacheWrite + input)`, per-role and per-project sums.

## Dictation

- Renderer captures the mic with `getUserMedia`, records while the key/button is held, resamples
  to 16 kHz mono `Float32Array`, posts it to a Web Worker.
- Worker loads an ASR pipeline from `@huggingface/transformers` (default model
  `onnx-community/whisper-base`, multilingual; setting to switch to `whisper-small` or `.en`).
  Try WebGPU, fall back to WASM. Confirm the exact model id and options from the library's
  current docs in Phase 9.
- First use downloads the model: show size and progress; cache persists.
- Electron: grant the `media` permission only to the app's own origin in
  `session.setPermissionRequestHandler`; deny it for the preview and library partitions.
- If the model fails to load, show the reason and a hint that Windows' own dictation (Win+H)
  works in the composer as a fallback.
