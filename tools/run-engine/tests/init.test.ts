import { execFileSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject, loadTemplate } from "voidra";
import { initializeExisting } from "../src/init.ts";

it("preserves an existing pointer and stops on an outside instruction edit", async () => {
  const template = await loadTemplate(
    resolve("templates/general/template.yaml"),
  );
  for (const conflict of [false, true]) {
    const root = await mkdtemp(join(tmpdir(), "voidra-pointer-"));
    try {
      await writeFile(join(root, "app.ts"), "export const greeting='Hello';\n");
      const instructions = "# Rules\nExisting .voidra/README.md pointer.\n";
      await writeFile(join(root, "AGENTS.md"), instructions);
      await writeFile(join(root, "CLAUDE.md"), instructions);
      const answers = Object.fromEntries(
        template.blocks.flatMap((b) =>
          b.questions.map((q) => [
            `${b.id}.${q.id}`,
            { value: null, source: "app.ts:1 (not specified)" },
          ]),
        ),
      );
      const options = {
        name: "Greeting",
        answers,
        glossary: "# Draft\n",
        ...(conflict
          ? {
              checkpoint: async () => {
                await writeFile(
                  join(root, "AGENTS.md"),
                  "Outside instructions.\n",
                );
              },
            }
          : {}),
      };
      if (conflict) {
        await expect(
          initializeExisting(root, template, options),
        ).rejects.toThrow("Instruction changed");
        expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(
          "Outside instructions.\n",
        );
      } else {
        const result = await initializeExisting(root, template, options);
        expect(result.paths).not.toContain("AGENTS.md");
        expect(result.paths).not.toContain("CLAUDE.md");
        expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe(
          instructions,
        );
      }
      expect((await checkProject(root)).diagnostics).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  const root = await mkdtemp(join(tmpdir(), "voidra-linked-intake-"));
  try {
    await writeFile(join(root, "app.ts"), "code");
    await symlink(join(root, "app.ts"), join(root, "AGENTS.md"));
    const answers = Object.fromEntries(
      template.blocks.flatMap((b) =>
        b.questions.map((q) => [
          `${b.id}.${q.id}`,
          { value: null, source: "app.ts:1" },
        ]),
      ),
    );
    await expect(
      initializeExisting(root, template, {
        name: "Bad",
        answers,
        glossary: "Draft",
      }),
    ).rejects.toThrow("symlink");
    await rm(join(root, "AGENTS.md"));
    await symlink(join(root, "app.ts"), join(root, "linked.ts"));
    await expect(
      initializeExisting(root, template, {
        name: "Bad",
        answers: { "problem.goal": { value: null, source: "linked.ts:1" } },
        glossary: "Draft",
      }),
    ).rejects.toThrow("linked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const kind of ["none", "agents", "claude", "pointer"] as const)
  it(`existing intake preserves source, glossary and ${kind} instructions without a commit`, async () => {
    const root = await mkdtemp(join(tmpdir(), "voidra-init-"));
    try {
      await cp(resolve("fixtures/existing-code/project"), root, {
        recursive: true,
      });
      const template = await loadTemplate(
        resolve("templates/general/template.yaml"),
      );
      const answers: Record<string, { value: unknown; source: string }> =
        Object.fromEntries(
          template.blocks.flatMap((b) =>
            b.questions.map((q) => [
              `${b.id}.${q.id}`,
              { value: null, source: "src/app.ts:1 (not specified)" },
            ]),
          ),
        );
      answers["problem.goal"] = {
        value: "Expose a greeting",
        source: "src/app.ts:1",
      };
      if (kind === "agents" || kind === "pointer")
        await writeFile(
          join(root, "AGENTS.md"),
          "# Rules\n\nKeep these exact instructions.\n",
        );
      if (kind === "claude")
        await writeFile(
          join(root, "CLAUDE.md"),
          "# Claude rules\n\nKeep these exact instructions.\n",
        );
      if (kind === "pointer")
        await writeFile(join(root, "CLAUDE.md"), "@AGENTS.md\n");
      if (kind === "agents")
        await writeFile(
          join(root, "GLOSSARY.md"),
          "# Existing glossary\nKeep exactly.\n",
        );
      execFileSync("git", ["init", "-q"], { cwd: root });
      execFileSync("git", ["config", "user.name", "Verification"], {
        cwd: root,
      });
      execFileSync(
        "git",
        ["config", "user.email", "verification@example.test"],
        { cwd: root },
      );
      execFileSync("git", ["add", "."], { cwd: root });
      execFileSync("git", ["commit", "-qm", "Initial fixture"], { cwd: root });
      const result = await initializeExisting(root, template, {
        name: "Greeting",
        answers,
        glossary:
          "# Draft glossary\n\nGreeting: the text exposed by src/app.ts.\n",
      });
      expect((await checkProject(root)).diagnostics).toEqual([]);
      expect(
        [...(await checkProject(root)).records.values()]
          .filter((r) => r.kind === "profile")
          .every((r) =>
            (
              r.document.data.answers as { status: string; source: string }[]
            ).every(
              (a) => a.status === "inferred" && a.source.includes("src/app.ts"),
            ),
          ),
      ).toBe(true);
      expect(await readFile(join(root, "src/app.ts"), "utf8")).toBe(
        'export const greeting = "Hello";\n',
      );
      expect(
        execFileSync("git", ["rev-list", "--count", "HEAD"], {
          cwd: root,
          encoding: "utf8",
        }).trim(),
      ).toBe("1");
      if (kind === "agents")
        expect(await readFile(join(root, "GLOSSARY.md"), "utf8")).toBe(
          "# Existing glossary\nKeep exactly.\n",
        );
      else
        expect(await readFile(join(root, "GLOSSARY.md"), "utf8")).toContain(
          "Draft glossary",
        );
      const target = kind === "claude" ? "CLAUDE.md" : "AGENTS.md";
      expect(await readFile(join(root, target), "utf8")).toContain(
        ".voidra/README.md",
      );
      if (kind !== "none")
        expect(await readFile(join(root, target), "utf8")).toContain(
          "Keep these exact instructions.",
        );
      if (kind === "pointer")
        expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe(
          "@AGENTS.md\n",
        );
      expect(result.paths).toContain(`.voidra/profile/problem.md`);
      await expect(
        initializeExisting(root, template, {
          name: "Again",
          answers,
          glossary: "Wrong",
        }),
      ).rejects.toThrow(/already/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
it("refuses intake without code, with evidence outside the project or without inference sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-init-")),
    template = await loadTemplate(resolve("templates/general/template.yaml"));
  try {
    await expect(
      initializeExisting(root, template, {
        name: "None",
        answers: {},
        glossary: "Draft",
      }),
    ).rejects.toThrow(/code/);
    await writeFile(join(root, "app.ts"), "code");
    await expect(
      initializeExisting(root, template, {
        name: "None",
        answers: {
          "problem.goal": { value: "Guess", source: "../outside.ts:1" },
        },
        glossary: "Draft",
      }),
    ).rejects.toThrow(/source/);
    await expect(
      initializeExisting(root, template, {
        name: "None",
        answers: { "problem.goal": { value: "Guess", source: "missing.ts:1" } },
        glossary: "Draft",
      }),
    ).rejects.toThrow(/source/);
    await expect(
      initializeExisting(root, template, {
        name: "None",
        answers: {},
        glossary: "Draft",
      }),
    ).rejects.toThrow(/source/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
