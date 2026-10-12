import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { hash } from "../src/lifecycle.ts";
import { checkProject } from "../src/project.ts";
import { applyOperation, recoverOperation } from "../src/writer.ts";
import { materialize } from "./helpers.ts";

const manifest = {
  id: "op-000000",
  changes: [
    {
      path: ".voidra/README.md",
      expectedHash: hash("# Guide\n"),
      content: "# New guide\n",
    },
    {
      path: ".voidra/profile/goal.md",
      expectedHash: null,
      content: "---\nblock: goal\ntitle: Goal\nanswers: []\n---\nNotes\n",
    },
  ],
};
it("commits a validated group and retains an idempotent receipt", async () => {
  const root = await materialize();
  expect((await applyOperation(root, manifest)).state).toBe("committed");
  expect((await checkProject(root)).diagnostics).toEqual([]);
  expect((await applyOperation(root, manifest)).alreadyCompleted).toBe(true);
  expect((await recoverOperation(root, "op-000000")).alreadyCompleted).toBe(
    true,
  );
  await expect(
    applyOperation(root, {
      ...manifest,
      changes: [
        {
          path: ".voidra/README.md",
          expectedHash: hash("# Guide\n"),
          content: "different",
        },
      ],
    }),
  ).rejects.toThrow(/different/);
});
for (const point of [
  "temp-written",
  "temp-flushed",
  "before-rename",
  "after-rename",
  "change-applied",
  "before-commit",
]) {
  it(`recovers after interruption at ${point}`, async () => {
    const root = await materialize();
    let hit = false;
    await expect(
      applyOperation(root, manifest, {
        checkpoint: async (p, file) => {
          if (
            !hit &&
            p === point &&
            (file === ".voidra/README.md" || p === "before-commit")
          ) {
            hit = true;
            throw new Error("interrupted");
          }
        },
      }),
    ).rejects.toThrow("interrupted");
    expect(hit).toBe(true);
    expect((await checkProject(root)).diagnostics.map((d) => d.code)).toContain(
      "incomplete-operation",
    );
    expect((await recoverOperation(root, "op-000000")).state).toBe("committed");
    expect((await recoverOperation(root, "op-000000")).alreadyCompleted).toBe(
      true,
    );
    expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
      "# New guide\n",
    );
  });
}
it("rolls back a partial group, refuses opposite replay and protects outside edits", async () => {
  const root = await materialize();
  await expect(
    applyOperation(root, manifest, {
      checkpoint: async (p) => {
        if (p === "change-applied") throw new Error("interrupted");
      },
    }),
  ).rejects.toThrow();
  await mkdir(join(root, ".voidra/profile"), { recursive: true });
  await writeFile(join(root, ".voidra/profile/goal.md"), "outside edit");
  await expect(recoverOperation(root, "op-000000")).rejects.toThrow(/conflict/);
  expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
    "# New guide\n",
  );
  await writeFile(
    join(root, ".voidra/profile/goal.md"),
    manifest.changes[1]?.content ?? "",
  );
  expect(
    (await recoverOperation(root, "op-000000", { rollback: true })).state,
  ).toBe("rolled-back");
  expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
    "# Guide\n",
  );
  await expect(
    readFile(join(root, ".voidra/profile/goal.md")),
  ).rejects.toThrow();
  expect(
    (await recoverOperation(root, "op-000000", { rollback: true }))
      .alreadyCompleted,
  ).toBe(true);
  await expect(recoverOperation(root, "op-000000")).rejects.toThrow(
    /rolled-back/,
  );
});
it("rejects stale hashes, invalid overlays, protected paths and symlink escapes", async () => {
  const root = await materialize();
  await expect(
    applyOperation(root, {
      changes: [
        { path: ".voidra/README.md", expectedHash: null, content: "x" },
      ],
    }),
  ).rejects.toThrow(/hash conflict/);
  await expect(
    applyOperation(root, {
      changes: [
        {
          path: ".voidra/README.md",
          expectedHash: hash("# Guide\n"),
          content: null,
        },
      ],
    }),
  ).rejects.toThrow(/invalid/);
  for (const path of [
    "../outside",
    ".voidra/../source.ts",
    "/absolute",
    "source.ts",
    ".voidra/local/writer.lock",
    ".voidra/local/operations/op-000001.json",
  ]) {
    await expect(
      applyOperation(root, {
        changes: [{ path, expectedHash: null, content: "x" }],
      }),
    ).rejects.toThrow(/path|reserved/);
  }
  await symlink(root, join(root, ".voidra/escape"));
  await expect(
    applyOperation(root, {
      changes: [
        { path: ".voidra/escape/outside", expectedHash: null, content: "x" },
      ],
    }),
  ).rejects.toThrow(/symlink/);
});
it("allows only the explicit root glossary exception", async () => {
  const root = await materialize();
  const edit = {
    changes: [
      { path: "GLOSSARY.md", expectedHash: null, content: "# Terms\n" },
    ],
  };
  await expect(applyOperation(root, edit)).rejects.toThrow(/path/);
  await applyOperation(root, edit, { allowGlossary: true });
  expect(await readFile(join(root, "GLOSSARY.md"), "utf8")).toBe("# Terms\n");
});
it("serializes writers, recovers only a dead lock owner, and validates journal identity", async () => {
  const root = await materialize();
  await mkdir(join(root, ".voidra/local"), { recursive: true });
  await writeFile(
    join(root, ".voidra/local/writer.lock"),
    JSON.stringify({ pid: process.pid, token: "busy" }),
  );
  await expect(applyOperation(root, manifest)).rejects.toThrow(/writer lock/);
  await expect(recoverOperation(root, "op-000000")).rejects.toThrow(/live/);
  await writeFile(
    join(root, ".voidra/local/writer.lock"),
    JSON.stringify({ pid: 2147483647, token: "dead" }),
  );
  await expect(recoverOperation(root, "op-000000")).rejects.toThrow(/journal/);
  await expect(recoverOperation(root, "../escape")).rejects.toThrow(/ID/);
});
it("checks expected hashes again immediately before replacement", async () => {
  const root = await materialize();
  await expect(
    applyOperation(root, manifest, {
      checkpoint: async (p, file) => {
        if (p === "before-rename" && file === ".voidra/README.md")
          await writeFile(join(root, file), "outside");
      },
    }),
  ).rejects.toThrow(/hash conflict/);
  expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
    "outside",
  );
});

