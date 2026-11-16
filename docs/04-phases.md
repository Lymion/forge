# 04 — Build phases

One phase per session. Each ends with: acceptance checks run, `docs/STATUS.md` updated, one commit.
"Check" items are things you must actually do and report the result of, not things to assume.

---

## Phase 0 — CLI spike (no app code)

Goal: replace every assumption about the `claude` CLI with captured facts.

Each command below spends a small amount of the user's subscription usage. Use `--model haiku`
for all of them and keep prompts tiny.

1. `git init` in the repo root if needed. Create `fixtures/` and `docs/cli-notes.md`.
2. Resolve the executable: `where claude`. Record the path and whether it is `.exe` or `.cmd`.
   Write a 20-line Node script `scripts/spike.mjs` that spawns it the way the app will
   (prompt on stdin, env without `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`, cwd = a temp folder
   containing one small text file) and writes stdout lines to a fixture file.
3. Capture these fixtures (one file each, raw lines):
   - `basic.jsonl` — prompt "Say hi in three words." with `--output-format stream-json --verbose --include-partial-messages`
   - `tool.jsonl` — prompt "Read note.txt and tell me its first word." with `--tools Read`
   - `resume.jsonl` — second turn using `--resume <id from basic>`; prompt "What did I ask before?"
   - `denied.jsonl` — `--tools "Read,Write,Edit" --allowedTools "Edit(.forge/**)" --permission-prompts none`,
     prompt "Create out.txt containing x, and create .forge/in.txt containing y." Record which file exists afterwards.
     If the rule syntax is wrong, try the documented alternatives (`Edit(/.forge/**)`, `Write(.forge/**)`) and record what works.
   - `agent.jsonl` — `--model haiku --agents <file>` with the `scout` agent from `02-architecture.md`,
     prompt "Use the scout agent to read note.txt." Record whether the subagent's model is reported.
   - `error.jsonl` — `--model not-a-model`. Record exit code and stderr.
   - `direct.jsonl` — BUILD's direct-mode flags: `--tools "Read,Glob,Grep,Edit,Write" --permission-mode acceptEdits --permission-prompts none`,
     prompt "Change the first word of note.txt to HELLO. Then run the command dir." Record that the edit
     happened, that no shell tool was available, and how the model reported it.
   - `pick.json` — the skill-picker call: `--tools "" --no-session-persistence --output-format json --json-schema <file>`
     with schema `{skills: string[], role: string}`, prompt = three fake index lines plus a message.
     Record exactly where the structured result sits in the output and whether `--tools ""` is accepted.
4. From the init event of `basic.jsonl` record: tool names, the skills/commands list, model id.
5. Check `claude --help` for `--append-system-prompt-file` and `--system-prompt-file`. Record.
6. Check skill loading: run with `--plugin-dir <a temp plugin with one dummy skill>` and confirm
   the dummy skill appears in the init event. Then add `--setting-sources project,local` and record
   (a) whether the user's `~/.claude/skills` entries disappear from the init list and
   (b) whether auth still works. This decides whether skill profiles can subtract.
7. Record whether the result event carries context-window or rate-limit fields.
8. Write `docs/cli-notes.md`: for each numbered "Not verified" item in `02-architecture.md`, the
   answer, with the fixture line that proves it. Include a table "spec says → reality" for
   anything different.

Acceptance: all fixtures exist and are non-empty; `cli-notes.md` answers all 8 items plus the
direct-mode and picker findings; no
`ANTHROPIC_API_KEY` usage anywhere. **Stop and report; the user reads `cli-notes.md` before Phase 1.**

---

## Phase 1 — Shell and design system

Read: `03-design.md` (all), `02-architecture.md` §Stack, §Processes, §Tiling layout.

1. Scaffold with electron-vite (react-ts). Add Tailwind v4, zustand, zod, vitest, motion, fontsource
   JetBrains Mono, lucide-react. Scripts: `dev`, `build`, `typecheck`, `test`.
2. Main window: 1280×800 min 960×600, frameless with a custom 32px title bar (drag region,
   min/max/close), `backgroundColor` = `--bg-0`, `contextIsolation: true`, `nodeIntegration: false`,
   `webviewTag: true`.
3. `src/shared/ipc.ts` contract helper + one working channel (`app:getVersion`) end to end,
   proving zod validation on the main side.
