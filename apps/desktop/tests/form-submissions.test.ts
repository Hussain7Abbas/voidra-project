import { randomUUID } from "node:crypto";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  applyOperation,
  createAction,
  hash,
  type OperationObserver,
  withOperationObserver,
} from "voidra";
import { FormSubmissions } from "../src/project-service/form-submissions.ts";

it("deduplicates concurrent and lost-acknowledgement creation through restart outside disposable indexes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-submission-")),
    root = join(temp, "project"),
    directory = join(temp, "private"),
    id = randomUUID(),
    request = {
      title: "One ticket",
      description: "**exact**\r\n",
      type: "docs" as const,
      by: "You",
    };
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  try {
    let creates = 0;
    const store = new FormSubmissions(root, directory);
    const edit = (observer: OperationObserver) =>
      withOperationObserver(root, observer, async () => {
        creates++;
        await createAction(root, request);
        return "created";
      });
    expect(
      await Promise.all([
        store.perform(id, request, edit, async () => "existing"),
        store.perform(id, request, edit, async () => "existing"),
      ]),
    ).toEqual(["created", "existing"]);
    expect(creates).toBe(1);
    expect(
      await new FormSubmissions(root, directory).perform(
        id,
        request,
        edit,
        async () => "existing",
      ),
    ).toBe("existing");
    expect(creates).toBe(1);
    await expect(
      store.perform(
        id,
        { ...request, title: "Different" },
        edit,
        async () => "existing",
      ),
    ).rejects.toThrow(/different values/);
    const next = randomUUID();
    await expect(
      store.perform(
        next,
        request,
        async (observer) =>
          withOperationObserver(
            root,
            {
              prepared: observer.prepared,
              committed: async (operation) => {
                await observer.committed(operation);
                throw Error("Lost reply");
              },
            },
            async () => {
              creates++;
              await createAction(root, { ...request, title: "Second" });
              return "created";
            },
          ),
        async () => "existing",
      ),
    ).rejects.toThrow(/Lost reply/);
    expect(
      await new FormSubmissions(root, directory).perform(
        next,
        request,
        edit,
        async () => "existing",
      ),
    ).toBe("existing");
    expect(creates).toBe(2);
    const files = await readdir(directory);
    expect(files).toHaveLength(2);
    for (const file of files)
      expect(await readFile(join(directory, file), "utf8")).not.toContain(
        "One ticket",
      );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it("recovers prepared private receipts using durable writer state and refuses corruption or uncertain edits", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-submission-recovery-")),
    root = join(temp, "project"),
    directory = join(temp, "private"),
    id = randomUUID(),
    request = { intent: "create" };
  await cp(resolve("fixtures/new-project/project"), root, { recursive: true });
  try {
    const path = ".voidra/backlog/idea-999999.md",
      content =
        '---\n{"id":"idea-999999","title":"New","status":"new"}\n---\nBody\n',
      store = new FormSubmissions(root, directory);
    const edit = (observer: OperationObserver) =>
      withOperationObserver(root, observer, async () => {
        await applyOperation(root, {
          changes: [{ path, expectedHash: null, content }],
        });
        return "new";
      });
    await expect(
      store.perform(
        id,
        request,
        async (observer) =>
          edit({
            prepared: async (operation) => {
              await observer.prepared(operation);
              throw Error("Stopped before journal");
            },
            committed: observer.committed,
          }),
        async () => "existing",
      ),
    ).rejects.toThrow(/Stopped/);
    expect(await store.perform(id, request, edit, async () => "existing")).toBe(
      "new",
    );
    const receiptPath = join(directory, `${id}.json`),
      receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    receipt.state = "prepared";
    await writeFile(receiptPath, JSON.stringify(receipt));
    expect(
      await new FormSubmissions(root, directory).perform(
        id,
        request,
        edit,
        async () => "existing",
      ),
    ).toBe("existing");
    const journal = join(
      root,
      `.voidra/local/operations/${receipt.operation}.json`,
    );
    receipt.state = "prepared";
    await writeFile(receiptPath, JSON.stringify(receipt));
    const raw = await readFile(journal, "utf8"),
      operation = JSON.parse(raw);
    operation.state = "prepared";
    await writeFile(journal, JSON.stringify(operation));
    await expect(
      new FormSubmissions(root, directory).perform(
        id,
        request,
        edit,
        async () => "existing",
      ),
    ).rejects.toThrow(/interrupted/);
    await rm(journal);
    await writeFile(join(root, path), "outside edit");
    await expect(
      new FormSubmissions(root, directory).perform(
        id,
        request,
        edit,
        async () => "existing",
      ),
    ).rejects.toThrow(/uncertain/);
    await writeFile(receiptPath, "{broken");
    await expect(
      new FormSubmissions(root, directory).perform(
        id,
        request,
        edit,
        async () => "existing",
      ),
    ).rejects.toThrow(/preserved/);
    expect(hash(await readFile(receiptPath))).toBe(hash("{broken"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
