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

One window. A left rail of tabs, a tiled main area, and a status line at the bottom.
Session, Preview, Terminal and Plan are **tiles in a tiling layout**, like a Linux tiling window
manager: they fill the space with small gaps, can be dragged to snap into a new position, and
move with a quick spring animation (details in `03-design.md` §Tiling). The drawing below is the
default arrangement.

```
┌──┬───────────────────────────────────────────────┬─────────────────────────────┐
│▣ │ SESSION  [SCOUT] [PLAN] [BUILD]               │ PREVIEW | TERMINAL | PLAN   │
│◫ │                                               │                             │
│▤ │  streamed conversation, terminal-styled       │  tiles: drag to snap,       │
│❖ │                                               │  maximise, close, reopen    │
│⚙ │                                               │                             │
│  ├───────────────────────────────────────────────┤                             │
│  │ > composer            [mic] [polish] [send]   │                             │
├──┴───────────────────────────────────────────────┴─────────────────────────────┤
│ cadarhouse · main · PLAN opus · ctx 34% · today 412k tok · cache 81% · 5h: 38% │
└────────────────────────────────────────────────────────────────────────────────┘
```

Left rail tabs:

1. **Projects** — grid of tiles. Home screen when no project is open.
2. **Workspace** — the tiled layout above. Default once a project is open.
3. **Library** — UI component sources and project templates.
4. **Skills** — synced skills, grouped; what each session loaded; pinned and never lists per role.
5. **Usage** — token ledger and charts.
6. **Settings**.

### Projects tab

- Tiles in a responsive grid. Each tile: project name, folder path (middle-truncated), detected
  stack badge (Next.js, Vite, Expo, Python, unknown), git branch, last opened (relative),
  tokens used in the last 7 days, and a small state marker (idle / session running / plan has N steps left).
- Actions: **Open folder** (native directory picker), **New from template** (see Library),
  right-click a tile: Open, Reveal in Explorer, Remove from list (never deletes files).
- Opening a tile switches to Workspace with that project as the working directory.

### Workspace: session stream (left)

- Role switcher at the top: SCOUT / PLAN / BUILD. Each keeps its own transcript and session id.
  The active role's accent colour tints the prompt glyph and the status line.
- Stream renders like a terminal log, not chat bubbles:
  - user turns: `> text`
  - assistant text: markdown rendered in mono, streamed as it arrives
  - thinking: one collapsed dim line `· thinking…` (expandable if text is present)
  - tool calls: one line each, e.g. `▸ Read src/app/page.tsx` → `✓ 212 lines` / `✗ denied`; click to expand input/output
  - turn footer: `── 4.2s · in 1.2k · out 640 · cache 18k ──`
- Composer: multi-line, Enter sends, Shift+Enter newline, Esc cancels a running turn.
  Buttons: mic (dictation), polish (SCOUT rewrites the draft tighter; shows a diff to accept), send.
- "New session" button per role (starts fresh; old transcript stays in history).
- A context gauge per session. At 60% it turns amber and offers **Handoff**: the role writes a
  summary to `.forge/handoff-<role>.md` and a fresh session is started that reads it.

### Workspace: the other tiles

- **Preview** — embedded browser for the project's dev server or a prototype file.
  URL bar, back/forward/reload, device widths (375 / 768 / 1280 / fit), and **Comment mode**.
- **Terminal** — a real PowerShell terminal in the project folder (tabs for multiple).
- **Plan** — `plan.md` rendered as step cards with status, and a **Run step** button on each.

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
3. **Send review** (`Ctrl+Enter`) posts the open threads to PLAN as compact text: selector, a
   short text snippet of the element, the note. No images by default, because images cost far
   more tokens; a per-pin "attach crop" toggle exists for when words are not enough.
4. PLAN revises; replies appear under each pin and resolved pins fade.
5. **Approve** locks the design and produces the plan.

`review-prototype` is pinned in every PLAN session.
Comment mode also works on the live dev server during BUILD; there the review goes to the BUILD session.

### Library tab

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

### Skills tab

- Source: the user's private repo `https://github.com/Lymion/skills-collections`, which is a
  Claude Code plugin marketplace (`plugins/haykal-skills/skills/<name>/SKILL.md`, 117 skills on
  `main` as of 2026-11-16, including `taste-skill`, `impeccable`, `oil-ui`, `stageshow`).
  FORGE clones it with the user's own git credentials into app data and can **Sync** (git pull).
- Skills listed in groups (Design & Motion, Marketing, Context engineering, Remotion, Writing, Other)
  with name and description parsed from SKILL.md frontmatter.
- **Haiku picks the skills for each chat.** Loading all 117 into every session spends context on
  descriptions that chat never uses. Instead, when a session's first message is sent, a small
  Haiku call reads that message plus the skill index and returns the few skills that fit
  (at most 6). Only those are loaded for that session.
  - The picked skills show as chips above the composer (`skills: emil-design-eng · animate · +`).
    The user can remove one or add one by name before or after sending.
  - The choice is fixed for the life of the session, because changing the skill list mid-session
    throws away the prompt cache. **Re-pick** is a button; it warns that it starts a cache reset.
  - Each role has **pinned** skills that always load regardless of the pick, and a **never** list.
    Defaults are in `02-architecture.md`.
  - A Settings switch chooses: `auto` (pick silently), `confirm` (show the pick, wait for Enter),
    or `manual` (no Haiku call; pinned skills only).
- Extra sources: "Add skill from git URL".

### Usage tab and status line

- Every turn's token counts are stored. Usage tab: totals by day, by role, by project; cache-hit
  rate; the 10 most expensive turns with a link to the transcript.
- Status line: project · branch · role + model · context % · tokens today · cache-hit % ·
  rolling 5-hour total. If the CLI reports rate-limit information it is shown; otherwise the
  5-hour figure is labelled as an estimate.

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
  code?"), a Haiku check suggests the right role in a one-line hint. It never switches by itself.
  It shares the single Haiku call with the skill picker when both apply.
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
- **Run whole plan** — runs steps in dependency order; pauses on any denial, failed quiet check,
  `NEEDS:` request, or budget stop.
- **Session search** — full-text search across transcripts.

## Out of scope for v1

Multi-user, cloud sync, macOS/Linux packaging, a built-in code editor, mobile device emulation
beyond viewport width.