4. `tokens.css` exactly as specified; Tailwind theme mapped to the variables.
5. All primitives in `src/renderer/ui/` with every state. A hidden route `/kitchen` renders them all.
6. App frame: left rail (6 tabs, tooltips, active indicator), main area with router, status line
   with placeholder segments, command palette (`Ctrl+K`) listing navigation commands.
7. Tiling: the split-tree model with unit tests for every pure function; `PaneFrame` with the
   depth recipe and pane colours; the Workspace route showing four placeholder tiles (each with
   a few lines of text and a coloured block so distortion is visible); FLIP spring animation for
   move, open, close, maximise; drag-to-snap with the drop ghost; divider drag; all `Alt+` keys;
   presets; layout saved and restored.
8. `config.json` store with defaults and a Settings page that edits: role models/effort, CRT
   texture toggle, font size (12–15px).

Acceptance: `npm run dev` opens the window; rail navigation works by mouse and keyboard; kitchen
page shows every primitive; focus rings visible on Tab. Tiling: drag each tile to each edge of
another and to its centre; open, close, maximise; retarget mid-animation by pressing move keys
quickly; record the screen while doing so and step through frames to confirm no jump, no blur
after settle, and that reduced-motion makes it instant. Every raised surface shows the top
highlight and both shadows (zoom in on a screenshot). `typecheck` and `test` pass (config
defaults/merge and the tiling functions).

---

## Phase 2 — Projects

Read: `01-product.md` §Projects tab, `02-architecture.md` persistence section.

1. `projects.json` store (id = uuid, name, path, addedAt, lastOpenedAt). Atomic writes.
2. Open folder (native dialog), remove from list, reveal in Explorer.
3. Stack detection (pure function, unit-tested): reads `package.json` deps (next, vite, expo,
   react-native), `pyproject.toml`/`requirements.txt`, else unknown.
4. Git branch via `git rev-parse --abbrev-ref HEAD` (`execFile`, 2s timeout, tolerate non-repos).
5. Tiles grid per design; empty state; right-click menu; opening a tile sets the active project
   and routes to Workspace (placeholder panes for now). Missing folders show a "missing" badge.

Acceptance: add three folders (one non-git, one Node project, one deleted after adding); all
render correctly; restart keeps them; tests cover stack detection and store read/write.

---

## Phase 3 — Engine and session stream

Read: `02-architecture.md` §Engine (all), `docs/cli-notes.md` (all), `01-product.md` §session stream.

1. `src/main/engine/parse.ts` — `parseLine` per `cli-notes.md`; tests run every fixture and
   snapshot the resulting `EngineEvent[]`.
2. `EngineManager.runTurn({ projectId, role, prompt, sessionId? })` → spawns per the spawn model,
   streams `EngineEvent`s over IPC, persists them to the session `.jsonl`, supports cancel.
3. Role config in `src/shared/roles.ts`; flags built by a pure function
   `buildArgs(role, opts): string[]` with unit tests (one per role; assert no API-key env, assert
   `--bare` never present, assert BUILD has no shell tool unless `allowShell` is set).
4. Renderer: role switcher, stream renderer (text, thinking, tool lines, denied cards, turn
   footer), composer with send/stop, auto-scroll behaviour, new-session button, transcript reload
   from disk when reopening a project.
5. Denied card actions wired to `.forge/permissions.json`. `NEEDS:` line detection and cards
   (Run in terminal is wired in Phase 4; until then the card shows the command with a copy button).
6. Usage ledger append on every `turn-result`; status line shows live role/model/tokens today.

Acceptance (real runs, tiny prompts): SCOUT answers a question about a file; PLAN writes
`.forge/test.md` and is denied writing `./outside.md` (card appears); BUILD edits a file with the
file tools and, asked to install a package, answers with a `NEEDS:` line instead of running anything; Esc
cancels a long turn and no `claude` process remains (`tasklist | findstr claude`); a second
turn resumes the same session; switching roles keeps three separate transcripts.

---

## Phase 4 — Terminal

Read: `02-architecture.md` §PTY terminal.

PtyManager, xterm with fit + webgl addons themed from tokens, multiple terminal tabs, resize,
copy/paste (`Ctrl+Shift+C/V`), localhost-URL detection chip, "Send selection to composer",
`NEEDS:` card → Run in terminal → result message back to BUILD. The terminal replaces its
placeholder tile; it must keep its contents and stay sharp through every tiling animation.

