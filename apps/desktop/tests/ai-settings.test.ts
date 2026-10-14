import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AiSettings, type SecretEncryption } from "../src/main/ai-settings.ts";

function encryption(): SecretEncryption {
  const key = randomBytes(32);
  return {
    async available() {
      return true;
    },
    async encrypt(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const bytes = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
    },
    async decrypt(bytes) {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(0, 12),
      );
      cipher.setAuthTag(bytes.subarray(12, 28));
      return {
        result: Buffer.concat([
          cipher.update(bytes.subarray(28)),
          cipher.final(),
        ]).toString(),
        shouldReEncrypt: false,
      };
    },
  };
}

it("stores only encrypted key bytes, retains private model/preferences across restart and never returns a key in public settings", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-settings-"));
  try {
    const file = join(root, "ai.json"),
      crypto = encryption(),
      store = new AiSettings(file, crypto);
    expect(await store.status()).toEqual({
      configured: false,
      available: true,
      model: null,
    });
    await store.setKey("sk-fixture-secret");
    await store.setModel("provider/model");
    const content = await readFile(file, "utf8");
    expect(content).not.toContain("sk-fixture-secret");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    const reopened = new AiSettings(file, crypto);
    expect(await reopened.key()).toBe("sk-fixture-secret");
    expect(await reopened.status()).toEqual({
      configured: true,
      available: true,
      model: "provider/model",
    });
    expect(JSON.stringify(await reopened.status())).not.toContain("secret");
    await reopened.removeKey();
    expect(await reopened.key()).toBeNull();
    expect(await reopened.status()).toMatchObject({
      configured: false,
      model: "provider/model",
    });
    expect(await readFile(file, "utf8")).not.toContain("sk-fixture-secret");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("refuses unavailable encryption, preserves invalid/decryption-failed settings and serializes independent writes without losing unknown fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-settings-"));
  try {
    const file = join(root, "ai.json"),
      crypto = encryption(),
      store = new AiSettings(file, crypto);
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        key: null,
        model: null,
        future: { keep: true },
      }),
    );
    await Promise.all([
      store.setKey("fixture-key"),
      store.setModel("provider/test"),
    ]);
    expect(JSON.parse(await readFile(file, "utf8")).future).toEqual({
      keep: true,
    });
    expect(await store.key()).toBe("fixture-key");
    const unavailable = new AiSettings(file, {
      ...crypto,
      async available() {
        return false;
      },
    });
    await expect(unavailable.setKey("replacement")).rejects.toThrow(
      /encryption|Keychain/i,
    );
    expect(await unavailable.status()).toMatchObject({
      configured: true,
      available: false,
    });
    const original = await readFile(file);
    await expect(new AiSettings(file, encryption()).key()).rejects.toThrow(
      /unlock|saved key/i,
    );
    expect(await readFile(file)).toEqual(original);
    await expect(store.setKey("  ")).rejects.toThrow();
    await expect(store.setModel("")).rejects.toThrow();
    await writeFile(file, "{");
    await expect(store.status()).rejects.toThrow(/settings/i);
    expect(await readFile(file, "utf8")).toBe("{");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
