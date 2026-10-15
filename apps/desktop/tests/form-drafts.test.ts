import { execFileSync, spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { once } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { SecretEncryption } from "../src/main/ai-settings.ts";
import { DraftStore } from "../src/main/form-drafts.ts";

async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "voidra-drafts-")),
    directory = join(temp, "private"),
    project = join(temp, "project"),
    other = join(temp, "other");
  await mkdir(project);
  await mkdir(other);
  return { temp, directory, project, other, store: new DraftStore(directory) };
}
async function file(directory: string, id: string) {
  const paths = await readdir(directory, { recursive: true });
  const path = paths.find((path) => path.endsWith(`${id}.json`));
  if (!path) throw Error("Missing private draft file");
  return join(directory, path);
}

it("persists complete invalid partial form values privately across restart and project/cache separation", async () => {
  const { temp, directory, project, other, store } = await fixture();
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: project });
    const before = execFileSync("git", ["status", "--porcelain"], {
      cwd: project,
      encoding: "utf8",
    });
    const id = randomUUID(),
      values = {
        mode: "normal",
        kind: "action",
        title: "",
        description: "# 私的\r\n**العربية** 🧭\r\n",
        release: "1.",
        assignee: "Previous member",
        sourceRevision: "old revision",
        generated: null,
      };
    const saved = await store.put(project, {
      id,
      family: "task-create",
      target: "",
      values,
      revision: null,
    });
    expect(saved.values).toEqual(values);
    expect((await new DraftStore(directory).read(project, id)).values).toEqual(
      values,
    );
    expect((await store.list(other)).drafts).toEqual([]);
    expect(
      (await store.list(project, { family: "profile-answer" })).drafts,
    ).toEqual([]);
    expect(
      (
        await store.list(project, { family: "task-create", target: "" })
      ).drafts.map((draft) => draft.id),
    ).toEqual([id]);
    expect(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: project,
        encoding: "utf8",
      }),
    ).toBe(before);
    expect((await stat(await file(directory, id))).mode & 0o777).toBe(0o600);
    await mkdir(join(temp, "cache"));
    await writeFile(join(temp, "cache/index.sqlite"), "disposable");
    await rm(join(temp, "cache"), { recursive: true });
    expect((await new DraftStore(directory).read(project, id)).revision).toBe(
      saved.revision,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it("refuses stale competing writes/deletes, preserves failed saves and retries without dropping other drafts", async () => {
  const { temp, directory, project, store } = await fixture();
  try {
    const id = randomUUID(),
      first = await store.put(project, {
        id,
        family: "team-member",
        target: "",
        values: { name: "A", email: "invalid" },
        revision: null,
      });
    const results = await Promise.allSettled([
      store.put(project, {
        id,
        family: "team-member",
        target: "",
        values: { name: "Ada", email: "partial@" },
        revision: first.revision,
      }),
      store.put(project, {
        id,
        family: "team-member",
        target: "",
        values: { name: "Other", email: "" },
        revision: first.revision,
      }),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    let current = await store.read(project, id);
    expect(current.values.name).toBe("Ada");
    expect(
      (
        await store.put(project, {
          id,
          family: "team-member",
          target: "",
          values: current.values,
          revision: first.revision,
        })
      ).revision,
    ).toBe(current.revision);
    await expect(store.delete(project, id, first.revision)).rejects.toThrow(
      /changed/i,
    );
    const path = await file(directory, id),
      parent = path.slice(0, path.lastIndexOf("/")),
      before = await readFile(path);
    await chmod(parent, 0o500);
    try {
      await expect(
        store.put(project, {
          id,
          family: "team-member",
          target: "",
          values: { name: "Still here" },
          revision: current.revision,
        }),
      ).rejects.toThrow();
      expect(await readFile(path)).toEqual(before);
    } finally {
      await chmod(parent, 0o700);
    }
    current = await store.put(project, {
      id,
      family: "team-member",
      target: "",
      values: { name: "Still here" },
      revision: current.revision,
    });
    const other = randomUUID();
    await store.put(project, {
      id: other,
      family: "team-member",
      target: "",
      values: { name: "Second" },
      revision: null,
    });
    await store.delete(project, id, current.revision);
    expect((await store.list(project)).drafts.map((draft) => draft.id)).toEqual(
      [other],
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it("preserves corrupt/escaping files, lists valid drafts and upgrades legacy Normal drafts only on an explicit save", async () => {
  const { temp, directory, project, store } = await fixture();
  try {
    const id = randomUUID(),
      good = randomUUID();
    await store.put(project, {
      id,
      family: "task-create",
      target: "",
      values: { title: "Legacy", description: "**source**" },
      revision: null,
    });
    const path = await file(directory, id),
      legacy = JSON.stringify({
        version: 0,
        id,
        kind: "task-create",
        target: "",
        values: { title: "Legacy", description: "**source**" },
      });
    await writeFile(path, legacy);
    const upgraded = await store.read(project, id);
    expect(upgraded.values.mode).toBe("normal");
    expect(await readFile(path, "utf8")).toBe(legacy);
    await store.put(project, {
      id,
      family: upgraded.family,
      target: upgraded.target,
      values: upgraded.values,
      revision: upgraded.revision,
    });
    expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1);
    await store.put(project, {
      id: good,
      family: "profile-answer",
      target: "scope:goal",
      values: { value: "Kept", sourceRevision: "captured" },
      revision: null,
    });
    await writeFile(path, "{broken private draft");
    const broken = await readFile(path);
    await expect(store.read(project, id)).rejects.toThrow(/preserved/i);
    expect((await store.list(project)).drafts.map((draft) => draft.id)).toEqual(
      [good],
    );
    expect((await store.list(project)).problems).toHaveLength(1);
    expect(await readFile(path)).toEqual(broken);
    const outside = join(temp, "outside.json");
    await writeFile(outside, "private outside");
    await rm(path);
    await symlink(outside, path);
    await expect(store.read(project, id)).rejects.toThrow(/link/i);
    expect(await readFile(outside, "utf8")).toBe("private outside");
    await expect(store.read(project, "../outside" as never)).rejects.toThrow();
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it("keeps unfinished keys encrypted, exposes metadata only, preserves a failed apply and uses main-only explicit application", async () => {
  const { temp, directory, project } = await fixture(),
    key = randomBytes(32);
  let availableCalls = 0;
  const encryption: SecretEncryption = {
    available: async () => {
      availableCalls++;
      return true;
    },
    encrypt: async (value) => {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv),
        data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]);
    },
    decrypt: async (bytes) => {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      decipher.setAuthTag(bytes.subarray(12, 28));
      return {
        result: Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString(),
        shouldReEncrypt: false,
      };
    },
  };
  try {
    const store = new DraftStore(directory, encryption);
    await store.list(project);
    await store.listSecrets();
    expect(availableCalls).toBe(0);
    const id = randomUUID(),
      value = "pending-private-openrouter-key",
      first = await store.putSecret({ id, revision: null, value }),
      saved = await store.putSecret({ id, revision: first.revision, value });
    await expect(
      store.putSecret({
        id,
        revision: first.revision,
        value: "competing unfinished key",
      }),
    ).rejects.toThrow(/changed/);
    const fork = await store.putSecret({
      id: randomUUID(),
      revision: null,
      value: "competing unfinished key",
    });
    expect((await store.listSecrets()).drafts).toHaveLength(2);
    await store.delete(null, fork.id, fork.revision, true);
    expect(JSON.stringify(saved)).not.toContain(value);
    expect(saved.hasValue).toBe(true);
    for (const path of await readdir(directory, { recursive: true })) {
      if (path.endsWith(".json"))
        expect(await readFile(join(directory, path), "utf8")).not.toContain(
          value,
        );
    }
    await expect(
      store.applySecret(id, saved.revision, async () => {
        throw Error("apply failed");
      }),
    ).rejects.toThrow(/apply failed/);
    expect((await store.listSecrets()).drafts[0]?.revision).toBe(
      saved.revision,
    );
    let applied = "";
    await store.applySecret(id, saved.revision, async (key) => {
      applied = key;
    });
    expect(applied).toBe(value);
    expect((await store.listSecrets()).drafts).toEqual([]);
    const unavailable = new DraftStore(directory, {
      ...encryption,
      available: async () => false,
    });
    await expect(
      unavailable.putSecret({
        id: randomUUID(),
        revision: null,
        value: "partial",
      }),
    ).rejects.toThrow(/encryption|secure/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

it("keeps a complete durable draft across actual process death before and after atomic replacement", async () => {
  const { temp, directory, project, store } = await fixture();
  try {
    for (const stage of ["temporary-written", "replaced"] as const) {
      const id = randomUUID(),
        first = await store.put(project, {
          id,
          family: "task-create",
          target: "action",
          values: {
            title: "Before kill",
            description: "# First\r\n",
            mode: "normal",
          },
          revision: null,
        });
      const script = join(temp, `${stage}.mts`),
        next = {
          id,
          family: "task-create" as const,
          target: "action",
          values: {
            title: "After kill",
            description: "# 第二\r\n**العربية** 🧭\r\n",
            mode: "normal",
          },
          revision: first.revision,
        };
      await writeFile(
        script,
        `import {DraftStore} from ${JSON.stringify(new URL("../src/main/form-drafts.ts", import.meta.url).href)};
process.stdin.resume();
const store=new DraftStore(${JSON.stringify(directory)},undefined,async stage=>{if(stage===${JSON.stringify(stage)}){process.stdout.write("checkpoint\\n");await new Promise(()=>{});}});
await store.put(${JSON.stringify(project)},${JSON.stringify(next)});
throw Error("Checkpoint was not reached");
`,
      );
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env.NODE_V8_COVERAGE;
      const child = spawn(process.execPath, [script], {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let errors = "";
      child.stderr.on("data", (chunk) => {
        errors += String(chunk);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error(`Draft child missed checkpoint: ${errors}`)),
            5000,
          );
          child.once("error", (error) => {
            clearTimeout(timer);
            reject(error);
          });
          child.stdout.on("data", (chunk) => {
            if (String(chunk).includes("checkpoint")) {
              clearTimeout(timer);
              resolve();
            }
          });
          child.once("exit", () => {
            clearTimeout(timer);
            reject(Error(`Draft child exited before checkpoint: ${errors}`));
          });
        });
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        const [, signal] = await exited;
        expect(signal).toBe("SIGKILL");
        const recovered = await new DraftStore(directory).read(project, id);
        expect(recovered.values).toEqual(
          stage === "temporary-written" ? first.values : next.values,
        );
        expect((await stat(await file(directory, id))).mode & 0o777).toBe(
          0o600,
        );
        if (stage === "replaced")
          expect((await store.put(project, next)).revision).toBe(
            recovered.revision,
          );
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