Acceptance: run `npm -v`, a long-running command, and `Ctrl+C` in the terminal; resize reflows;
closing the project kills the shell (check `tasklist`); a printed `http://localhost:5173` shows the chip;
moving and maximising the terminal tile mid-output loses nothing; a `NEEDS: npm install <pkg>` card runs and BUILD gets `ok`.

---

## Phase 5 — Preview and review comments

Read: `01-product.md` §Prototype review, `02-architecture.md` §Preview and picker. Also fetch and read
the user's original skill (command in `02-architecture.md` §Skills, bundled plugin) so the surface matches it.

1. Preview pane with `<webview>`, URL bar, nav buttons, device widths, navigation allow-list.
2. `picker.ts` preload: hover outline, click-to-pick, selector generation (pure function with
   unit tests on jsdom fixtures: id, data-testid, nth-of-type path, uniqueness), shadow-DOM pins.
3. Comment side strip: add/edit/delete pins, threads (note, reply, resolved), persistence to
   `.forge/reviews/*.json`, optional crop.
4. Prototype watcher: new/changed `.forge/prototypes/*.html` opens/reloads and enables Comment mode.
   Shots: capture the preset set, show the Shots strip, collect console errors.
5. **Send review** builds the message in the specified format and sends it to the PLAN session
   (or BUILD when the target is the dev server); **Approve** sends
   `APPROVED <path>. Write .forge/design.md, then .forge/plan.md.`

Acceptance: hand-write a prototype HTML (with a `.proto` bar and `?state=`/`?theme=` presets) into
`.forge/prototypes/`; it opens by itself; all shots appear without the bar; a deliberate script error
is reported; the webview survives tile moves without reloading; add three
pins on different elements; reload keeps pins on the right elements; Send review produces exactly
the documented text; external URLs do not load in Preview; the webview has no Node access
(`typeof require` is `undefined` in its console).

---

## Phase 6 — Handoff pipeline and plan runner

Read: `01-product.md` §core idea, `02-architecture.md` §Role instructions, §Build-step runner, §Skills (bundled plugin), §Git.

1. Write the bundled plugin `resources/forge-skills/`: `forge-plan-format`, and `review-prototype`
   adapted from the user's original exactly as `02-architecture.md` §Skills describes (keep
   `SOURCE.md`). Load the plugin in every session; confirm both appear in the init event. Show the
   user a diff of SOURCE.md against the adapted SKILL.md in STATUS.
2. `plan.md` parser/serialiser (pure, unit-tested with good and malformed input; malformed steps
   are shown as "unparsed" cards, never dropped).
3. Plan pane: step cards, status, dependencies greyed until met, **Run step**.
4. Git module: checkpoint + undo exactly as specified, tested in a temp repo by unit tests.
5. Step runner flow including `NEEDS:` handling, diff summary and Keep/Undo.
   Quiet checks module with reducers and the two-round limit (`02-architecture.md` §Direct mode plumbing).
