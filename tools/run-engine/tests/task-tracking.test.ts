import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { checkProject, enableTaskTracking, previewTaskTracking } from "voidra";
import {
  publishHumanBlocker,
  publishPlanning,
  publishResearch,
  startRun,
} from "../src/run.ts";
import { fixture } from "./helpers.ts";

for (const agent of ["claude-code", "codex"] as const)
  for (const behavior of ["research", "human", "slices"] as const)
    it(`${agent} runtime creates valid release metadata for ${behavior} in opted-in projects`, async () => {
      const root = await fixture(
        behavior === "research" ? "research" : "feature",
      );
      try {
        await writeFile(join(root, "package.json"), '{"version":"2.3.4"}');
        await enableTaskTracking(root, {
          revision: (await previewTaskTracking(root)).revision,
        });
        const ctx = await startRun(root, agent, process.pid);
        if (ctx?.phase !== "started") throw Error("Missing run");
        if (behavior === "research")
          await publishResearch(root, ctx.ownerToken, {
            findings: "Found evidence.",
            recommendation: "Continue.",
            ideas: [{ title: "Follow-up", description: "Proposed notes." }],
          });
        else if (behavior === "human")
          await publishHumanBlocker(root, ctx.ownerToken, {
            title: "Create account",
            description: "Human setup.",
            steps: ["Create the account"],
          });
        else
          await publishPlanning(root, ctx.ownerToken, {
            kind: "slices",
            action: ctx.action,
            slices: [
              { title: "First", description: "First path." },
              { title: "Second", description: "Second path." },
            ],
          });
        const project = await checkProject(root);
        expect(project.diagnostics).toEqual([]);
        const added = [...project.records.values()].filter(
          (r) =>
            (r.kind === "idea" || r.kind === "action") &&
            r.document.data.id !== ctx.action,
        );
        expect(added.length).toBeGreaterThan(0);
        for (const record of added)
          expect(record.document.data.targetRelease).toBe("2.3.4");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
