import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  checkProject,
  hash,
  parseRecord,
  replaceActionQueue,
  serializeRecord,
} from "voidra";
import { runRelease, startRelease } from "../src/release-intake.ts";
import { fixture } from "./helpers.ts";

it("terminal intake creates and queues completed work atomically ahead of the preserved queue, without Git/source effects or duplicates", async () => {
  const root = await fixture();
  try {
    const path = ".voidra/actions/act-000000/action.md",
      doc = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(doc, { ...doc.data, stage: "done", status: "complete" }),
    );
    const other = ".voidra/actions/act-000001/action.md";
    await mkdir(join(root, ".voidra/actions/act-000001"), { recursive: true });
    await writeFile(
      join(root, other),
      serializeRecord(
        parseRecord(other, "---\n{}\n---\n"),
        {
          id: "act-000001",
          type: "docs",
          title: "Other queued work",
          stage: "implement",
          status: "ready",
          doneBy: "agent",
        },
        "Other work.\n",
      ),
    );
    const project = await checkProject(root),
      raw = project.files.get(".voidra/local/pending-actions.md");
    await replaceActionQueue(root, {
      ids: ["act-000001"],
      revision: raw ? hash(raw) : null,
      by: "Fixture owner",
    });
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
      }).toString(),
      source = await readFile(join(root, "README.md"));
    const result = await startRelease(root);
    expect(result.queued).toBe(true);
    expect(result.action).toMatch(/^act-/);
    const after = await checkProject(root);
    expect(after.diagnostics).toEqual([]);
    expect(
      after.records.get(".voidra/local/pending-actions.md")?.document.body,
    ).toBe(`1. [ ] ${result.action}\n2. [ ] act-000001\n`);
    expect(
      after.records.get(`.voidra/actions/${result.action}/action.md`)?.document
        .data,
    ).toMatchObject({
      type: "release",
      stage: "plan",
      releaseActions: ["act-000000"],
      createdBy: "Voidra Verification <verification@example.test>",
    });
    expect(await startRelease(root)).toEqual({ action: null, queued: false });
    expect(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString(),
    ).toBe(head);
    expect(await readFile(join(root, "README.md"))).toEqual(source);
    expect(
      execFileSync("git", ["tag", "--list"], { cwd: root }).toString(),
    ).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("validates explicit selection and CLI options without expanding its scope", async () => {
  const root = await fixture();
  try {
    await expect(startRelease(root, { ids: ["act-000000"] })).rejects.toThrow(
      /completed/,
    );
    expect((await runRelease(["--help"], root)).code).toBe(0);
    expect((await runRelease(["--unknown", "value"], root)).code).toBe(1);
    expect((await runRelease(["--project"], root)).code).toBe(1);
    expect(
      (await runRelease(["--project", root, "--project", root], root)).code,
    ).toBe(1);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    await expect(
      startRelease(root, { ids: ["act-000000", "act-000000"] }),
    ).rejects.toThrow(/duplicate/i);
    const path = ".voidra/actions/act-000000/action.md",
      doc = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(doc, { ...doc.data, stage: "done", status: "complete" }),
    );
    await writeFile(
      join(root, ".voidra/local/selection.json"),
      JSON.stringify({ ids: ["act-000000"] }),
    );
    expect(
      (
        await runRelease(
          ["--project", root, "--report", ".voidra/local/selection.json"],
          root,
        )
      ).code,
    ).toBe(0);
    await mkdir(join(root, "nested"));
    await expect(startRelease(join(root, "nested"))).rejects.toThrow(
      /Git root/,
    );
    execFileSync("git", ["config", "user.name", ""], { cwd: root });
    execFileSync("git", ["config", "user.email", ""], { cwd: root });
    await expect(startRelease(root)).rejects.toThrow(/Configure Git/);
    await rm(join(root, ".git"), { recursive: true, force: true });
    await expect(startRelease(root)).rejects.toThrow(/Git root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