6. "Map repo" action: SCOUT produces the digest, app writes `.forge/map.md`.
7. Brief editor: composer "Save as brief" writes `.forge/brief.md`.
8. Context gauge + Handoff action (uses `contextPct` if the CLI reports it; otherwise estimates
   from cumulative input+cacheRead of the last turn against the model's window and labels it "est.").

Acceptance: in a scratch Vite project — map repo, write a brief, ask PLAN for a one-screen
feature; PLAN writes a prototype with the Prototype bar and presets and stops; comment on three
elements and send; PLAN edits the page and writes a one-line reply and `resolved` for each;
approve; `design.md` and a parseable `plan.md` appear; Run step 1 with BUILD; introduce a type
error by hand and confirm BUILD receives only the failing lines and fixes it; Undo restores the tree exactly (`git status` clean
relative to the checkpoint, including removal of new files).

---

## Phase 7 — Skills manager

Read: `01-product.md` §Skills tab, `02-architecture.md` §Skills, `cli-notes.md` item 5.

Clone/sync source repo (show progress and errors), index SKILL.md frontmatter, grouping (by a
static name→group map in `resources/skill-groups.json`, unknown → Other), the Haiku skill picker
end to end (index text, call, validation, per-session plugin folder, chips above the composer,
add/remove, Re-pick with cache warning, auto/confirm/manual setting, failure fallback), pinned and
never lists per role, "needs shell" badge, "Add skill from git URL".
If `cli-notes.md` shows user-level skills cannot be hidden, show a clear note in the tab:
"Skills in ~/.claude/skills also load in every session" with the count.

Acceptance: sync succeeds against the real repo; counts match the repo (117 skills on 2026-11-16).
Send these first messages in new sessions and record what the picker chose: "add a spring
animation to the drawer" (expect motion/design skills, no marketing), "write a cold email
sequence" in PLAN (expect marketing skills), "rename this variable" (expect an empty pick).
The init event's skill list equals pinned ∪ picked; the second turn of a session reports cache
reads (the skill folder did not change); a picker timeout falls back to pinned only; the index
text is byte-identical across two calls.

---

## Phase 8 — Library

Read: `01-product.md` §Library tab, `02-architecture.md` §Library.

Registries (verified entries only), cached search, result cards, Add to project via terminal,
Tell BUILD, in-app browser with bookmarks and "Send selection to composer", templates with
verified commands, New from template flow, MCP servers list in Settings wired to `--mcp-config`.

Acceptance: search "button" returns shadcn results; Add runs the real command in a scratch
project and the file appears; a template creates a runnable project and registers it; with no
MCP servers enabled, `--mcp-config` is not passed.

---

## Phase 9 — Dictation and polish

Read: `01-product.md` §Dictation, `02-architecture.md` §Dictation.

Mic capture, hold-to-talk (button and shortcut), worker transcription with download progress,
model setting, permission handling, error fallback text; **Polish** using SCOUT with a fixed
instruction ("Rewrite as a concise brief. Keep every requirement and constraint. Remove filler.
Output only the rewritten text.") and a before/after accept dialog. Polish runs in a throwaway
session (not the visible SCOUT transcript).

Acceptance: a 10-second spoken sentence lands in the composer; second use needs no download;
preview/library webviews cannot get mic access; polish shortens a rambling paragraph and
keeps its concrete requirements (compare by eye, report both texts in STATUS).

---

## Phase 10 — Usage

Read: `01-product.md` §Usage tab, `02-architecture.md` §Usage ledger.

Usage tab (by day/role/project, cache-hit rate, top turns, link to transcript), complete status
line, per-tile 7-day meter, CSV export.

Acceptance: numbers on the tab equal sums computed by hand from `usage.jsonl` for one day;
derived-metric functions have unit tests including empty and single-entry cases.

---

## Phase 11 — Token savers

Read: `01-product.md` §Token savers, `02-architecture.md` §Direct mode plumbing, §Usage ledger.

Build in this order, one commit each: reference board; snippet shelf; budget guard (live token
count from stream events, cancel at the ceiling, show partial work); diff-only review; auto-route
hint (reuses the picker call's `role` field; one Haiku call covers both); reset-aware queue.
Quiet checks already exist from Phase 6; add the on-demand "Run checks" button and per-project
command editor here.

Acceptance: a reference image produces a text entry and is not attached to later turns unless
ticked (check the transcript); a step with a 20k ceiling is cancelled and reported; "Review step"
sends a diff, not files; asking BUILD "where is X defined?" shows the hint and switches nothing;
a queued step starts at its time and can be cancelled; closing the app clears nothing silently
(the queue is listed again on restart, paused).

---

## Phase 12 — Clarity tools

Read: `01-product.md` §Clarity tools and §Prototype review.

Every tool here creates or uses pins in the existing review list. Do not add a second comment
store or a second way of sending feedback. Order, one commit each: point and talk; draw on
preview; variant picker (read the `prototype` skill and its `PICKER.md` first; its variants
become Preview tabs); before/after slider (uses checkpoint screenshots; start capturing them in
the step runner); design-token panel; decision recall; session search; run whole plan with
its pause conditions.

Acceptance: a spoken comment while hovering becomes a pin with the transcript; a drawing becomes
a pin with a crop; both go out through Send review in the same message as typed pins; promoting
a variant writes `design.md`; the slider shows a real before/after for a finished step; a token
edit previews live and Apply triggers exactly one BUILD turn; Run whole plan pauses on a failed
check, a `NEEDS:` card, a denial and a budget stop (test each).

---

## Phase 13 — Design polish and packaging

Read: `03-design.md` §Phase 13 polish procedure.

Run the polish passes in order (one commit each). Then: app icon, electron-builder NSIS config,
`npm run dist`, install the result on this machine and smoke-test Phases 2–12's acceptance lists
on the installed build (native modules, the picker preload path and the Whisper worker are the
usual breakages).

Acceptance: installed app passes the smoke test; STATUS lists every polish change by pass.
