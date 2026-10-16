---
name: voidra-init
description: Bring an existing codebase into Voidra with a source-linked
  inferred profile, a glossary draft and instruction pointers. Use when code
  exists but .voidra does not. Creates no commits and changes no source code.
license: AGPL-3.0-or-later
metadata:
  version: "1.1.1"
  format-version: "1"
---

Read the repository instructions and [intake procedure](references/intake.md). Use the bundled [general template](references/templates/general/template.yaml); `--template <id>` selects another bundled template. The [format reference](references/format.md) defines the output.

1. Inspect the existing code and relevant manifests/docs. Do not read secrets or dependency/generated folders. Infer answers from actual files, with a relative file and line as source. Every template question gets an inferred answer; if evidence is absent, use null and name an inspected file with a note that it did not establish an answer. Never label an inference confirmed or invent a decision.
2. Draft glossary terms from the observed code. Preserve an existing GLOSSARY.md. Send the report to `scripts/init.mjs` as JSON on stdin. The helper validates it, creates a complete .voidra atomically, writes a glossary only if absent and preserves existing instruction text when adding the Voidra pointer. Follow the exact report shape in the procedure. Do not hand-edit files around the helper or overwrite an existing planning folder.
3. Run `npx --yes voidra@1.1.1 check .` after the completed intake group. Inspect the created files and diff against the allowed paths. Stop on validation or recovery conflicts. Do not edit source code, commit, tag or push.
4. List every created/changed path, what was inferred and where the evidence came from. Leave the answers for the person to confirm in the app. Do not start Bootstrap or other implementation.

The user's instructions take precedence. Allowed writes are .voidra/, a new GLOSSARY.md, and the AGENTS.md/CLAUDE.md instruction pointers described in the procedure. Report partial failure clearly; never repair unrelated files silently.
