import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { hash } from "../src/lifecycle.ts";
import { createIdea } from "../src/planning.ts";
import { applyOperation, withOperationObserver } from "../src/writer.ts";
import { materialize } from "./helpers.ts";

it("observes helper writes under the writer lock, with exact snapshots and no unchanged guards", async () => {
  const root = await materialize();
  const seen: string[] = [];
  await withOperationObserver(
    root,
    {
      prepared: async (operation) => {
        expect(
          JSON.parse(
            await readFile(join(root, ".voidra/local/writer.lock"), "utf8"),
          ).pid,
        ).toBe(process.pid);
        expect(operation.state).toBe("prepared");
        expect(operation.changes).toHaveLength(1);
        expect(operation.changes[0]?.before).toBeNull();
        expect(operation.changes[0]?.after).toContain("Observed idea");
        seen.push(operation.id);
      },
      committed: (id) => {
        expect(seen).toContain(id);
        seen.push("committed");
      },
    },
    () =>
      createIdea(root, {
        title: "Observed idea",
        description: "Retain the exact body.",
        by: "You",
      }),
  );
  expect(seen).toHaveLength(2);
  await createIdea(root, {
    title: "Outside context",
    description: "Agent edits are not app history.",
    by: "Agent",
  });
  expect(seen).toHaveLength(2);
});

it("refuses the edit if durable history cannot be prepared, and isolates observer roots", async () => {
  const root = await materialize(),
    other = await materialize();
  const manifest = {
    changes: [
      {
        path: ".voidra/README.md",
        expectedHash: hash("# Guide\n"),
        content: "# Changed\n",
      },
    ],
  };
  await expect(
    withOperationObserver(
      root,
      {
        prepared: () => {
          throw new Error("History unavailable");
        },
        committed: () => {},
      },
      () => applyOperation(root, manifest),
    ),
  ).rejects.toThrow("History unavailable");
  expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
    "# Guide\n",
  );
  await withOperationObserver(
    root,
    {
      prepared: () => {
        throw new Error("Wrong root");
      },
      committed: () => {},
    },
    () => applyOperation(other, manifest),
  );
  expect(await readFile(join(other, ".voidra/README.md"), "utf8")).toBe(
    "# Changed\n",
  );
});
