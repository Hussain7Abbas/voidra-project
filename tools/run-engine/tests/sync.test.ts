import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject, hash } from "voidra";
import { applySync, runSync, syncContext } from "../src/sync.ts";
import { fixture } from "./helpers.ts";

const git = (root: string, args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
async function report(root: string) {
  const context = await syncContext(root);
  if (!context.examinedRevision) throw new Error("Missing Git HEAD");
  return {
    examinedRevision: context.examinedRevision,
    since: context.since,
    commits: context.commits.map((commit) => commit.hash),
    summary: "Reviewed outside commits.",
    profiles: [],
    actions: [],
    ideas: [
      {
        title: "Document outside changes",
        body: "Explain the new behavior.",
        commits: [context.examinedRevision],
      },
    ],
  };
}
it("uses actual outside trailers, records the examined HEAD, suggests later commits and repeats without new proposals or Git writes", async () => {
  const root = await fixture();
  try {
    const initial = git(root, ["rev-parse", "HEAD"]);
    expect((await syncContext(root)).commits.map((c) => c.hash)).toEqual([
      initial,
    ]);
    const initialReport = await report(root);
    const result = await applySync(root, initialReport);
    expect(result.repeated).toBe(false);
    expect((await syncContext(root)).commits).toEqual([]);
    const before = await checkProject(root);
    expect(
      await applySync(root, { ...initialReport, ideas: [] }),
    ).toMatchObject({ id: result.id, repeated: true });
    expect((await checkProject(root)).files).toEqual(before.files);
    expect(git(root, ["rev-parse", "HEAD"])).toBe(initial);
    for (const message of [
      "Tracked change\n\nVoidra-Action: act-000000",
      "Outside change",
    ]) {
      await writeFile(join(root, "README.md"), message);
      git(root, ["add", "README.md"]);
      git(root, ["commit", "-qm", message]);
    }
    const context = await syncContext(root);
    expect(context.since).toBe(initial);
    expect(context.commits).toHaveLength(1);
    const second = await applySync(root, await report(root));
    expect(second.id).not.toBe(result.id);
    expect((await syncContext(root)).commits).toEqual([]);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("checks current Git evidence and protects a confirmed profile while inferring an open answer", async () => {
  const root = await fixture();
  try {
    const input = await report(root),
      path = ".voidra/profile/problem.md",
      before = await readFile(join(root, path));
    await expect(
      applySync(root, { ...input, examinedRevision: "f".repeat(40) }),
    ).rejects.toThrow(/changed|revision/i);
    await expect(applySync(root, { ...input, commits: [] })).rejects.toThrow(
      /commit|array|small/i,
    );
    const result = await applySync(root, {
      ...input,
      profiles: [
        {
          block: "problem",
          id: "goal",
          value: "Changed externally",
          revision: hash(before),
          commit: input.examinedRevision,
          source: "README.md",
        },
        {
          block: "problem",
          id: "workflow",
          value: "Now documented",
          revision: hash(before),
          commit: input.examinedRevision,
          source: "README.md",
        },
      ],
    });
    const project = await checkProject(root);
    expect(result.proposals).toHaveLength(2);
    expect(project.records.get(path)?.document.data.answers).toMatchObject([
      {
        answer: "Save and reopen private project notes offline.",
        status: "confirmed",
      },
      { answer: "Now documented", status: "inferred" },
    ]);
    expect(git(root, ["status", "--porcelain", "--", "README.md"])).toBe("");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("recovers a real process death between a proposal and its sync record without duplicating or losing commits", async () => {
  const root = await fixture();
  try {
    const input = await report(root);
    const script = `import {applySync} from ${JSON.stringify(resolve("tools/run-engine/src/sync.ts"))};
      await applySync(${JSON.stringify(root)}, ${JSON.stringify(input)}, {checkpoint(point,path) {
        if(point==='change-applied' && path.startsWith('.voidra/backlog/')) process.kill(process.pid,'SIGKILL');
      }});`;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", script],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let errors = "";
    child.stderr.on("data", (chunk) => {
      errors += String(chunk);
    });
    const [, signal] = await once(child, "exit");
    expect(signal, errors).toBe("SIGKILL");
    const recovered = await applySync(root, input);
    expect(recovered.repeated).toBe(true);
    const project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(
      [...project.records.values()].filter((r) => r.kind === "idea"),
    ).toHaveLength(1);
    expect(
      [...project.records.values()].filter((r) => r.kind === "sync"),
    ).toHaveLength(1);
    expect((await syncContext(root)).commits).toEqual([]);
    expect(await applySync(root, input)).toEqual(recovered);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("preserves outside edits during recovery and refuses active work and non-root invocation", async () => {
  const root = await fixture();
  try {
    const input = await report(root);
    await expect(
      applySync(root, input, {
        checkpoint(point) {
          if (point === "journal-prepared") throw new Error("Interrupted");
        },
      }),
    ).rejects.toThrow(/Interrupted/);
    const project = await checkProject(root),
      operation = [...project.records.values()].find(
        (r) => r.kind === "operation" && r.document.data.state === "prepared",
      );
    if (!operation) throw new Error("Missing operation");
    const proposalPath = (
      operation.document.data.changes as { path: string }[]
    ).find((c) => c.path.startsWith(".voidra/backlog/"))?.path;
    if (!proposalPath) throw new Error("Missing proposal");
    await mkdir(join(root, ".voidra/backlog"), { recursive: true });
    await writeFile(join(root, proposalPath), "Outside edit\n");
    await expect(applySync(root, input)).rejects.toThrow(
      /changed|outside|hash|unexpected/i,
    );
    expect(await readFile(join(root, proposalPath), "utf8")).toBe(
      "Outside edit\n",
    );
    await expect(syncContext(join(root, ".voidra"))).rejects.toThrow(/root/i);
    await writeFile(join(root, ".voidra/local/run.lock"), "{}");
    await expect(applySync(root, input)).rejects.toThrow(/pending|run/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("exposes bounded context and apply commands, reports invalid options, and handles a repository with no commits", async () => {
  const root = await fixture();
  try {
    expect((await runSync(["--help"], root)).code).toBe(0);
    expect((await runSync(["--unknown", "value"], root)).code).toBe(1);
    for (const args of [
      ["context", "--report", "x"],
      ["apply"],
      ["context", "--project", root, "--project", root],
      ["apply", "--report", "missing.json"],
    ])
      expect((await runSync(args, root)).code).toBe(1);
    expect((await runSync(["context", "--project", root], root)).code).toBe(0);
    await writeFile(
      join(root, ".voidra/local/sync-report.json"),
      JSON.stringify(await report(root)),
    );
    expect(
      (
        await runSync(
          ["apply", "--report", ".voidra/local/sync-report.json"],
          root,
        )
      ).code,
    ).toBe(0);
    await rm(join(root, ".git"), { recursive: true, force: true });
    expect((await runSync(["context"], root)).code).toBe(1);
    git(root, ["init", "-q"]);
    expect((await syncContext(root)).examinedRevision).toBeNull();
    expect((await syncContext(root)).commits).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("chooses a reachable Sync after switching branches and never uses an unrelated branch's newer record", async () => {
  const root = await fixture();
  try {
    const base = git(root, ["rev-parse", "HEAD"]);
    await applySync(root, await report(root));
    git(root, ["branch", "sync-side"]);
    await writeFile(join(root, "README.md"), "Main change\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-qm", "Main outside work"]);
    await applySync(root, await report(root));
    git(root, ["checkout", "-q", "sync-side"]);
    await writeFile(join(root, "README.md"), "Side change\n");
    git(root, ["add", "README.md"]);
    git(root, ["commit", "-qm", "Side outside work"]);
    const context = await syncContext(root);
    expect(context.since).toBe(base);
    expect(context.commits.map((commit) => commit.subject)).toEqual([
      "Side outside work",
    ]);
    await applySync(root, await report(root));
    expect((await syncContext(root)).commits).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("requires identity and refuses unrelated prepared work rather than recovering its files", async () => {
  const root = await fixture();
  try {
    const input = await report(root);
    git(root, ["config", "user.name", ""]);
    await expect(applySync(root, input)).rejects.toThrow(
      /identity|name|email/i,
    );
    git(root, ["config", "user.name", "Tests"]);
    const { applyOperation } = await import("voidra"),
      path = ".voidra/README.md",
      before = await readFile(join(root, path));
    await expect(
      applyOperation(
        root,
        {
          changes: [
            {
              path,
              expectedHash: hash(before),
              content: before.toString() + "\nPending unrelated note\n",
            },
          ],
        },
        {
          checkpoint(point) {
            if (point === "journal-prepared")
              throw new Error("Stop unrelated operation");
          },
        },
      ),
    ).rejects.toThrow(/Stop/);
    await expect(applySync(root, input)).rejects.toThrow(/unrelated/i);
    expect(await readFile(join(root, path))).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
