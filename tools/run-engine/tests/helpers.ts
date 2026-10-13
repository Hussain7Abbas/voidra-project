import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type Action, lifecycles, parseRecord, serializeRecord } from "voidra";
export async function fixture(type: Action["type"] = "docs") {
  const root = await mkdtemp(join(tmpdir(), "voidra-run-"));
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const path = ".voidra/actions/act-000000/action.md",
    old = parseRecord(path, await readFile(join(root, path)));
  await writeFile(
    join(root, path),
    serializeRecord(
      old,
      {
        id: "act-000000",
        type,
        title: "Document installation",
        stage: lifecycles[type].stages[0],
        status: "ready",
        doneBy: "agent",
      },
      "Add an installation sentence to README.md.\n",
    ),
  );
  await writeFile(join(root, "README.md"), "# Fixture\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Voidra Verification"], {
    cwd: root,
  });
  execFileSync("git", ["config", "user.email", "verification@example.test"], {
    cwd: root,
  });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "Initial fixture"], { cwd: root });
  await mkdir(join(root, ".voidra/local"), { recursive: true });
  const queue = ".voidra/local/pending-actions.md";
  await writeFile(
    join(root, queue),
    serializeRecord(
      parseRecord(queue, "---\n{}\n---\n"),
      { queuedBy: "Test", queuedAt: new Date().toISOString() },
      "1. [ ] act-000000\n",
    ),
  );
  return root;
}
export const report = {
  summary: "Documented installation.",
  paths: ["README.md"],
  checks: [{ name: "Documentation reviewed", passed: true }],
};
