import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { checkProject, hash, parseRecord, serializeRecord } from "voidra";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("onboards through the checked bridge, confirms an inference and creates a Profile change draft", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-profile-")),
    root = join(temp, "project");
  await mkdir(root);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (p): p is [string, string] =>
        p[1] !== undefined && p[0] !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  const app = await _electron.launch({
    args: [resolve("apps/desktop"), `--project=${root}`],
    env: {
      ...env,
      VOIDRA_DATA_DIR: join(temp, "data"),
      ...(nativeCoverageDirectory
        ? { NODE_V8_COVERAGE: nativeCoverageDirectory }
        : {}),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-app-ready="true"]').waitFor();
    const before = await page.evaluate(async () =>
      window.voidra.invoke({ command: "workspace" }),
    );
    expect(
      before.ok && before.data.kind === "workspace"
        ? before.data.workspace
        : null,
    ).toMatchObject({
      hasCode: false,
      templates: [expect.objectContaining({ id: "general" })],
    });
    const created = await page.evaluate(async () =>
      window.voidra.invoke({
        command: "initialize-profile",
        template: "general",
        name: "Profile test",
        answers: { "problem.goal": "Original goal" },
      } as never),
    );
    expect(created.ok).toBe(true);
    expect((await checkProject(root)).diagnostics).toEqual([]);
    const path = ".voidra/profile/problem.md",
      original = await readFile(join(root, path)),
      doc = parseRecord(path, original);
    await writeFile(
      join(root, path),
      serializeRecord(doc, {
        ...doc.data,
        answers: [
          {
            id: "goal",
            question: "What should this project make possible?",
            answer: "Inferred goal",
            status: "inferred",
            source: "README.md:1",
          },
        ],
      }),
    );
    const revision = hash(await readFile(join(root, path)));
    const confirm = await page.evaluate(
      async (revision) =>
        window.voidra.invoke({
          command: "edit-profile-answer",
          block: "problem",
          id: "goal",
          value: "Inferred goal",
          revision,
        } as never),
      revision,
    );
    expect(confirm.ok).toBe(true);
    const current = hash(await readFile(join(root, path)));
    const edit = await page.evaluate(
      async (revision) =>
        window.voidra.invoke({
          command: "edit-profile-answer",
          block: "problem",
          id: "goal",
          value: "Revised goal",
          revision,
        } as never),
      current,
    );
    expect(edit.ok).toBe(true);
    const checked = await checkProject(root),
      drafts = [...checked.records.values()].filter(
        (r) => r.kind === "action" && r.document.data.type === "profile-change",
      );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.document.data.status).toBe("draft");
    const stale = await page.evaluate(
      async (revision) =>
        window.voidra.invoke({
          command: "edit-profile-answer",
          block: "problem",
          id: "goal",
          value: "Stale",
          revision,
        } as never),
      current,
    );
    expect(stale.ok).toBe(false);
    await writeFile(join(root, "package.json"), "{}");
    await rm(join(root, ".voidra"), { recursive: true, force: true });
    const existing = await page.evaluate(async () =>
      window.voidra.invoke({ command: "workspace" }),
    );
    expect(
      existing.ok && existing.data.kind === "workspace"
        ? existing.data.workspace
        : null,
    ).toMatchObject({ hasCode: true, codeEvidence: ["package.json"] });
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
