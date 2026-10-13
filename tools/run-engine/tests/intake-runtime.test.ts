import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  checkProject,
  loadTemplate,
  parseRecord,
  serializeRecord,
} from "voidra";
import { runIntake } from "../src/init-runtime.ts";
import { startRun } from "../src/run.ts";
import { fixture } from "./helpers.ts";

it("validates intake flags/reports and executes both stdin and file reports", async () => {
  expect((await runIntake(["--help"], "")).code).toBe(0);
  for (const args of [
    ["--bad", "x"],
    ["--project"],
    ["--template", "../outside"],
    ["--project", "a", "--project", "b"],
  ])
    expect((await runIntake(args, "")).code).toBe(1);
  const template = await loadTemplate(
    resolve("templates/general/template.yaml"),
  );
  for (const reportFile of [false, true]) {
    const root = await mkdtemp(join(tmpdir(), "voidra-runtime-intake-"));
    try {
      await writeFile(join(root, "app.ts"), "export const greeting='Hello';\n");
      expect((await runIntake([], "bad JSON", root)).code).toBe(1);
      const report = JSON.stringify({
        name: "Greeting",
        answers: Object.fromEntries(
          template.blocks.flatMap((b) =>
            b.questions.map((q) => [
              `${b.id}.${q.id}`,
              { value: null, source: "app.ts:1 (not specified)" },
            ]),
          ),
        ),
        glossary: "# Draft glossary\n",
      });
      if (reportFile) await writeFile(join(root, "report.json"), report);
      const result = await runIntake(
        reportFile
          ? ["--report", "report.json"]
          : ["--project", root, "--template", "general"],
        report,
        root,
      );
      expect(result.code).toBe(0);
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
it("copied standalone skills find their own templates and native assets", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-portable-")),
    root = join(temp, "project"),
    runRoot = await fixture();
  try {
    await mkdir(root);
    await writeFile(join(root, "app.ts"), "export const greeting='Hello';\n");
    await cp(resolve("skills/voidra-init"), join(temp, "arbitrary-intake"), {
      recursive: true,
    });
    const template = await loadTemplate(
        resolve("templates/general/template.yaml"),
      ),
      report = {
        name: "Greeting",
        answers: Object.fromEntries(
          template.blocks.flatMap((b) =>
            b.questions.map((q) => [
              `${b.id}.${q.id}`,
              { value: null, source: "app.ts:1 (not specified)" },
            ]),
          ),
        ),
        glossary: "# Draft glossary\n",
      };
    const intake = JSON.parse(
      execFileSync(
        process.execPath,
        [join(temp, "arbitrary-intake/scripts/init.mjs")],
        { cwd: root, input: JSON.stringify(report), encoding: "utf8" },
      ),
    );
    expect(intake.ok).toBe(true);
    await cp(resolve("skills/voidra-go"), join(temp, "arbitrary-run"), {
      recursive: true,
    });
    const start = JSON.parse(
      execFileSync(
        process.execPath,
        [
          join(temp, "arbitrary-run/scripts/runtime.mjs"),
          "start",
          "--project",
          runRoot,
          "--agent",
          "codex",
          "--owner-pid",
          String(process.pid),
        ],
        { encoding: "utf8" },
      ),
    );
    expect(start.phase).toBe("started");
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(temp, { recursive: true, force: true });
    await rm(runRoot, { recursive: true, force: true });
  }
});
it("requires review before a draft Profile change can be consumed", async () => {
  const root = await fixture("profile-change");
  try {
    const path = ".voidra/actions/act-000000/action.md",
      doc = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(doc, { ...doc.data, status: "draft" }),
    );
    await expect(startRun(root, "codex", process.pid)).rejects.toThrow(
      /review.*draft|draft.*review/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
