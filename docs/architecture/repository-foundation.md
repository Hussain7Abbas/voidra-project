# Repository foundation

[Architecture index](Intro.md) · [Development](../development.md)

P00 introduced `tools/standards`; P01 adds the real `packages/voidra` member to the pnpm workspace. The workspace patterns reserve `apps/*`, `packages/*` and `tools/*`, but absent packages are not created as empty directories.

The root package owns exact dependency pins, strict TypeScript settings, Biome, Vitest and the shared quality commands. The Makefile calls those commands from the repository root. TypeScript output, V8 coverage and dependencies are ignored by git.

`tools/standards` owns the coverage gates and read-only deprecation scanner. The scanner exposes three testing seams: comment parsing, real filesystem discovery and CLI behavior. It uses the stable TypeScript parser to separate source comments from quoted examples. The coverage tests launch the real Vitest CLI against temporary projects with the same root configuration and policy.

Documentation and planning are source-controlled Markdown. `VISION.md` defines product behavior; `plan/main.md` tracks phase status and links evidence. `AGENTS.md` defines development rules; sibling `CLAUDE.md` files only import those rules.

P01 implements the Electron-independent [`voidra` package](format-package.md). P02 creates the desktop shell and confirms the proposed utility-process boundary. Those runtime components are described in the [plan](../../plan/main.md#architecture-overview), not presented here as implemented code.
