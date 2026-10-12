import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  contentPolicy,
  isTrustedFrame,
  resolveAsset,
} from "../src/main/security.ts";

it("serves only packaged renderer files on the trusted origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-assets-"));
  try {
    await writeFile(join(root, "index.html"), "<html></html>");
    await mkdir(join(root, "_next"));
    await writeFile(join(root, "_next/app.js"), "code");
    await symlink(tmpdir(), join(root, "escape"));
    expect(await resolveAsset(root, "app://voidra-project/")).toBe(
      await realpath(join(root, "index.html")),
    );
    expect(await resolveAsset(root, "app://voidra-project/_next/app.js")).toBe(
      await realpath(join(root, "_next/app.js")),
    );
    for (const url of [
      "https://voidra-project/",
      "app://other/",
      "app://voidra-project/%2e%2e%2foutside",
      "app://voidra-project/escape/other",
      "app://voidra-project/%00",
      "app://voidra-project/missing",
    ]) {
      await expect(resolveAsset(root, url)).rejects.toThrow();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("uses script hashes rather than permissive inline/eval policies", () => {
  const policy = contentPolicy(
    '<script>trusted()</script><script src="/_next/a.js"></script>',
  );
  expect(policy).toContain("sha256-");
  expect(policy).not.toContain("unsafe-inline");
  expect(policy).not.toContain("unsafe-eval");
  expect(policy).toContain("connect-src 'none'");
  expect(isTrustedFrame("app://voidra-project/", true)).toBe(true);
  expect(isTrustedFrame("app://voidra-project/", false)).toBe(false);
  expect(isTrustedFrame("app://attacker/", true)).toBe(false);
  expect(isTrustedFrame("invalid", true)).toBe(false);
});