for (const point of [
  "lock-acquired",
  "validated",
  "journal-prepared",
  "preflight",
  "committed",
]) {
  it(`supports retries after interruption at ${point}`, async () => {
    const root = await materialize();
    await expect(
      applyOperation(root, manifest, {
        checkpoint: async (p) => {
          if (p === point) throw new Error("stop");
        },
      }),
    ).rejects.toThrow("stop");
    if (point === "lock-acquired" || point === "validated")
      expect((await applyOperation(root, manifest)).state).toBe("committed");
    else
      expect((await recoverOperation(root, "op-000000")).state).toBe(
        "committed",
      );
  });
}
for (const point of [
  "temp-written",
  "temp-flushed",
  "before-rename",
  "after-rename",
  "change-applied",
]) {
  it(`recovers a second-record interruption at ${point}`, async () => {
    const root = await materialize();
    await expect(
      applyOperation(root, manifest, {
        checkpoint: async (p, file) => {
          if (p === point && file === ".voidra/profile/goal.md")
            throw new Error("stop");
        },
      }),
    ).rejects.toThrow("stop");
    expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
      "# New guide\n",
    );
    await recoverOperation(root, "op-000000");
    expect((await checkProject(root)).diagnostics).toEqual([]);
  });
}
it("never overwrites an edit made after recovery preflight", async () => {
  const root = await materialize();
  await expect(
    applyOperation(root, manifest, {
      checkpoint: async (p) => {
        if (p === "journal-prepared") throw new Error("stop");
      },
    }),
  ).rejects.toThrow();
  await expect(
    recoverOperation(root, "op-000000", {
      checkpoint: async (p) => {
        if (p === "preflight")
          await writeFile(
            join(root, ".voidra/README.md"),
            "outside after preflight",
          );
      },
    }),
  ).rejects.toThrow(/conflict/);
  expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
    "outside after preflight",
  );
});

for (const occurrence of [1, 2])
  for (const point of [
    "temp-written",
    "temp-flushed",
    "before-rename",
    "after-rename",
  ]) {
    it(`recovers journal replacement ${occurrence} at ${point}`, async () => {
      const root = await materialize();
      let seen = 0;
      await expect(
        applyOperation(root, manifest, {
          checkpoint: async (p, file) => {
            if (
              p === point &&
              file.endsWith("op-000000.json") &&
              ++seen === occurrence
            )
              throw new Error("stop");
          },
        }),
      ).rejects.toThrow("stop");
      if (occurrence === 1 && point !== "after-rename")
        await applyOperation(root, manifest);
      else await recoverOperation(root, "op-000000");
      expect((await checkProject(root)).diagnostics).toEqual([]);
    });
  }
it("preserves the original after an actual failed rename", async () => {
  const { readdir, unlink } = await import("node:fs/promises");
  const root = await materialize();
  await expect(
    applyOperation(root, manifest, {
      checkpoint: async (p, file) => {
        if (p === "before-rename" && file === ".voidra/README.md") {
          for (const name of await readdir(join(root, ".voidra")))
            if (name.startsWith(".voidra-tmp-"))
              await unlink(join(root, ".voidra", name));
        }
      },
    }),
  ).rejects.toThrow(/ENOENT/);
  expect(await readFile(join(root, ".voidra/README.md"), "utf8")).toBe(
    "# Guide\n",
  );
  await recoverOperation(root, "op-000000");
});
it("recovers a killed process and its persisted owner lock", async () => {
  const { spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const root = await materialize();
  const script = `import {applyOperation} from ${JSON.stringify(pathToFileURL(resolve("packages/voidra/src/writer.ts")).href)}; await applyOperation(process.argv[1],JSON.parse(process.argv[2]),{checkpoint:(point)=>{if(point==='change-applied')process.kill(process.pid,'SIGKILL')}});`;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script, root, JSON.stringify(manifest)],
    { encoding: "utf8" },
  );
  expect(child.signal, child.stderr).toBe("SIGKILL");
  expect((await checkProject(root)).diagnostics.map((d) => d.code)).toContain(
    "incomplete-operation",
  );
  await recoverOperation(root, "op-000000");
  expect((await checkProject(root)).diagnostics).toEqual([]);
});
it("deletes optional records atomically and can roll back their deletion", async () => {
  const root = await materialize();
  await writeFile(join(root, ".voidra/note.txt"), "before");
  const deletion = {
    id: "op-111111",
    changes: [
      { path: ".voidra/note.txt", expectedHash: hash("before"), content: null },
    ],
  };
  await expect(
    applyOperation(root, deletion, {
      checkpoint: async (point, path) => {
        if (point === "after-rename" && path === ".voidra/note.txt")
          throw new Error("stop");
      },
    }),
  ).rejects.toThrow();
  await expect(readFile(join(root, ".voidra/note.txt"))).rejects.toThrow();
  await recoverOperation(root, "op-111111", { rollback: true });
  expect(await readFile(join(root, ".voidra/note.txt"), "utf8")).toBe("before");
});
