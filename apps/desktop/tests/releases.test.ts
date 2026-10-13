import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import {
  checkProject,
  createReleaseAction,
  parseRecord,
  serializeRecord,
} from "voidra";
import type { BridgeRequest, BridgeResponse } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("creates and replays a release through the real validated bridge without changing completed work", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-release-service-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const path = ".voidra/actions/act-000000/action.md",
    old = parseRecord(path, await readFile(join(root, path)));
  await writeFile(
    join(root, path),
    serializeRecord(
      old,
      {
        id: "act-000000",
        title: "Completed docs",
        type: "docs",
        stage: "done",
        status: "complete",
        doneBy: "agent",
      },
      "Completed documentation.\n",
    ),
  );
  const member = await readFile(join(root, path));
  const otherPath = ".voidra/actions/act-000001/action.md";
  await mkdir(join(root, ".voidra/actions/act-000001"), { recursive: true });
  await writeFile(
    join(root, otherPath),
    serializeRecord(
      parseRecord(otherPath, "---\n{}\n---\n"),
      {
        id: "act-000001",
        title: "Other completed work",
        type: "docs",
        stage: "done",
        status: "complete",
        doneBy: "agent",
      },
      "Other work.\n",
    ),
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] =>
        pair[1] !== undefined && pair[0] !== "ELECTRON_RUN_AS_NODE",
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
    const invoke = (request: BridgeRequest): Promise<BridgeResponse> =>
      page.evaluate(
        (raw) => window.voidra.invoke(JSON.parse(raw)),
        JSON.stringify(request),
      );
    const before = await invoke({ command: "workspace" });
    if (!before.ok || before.data.kind !== "workspace")
      throw new Error("Workspace missing");
    expect(before.data.workspace.releaseCandidates).toHaveLength(2);
    const created = await invoke({
      command: "create-release",
      actions: before.data.workspace.releaseCandidates
        .filter((candidate) => candidate.id === "act-000000")
        .map(({ id, revision }) => ({ id, revision })),
    });
    if (!created.ok || created.data.kind !== "workspace")
      throw new Error(JSON.stringify(created));
    const release = created.data.workspace.actions.find(
      (action) => action.data.type === "release",
    );
    expect(release?.data).toMatchObject({
      stage: "plan",
      status: "ready",
      releaseActions: ["act-000000"],
    });
    expect(created.data.workspace.releaseCandidates).toHaveLength(1);
    expect(created.data.workspace.editing.undo.label).toBe("Create release");
    const revision = created.data.workspace.editing.undo.revision;
    if (!revision) throw new Error("Undo revision missing");
    const other = await createReleaseAction(root, {
      actions: created.data.workspace.releaseCandidates.map(
        ({ id, revision }) => ({ id, revision }),
      ),
      by: "Outside actor",
    });
    const undone = await invoke({ command: "undo", revision });
    if (!undone.ok || undone.data.kind !== "workspace")
      throw new Error(JSON.stringify(undone));
    expect(
      undone.data.workspace.actions.some(
        (action) => action.data.id === release?.data.id,
      ),
    ).toBe(false);
    expect(undone.data.workspace.releaseCandidates).toHaveLength(1);
    expect(
      undone.data.workspace.actions.some((action) => action.data.id === other),
    ).toBe(true);
    const redo = undone.data.workspace.editing.redo.revision;
    if (!redo) throw new Error("Redo revision missing");
    const redone = await invoke({ command: "redo", revision: redo });
    if (!redone.ok || redone.data.kind !== "workspace")
      throw new Error(JSON.stringify(redone));
    expect(
      redone.data.workspace.actions.find(
        (action) => action.data.id === release?.data.id,
      )?.data.stage,
    ).toBe("plan");
    expect(await readFile(join(root, path))).toEqual(member);
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
