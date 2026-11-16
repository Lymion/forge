# 01 — Product

## What FORGE is

A personal desktop app (Windows 11, single user) that wraps the `claude` CLI the user is already
logged into with their Claude subscription. It exists to do two things:

1. **Spend fewer tokens** for the same result.
2. **Make intent clear** between the user and Claude, especially for UI work.

"FORGE" is a working name. It appears in one constant (`APP_NAME` in `src/shared/app.ts`) and
the per-project folder name (`.forge/`), so it can be renamed later.

## The core idea: three roles, three sessions, files in between

| Role  | Model alias | Job | Can it change code? |
|-------|-------------|-----|---------------------|
| SCOUT | `haiku`  | Search the repo, browse the web, read docs, summarise, polish dictated prompts | No (read-only tools) |
| PLAN  | `opus`   | Turn the brief into a plan and UI prototypes; discuss design with the user | Only inside `.forge/` |
| BUILD | `sonnet` | Implement one plan step at a time | Yes, by editing files directly; it has no shell (see "Direct mode") |

Each role is its **own `claude` session**. Roles never share a conversation. They hand off through
small files in the project's `.forge/` folder. This is the main token saver:

- Prompt caches are per model, so switching model inside one conversation throws the cache away.
  Separate sessions keep each cache warm.
- The expensive model (Opus) never reads raw search results; it reads the scout's digest.
- The builder never carries the planning debate; it starts fresh and reads one plan step.

### `.forge/` handoff files (inside each project)

| File | Written by | Read by | Content |
|------|-----------|---------|---------|
| `brief.md` | user (via composer, optionally polished by SCOUT) | PLAN | The goal, in plain words |
| `map.md` | SCOUT | PLAN, BUILD | Repo digest: stack, entry points, folder purposes, key files. Max ~150 lines |
| `design.md` | PLAN (after review) | BUILD | Locked UI decisions: tokens, fonts, spacing, component choices |
| `decisions.md` | PLAN | PLAN, BUILD | Append-only log: date, decision, reason (one line each) |
| `plan.md` | PLAN | BUILD, app UI | Numbered steps in the exact format below |
| `prototypes/*.html` | PLAN | Preview pane | Single-file HTML prototypes, no build step |
| `reviews/<name>.json` | app | PLAN | The user's pinned comments on a prototype |
| `progress.md` | BUILD | user, PLAN | Per step: what changed, how it was verified, what is left |

