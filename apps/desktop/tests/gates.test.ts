import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron } from "@playwright/test";
import { expect, it } from "vitest";
import { checkProject, createAction, planFiles } from "voidra";
import { publishFakeGate } from "../../../tools/fake-agent/src/gates.ts";
import type { BridgeRequest, BridgeResponse } from "../src/shared/bridge.ts";
import { nativeCoverageDirectory } from "./coverage-setup.ts";

it("answers, changes plans, checks exact revisions and reviews all types through the real service boundary", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-gate-service-")),
    root = join(temp, "project");
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  const id = await createAction(root, {
    type: "feature",
    title: "Export",
    description: "Private export",
    by: "You",
  });
  await publishFakeGate(root, id, "questions");
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
    const invoke = async (request: BridgeRequest): Promise<BridgeResponse> =>
      page.evaluate(
        (raw: string) => window.voidra.invoke(JSON.parse(raw) as never),
        JSON.stringify(request),
      );
    async function snapshot() {
      const response = await invoke({ command: "workspace" });
      if (!response.ok || response.data.kind !== "workspace")
        throw new Error("Missing workspace");
      return response.data.workspace;
    }
    const first = (await snapshot()).actions.find(
        (a) => a.data.id === id,
      )?.questions,
      q = first?.rounds[0]?.questions[0];
    if (!q || !first) throw new Error("Missing questions");
    expect(
      (
        await invoke({
          command: "answer-question",
          id,
          question: q.id,
          revision: first.revision,
          answer: { kind: "text", text: "Only the owner" },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await invoke({
          command: "answer-question",
          id,
          question: q.id,
          revision: first.revision,
          answer: { kind: "choice", choice: "b" },
        })
      ).ok,
    ).toBe(false);
    await publishFakeGate(root, id, "plan");
    let action = (await snapshot()).actions.find((a) => a.data.id === id);
    if (!action?.planRevision) throw new Error("Missing plan");
    expect(
      (
        await invoke({
          command: "reject-plan",
          id,
          revision: action.planRevision ?? "",
          feedback: "Clarify output",
        })
      ).ok,
    ).toBe(true);
    await publishFakeGate(root, id, "plan");
    action = (await snapshot()).actions.find((a) => a.data.id === id);
    if (!action?.planRevision) throw new Error("Missing plan");
    expect(
      (
        await invoke({
          command: "approve-plan",
          id,
          revision: action.planRevision ?? "",
        })
      ).ok,
    ).toBe(true);
    for (const file of planFiles) {
      const path = join(root, `.voidra/actions/${id}/${file}`);
      await writeFile(path, `${await readFile(path, "utf8")} \n`);
      const current = (await snapshot()).actions.find((a) => a.data.id === id);
      expect(current?.changedPlans).toEqual([file]);
      expect(current?.effectiveStage).toBe("plan");
      expect(
        (
          await invoke({
            command: "approve-plan",
            id,
            revision: action.planRevision ?? "",
          })
        ).ok,
      ).toBe(false);
      if (!current?.planRevision) throw new Error("Missing changed plan");
      expect(
        (
          await invoke({
            command: "approve-plan",
            id,
            revision: current.planRevision,
          })
        ).ok,
      ).toBe(true);
      action = current;
    }
    for (const type of ["feature", "research", "release"] as const) {
      const actionId =
        type === "feature"
          ? id
          : await createAction(root, {
              type,
              title: type,
              description: "Review",
              by: "You",
            });
      if (type === "release") await publishFakeGate(root, actionId, "plan");
      await publishFakeGate(root, actionId, "review");
      let current = (await snapshot()).actions.find(
        (a) => a.data.id === actionId,
      );
      if (!current) throw new Error("Missing review");
      expect(
        (
          await invoke({
            command: "review-action",
            id: actionId,
            revision: current.revision,
            decision: "rejected",
            feedback: "Clarify outcome",
          })
        ).ok,
      ).toBe(true);
      await publishFakeGate(root, actionId, "review");
      current = (await snapshot()).actions.find((a) => a.data.id === actionId);
      if (!current) throw new Error("Missing review");
      expect(
        (
          await invoke({
            command: "review-action",
            id: actionId,
            revision: current.revision,
            decision: "accepted",
            feedback: "",
          })
        ).ok,
      ).toBe(true);
      if (type === "release")
        expect(
          (await invoke({ command: "queue-action", id: actionId })).ok,
        ).toBe(true);
    }
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await app.close();
    await rm(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}, 60000);
