# Existing-code intake

Run the helper from the project folder with Node 24 or later. Locate this skill's own directory through the agent's skill discovery; do not assume it is in the project. The bundled script and references work when copied elsewhere, without the app or development repository.

```sh
node <skill-directory>/scripts/init.mjs --template general <<'JSON'
{
  "name": "Existing project",
  "answers": {
    "problem.goal": {
      "value": "Expose the observed greeting",
      "source": "src/app.ts:1"
    },
    "problem.workflow": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "users.audience": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "users.success": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "scope.features": {
      "value": [
        "Export greeting"
      ],
      "source": "src/app.ts:1"
    },
    "scope.modules": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "technology.stack": {
      "value": "TypeScript",
      "source": "src/app.ts:1"
    },
    "technology.libraries": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "design.direction": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "integrations.systems": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "data.model": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "data.protection": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "delivery.platform": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "delivery.distribution": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "constraints.priorities": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "constraints.limits": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    },
    "constraints.references": {
      "value": null,
      "source": "src/app.ts:1 (not specified by this file)"
    }
  },
  "glossary": "# Draft glossary\n\nGreeting: the text exported by src/app.ts.\n"
}
JSON
npx --yes voidra@1.0.0 check .
```

This illustrates the general template's report shape, not universal answers. Read the selected template and provide all its questions. Keys are `<block>.<question>`; text/choice answers are strings, multiple choices/lists are arrays and unknown answers are null. Each source must name an existing, unlinked project file. Do not use a path outside the project. Optional flags are `--project FOLDER`, `--template ID`, and `--report FILE` instead of stdin; `--help` prints usage. Stdin avoids leaving a report file in the project.

The helper checks for actual code, validates templates/answers and refuses an existing .voidra. It creates no Bootstrap for existing code. Profile answers remain inferred, including unresolved nulls; the person can fill those in rather than confirming an empty answer. No Git command is executed.

An existing glossary is preserved exactly. Instruction text is retained. Prefer AGENTS.md; preserve a CLAUDE.md that only imports it. If only a full CLAUDE.md exists, add its Voidra section there and create an AGENTS.md entry that points to those rules so Codex sees them too. If neither exists, create AGENTS.md and the CLAUDE.md import. A custom CLAUDE.md beside AGENTS.md gets its own short Voidra pointer; no existing project rules are replaced.

The .voidra creation is atomic. Glossary and instruction writes are separately checked, so an outside instruction edit stops intake and may leave a valid profile with pending pointer work. Report that partial result and the conflict; do not rerun over existing planning data or overwrite the outside edit. Review the diff before a person commits planning changes. Every completed planning write is checked internally with the package, followed by the published CLI after the intake group.
