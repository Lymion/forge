# Start here (for you, not for Sonnet)

## What is in this folder

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules Sonnet reads automatically every session. Kept short on purpose. |
| `docs/01-product.md` | What the app does, screen by screen |
| `docs/02-architecture.md` | How it is built; what is verified about the `claude` CLI and what is not |
| `docs/03-design.md` | The terminal look: tokens, components, motion, keyboard |
| `docs/04-phases.md` | 14 phases (0–13), each with acceptance checks |
| `docs/05-backlog.md` | Empty; a parking place for new ideas |
| `docs/06-desktop-app.md` | Installer wizard, Start menu, native behaviour, updates |
| `docs/cli-notes.md` | What was verified about the `claude` CLI on this machine |
| `scratch/forge-workspace.html` | The approved look; Sonnet must match it |

## How to run the build

1. Put this folder where the app should live (e.g. `C:\Forge`) and open it in Claude Code with Sonnet.
2. For every phase, start a **new session** and paste:

   ```
   Follow CLAUDE.md. Do the next phase only, then stop and report.
   ```

3. After Phase 0, read `docs/cli-notes.md` yourself. It records how the `claude` CLI really
   behaves on your machine. If something there contradicts the spec in a way that changes a
   feature, decide before Phase 1. Three things are already verified there: your global skills
   can be hidden per chat, Opus can be limited to writing inside `.forge/`, and real usage-limit
   figures are available.
4. After each phase, try the acceptance items yourself before starting the next session.

One fresh session per phase is itself a token saver: Sonnet reads the rules, one phase, and the
status file, instead of carrying the whole build in context.

## Decisions made for you (change them in the docs before Phase 1 if you disagree)

- Working name FORGE; per-project folder `.forge/`.
- Electron + React + TypeScript, Windows only.
- Roles: SCOUT = haiku, PLAN = opus, BUILD = sonnet, as separate sessions that hand off through files.
- BUILD has no shell. It edits files directly; the app runs checks and sends back only failures;
  anything else BUILD needs run becomes a card you click.
- You choose the skills for each chat yourself. Templates load a group in one click (UI design,
  Motion, Polish, Marketing, None, plus your own).
- Start build: once Opus has written the plan, one click hands every step to Sonnet in order.
  Opus calls Haiku by itself whenever it needs something looked up.
- The look is the prototype in `scratch/forge-workspace.html`: two tiles by default, no side rail.
- Your `review-prototype` skill is bundled in an adapted form: same process, but the Preview tile
  replaces the Artifact link and the app takes the screenshots.
- Nothing ever waits on a permission prompt; anything not pre-allowed is denied and shown with an "allow" button.
- Dictation is local Whisper (no tokens, no cloud).
- No MCP server is enabled by default.
- It is a real installed app: a setup wizard, a Start menu entry, an uninstaller. The installer
  exists from Phase 1 so you can install and try each phase.
- Updating after you change something: run `npm run release`. The installed app notices within
  seconds and offers "restart and update"; your projects and settings are untouched. Updates come
  from a folder on this machine by default, so nothing is uploaded anywhere.
- The installer is not code-signed, so Windows shows a SmartScreen warning the first time
  (More info → Run anyway). Signing needs a paid certificate.
