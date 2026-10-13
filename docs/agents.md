# Claude Code and Codex

[Documentation index](intro.md) · [Run architecture](architecture/runs.md) · [P08 evidence](verification/p08.md)

The same Go and Plan skill texts run locally without the desktop. Both read repository instructions, dispatch the installed template's architecture procedure, publish through the active runtime token, and stop at human gates. Planning-only runs never switch to Go mode to continue implementation. No authenticated agent runs in CI.

Use Node 24.13.0+ and the genuine compatible `voidra` CLI. In development, `make skills-link PROJECT=/absolute/project` exposes the installed folders in `.claude/skills` and `.agents/skills`. Invocations are `/voidra-go` or `/voidra-plan` in Claude Code, and `$voidra-go` or `$voidra-plan` in Codex. The runtime returns the exact template path and architecture skill name; for general, the bundled file is `references/templates/general/template.yaml`, not `references/templates/general.yaml`.

Real checks use Haiku and Luna at low effort, with default-model retries after failure. Claude's JSON result exposes canonical model usage; Codex's JSON rollout does not consistently expose the resolved default model ID. Record the actual command and any model-resolution limit instead of guessing an alias. The configured desktop alias `gpt-6.1-sol` was rejected by the CLI backend; the isolated CLI default worked. The account's model-list response advertised `gpt-6-astra` as default, which is not by itself proof of a particular rollout's resolved model.

Claude checks restrict tools to Bash and Read with sandboxed writes inside the temporary fixture parent. Codex uses workspace-write with that parent explicitly added. Codex protects a worktree's `.git` directory even when the containing project is writable; verification fixtures therefore use a separate Git metadata directory inside the allowed temporary parent. This keeps real Git operations scoped without disabling the sandbox. Normal user repositories retain their own agent permission requirements.

Restricted shells may reject heredocs because their temporary-file location is unwritable. Write private reports with Node or another permitted file-writing tool; do not broaden permissions or move reports into source files. Reports belong in `.voidra/local/`; npm caches stay outside it. The genuine candidate CLI is installed before fixture baselines and checked offline.

Small models can miscopy ownership tokens or infer a wrong template filename. Use the exact returned path/token. Re-read a checkpoint after a typo; never interpret a rejected token as permission to clear a live owner or edit a lock. The runtime preserves the active run and refuses effects. Explicit recovery occurs only after the original owner exits. A stopped result at Review is waiting for a human decision, even if a model's prose calls its work complete.

The recorded P08 matrix includes real planning, approved implementations, Research, Docs, slices, human blockers, planning-only glossary changes and Review rework. Scripted scenarios and committed golden examples cover deterministic app/format behavior; they do not replace these real-agent outputs.
