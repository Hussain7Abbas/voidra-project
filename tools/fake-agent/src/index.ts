import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  commitResult,
  finalizeResult,
  guardRun,
  initializeExisting,
  prepareResult,
  publishPlanning,
  publishReleasePlan,
  publishResearch,
  startRun,
} from "@voidra/run-engine";
import {
  applyOperation,
  detectCode,
  hash,
  loadTemplate,
  parseRecord,
  schemas,
  serializeRecord,
} from "voidra";
export type Scenario =
  | "init"
  | "success"
  | "invalid-write"
  | "crash-mid-run"
  | "crash-after-commit"
  | "stale-lock"
  | "live-stale"
  | "pause-after-start"
  | "interrupted-operation";
export async function runFakeAgent(
  root: string,
  scenario: Scenario,
): Promise<{ run: string; scenario: Scenario }> {
  if (scenario === "init") {
    const template = await loadTemplate(
        fileURLToPath(
          new URL("../../../templates/general/template.yaml", import.meta.url),
        ),
      ),
      evidence = (await detectCode(root)).evidence[0];
    if (!evidence) throw new Error("Existing-code fixture is required");
    const answers: Record<string, { value: unknown; source: string }> =
      Object.fromEntries(
        template.blocks.flatMap((block) =>
          block.questions.map((q) => [
            `${block.id}.${q.id}`,
            { value: null, source: `${evidence}:1 (not specified)` },
          ]),
        ),
      );
    answers["problem.goal"] = {
      value: "Expose the existing greeting",
      source: `${evidence}:1`,
    };
    await initializeExisting(root, template, {
      name: "Existing greeting",
      answers,
      glossary:
        "# Draft glossary\n\nGreeting: the message exposed by the existing code.\n",
    });
    return { run: "", scenario };
  }
  const ctx = await startRun(root, "codex", process.pid);
  if (!ctx) throw new Error("No queued action");
  if (ctx.phase !== "started") return { run: ctx.run, scenario };
  if (scenario === "pause-after-start") return { run: ctx.run, scenario };
  if (scenario === "invalid-write") {
    await writeFile(
      join(root, ctx.actionPath),
      "---\nid: broken\n---\nInvalid fixture output.\n",
    );
    return { run: ctx.run, scenario };
  }
  if (scenario === "stale-lock" || scenario === "live-stale") {
    const path = ".voidra/local/run.lock",
      old = await readFile(join(root, path), "utf8");
    await applyOperation(root, {
      changes: [
        {
          path,
          expectedHash: hash(old),
          content: JSON.stringify({
            ...JSON.parse(old),
            heartbeatAt: new Date(Date.now() - 180000).toISOString(),
          }),
        },
      ],
    });
    return { run: ctx.run, scenario };
  }
  if (scenario === "interrupted-operation") {
    const old = await readFile(join(root, ctx.actionPath)),
      doc = parseRecord(ctx.actionPath, old);
    try {
      await applyOperation(
        root,
        {
          changes: [
            {
              path: ctx.actionPath,
              expectedHash: hash(old),
              content: serializeRecord(doc, {
                ...doc.data,
                title: "Unfinished fixture operation",
              }).toString(),
            },
          ],
        },
        {
          checkpoint(point) {
            if (point === "change-applied")
              throw new Error("Scripted interruption");
          },
        },
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "Scripted interruption"
      )
        throw error;
    }
    return { run: ctx.run, scenario };
  }
  const action = parseRecord(
    ctx.actionPath,
    await readFile(join(root, ctx.actionPath)),
  );
  const data = schemas.action.parse(action.data);
  if (scenario === "success" && data.type === "release") {
    if (data.stage === "plan") {
      await publishReleasePlan(root, ctx.ownerToken, {
        version: "0.2.0",
        tag: "v0.2.0",
        message: "chore(release): 0.2.0",
        paths: ["package.json", "CHANGELOG.md"],
        notes:
          "## Notes\nCompleted fixture documentation.\n" +
          (data.reviewDecision?.feedback
            ? "\nClarified: This release is local only; nothing is published.\n"
            : ""),
        requirements:
          "## Goal\nRelease fixture work as 0.2.0.\n## Out of scope\nPublishing.\n",
        blueprint:
          "## Approach\nBump package.json and prepend CHANGELOG.md, preserving its earlier section.\n## Testing seams\nRead the version/changelog, validate files and inspect local Git.\n## Proposed ADRs\nNone.\n",
        acceptance:
          "- Version 0.2.0 and the original changelog section remain.\n- One local commit/tag marks selected work Released.\n",
      });
    } else {
      await guardRun(root, ctx.ownerToken, data.releaseFiles);
      const file = join(root, "package.json"),
        value = JSON.parse(await readFile(file, "utf8")) as Record<
          string,
          unknown
        >;
      await writeFile(
        file,
        `${JSON.stringify({ ...value, version: data.releaseVersion }, null, 2)}\n`,
      );
      const changelog = join(root, "CHANGELOG.md"),
        prior = await readFile(changelog, "utf8");
      await writeFile(
        changelog,
        prior.replace(
          "# Changelog",
          "# Changelog\n\n## 0.2.0\n- Completed fixture documentation.",
        ),
      );
      if (
        (JSON.parse(await readFile(file, "utf8")) as { version?: string })
          .version !== data.releaseVersion ||
        !(await readFile(changelog, "utf8")).endsWith(
          prior.slice("# Changelog".length),
        )
      )
        throw new Error("Scripted version/changelog readback failed");
      await prepareResult(root, ctx.ownerToken, {
        summary: "Scripted version/changelog boundary verified.",
        paths: data.releaseFiles ?? [],
        checks: [
          { name: "Version and changelog fixture readback", passed: true },
        ],
        reviews: {
          standards: {
            passed: true,
            summary: "Fixture conventions preserved.",
          },
          plan: { passed: true, summary: "Scripted accepted release scope." },
        },
      });
      if (!data.releaseMessage) throw new Error("Release message missing");
      await commitResult(root, ctx.ownerToken, data.releaseMessage);
      await finalizeResult(root, ctx.ownerToken);
    }
    return { run: ctx.run, scenario };
  }
  const before = await readFile(join(root, "README.md"), "utf8");
  if (scenario === "success" && data.type === "research") {
    await publishResearch(root, ctx.ownerToken, {
      findings: "The scripted fixture uses a local README boundary.",
      recommendation:
        "Keep the next documentation improvement small and observable.",
      ideas: [
        {
          title: "Clarify troubleshooting",
          description: "Proposed fixture follow-up.",
        },
      ],
    });
    return { run: ctx.run, scenario };
  }
  if (
    scenario === "success" &&
    ["discovery", "plan"].includes(data.stage ?? "")
  ) {
    await publishPlanning(root, ctx.ownerToken, {
      action: ctx.action,
      kind: "plan",
      summary:
        "Scripted general architecture dispatch; app-side gate scenario only.",
      requirements:
        "## Goal\nClarify local fixture installation.\n## Out of scope\nNetwork and account changes.\n",
      blueprint:
        "## Approach\nUpdate the README boundary.\n## Testing seams\nRead the public README and validate planning records.\n## Proposed ADRs\nNone for this reversible documentation fixture.\n",
      acceptance: "- The README names the installation command.\n",
    });
    return { run: ctx.run, scenario };
  }
  const feedback = (
    action.data.reviewDecision as { feedback?: string } | undefined
  )?.feedback;
  await writeFile(
    join(root, "README.md"),
    `${before}\n${feedback ? "Troubleshooting: reinstall dependencies if setup fails." : "Install dependencies with pnpm install."}\n`,
  );
  if (scenario === "crash-mid-run") return { run: ctx.run, scenario };
  await prepareResult(root, ctx.ownerToken, {
    summary: feedback
      ? "Added troubleshooting guidance from the review feedback."
      : "Added installation guidance.",
    paths: ["README.md"],
    reviews: {
      standards: { passed: true, summary: "Fixture rules checked" },
      plan: { passed: true, summary: "Scripted accepted scope checked" },
    },
    checks: [
      { name: "Documentation reviewed", passed: true },
      { name: "voidra check", passed: true },
    ],
  });
  await commitResult(
    root,
    ctx.ownerToken,
    feedback ? "Add troubleshooting guidance" : "Document installation",
  );
  if (scenario !== "crash-after-commit")
    await finalizeResult(root, ctx.ownerToken);
  return { run: ctx.run, scenario };
}
