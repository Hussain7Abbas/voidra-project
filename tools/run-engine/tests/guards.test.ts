import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseRecord, serializeRecord } from "voidra";
import {
  commitResult,
  finalizeResult,
  heartbeat,
  prepareResult,
  startRun,
} from "../src/run.ts";
import { ownerPid, runRuntime } from "../src/runtime.ts";
import { fixture, report } from "./helpers.ts";

it("rejects missing owners, gates, dependencies, failed checks and missing commit preparation", async () => {
  const root = await fixture();
  try {
    await expect(startRun(root, "codex", 2147483647)).rejects.toThrow(
      "owner process is missing",
    );
    const path = ".voidra/actions/act-000000/action.md",
      doc = parseRecord(path, await readFile(join(root, path)));
    await writeFile(
      join(root, path),
      serializeRecord(doc, { ...doc.data, stage: "review", status: "waiting" }),
    );
    await expect(startRun(root, "codex", process.pid)).rejects.toThrow(/gate/);
    const other = ".voidra/actions/act-000001/action.md";
    await mkdir(join(root, ".voidra/actions/act-000001"), { recursive: true });
    await writeFile(
      join(root, other),
      serializeRecord(parseRecord(other, "---\n{}\n---\n"), {
        ...doc.data,
        id: "act-000001",
      }),
    );
    await writeFile(
      join(root, path),
      serializeRecord(doc, { ...doc.data, blockedBy: ["act-000001"] }),
    );
    await expect(startRun(root, "codex", process.pid)).rejects.toThrow(
      "blocked",
    );
    await writeFile(
      join(root, other),
      serializeRecord(parseRecord(other, await readFile(join(root, other))), {
        ...doc.data,
        id: "act-000001",
        stage: "done",
        status: "complete",
      }),
    );
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Expected run");
    await expect(
      prepareResult(root, ctx.ownerToken, {
        ...report,
        checks: [{ name: "Failed check", passed: false }],
      }),
    ).rejects.toThrow("Failed checks");
    await expect(commitResult(root, ctx.ownerToken, "Docs")).rejects.toThrow(
      "Prepare",
    );
    await expect(finalizeResult(root, ctx.ownerToken)).rejects.toThrow(
      "reconciliation",
    );
    await rm(join(root, ".voidra/local/run.lock"));
    await expect(heartbeat(root, ctx.ownerToken)).rejects.toThrow(
      "lock was lost",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("refuses invalid planning, non-repositories, symlinks, repeated preparation and changed HEAD", async () => {
  const root = await fixture();
  try {
    const path = join(root, ".voidra/actions/act-000000/action.md"),
      old = await readFile(path);
    await writeFile(path, "broken");
    await expect(startRun(root, "codex", process.pid)).rejects.toThrow(
      "validation",
    );
    await writeFile(path, old);
    await rm(join(root, ".git"), { recursive: true });
    await expect(startRun(root, "codex", process.pid)).rejects.toThrow(
      "Git repository",
    );
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Voidra Verification"], {
      cwd: root,
    });
    execFileSync("git", ["config", "user.email", "verification@example.test"], {
      cwd: root,
    });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["commit", "-qm", "Initial"], { cwd: root });
    const ctx = await startRun(root, "codex", process.pid);
    if (!ctx) throw new Error("Expected run");
    await symlink(join(root, "README.md"), join(root, "linked.md"));
    await expect(
      prepareResult(root, ctx.ownerToken, { ...report, paths: ["linked.md"] }),
    ).rejects.toThrow("symlinks");
    await prepareResult(root, ctx.ownerToken, report);
    await expect(prepareResult(root, ctx.ownerToken, report)).rejects.toThrow(
      "already prepared",
    );
    execFileSync("git", ["commit", "--allow-empty", "-qm", "Outside commit"], {
      cwd: root,
    });
    await expect(commitResult(root, ctx.ownerToken, "Docs")).rejects.toThrow(
      "HEAD changed",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("walks real process ancestry and supports a detected owner or an explicit detection failure", async () => {
  const result = await ownerPid().catch((error) => error);
  if (typeof result === "number") expect(result).toBeGreaterThan(1);
  else expect(String(result)).toContain("identify the agent");
  const root = await fixture();
  try {
    const result = await runRuntime(["start", "--agent", "codex"], root);
    if (result.code === 0) {
      const token = (result.value as { ownerToken: string }).ownerToken;
      expect(
        (
          await runRuntime(
            ["fail", "--token", token, "--summary", "Stopped test"],
            root,
          )
        ).code,
      ).toBe(0);
    } else expect(JSON.stringify(result.value)).toContain("identify the agent");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
