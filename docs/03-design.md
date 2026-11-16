# 03 — Design system: "phosphor"

A stylised terminal: dense, monospaced, dark, with one glowing accent per role. It should feel
like a well-made instrument, not a retro costume. Effects are used with restraint; readability
always wins.

These values are fixed for Phases 1–12. Phase 13 is the only place they may be refined, using
the design skills listed at the end.

## Tokens (`src/renderer/styles/tokens.css`, exposed to Tailwind v4 via `@theme`)

```css
:root {
  /* surfaces */
  --bg-0: #080A09;        /* window */
  --bg-1: #0D100F;        /* panes */
  --bg-2: #131716;        /* raised: cards, inputs */
  --bg-3: #1A201E;        /* hover / selected */
  --line: #222A27;        /* 1px borders */
  --line-strong: #33403B;

  /* text */
  --fg-0: #E4ECE7;        /* primary */
  --fg-1: #A9B6AF;        /* secondary */
  --fg-2: #6F7D76;        /* dim: timestamps, hints */
  --fg-3: #47524D;        /* disabled, rules */

  /* role accents */
  --scout: #5CCFE6;       /* haiku  — cyan */
  --plan:  #FFB454;       /* opus   — amber */
  --build: #7EE6A1;       /* sonnet — phosphor green */

  /* status */
  --ok: #7EE6A1;  --warn: #FFB454;  --err: #FF6B6B;  --info: #5CCFE6;

  --accent: var(--build); /* set on <body data-role="scout|plan|build"> */

  /* type */
  --font-mono: "JetBrains Mono", ui-monospace, "Cascadia Code", Consolas, monospace;
  --text-xs: 11px; --text-sm: 12px; --text-md: 13px; --text-lg: 15px; --text-xl: 20px;
  --leading: 1.55;

  /* shape & space (4px grid) */
  --radius: 2px;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;

  /* motion */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --dur-fast: 120ms; --dur: 180ms; --dur-slow: 260ms;

  /* pane identity colours (title tint, focus line, glyphs) */
  --c-session:  var(--accent);   /* follows the active role */
  --c-preview:  #B79CFF;         /* violet */
  --c-terminal: #7EE6A1;         /* green */
  --c-plan:     #FFB454;         /* amber */
  --c-library:  #6FB1FF;         /* blue */
  --c-comment:  #FF7AB6;         /* pink: review pins and drawings */

  /* depth: every raised surface = top highlight + hard shadow + soft shadow */
  --hi:          inset 0 1px 0 rgba(255, 255, 255, 0.08);   /* 1px light on the top edge */
  --shadow-hard: 0 1px 0 rgba(0, 0, 0, 0.9), 0 2px 3px rgba(0, 0, 0, 0.55);  /* tight, crisp */
  --shadow-soft: 0 14px 34px -10px rgba(0, 0, 0, 0.7);      /* wide, diffuse */
  --elev-1: var(--hi), var(--shadow-hard);                       /* buttons, chips, inputs */
  --elev-2: var(--hi), var(--shadow-hard), var(--shadow-soft);   /* tiles/panes, cards */
  --elev-3: var(--hi), var(--shadow-hard), 0 28px 60px -12px rgba(0, 0, 0, 0.8); /* dragged pane, dialogs, menus */
  --surface: linear-gradient(180deg, var(--bg-2) 0%, var(--bg-1) 100%); /* raised surfaces are lit from above */
  --well: inset 0 1px 2px rgba(0, 0, 0, 0.6);                    /* sunken: inputs, the stream area */

  /* effects */
  --glow: 0 0 12px color-mix(in srgb, var(--accent) 45%, transparent);

  /* tiling */
  --gap: 8px;
  --radius-pane: 6px;
}
body[data-role="scout"] { --accent: var(--scout); }
body[data-role="plan"]  { --accent: var(--plan); }
body[data-role="build"] { --accent: var(--build); }
```

Check contrast: `--fg-0` and `--fg-1` on `--bg-1` must meet WCAG AA (4.5:1). `--fg-2` is for
non-essential text only.

## Typography

- One family: JetBrains Mono, weights 400 / 500 / 700, bundled locally. Ligatures off
  (`font-variant-ligatures: none`) in the stream and terminal; on is fine in headings.
- Body 13px, tabular numbers everywhere (`font-variant-numeric: tabular-nums`).
- Labels: 11px, uppercase, letter-spacing 0.08em, `--fg-2`.
- Headings are size and weight changes only; no second typeface.

## Motifs

