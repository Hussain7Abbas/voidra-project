import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Action,
  applyOperation,
  checkProject,
  lifecycles,
  parseRecord,
  readProjectFiles,
  schemas,
  serializeRecord,
} from "voidra";
import { writeProject } from "../../../packages/voidra/scripts/fixtures.ts";
import {
  commitResult,
  finalizeResult,
  prepareResult,
  publishHumanBlocker,
  publishPlanning,
  publishResearch,
  startRun,
} from "../src/run.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const scenarios: { name: string; type: Action["type"]; summary: string }[] = [
  {
    name: "feature-discovery",
    type: "feature",
    summary:
      "Dispatched voidra-architect-general. Inspected source and rejected backlog: double(value) is absent and was not rejected. Scope is a finite-number local function.",
  },
  {
    name: "bug-diagnosis",
    type: "bug",
    summary:
      "Dispatched voidra-architect-general. Reproduced magnitude(-2) returning -2; reduced to one argument. Hypothesis confirmed: the function returns its input rather than absolute value. Public exported-function regression seam.",
  },
  {
    name: "improvement-expand-contract",
    type: "improvement",
    summary:
      "Dispatched voidra-architect-general. Extract normalization while preserving the public names(values) result; expand helper, migrate caller, remove duplicated logic after regression checks.",
  },
  {
    name: "profile-impact",
    type: "profile-change",
    summary:
      "Dispatched voidra-architect-general. Confirmed local-only scope affects README/local constraints; code stays synchronous and open actions retain their scope. Inspect affected documentation and tests.",
  },
  {
    name: "slices",
    type: "feature",
    summary:
      "Dispatched voidra-architect-general. Scope exceeds one session; each slice delivers observable behavior through data, logic, interface and public tests.",
  },
  {
    name: "research",
    type: "research",
    summary: "Investigate local numeric test coverage.",
  },
  {
    name: "human-blocker",
    type: "feature",
    summary: "A person must create and confirm the development account.",
  },
  {
    name: "verification",
    type: "docs",
    summary: "Document the installation boundary.",
  },
];
const catalog: { name: string; project: string }[] = [];
for (const scenario of scenarios) {
  const root = await mkdtemp(join(tmpdir(), "voidra-lifecycle-golden-"));
  try {
    await cp(join(repository, "fixtures/new-project/project"), root, {
      recursive: true,
    });
    const path = ".voidra/actions/act-000000/action.md",
      doc = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(
        doc,
        {
          id: "act-000000",
          type: scenario.type,
          title: scenario.name,
          doneBy: "agent",
          status: "ready",
          stage: lifecycles[scenario.type].stages[0],
        },
        scenario.summary,
      ),
    );
    await writeFile(join(root, "README.md"), "# Fixture\n");
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Voidra Golden"],
      ["config", "user.email", "golden@example.test"],
      ["add", "."],
      ["commit", "-qm", "Initial golden"],
    ])
      execFileSync("git", args, { cwd: root });
    const queue = ".voidra/local/pending-actions.md";
    await applyOperation(root, {
      changes: [
        {
          path: queue,
          expectedHash: null,
          content: serializeRecord(
            parseRecord(queue, "---\n{}\n---\n"),
            { queuedBy: "Fixture owner", queuedAt: "2026-10-13T00:00:00Z" },
            "1. [ ] act-000000\n",
          ).toString(),
        },
      ],
    });
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Missing golden run");
    if (scenario.name === "research")
      await publishResearch(root, ctx.ownerToken, {
        findings:
          "The numeric test covers positive values only; negative and fractional inputs are untested.",
        recommendation:
          "Add negative and fractional cases at the public exported function.",
        ideas: [
          {
            title: "Extend numeric coverage",
            description:
              "Proposed regression and edge cases; not an accepted action.",
          },
        ],
      });
    else if (scenario.name === "human-blocker")
      await publishHumanBlocker(root, ctx.ownerToken, {
        title: "Create development account",
        description:
          "Open the provider settings, create an account, and confirm local development access.",
        steps: ["Create the development account", "Confirm development access"],
      });
    else if (scenario.name === "slices")
      await publishPlanning(root, ctx.ownerToken, {
        action: ctx.action,
        kind: "slices",
        summary: scenario.summary,
        slices: [
          {
            title: "Save and reopen one note",
            description:
              "Local persistence through command output with real-file round-trip tests.",
          },
          {
            title: "Search saved notes",
            description:
              "Storage query through CLI results with exported query and command tests; depends on saving.",
          },
        ],
      });
    else if (scenario.name === "verification") {
      await writeFile(
        join(root, "README.md"),
        "# Fixture\nInstall with pnpm install.\n",
      );
      await prepareResult(root, ctx.ownerToken, {
        summary: "Documented installation; checked the public README seam.",
        paths: ["README.md"],
        checks: [{ name: "README installation boundary", passed: true }],
        reviews: {
          standards: {
            passed: true,
            summary: "Preserves repository documentation conventions.",
          },
          plan: {
            passed: true,
            summary: "Matches the requested installation sentence.",
          },
        },
      });
      await commitResult(root, ctx.ownerToken, "Document installation");
      await finalizeResult(root, ctx.ownerToken);
    } else
      await publishPlanning(root, ctx.ownerToken, {
        action: ctx.action,
        kind: "plan",
        summary: scenario.summary,
        requirements: `## Goal\n${scenario.summary}\n\n## Out of scope\nNetwork services, accounts, unrelated functionality and source changes before approval.\n`,
        blueprint: `## Approach\n${scenario.summary}\n\n## Testing seams\nPublic exported functions, real temporary files and CLI input/output. Test failing behavior before implementation; mocks only outside the project.\n\n## Proposed ADRs\nNone: this reversible local change does not meet the lasting-decision threshold.\n`,
        acceptance:
          "- The specified behavior passes its public-boundary checks.\n- Unrelated behavior and user changes are preserved.\n",
      });
    const checked = await checkProject(root);
    if (checked.diagnostics.length)
      throw new Error(JSON.stringify(checked.diagnostics));
    const ids = new Map<string, string>();
    let run = 0,
      action = 1,
      idea = 0;
    const primary = schemas.action.parse(
      checked.records.get(path)?.document.data,
    );
    for (const id of primary.blockedBy ?? [])
      ids.set(id, `act-${String(action++).padStart(6, "0")}`);
    for (const record of checked.records.values()) {
      const id = String(record.document.data.id ?? "");
      if (id.startsWith("run-"))
        ids.set(id, `run-${String(run++).padStart(6, "0")}`);
      else if (id.startsWith("act-") && id !== "act-000000" && !ids.has(id))
        ids.set(id, `act-${String(action++).padStart(6, "0")}`);
      else if (id.startsWith("idea-"))
        ids.set(id, `idea-${String(idea++).padStart(6, "0")}`);
    }
    const normalize = (value: string) => {
      for (const [old, id] of ids) value = value.replaceAll(old, id);
      value = value.replace(
        /\d{4}-\d{2}-\d{2}T\d{2}:?\d{2}:?\d{2}(?:\.\d+)?Z/g,
        (value) =>
          value.includes(":") ? "2026-10-13T00:00:00Z" : "2026-10-13T000000Z",
      );
      const commit = schemas.action.parse(
        checked.records.get(path)?.document.data,
      ).commits?.[0];
      if (commit) value = value.replaceAll(commit, "f".repeat(40));
      return value;
    };
    const project = `fixtures/lifecycles/${scenario.name}/project`;
    const files = new Map(
      [...checked.files]
        .filter(([path]) => !path.startsWith(".voidra/local/"))
        .map(([path, bytes]) => [
          normalize(path),
          Buffer.from(normalize(bytes.toString())),
        ]),
    );
    if (process.argv.includes("--check")) {
      const existing = (await readProjectFiles(resolve(repository, project)))
        .files;
      if (
        existing.size !== files.size ||
        [...files].some(([path, bytes]) => !existing.get(path)?.equals(bytes))
      )
        throw new Error(`Stale lifecycle golden: ${scenario.name}`);
    } else {
      await rm(resolve(repository, project), { recursive: true, force: true });
      await writeProject(resolve(repository, project), files);
    }
    catalog.push({ name: scenario.name, project });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const path = resolve(repository, "fixtures/lifecycles/catalog.json"),
  content = `${JSON.stringify(catalog, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(path, "utf8")) !== content)
    throw new Error("Stale lifecycle golden catalog");
} else {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
