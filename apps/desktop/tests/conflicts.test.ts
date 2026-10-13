import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import type { BridgeRequest, BridgeResponse } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("shows conflicted records and permits only unrelated edits through the real service", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-conflict-service-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/conflicted/project"), root, { recursive: true });
  const path = ".voidra/actions/act-000000/action.md",
    bytes = await readFile(join(root, path));
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
    const invoke = (request: BridgeRequest): Promise<BridgeResponse> =>
      page.evaluate(
        (raw: string) => window.voidra.invoke(JSON.parse(raw) as never),
        JSON.stringify(request),
      );
    const snapshot = await invoke({ command: "workspace" });
    if (!snapshot.ok || snapshot.data.kind !== "workspace")
      throw new Error("Missing snapshot");
    expect(snapshot.data.workspace.readOnly).toBe(false);
    const conflict = snapshot.data.workspace.actions.find(
      (a) => a.data.id === "act-000000",
    );
    expect(conflict?.data.status).toBe("conflicted");
    expect(conflict?.queueable).toBe(false);
    expect(
      (
        await invoke({
          command: "create-action",
          type: "docs",
          title: "Separate action",
          description: "An unrelated edit",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await invoke({
          command: "edit-action",
          id: "act-000000",
          revision: conflict?.editRevision ?? "",
          title: "Overwrite",
          description: "Must refuse",
        })
      ).ok,
    ).toBe(false);
    expect(await readFile(join(root, path))).toEqual(bytes);
    await page
      .getByRole("button", { name: "Conflicted act-000000", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Conflicted planning files", exact: true })
      .waitFor();
    expect(
      await page
        .getByRole("button", { name: "Queue for agent", exact: true })
        .isDisabled(),
    ).toBe(true);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
