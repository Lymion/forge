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

## How to run the build

1. Put this folder where the app should live (e.g. `C:\Forge`) and open it in Claude Code with Sonnet.
2. For every phase, start a **new session** and paste:

   ```
   Follow CLAUDE.md. Do the next phase only, then stop and report.
   ```

3. After Phase 0, read `docs/cli-notes.md` yourself. It records how the `claude` CLI really
   behaves on your machine. If something there contradicts the spec in a way that changes a
   feature, decide before Phase 1. The two most likely: whether the ~100 skills in
   `~/.claude/skills` can be hidden (if not, the Haiku picker can add skills but not remove those),
   and whether Opus can be limited to writing inside `.forge/`.
4. After each phase, try the acceptance items yourself before starting the next session.

One fresh session per phase is itself a token saver: Sonnet reads the rules, one phase, and the
status file, instead of carrying the whole build in context.

## Decisions made for you (change them in the docs before Phase 1 if you disagree)

- Working name FORGE; per-project folder `.forge/`.
- Electron + React + TypeScript, Windows only.
- Roles: SCOUT = haiku, PLAN = opus, BUILD = sonnet, as separate sessions that hand off through files.
- BUILD has no shell. It edits files directly; the app runs checks and sends back only failures;
  anything else BUILD needs run becomes a card you click.
- Haiku picks up to 6 skills per chat from the first message; the pick stays fixed for that chat.
- Your `review-prototype` skill is bundled in an adapted form: same process, but the Preview tile
  replaces the Artifact link and the app takes the screenshots.
- Nothing ever waits on a permission prompt; anything not pre-allowed is denied and shown with an "allow" button.
- Dictation is local Whisper (no tokens, no cloud).
- No MCP server is enabled by default.
