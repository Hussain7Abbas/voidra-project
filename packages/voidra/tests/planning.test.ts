import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { minimalFiles } from "../scripts/fixtures.ts";
import {
  checkProject,
  createAction,
  createIdea,
  editAction,
  editIdea,
  hash,
  lifecycles,
  PACKAGE_VERSION,
  parseRecord,
  promoteIdea,
  serializeRecord,
  setHumanStep,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("creates and edits ideas through all manual statuses, requires rejection reasons and preserves outside edits and unknown fields", async () => {
  const root = await materialize(minimalFiles());
  try {
    const id = await createIdea(root, {
      title: "Export notes",
      description: "Export notes as readable text.",
      by: "You",
    });
    const path = `.voidra/backlog/${id}.md`;
    for (const status of ["needs-info", "ready", "rejected", "new"] as const) {
      const old = await readFile(join(root, path));
      await editIdea(root, {
        id,
        revision: hash(old),
        title: "Export private notes",
        description: "Keep ownership restrictions.",
        status,
        reason:
          status === "rejected" ? "Already supported by the CLI" : undefined,
      });
      const record = parseRecord(path, await readFile(join(root, path)));
      expect(record.data.status).toBe(status);
      expect(record.body).toBe("Keep ownership restrictions.");
    }
    const old = await readFile(join(root, path));
    await expect(
      editIdea(root, {
        id,
        revision: hash(old),
        title: "Export",
        description: "Details",
        status: "rejected",
      }),
    ).rejects.toThrow(/reason/i);
    await writeFile(
      join(root, path),
      serializeRecord(parseRecord(path, old), {
        ...parseRecord(path, old).data,
        custom: "preserved",
      }),
    );
    await expect(
      editIdea(root, {
        id,
        revision: hash(old),
        title: "Export",
        description: "Details",
        status: "ready",
      }),
    ).rejects.toThrow(/changed|hash/i);
    const current = await readFile(join(root, path));
    await editIdea(root, {
      id,
      revision: hash(current),
      title: "Export",
      description: "Details",
      status: "ready",
    });
    expect(
      parseRecord(path, await readFile(join(root, path))).data.custom,
    ).toBe("preserved");
    await expect(
      createIdea(root, { title: " ", description: "Text", by: "You" }),
    ).rejects.toThrow();
    await expect(
      editIdea(root, {
        id: "../escape",
        revision: hash(current),
        title: "Export",
        description: "Details",
        status: "ready",
      }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses dependency/parent cycles and completes aggregate parents only after every child is completed", async () => {
  const root = await materialize(minimalFiles());
  try {
    const parent = await createAction(root, {
      type: "feature",
      title: "Provision publishing",
      description: "Complete the publishing setup slices.",
      by: "You",
    });
    const child = await createAction(root, {
      type: "docs",
      title: "Create account",
      description: "Create the provider account.",
      by: "You",
      doneBy: "you",
      steps: ["Create account"],
    });
    const other = await createAction(root, {
      type: "docs",
      title: "Configure access",
      description: "Finish account permissions.",
      by: "You",
      doneBy: "you",
      steps: ["Confirm access"],
    });
    const revision = async (id: string) =>
      hash(await readFile(join(root, `.voidra/actions/${id}/action.md`)));
    await editAction(root, {
      id: child,
      revision: await revision(child),
      parent,
    });
    await editAction(root, {
      id: other,
      revision: await revision(other),
      parent,
      blockedBy: [child],
    });
    await expect(
      editAction(root, {
        id: child,
        revision: await revision(child),
        blockedBy: [other],
      }),
    ).rejects.toThrow(/cycle/i);
    await expect(
      editAction(root, {
        id: parent,
        revision: await revision(parent),
        parent: child,
      }),
    ).rejects.toThrow(/cycle/i);
    await setHumanStep(root, {
      id: child,
      revision: await revision(child),
      step: "step-1",
      done: true,
    });
    expect(
      (await checkProject(root)).records.get(
        `.voidra/actions/${parent}/action.md`,
      )?.document.data.stage,
    ).toBe("discovery");
    await setHumanStep(root, {
      id: other,
      revision: await revision(other),
      step: "step-1",
      done: true,
    });
    const result = await checkProject(root);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.records.get(`.voidra/actions/${parent}/action.md`)?.document.data,
    ).toMatchObject({
      stage: "done",
      status: "complete",
      completedBySlices: true,
    });
    await expect(
      setHumanStep(root, {
        id: other,
        revision: await revision(other),
        step: "step-1",
        done: false,
      }),
    ).rejects.toThrow(/children|parent/i);
    const agent = await createAction(root, {
      type: "docs",
      title: "Prepare documentation",
      description: "Document publishing.",
      by: "You",
    });
    await expect(
      setHumanStep(root, {
        id: agent,
        revision: await revision(agent),
        step: "step-1",
        done: true,
      }),
    ).rejects.toThrow(/human/i);
    const cancelHuman = await createAction(root, {
      type: "docs",
      title: "No longer needed",
      description: "Optional account setup.",
      by: "You",
      doneBy: "you",
      steps: ["Create account"],
    });
    await editAction(root, {
      id: cancelHuman,
      revision: await revision(cancelHuman),
      cancel: true,
    });
    const cancelled = (await checkProject(root)).records.get(
      `.voidra/actions/${cancelHuman}/action.md`,
    )?.document.data;
    expect(cancelled?.stage).toBe("cancelled");
    expect(cancelled).toMatchObject({ steps: [{ done: false }] });
    await expect(
      setHumanStep(root, {
        id: cancelHuman,
        revision: await revision(cancelHuman),
        step: "step-1",
        done: true,
      }),
    ).rejects.toThrow(/Cancelled/);
    await editAction(root, {
      id: agent,
      revision: await revision(agent),
      cancel: true,
    });
    expect(
      (await checkProject(root)).records.get(
        `.voidra/actions/${agent}/action.md`,
      )?.document.data.stage,
    ).toBe("cancelled");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("creates every action type at its engine-defined first stage and human tasks with explicit steps", async () => {
  const root = await materialize(minimalFiles());
  try {
    for (const type of Object.keys(lifecycles) as (keyof typeof lifecycles)[]) {
      const id = await createAction(root, {
        type,
        title: `New ${type}`,
        description: "One observable outcome.",
        by: "You",
        doneBy: "agent",
      });
      const project = await checkProject(root);
      expect(project.diagnostics).toEqual([]);
      expect(
        project.records.get(`.voidra/actions/${id}/action.md`)?.document.data,
      ).toMatchObject({
        type,
        stage: lifecycles[type].stages[0],
        status: "ready",
        doneBy: "agent",
      });
    }
    const human = await createAction(root, {
      type: "docs",
      title: "Create a service account",
      description: "Follow the provider account steps.",
      by: "You",
      doneBy: "you",
      steps: ["Create the account", "Confirm access"],
    });
    const record = (await checkProject(root)).records.get(
      `.voidra/actions/${human}/action.md`,
    )?.document.data;
    expect(record?.stage).toBeUndefined();
    expect(record?.steps).toHaveLength(2);
    await expect(
      createAction(root, {
        type: "docs",
        title: "Empty steps",
        description: "Account",
        by: "You",
        doneBy: "you",
        steps: [],
      }),
    ).rejects.toThrow(/step/);
    await expect(
      createAction(root, {
        type: "feature",
        title: "Agent with steps",
        description: "Work",
        by: "You",
        doneBy: "agent",
        steps: ["Not an agent stage"],
      }),
    ).rejects.toThrow(/step/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("promotes an idea atomically to a chosen lifecycle with reciprocal links and refuses duplicate or rejected promotions", async () => {
  const root = await materialize(minimalFiles());
  try {
    const id = await createIdea(root, {
      title: "Document export",
      description: "Write an export guide.",
      by: "You",
      status: "ready",
    });
    const path = `.voidra/backlog/${id}.md`,
      old = await readFile(join(root, path));
    const actionId = await promoteIdea(root, {
      id,
      revision: hash(old),
      type: "docs",
      by: "You",
    });
    const project = await checkProject(root);
    expect(project.diagnostics).toEqual([]);
    expect(project.records.get(path)?.document.data).toMatchObject({
      status: "promoted",
      promotedTo: actionId,
    });
    expect(
      project.records.get(`.voidra/actions/${actionId}/action.md`)?.document
        .data,
    ).toMatchObject({
      type: "docs",
      stage: "implement",
      status: "ready",
      links: [id],
    });
    await expect(
      promoteIdea(root, {
        id,
        revision: hash(await readFile(join(root, path))),
        type: "feature",
        by: "You",
      }),
    ).rejects.toThrow(/promoted/);
    const rejected = await createIdea(root, {
      title: "Duplicate",
      description: "Already present.",
      by: "You",
      status: "rejected",
      reason: "Already implemented",
    });
    await expect(
      promoteIdea(root, {
        id: rejected,
        revision: hash(
          await readFile(join(root, `.voidra/backlog/${rejected}.md`)),
        ),
        type: "feature",
        by: "You",
      }),
    ).rejects.toThrow(/rejected/);
    await expect(
      promoteIdea(root, { id, revision: hash(old), type: "docs", by: "You" }),
    ).rejects.toThrow(/changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("retains Backlog assignment and proposed type through editing and promotion with the v1.1 reader contract", async () => {
  const root = await materialize(minimalFiles());
  try {
    const id = await createIdea(root, {
        title: "Assigned idea",
        description: "**Exact**\r\n",
        type: "bug",
        assignee: "Ada <ada@example.test>",
        by: "You",
      }),
      path = `.voidra/backlog/${id}.md`;
    let bytes = await readFile(join(root, path));
    expect(parseRecord(path, bytes).data).toMatchObject({
      assignee: "Ada <ada@example.test>",
      type: "bug",
    });
    expect((await checkProject(root)).metadata?.requiredVoidra).toBe(
      PACKAGE_VERSION,
    );
    const metadata = await readFile(join(root, ".voidra/voidra.json"));
    await writeFile(
      join(root, ".voidra/voidra.json"),
      JSON.stringify({
        ...JSON.parse(metadata.toString()),
        requiredVoidra: "1.0.0",
      }),
    );
    expect((await checkProject(root)).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "minimum-reader" }),
      ]),
    );
    await writeFile(join(root, ".voidra/voidra.json"), metadata);
    await editIdea(root, {
      id,
      revision: hash(bytes),
      title: "Assigned idea edited",
      description: "Kept",
      status: "ready",
    });
    bytes = await readFile(join(root, path));
    const action = await promoteIdea(root, {
      id,
      revision: hash(bytes),
      type: "bug",
      by: "You",
    });
    expect(
      parseRecord(
        `.voidra/actions/${action}/action.md`,
        await readFile(join(root, `.voidra/actions/${action}/action.md`)),
      ).data.assignee,
    ).toBe("Ada <ada@example.test>");
    expect((await checkProject(root)).diagnostics).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
