import { cp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  applyOperation,
  checkProject,
  createAction,
  createIdea,
  editAction,
  hash,
} from "../src/index.ts";
import { materialize } from "./helpers.ts";

it("keeps conflicted records untouched while allowing unrelated planning edits", async () => {
  const root = await materialize(new Map());
  await cp(
    resolve("fixtures/conflicted/project/.voidra"),
    join(root, ".voidra"),
    { recursive: true },
  );
  const path = ".voidra/actions/act-000000/action.md",
    before = await readFile(join(root, path));
  const id = await createAction(root, {
    type: "docs",
    title: "Separate documentation",
    description: "An unrelated edit",
    by: "You",
  });
  await createIdea(root, {
    title: "Another idea",
    description: "Independent planning",
    by: "You",
  });
  const current = await checkProject(root),
    action = current.records.get(`.voidra/actions/${id}/action.md`);
  if (!action) throw new Error("Missing action");
  await editAction(root, {
    id,
    revision: hash(action.document.raw),
    title: "Revised documentation",
    description: "Still unrelated",
  });
  expect(await readFile(join(root, path))).toEqual(before);
  expect(
    (await checkProject(root)).diagnostics.some(
      (d) => d.code === "conflict" && d.file === path,
    ),
  ).toBe(true);
  await expect(
    applyOperation(root, {
      changes: [
        {
          path,
          expectedHash: hash(before),
          content: before
            .toString()
            .replace(
              /<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n/,
              "Resolved by app\n",
            ),
        },
      ],
    }),
  ).rejects.toThrow(/conflict/i);
  expect(await readFile(join(root, path))).toEqual(before);
});

it("rejects new references to a conflicted record and newly arriving conflict markers during a write", async () => {
  const root = await materialize();
  const path = ".voidra/actions/act-000000/action.md",
    original = await readFile(join(root, path));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    join(root, path),
    `${original.toString()}\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n`,
  );
  const id = await createAction(root, {
    type: "docs",
    title: "Separate action",
    description: "Independent",
    by: "You",
  });
  const action = (await checkProject(root)).records.get(
    `.voidra/actions/${id}/action.md`,
  );
  if (!action) throw new Error("Missing action");
  await expect(
    editAction(root, {
      id,
      revision: hash(action.document.raw),
      title: "Separate action",
      description: "Independent",
      blockedBy: ["act-000000"],
    }),
  ).rejects.toThrow();
  const guide = await readFile(join(root, ".voidra/README.md"));
  await expect(
    applyOperation(
      root,
      {
        changes: [
          {
            path: ".voidra/README.md",
            expectedHash: hash(guide),
            content: "A valid guide\n",
          },
        ],
      },
      {
        checkpoint: async (point) => {
          if (point === "journal-prepared")
            await writeFile(
              join(root, ".voidra/.gitignore"),
              "local/\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n",
            );
        },
      },
    ),
  ).rejects.toThrow();
});
