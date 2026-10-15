import { expect, it } from "vitest";
import {
  releaseVersionChoices,
  selectedReleaseVersion,
} from "../src/choices.ts";

it("uses Xeploy for stable bug-fix/minor/major choices and validates a custom forward version", () => {
  expect(releaseVersionChoices("1.2.3")).toEqual([
    { value: "patch", label: "Bug fix", version: "1.2.4" },
    { value: "minor", label: "Minor", version: "1.3.0" },
    { value: "major", label: "Major", version: "2.0.0" },
  ]);
  expect(selectedReleaseVersion("1.2.3", "minor")).toBe("1.3.0");
  expect(selectedReleaseVersion("1.2.3", "custom", "1.8.4")).toBe("1.8.4");
  for (const version of [
    "1.2.3",
    "1.2.2",
    "01.3.0",
    "1.3.0-rc.1",
    "v1.3.0",
    "9007199254740993.0.0",
  ])
    expect(() => selectedReleaseVersion("1.2.3", "custom", version)).toThrow();
  for (const source of ["1.2", "1.2.3-rc.1", "9007199254740991.0.0"])
    expect(() => releaseVersionChoices(source)).toThrow();
});

it("exposes the same read-only Xeploy preview to the standalone runtime", async () => {
  const { cp, mkdtemp, readFile, rm, writeFile } = await import(
      "node:fs/promises"
    ),
    { tmpdir } = await import("node:os"),
    { join, resolve } = await import("node:path"),
    { runRuntime } = await import("../../run-engine/src/runtime.ts");
  const root = await mkdtemp(join(tmpdir(), "voidra-release-options-"));
  try {
    await cp(resolve("fixtures/new-project/project"), root, {
      recursive: true,
    });
    await writeFile(join(root, "package.json"), '{"version":"2.3.4"}\n');
    const before = await readFile(join(root, "package.json"));
    const result = await runRuntime(["release-options", "--project", root]);
    expect(result.code).toBe(0);
    expect(result.value).toMatchObject({
      source: { path: "package.json", version: "2.3.4" },
      choices: [
        { version: "2.3.5" },
        { version: "2.4.0" },
        { version: "3.0.0" },
      ],
    });
    expect(await readFile(join(root, "package.json"))).toEqual(before);
    await rm(join(root, "package.json"));
    expect(
      (await runRuntime(["release-options", "--project", root])).value,
    ).toMatchObject({
      choices: [],
      source: { version: null, message: expect.stringContaining("not found") },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
