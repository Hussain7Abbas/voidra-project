import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import type { BridgeRequest, BridgeResponse } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("indexes every knowledge kind from real sources through validated correlated reads", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-knowledge-service-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/busy-project/project"), root, { recursive: true });
  await mkdir(join(root, "docs/adr"), { recursive: true });
  await writeFile(
    join(root, "docs/adr/2026-10-13-storage.md"),
    "# Storage decision\n\nPrivate local files avoid a server.\n",
  );
  await writeFile(
    join(root, "GLOSSARY.md"),
    "# Glossary\n\nAction: A unit of work.\n",
  );
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
        (raw) => window.voidra.invoke(JSON.parse(raw)),
        JSON.stringify(request),
      );
    const search = await invoke({
      command: "search-decisions",
      q: "",
      kind: "all",
      limit: 100,
      offset: 0,
    });
    if (!search.ok || search.data.kind !== "decisions")
      throw new Error("Knowledge response missing");
    expect(new Set(search.data.items.map((e) => e.kind))).toEqual(
      new Set(["question", "profile", "plan", "adr"]),
    );
    expect(
      search.data.items.filter((e) => e.assumed).length,
    ).toBeGreaterThanOrEqual(2);
    const results = await Promise.all([
      invoke({
        command: "search-decisions",
        q: "server",
        kind: "adr",
        limit: 50,
        offset: 0,
      }),
      invoke({ command: "read-document", path: "GLOSSARY.md" }),
    ]);
    expect(
      results[0]?.ok &&
        results[0].data.kind === "decisions" &&
        results[0].data.total,
    ).toBe(1);
    expect(
      results[1]?.ok &&
        results[1].data.kind === "document" &&
        results[1].data.document.body,
    ).toContain("unit of work");
    expect(
      (
        await invoke({
          command: "read-document",
          path: ".voidra/local/run.lock",
        })
      ).ok,
    ).toBe(false);
    expect(
      (await invoke({ command: "read-document", path: "../outside.md" })).ok,
    ).toBe(false);
    await writeFile(
      join(root, "docs/adr/new.md"),
      "# Network boundary\n\nUse a server for collaboration.\n",
    );
    await expect
      .poll(async () => {
        const result = await invoke({
          command: "search-decisions",
          q: "server",
          kind: "adr",
          limit: 50,
          offset: 0,
        });
        return result.ok && result.data.kind === "decisions"
          ? result.data.total
          : 0;
      })
      .toBe(2);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true });
  }
});