`plan.md` step format (the app parses this; PLAN's system prompt enforces it):

```
## S3: Pricing card component
- status: todo            <!-- todo | doing | done | blocked -->
- files: src/components/PricingCard.tsx, src/app/pricing/page.tsx
- depends: S1
- accept: Card renders three tiers from props; keyboard focus ring visible; `npm run typecheck` passes
- notes: Use tokens from .forge/design.md. No new dependencies.
```

### Direct mode (BUILD has no shell)

BUILD's tools are file tools only: read, search, edit, write. It does not get Bash or PowerShell.
What actually costs tokens with a shell is the output Claude has to read back (install logs, test
runs, directory listings) and the extra turns spent running things. So the app does that work:

- **The app runs the checks.** After each build step it runs the project's typecheck, lint and
  test commands itself and sends BUILD only the failing lines (see "Quiet checks").
- **BUILD asks, the app runs.** If BUILD needs a command run (install a package, generate a
  file), it ends its reply with a line `NEEDS: <command>`. The app shows a card with **Run in
  terminal**; the user clicks, the command runs in the visible terminal, and BUILD is told only
  `done` or the last 20 lines on failure.
- A per-project switch "Allow shell for BUILD" exists for the rare project that needs it. Off by default.

## Screens

**Keep it calm.** The first version of the prototype was rejected as too crowded. The rules:

- One top bar, the tiles, one status line. No side rail, no second toolbar.
- A project opens with **two tiles: Chat and Preview**. Plan and Terminal are closed until the
  user opens them from the tile switch in the top bar (`chat · preview · plan · terminal`), or
  the app opens one because something there needs attention (a command to approve, a failed check).
- Plain words in the UI: "chat", "new", "Start build", "fixing…", "5h limit 1% used". No
  internal ids, selectors, token breakdowns or keyboard hints on the main surface; those live in
  tooltips, the command palette (`Ctrl+K`) and the Usage screen.
- One accent-coloured primary button per tile at most.
- Tool activity in the chat is one dim summary line per turn ("haiku looked through 3 files"),
  expandable; never a list by default.
- Thin, quiet scrollbars styled from the tokens (see `03-design.md`).

The approved reference is the prototype at `scratch/forge-workspace.html`
(published: https://claude.ai/artifact/G6q77kYNwUzatFQe3MVVCz). Where this document and the
prototype disagree on layout or wording, the prototype wins.

```
 FORGE  chapterwise ▾                              [ chat | preview | plan | terminal ]
┌───────────────────────────────┐ ┌──────────────────────────────────────────────────┐
│ CHAT  planning with opus  new │ │ PREVIEW  library prototype                    ▢ × │
│                               │ │ .forge/prototypes/library.html      [◆ comment]  │
│ > redo the library screen…    │ │ ┌──────────────────────────────┐ comments        │
│ haiku looked through 3 files  │ │ │  the page being reviewed     │ ◆ 1 summary     │
│ A card per book with…         │ │ │                              │ make it bold    │
│                               │ │ └──────────────────────────────┘ opus: done      │
│ > Tell opus what to build…    │ │                                                  │
│ [scout|plan|build] skills ▾   │ │                                                  │
│                    mic  send  │ │                                                  │
└───────────────────────────────┘ └──────────────────────────────────────────────────┘
 plan · opus · 5h limit 1% used · week 23% used
```

Navigation:

- **Project button** (top left, shows the project name): opens the Projects screen.
- **Tile switch** (top right): shows or hides each tile. Tiles are a tiling layout: drag a title
  bar to snap, maximise, close (`03-design.md` §Tiling).
- **Command palette** (`Ctrl+K`): everything else — Library, Skills, Usage, Settings, layout
  presets, decision recall. These are full screens reached from the palette or the project
  button's menu, not permanent chrome.

### Start build: Opus's plan goes to Sonnet by itself

Once the user tells Opus to start (approves the prototype, or says "go"), the chain runs without
the user relaying anything:

1. **Opus → Haiku, directly.** Opus calls the `scout` subagent (Haiku) whenever it needs
   something found or read. This happens inside Opus's turn.
2. **Opus → Sonnet, through the plan.** Opus writes its instructions as steps in `plan.md`.
   The Plan tile shows one button, **Start build**. The app then gives each step to Sonnet in
   order, a fresh Sonnet session per step, runs the checks after each, and moves on.
   It stops and opens the relevant tile only when something needs the user: a command Sonnet
   wants run, a denied action, checks still failing after two fix attempts, or the step's token ceiling.
3. A setting "Start building as soon as the plan is approved" (off by default) removes even
   that one click.

Opus does not supervise Sonnet turn by turn. That would keep Opus's expensive context open for
the whole build; the app does the hand-off for free. If a step fails twice, the app offers
"Ask Opus" which sends Opus the step and the failure (as a diff and error lines) to revise the plan.

### Projects screen

- Tiles in a responsive grid. Each tile shows three things: project name, folder path
  (middle-truncated), and one line with last opened and tokens used this week. Stack, branch and
  state are in the tile's tooltip. A dashed "+ new project" tile comes last.
- Actions: **Open folder** (native directory picker), **New from template** (see Library),
  right-click a tile: Open, Reveal in Explorer, Remove from list (never deletes files).
- Opening a tile switches to Workspace with that project as the working directory.

### Chat tile

- Title bar: `CHAT`, a plain status ("planning with opus"), a `new` button (fresh chat; the old
  one stays in history) and maximise. Chat cannot be closed.
- The stream sits directly on the tile, not in a bordered box:
  - user turns: `> text`
  - assistant text: markdown in mono, streamed as it arrives
  - while working: one line with the spinner and what it is doing
  - tool activity: **one dim summary line per turn** ("haiku looked through 3 files · opus read
    the project map"). Clicking it expands the individual calls with input and output.
  - no per-turn statistics line. Time and token counts for a turn are in the expanded view and on the Usage screen.
- Composer, one raised box with two rows:
  - row 1: `>` and the text area (Enter sends, Shift+Enter newline, Esc cancels a running turn;
    the placeholder names who is listening: "Tell opus what to build…")
  - row 2: the role switch as one segmented control `scout | plan | build` (each keeps its own
    transcript; the active role's colour tints the prompt glyph and status line), then
    `skills: <template> ▾`, then at the right `mic` and the solid `send` button (becomes `stop` while a turn runs).
  - **Polish** is not a permanent button. It is offered as a small "tidy this up?" link under the
    text area only after dictation or when the draft is longer than about 60 words.
- When the chat's context passes 60%, a single line appears above the composer:
  "This chat is getting long. Start fresh with a summary?" It runs the handoff
  (`.forge/handoff-<role>.md`, new chat reads it). No permanent context gauge.
- Things that need a decision appear as cards in the stream (a denied action, a sign-in problem),
  each with at most two buttons.

### The other tiles

- **Preview** — the project's running app or a prototype. A path/URL field and one `◆ comment`
  toggle. Reload, back/forward and device widths (375 / 768 / 1280 / fit) are in the tile's
  title-bar menu, not on the bar. The comments strip sits at the right and disappears when the
  tile is narrow (pins stay visible).
- **Plan** — the steps as a plain list (status glyph, step name, who built it and tokens used),
  with one **Start build** button under it. A single step can be run or re-run from its row's menu.
- **Terminal** — a real PowerShell terminal in the project folder (tabs for multiple). Requests
  from Sonnet to run a command appear here as a card: "Sonnet needs `npm install date-fns`" with **Run it** / **Skip**.

### Prototype review (the user's `review-prototype` skill, built in, automatic during planning)

The user has already built and used this workflow as a skill. Source of truth:
`https://github.com/Lymion/workflow-hub`, branch `claude/dazzling-rubin-tjxri3`,
file `.claude/skills/review-prototype/SKILL.md` (private; fetch with `gh` in Phase 6).

That skill was written for one project and for the Claude desktop app. It depends on tools that
do not exist in a headless `claude` session (publishing an Artifact, reading Artifact comments,
sending files to the user) and on that project's look. FORGE keeps the skill's process and
replaces only those parts with app features:

| The skill's step | In FORGE |
|---|---|
| 1. Plan in 3–6 lines, no discovery questions | Unchanged. PLAN does this in chat. |
| 2. Build one self-contained page in `scratch/<screen>.html`, in the hub's look | PLAN writes `.forge/prototypes/<screen>.html` as a complete HTML document, in **this project's** look: tokens from `.forge/design.md` if it exists, else from the project's stylesheet. Kept from the skill: real data (never lorem ipsum), everything clickable works, the fixed bottom-right "Prototype" bar with Full / Empty / Loading / Error and a light/dark toggle, query-string presets (`?state=empty&theme=dark…`), works at ~390px, drawings as plain SVG with geometry in plain functions. |
| 3. Screenshot with Playwright and send the shots | **The app takes the shots, with no model involvement.** It loads the page with the presets and captures: main state at 1440×900, dark mode, phone width (390), plus each state. The Prototype bar is hidden in shots. They appear as a "Shots" strip in Preview and are saved in `.forge/prototypes/shots/`. Console errors from the page are collected and, if any, sent to PLAN as text to fix first. |
| 4. Publish as an Artifact for comments | **The Preview tile is the comment surface.** The prototype opens there automatically with Comment mode on. |
| 5. Read comments, smallest edit each, reply in each thread in one line, resolve, republish, re-shoot what changed | Comments are threads stored in `.forge/reviews/<screen>.json`. **Send review** gives PLAN the open threads as text. PLAN makes the smallest edit for each, writes its one-line reply and `resolved: true` into the same file, and keeps chat replies to 1–2 lines. The preview reloads and the app re-shoots automatically. Ambiguous comment → PLAN makes the reasonable call and says so in the reply. |
| 6. On approval, build the real thing from the prototype | **Approve** → PLAN writes `design.md` and `plan.md`; BUILD implements it step by step, reusing the prototype's geometry functions and tokens, every state included. The prototype file stays as the approved design reference. The skill's project-specific release steps (its test commands, version bump, changelog) are not carried over; a project can add its own in its `CLAUDE.md`. |

How it looks to the user:

1. While planning anything with a UI, PLAN writes the prototype and ends its turn with one line
   saying it is ready. The Preview tile opens it; the Shots strip fills in.
2. The user clicks any element: a numbered pin drops and a small input takes the note. Pins are
   listed in a side strip with their thread (note, PLAN's reply, resolved or open). Comments can
   be added while PLAN is busy; they queue.
3. **Comments are live.** Saving a pin sends it to PLAN straight away as compact text (selector,
   a short text snippet of the element, the note). If PLAN is mid-turn the comment waits and goes
   out the moment that turn ends. The user keeps commenting while PLAN works; the page updates
   in front of them and each pin shows its state (queued, working, replied, resolved). A
   **Live / Batch** switch restores send-all-at-once (`Ctrl+Enter`) for people who prefer it. No images by default, because images cost far
   more tokens; a per-pin "attach crop" toggle exists for when words are not enough.
4. PLAN revises; replies appear under each pin and resolved pins fade.
5. **Approve** locks the design and produces the plan.

`review-prototype` is pinned in every PLAN session.
Comment mode also works on the live dev server during BUILD; there the review goes to the BUILD session.

### Library screen

Two sections, both designed so code arrives **without the model writing it**:

- **Components** — search across shadcn-compatible registries (shadcn/ui, plus others listed in
  `resources/registries.json`). Each result: name, source, description, dependencies, "Open docs"
  (opens in an in-app browser tab), **Add to project** (runs the registry CLI in the project
  terminal; zero model tokens), and **Tell BUILD** (inserts a one-line reference into the composer).
  Also an in-app browser bookmark bar for design sites that have no registry; from any page the
  user can select code and press **Send selection to composer**.
- **Templates** — starters created with their official scaffolding command (e.g. Vite React TS,
  Next.js, Expo). "New from template" asks for a name and parent folder, runs the command in a
  terminal, then registers the project.

### Skills screen

- Source: the user's private repo `https://github.com/Lymion/skills-collections`, which is a
  Claude Code plugin marketplace (`plugins/haykal-skills/skills/<name>/SKILL.md`, 117 skills on
  `main` as of 2026-11-16, including `taste-skill`, `impeccable`, `oil-ui`, `stageshow`).
  FORGE clones it with the user's own git credentials into app data and can **Sync** (git pull).
- Skills listed in groups (Design & Motion, Marketing, Context engineering, Remotion, Writing, Other)
  with name and description parsed from SKILL.md frontmatter.
- **The user chooses the skills.** Nothing is picked automatically.
  - The composer has one control: `skills: UI design ▾`. It opens a small panel with
    **templates** at the top and the full skill list (searchable, tick boxes) below.
  - A **template** is a named group of skills applied with one click. Shipped templates:
    *UI design* (`review-prototype`, `prototype`, `ui-ux-pro-max`, `taste-skill`, `impeccable`),
    *Motion* (`emil-design-eng`, `animate`, `apple-design`, `review-animations`),
    *Polish* (`ui-elevate`, `impeccable`, `emil-design-eng`, `stop-slop`),
    *Marketing* (`copywriting`, `ad-creative`, `cro`, `stop-slop`), *None*.
  - **Save as template** stores the current ticks under a name the user types. Templates can be
    renamed, edited and deleted in the Skills screen, and each role can have a default template.
  - The button shows the template's name when the ticks match one, otherwise "N chosen". The
    panel's footer shows "5 of 117 skills loaded".
  - Skills are fixed for the life of a chat (changing them mid-chat throws away the prompt
    cache). Changing the selection in a chat that has already started asks: "Apply to a new chat"
    (default) or "Apply here (resets the cache)".
- Extra sources: "Add skill from git URL".

### Usage screen and status line

- Every turn's token counts are stored. Usage screen: totals by day, by role, by project;
  cache-hit rate; the 10 most expensive turns with a link to the transcript.
- Status line, three items only: `plan · opus` (active role and model), `5h limit 1% used`,
  `week 23% used`. The two limits are real figures reported by the CLI after every turn; hovering
  shows the reset time. Clicking any item opens the Usage screen. Project name is in the top bar;
  branch, context and cache figures are on the Usage screen.

### Dictation

- Hold the mic button or hold `Ctrl+Shift+Space` to talk; release to transcribe. Text lands in the
  composer and is never auto-sent.
- Transcription runs locally (Whisper in a worker). No tokens, no cloud, works offline after the
  first model download.
- **Polish** (optional, one click): SCOUT turns the rambling transcript into a tight brief.
  The user sees before/after and chooses.

## Token savers (Phase 11)

- **Quiet checks** — the app runs typecheck, lint and tests (commands detected from
  `package.json` scripts, editable per project) after every build step and on demand. Passing
  output is never sent. On failure BUILD receives at most 40 lines: file, line, message.
- **Reference board** — drop inspiration images into a project once. SCOUT writes a short text
  description of each into `.forge/references.md` (layout, colours, type, what is notable). Later
  sessions read the text; the image is only attached again when the user ticks it.
- **Snippet shelf** — named reusable prompts and code blocks, inserted in the composer with `/name`.
- **Budget guard** — a token ceiling per build step (default 150k total). The meter on the step
  card fills as the turn runs; at 100% the app cancels the turn and shows what was done so far.
- **Reset-aware queue** — queue build steps to start at a chosen time or when the rolling
  5-hour total drops below a threshold. The queue is visible and cancellable; it never runs
  while the app is closed.
- **Auto-route** — when the user types in the wrong role (e.g. asks BUILD "where is the auth
  code?"), a small Haiku check suggests the right role in a one-line hint. It never switches by
  itself. Off by default.
- **Diff-only review** — "Review step" sends PLAN the `git diff` since the step's checkpoint
  (truncated to 400 lines with a per-file summary beyond that), not the files.

## Clarity tools (Phase 12)

All of these feed the `review-prototype` flow; none of them is a second, separate review system.
A comment made with any of them becomes a pin in the same review list and is sent the same way.

- **Variant picker** — runs the `prototype` skill; its variants appear as tabs in Preview.
  **Promote** records the winner in `design.md`.
- **Draw on preview** — freehand arrows and boxes over the page. A drawing becomes a pin with a
  cropped image attached.
- **Point and talk** — hold the dictation key while hovering an element: the element is pinned
  and the transcript becomes the pin's note.
- **Before/after** — a screenshot of Preview is taken at each checkpoint; each finished step
  shows a slider comparing before and after.
- **Design-token panel** — the colours, spacing and radius in `design.md` as editable controls
  with live preview (CSS variables injected into the page). **Apply** saves `design.md` and asks
  BUILD once to carry the values into the code.
- **Decision recall** — search `decisions.md` from the command palette.
- **Session search** — full-text search across transcripts.

## Out of scope for v1

Multi-user, cloud sync, macOS/Linux packaging, a built-in code editor, mobile device emulation
beyond viewport width.