- **Depth, not flatness.** The window background (`--bg-0`) is the floor. Everything on it is a
  physical slab lit from above:
  - a 1px highlight on the top inner edge (`--hi`),
  - a hard, tight shadow directly beneath (`--shadow-hard`),
  - a soft, wide shadow under that (`--shadow-soft`),
  - a faint top-to-bottom surface gradient (`--surface`).
  Use the `--elev-*` tokens; never write one-off shadows. Panes and project tiles use `--elev-2`;
  buttons, chips and inputs `--elev-1`; dialogs, menus and a pane being dragged `--elev-3`.
  Pressed buttons lose the hard shadow and move down 1px. Inputs and the stream area are sunken (`--well`).
  Controls keep the 2px radius; panes use `--radius-pane`.
- **Colour, in measured doses.** The base stays near-black and grey. Colour comes from the role
  accents and the pane identity colours, and it is allowed only on: the pane title label and a
  6%-tinted title bar, the 1px focus line along the top of the focused pane (replaces the white
  highlight with the pane's colour at 70%), status glyphs, chips, meters, pins, links and syntax
  highlighting. Never on large backgrounds or body text. Rule of thumb: on any screen, coloured
  pixels stay under about a tenth of the area, and no more than three hues sit next to each other.
  Unfocused panes show their colour at 50% saturation.
- **Pane title bars** are 28px, part of the slab: `◧ PREVIEW  localhost:5173` with the label in
  the pane's colour, controls at the right (maximise, close). The bar is the drag handle.
- **Prompt glyph** `>` in `--accent` before user turns and in the composer. Block caret, blinking
  at 1.1s, steady while typing; no blink under reduced motion.
- **Glow** (`--glow` as `text-shadow`/`box-shadow`) only on: the active role chip, the prompt
  glyph while a turn is running, and focus rings. Never on body text.
- **Scanlines**: a fixed overlay, `repeating-linear-gradient` 1px every 3px at 2.5% opacity,
  `pointer-events: none`. Off by default under `prefers-reduced-motion` or reduced transparency;
  toggle in Settings ("CRT texture").
- **Status glyphs** (text, not icon fonts): `▸` running, `✓` ok, `✗` failed/denied, `·` idle,
  `◆` pinned comment. Icons elsewhere: `lucide-react` at 14px, stroke 1.5, only where a glyph
  will not do (mic, settings, folder).
- **Role chips**: `[ SCOUT ]`, `[ PLAN ]`, `[ BUILD ]` — bracketed text; active one is filled with
  `--accent` at 14% and has the accent text colour.

## Components (`src/renderer/ui/`)

Build these primitives once and use them everywhere: `Pane` (titled border box), `Button`
(variants: solid-accent, outline, ghost; sizes sm/md), `Chip`, `Input`, `Textarea`, `Tabs`,
`Tooltip`, `Menu` (context/right-click), `Dialog`, `Toast`, `Kbd`, `Meter` (thin bar with
segments, used for context % and usage), `PaneFrame` (the tile slab: title bar, focus line, elevation; see §Tiling), `Tile`, `EmptyState`, `Spinner` (a 4-frame braille cycle `⠋⠙⠸⠴`, not a circle).

States every interactive element must have: default, hover (`--bg-3`), active (scale 0.98),
focus-visible (1px `--accent` outline + glow, offset 1px), disabled (`--fg-3`, no pointer).

## Screen notes

- **Project tiles**: 260px min width, 148px tall, `--bg-2`, 1px `--line`. Top row: name (15px,
  500) and stack badge. Middle: path in `--fg-2`, middle-truncated. Bottom row: branch, last
  opened, 7-day tokens as a tiny `Meter`. Hover: border becomes `--line-strong`, name gets
  `--accent`. The "new project" tile is dashed-bordered with a `+`.
- **Session stream**: max line width 100ch, 16px side padding, tool lines indented 2ch, turn
  footer as a full-width dim rule with stats. Auto-scroll sticks to bottom unless the user has
  scrolled up; then show a `↓ new output` pill.
- **Composer**: grows from 1 to 10 lines; border becomes `--accent` on focus; while a turn runs
  the send button becomes `stop`.
- **Status line**: 24px tall, `--bg-0`, segments separated by `·`, each segment clickable
  (branch → git menu, role → role settings, tokens → Usage tab).
- **Plan cards**: one per step, status glyph at left, files as dim chips, `Run step` on the right.
- **Comment pins**: 20px amber `◆` with the number; selected pin's element gets a 1px amber outline.

## Tiling: panes that snap into place

The feel to hit is a Linux tiling window manager (Hyprland-style): windows glide to their slot
fast, settle with a hint of overshoot, and never feel floaty. Mechanics are in
`02-architecture.md` §Tiling layout; these are the numbers.

| Moment | Animation |
|---|---|
| Pane moves or resizes because the layout changed | FLIP spring on the frame: `stiffness 520, damping 38, mass 1` (settles in about 220ms, ~2% overshoot). All affected panes move together. |
| Pane opens | Scale 0.92 → 1 and opacity 0 → 1 from the pane's centre, same spring; neighbours slide to make room at the same time. |
| Pane closes | Scale 1 → 0.94, opacity → 0 in 120ms ease-out; neighbours spring into the freed space. |
| Maximise / restore | Same FLIP spring from the tile rect to the full area and back. |
| Pick up (drag start) | Pane lifts: scale 1.02, shadow `--elev-2` → `--elev-3`, opacity 0.92, 120ms. It follows the pointer directly (no spring lag). |
| Drop-zone ghost | A rounded rect in the pane's colour at 14% with a 1px border at 60%. It springs between zones (`stiffness 700, damping 40`) as the pointer moves. |
| Drop | The pane springs from the pointer position into its slot; shadow returns to `--elev-2`. |
| Divider drag | No animation; tiles track the pointer 1:1. Double-click a divider → ratio springs to 0.5. |
| Focus change | The top focus line cross-fades in 120ms. No movement. |

- Springs come from `motion` (`type: 'spring'`). Do not approximate them with CSS easing.
- Animate `transform` and `opacity` only. Never animate `width`/`height`/`left`/`top`.
- A new layout change during an animation retargets from the current visual position (no jump, no queue).
- Under `prefers-reduced-motion`, layout changes are instant and open/close is a 100ms fade.
- Check on this machine at 60Hz with a live webview and a busy terminal: no dropped frames,
  no blurry text after settle (round final rects to whole pixels; clear the transform at rest).

Keys: `Alt+H/J/K/L` focus left/down/up/right · `Alt+Shift+H/J/K/L` move the focused pane ·
`Alt+F` maximise/restore · `Alt+W` close pane · `Alt+Enter` open a terminal tile ·
`Alt+1/2/3` layout presets plan/build/review.

## Motion rules

- Animate only `transform` and `opacity`. Entrances use `--ease-out`; never `ease-in`.
- UI feedback ≤ 180ms. Dialogs ≤ 260ms. Pane layout changes follow §Tiling.
- No animation on things done many times a minute from the keyboard: rail tab switches, role
  switches, sending a message, stream text arriving.
- Named animations allowed: everything in §Tiling, project-tile hover lift (translateY −2px with
  the soft shadow deepening), button press (translateY 1px), dialog fade + scale from 0.97,
  toast slide from bottom-right, pin drop (scale 0.6 → 1), meter fill, caret blink.
- `prefers-reduced-motion: reduce` → durations 0 except opacity fades ≤ 120ms.

## Keyboard

`Ctrl+K` command palette · `Ctrl+1/2/3` SCOUT/PLAN/BUILD · `Ctrl+Shift+P/T/L` open or focus the
Preview/Terminal/Plan tile · `Ctrl+N` new session · `Ctrl+O` open project · `Esc` cancel turn ·
`Ctrl+Shift+Space` (hold) dictate · `Ctrl+Shift+C` toggle Comment mode · `Ctrl+Enter` send review.
All shortcuts are listed in the command palette.

## Phase 13 polish procedure (design skills)

Run each as its own fresh session so the skills' text does not pile up in one context.
Apply findings, commit, then start the next:

1. `ui-ux-pro-max` — audit accessibility, hierarchy, spacing against this document.
2. `emil-design-eng`, then `review-animations` — motion and interaction details, the tiling
   springs in particular.
3. `apple-design` — feedback, spatial consistency, depth and materials, restraint.
4. `ui-elevate` — one pass each: unslop, hierarchy, delight.
5. `taste-skill` (skill name `design-taste-frontend`) — use it for its judgement on generic,
   templated-looking UI only. It is written for marketing websites: ignore its website-specific
   house rules (one section per screen, photographs, hero entrances) and do not run its gate
   script against this app.
6. `break-ui` — worst-case data on tiles, stream, plan cards (long names, zero items, huge counts).

Any token change made in Phase 13 must be made in `tokens.css` only, never as one-off values.
The depth recipe (top highlight + hard shadow + soft shadow) and the colour limits above are
user requirements; polish may tune their values but must not remove them.
