# FORGE — build rules (read this every session)

FORGE is a Windows desktop app that drives the user's locally installed, already logged-in
`claude` CLI (Claude subscription, no API key) with strict model routing to save tokens:
Haiku scouts, Opus plans, Sonnet builds. It looks like a stylised terminal.

You are building it one phase at a time. This file is short on purpose. Details live in `docs/`.

## How to work

1. Read `docs/STATUS.md` first. It says which phase is next. If it does not exist, you are on Phase 0.
2. Read only the section for that phase in `docs/04-phases.md`, plus the parts of
   `docs/02-architecture.md` and `docs/03-design.md` that phase points at. Do not read all docs up front.
3. Build that one phase. Do not start the next one.
4. Run the phase's acceptance checks. Run `npm run typecheck` and `npm test` and fix failures.
5. Update `docs/STATUS.md` (what is done, what was verified and how, anything that deviated from the spec and why).
6. Commit with message `phase N: <summary>`. Then stop and report.

## Hard rules

- **Never guess the `claude` CLI's behaviour.** `docs/cli-notes.md` (written in Phase 0 from real
  captured output) is the source of truth for flags and event shapes. If the spec and
  `cli-notes.md` disagree, `cli-notes.md` wins; note the deviation in STATUS.
- **Never set, read, or ask for `ANTHROPIC_API_KEY`.** Always delete `ANTHROPIC_API_KEY` and
  `ANTHROPIC_AUTH_TOKEN` from the environment of every spawned `claude` process, so the
  subscription login is used.
- **Never call the Anthropic HTTP API or any Anthropic SDK directly.** The only way FORGE talks
  to Claude is by spawning the `claude` executable.
- **No stubs presented as done.** If something cannot be finished, say so in STATUS under "Not done".
- **No new dependencies** beyond `docs/02-architecture.md` §Stack without writing the reason in STATUS.
- **Electron security is not optional:** `contextIsolation: true`, `nodeIntegration: false`,
  every IPC payload validated with zod in the main process, no `remote` module.
- **Prompts go to `claude` over stdin, never argv.** Long or quoted text passed as an argument
  breaks on Windows. Anything long that must be a flag value goes in a temp file.
- TypeScript `strict`. No `any` except at a zod-validated boundary. No default exports except React pages.
- Do not restyle or "improve" the design system in feature phases. Design changes happen only in Phase 13.
- Platform is Windows 11. Use `path.join`, never hard-code `/`. Kill process trees with `taskkill /PID <pid> /T /F`.

## Commands (after Phase 1)

- `npm run dev` — start the app
- `npm run typecheck` — `tsc --noEmit` for main, preload, renderer
- `npm test` — vitest (unit tests for parsers, stores, pure logic)
- `npm run build` — production build

## Layout of the repo (after Phase 1)

```
src/main/        Electron main: engine/, pty/, projects/, skills/, preview/, usage/, git/, ipc/
src/preload/     contextBridge API (window.forge) and webview preload (picker)
src/renderer/    React app: app/, features/<feature>/, ui/ (design-system primitives), styles/
src/shared/      Types and zod schemas used by both sides (EngineEvent, IPC contracts, Role config)
resources/       Bundled plugin (forge-skills/), fonts, default registries.json, templates.json
fixtures/        Real captured `claude` stream-json output from Phase 0 (used by parser tests)
docs/            Spec and STATUS
```
