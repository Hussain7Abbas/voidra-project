import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { runCli } from "../src/cli.ts";
import { hash } from "../src/lifecycle.ts";
import { PACKAGE_VERSION } from "../src/versions.ts";
import { materialize } from "./helpers.ts";

const bin = resolve("packages/voidra/dist/cli-entry.js");
it("identifies the package version in built help and usage output", () => {
  const version = spawnSync(process.execPath, [bin, "version"], {
    encoding: "utf8",
  });
  expect(version.status).toBe(0);
  expect(version.stdout.trim()).toBe(PACKAGE_VERSION);
  for (const command of ["--help", "help", "unknown"]) {
    const result = spawnSync(process.execPath, [bin, command], {
      encoding: "utf8",
    });
    expect(result.status).toBe(command === "unknown" ? 2 : 0);
    const output = command === "unknown" ? result.stderr : result.stdout;
    expect(output).toContain(
      `Voidra ${version.stdout.trim()}\nCommands: check`,
    );
  }
});
it("runs the built executable with human/json output and all three exit codes", async () => {
  const root = await materialize();
  for (const args of [
    ["check", root],
    ["check", root, "--json"],
    ["version"],
    ["id", "act"],
    ["--help"],
  ]) {
    const result = spawnSync(process.execPath, [bin, ...args], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toBe("");
  }
  expect(
    spawnSync(
      process.execPath,
      [bin, "check", await materialize(new Map()), "--json"],
      { encoding: "utf8" },
    ).status,
  ).toBe(1);
  expect(
    spawnSync(process.execPath, [bin, "unknown"], { encoding: "utf8" }).status,
  ).toBe(2);
});
it("shares usage rules and public helpers with API callers", async () => {
  const root = await materialize();
  const manifest = join(root, "manifest.json");
  await writeFile(
    manifest,
    JSON.stringify({
      changes: [
        {
          path: ".voidra/README.md",
          expectedHash: hash("# Guide\n"),
          content: "# CLI guide\n",
        },
      ],
    }),
  );
  const result = await runCli(["apply", manifest, "--project", root, "--json"]);
  expect(result.exitCode).toBe(0);
  const operation = JSON.parse(result.stdout);
  expect(
    (await runCli(["recover", operation.id, "--project", root, "--json"]))
      .exitCode,
  ).toBe(0);
  expect(
    (await runCli(["migrate", root, "--dry-run", "--json"])).exitCode,
  ).toBe(0);
  for (const args of [
    [],
    ["version", "extra"],
    ["version", "--json"],
    ["check", "a", "b"],
    ["check", "--project", "a"],
    ["id", "bad"],
    ["approve", "act-000000"],
    ["apply"],
    ["recover"],
    ["id", "act", "--json"],
  ])
    expect((await runCli(args)).exitCode).toBe(2);
  expect((await runCli(["check", "/does/not/exist"])).exitCode).toBe(1);
  expect((await runCli(["apply", "/does/not/exist", "--json"])).exitCode).toBe(
    1,
  );
  expect(
    (
      await runCli([
        "approve",
        "act-000000",
        "--by",
        "You",
        "--revision",
        "0".repeat(64),
        "--project",
        root,
      ])
    ).exitCode,
  ).toBe(1);
});
it("approves the displayed revision through the built CLI and public command API", async () => {
  const { baseFiles } = await import("./helpers.ts");
  const { samples, markdown, bodies } = await import("./samples.ts");
  const files = baseFiles();
  files.set(
    ".voidra/actions/act-000000/action.md",
    Buffer.from(
      markdown({ ...samples.action, stage: "plan", status: "waiting" }),
    ),
  );
  for (const file of ["requirements", "blueprint", "acceptance"])
    files.set(
      `.voidra/actions/act-000000/${file}.md`,
      Buffer.from(markdown({ action: "act-000000" }, bodies[file])),
    );
  const root = await materialize(files);
  const shown = await runCli([
    "plan",
    "act-000000",
    "--project",
    root,
    "--json",
  ]);
  expect(shown.exitCode).toBe(0);
  const revision = JSON.parse(shown.stdout).revision;
  const approved = await runCli([
    "approve",
    "act-000000",
    "--by",
    "You",
    "--revision",
    revision,
    "--project",
    root,
    "--json",
  ]);
  expect(approved.exitCode, approved.stderr).toBe(0);
  expect((await runCli(["id", "q"])).exitCode).toBe(0);
  expect((await runCli(["version"])).stdout).toBe(`${PACKAGE_VERSION}\n`);
  const child = spawnSync(
    process.execPath,
    [
      bin,
      "approve",
      "act-000000",
      "--by",
      "You",
      "--revision",
      revision,
      "--project",
      root,
    ],
    { encoding: "utf8" },
  );
  expect(child.status).toBe(1);
});
