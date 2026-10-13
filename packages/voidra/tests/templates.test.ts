import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  checkProject,
  detectCode,
  hash,
  initializeProject,
  loadTemplate,
  parseRecord,
  readTemplates,
  updateProfileAnswer,
  validateTemplate,
  validateTemplateAnswer,
} from "../src/index.ts";

const general = resolve("templates/general/template.yaml");
const temporary = () => mkdtemp(join(tmpdir(), "voidra-intake-"));
it("loads the starter template, preserves unknown fields and rejects invalid or incompatible templates", async () => {
  const template = await loadTemplate(general);
  expect(template.id).toBe("general");
  expect(
    template.blocks.flatMap((b) => b.questions).map((q) => q.type),
  ).toEqual(
    expect.arrayContaining([
      "short-text",
      "long-text",
      "single-choice",
      "multiple-choice",
      "list",
    ]),
  );
  expect(
    validateTemplate({ ...template, extension: "retained" }).extension,
  ).toBe("retained");
  for (const change of [
    { format: 99 },
    { version: "broken" },
    { blocks: [template.blocks[0], template.blocks[0]] },
    { architectureSkill: "../unsafe" },
    {
      lifecycleOverrides: {
        docs: {
          stages: ["implement", "done"],
          planGate: false,
          rejectTo: "implement",
        },
      },
    },
  ])
    expect(() => validateTemplate({ ...template, ...change })).toThrow();
  const root = await temporary();
  try {
    await mkdir(join(root, "good"));
    await mkdir(join(root, "bad"));
    await writeFile(join(root, "good/template.yaml"), await readFile(general));
    await writeFile(join(root, "bad/template.yaml"), "id: [broken\n");
    const catalog = await readTemplates(root);
    expect(catalog.templates).toHaveLength(1);
    expect(catalog.diagnostics[0]?.file).toBe(join(root, "bad/template.yaml"));
    expect(catalog.diagnostics[0]?.message).toBeTruthy();
    await symlink(join(root, "good"), join(root, "linked"));
    expect((await readTemplates(root)).templates).toHaveLength(1);
    await writeFile(join(root, "bad/template.yaml"), "id: incomplete\n");
    await expect(loadTemplate(join(root, "bad/template.yaml"))).rejects.toThrow(
      /version|format|blocks/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("checks all answer types and permits unanswered fields without inventing a value", async () => {
  const template = await loadTemplate(general),
    questions = template.blocks.flatMap((b) => b.questions);
  for (const q of questions) {
    expect(validateTemplateAnswer(q, null)).toBeNull();
    const value =
      q.type === "list"
        ? ["item"]
        : q.type === "multiple-choice"
          ? [q.options?.[0]?.value]
          : q.type === "single-choice"
            ? q.options?.[0]?.value
            : "A concrete answer";
    expect(validateTemplateAnswer(q, value)).toEqual(value);
    expect(() => validateTemplateAnswer(q, 123)).toThrow(q.id);
    if (q.options) {
      expect(() =>
        validateTemplateAnswer(
          { ...q, allowFreeText: false },
          q.type === "multiple-choice" ? ["unknown"] : "unknown",
        ),
      ).toThrow(q.id);
      expect(
        validateTemplateAnswer(
          { ...q, allowFreeText: true },
          q.type === "multiple-choice" ? ["Other"] : "Other",
        ),
      ).toEqual(q.type === "multiple-choice" ? ["Other"] : "Other");
    }
  }
});
it("detects manifests or source files while ignoring dependencies, generated files and linked folders", async () => {
  const root = await temporary(),
    outside = await temporary();
  try {
    expect((await detectCode(root)).hasCode).toBe(false);
    await mkdir(join(root, "node_modules/a"), { recursive: true });
    await writeFile(join(root, "node_modules/a/index.ts"), "code");
    await writeFile(join(outside, "main.py"), "code");
    await symlink(outside, join(root, "linked"));
    expect((await detectCode(root)).hasCode).toBe(false);
    await writeFile(join(root, "package.json"), "{}");
    expect(await detectCode(root)).toMatchObject({
      hasCode: true,
      evidence: ["package.json"],
    });
    await rm(join(root, "package.json"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), "code");
    expect(await detectCode(root)).toMatchObject({
      hasCode: true,
      evidence: ["src/app.ts"],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
it("creates a complete valid profile and Bootstrap atomically and preserves existing project files", async () => {
  const root = await temporary(),
    template = await loadTemplate(general);
  try {
    await writeFile(join(root, "notes.txt"), "Keep exactly.\n");
    const result = await initializeProject(root, template, {
      name: "New app",
      answers: { "problem.goal": { value: "A useful project" } },
    });
    const checked = await checkProject(root);
    expect(checked.diagnostics).toEqual([]);
    expect(result.bootstrap).toMatch(/^act-/);
    expect(checked.metadata?.template).toEqual({
      id: "general",
      version: template.version,
    });
    expect(
      checked.records.get(`.voidra/actions/${result.bootstrap}/action.md`)
        ?.document.data,
    ).toMatchObject({
      title: "Bootstrap",
      type: "feature",
      stage: "discovery",
    });
    expect(
      checked.records.get(".voidra/profile/problem.md")?.document.data.answers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "goal",
          status: "confirmed",
          confirmedBy: "You",
          answer: "A useful project",
        }),
      ]),
    );
    expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(
      "Keep exactly.\n",
    );
    await expect(
      initializeProject(root, template, { name: "Again", answers: {} }),
    ).rejects.toThrow(/already/);
    expect((await readdir(root)).some((n) => n.includes("staging"))).toBe(
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("failed initialization leaves no planning directory and inference requires a source for every answer", async () => {
  const root = await temporary(),
    template = await loadTemplate(general);
  try {
    await expect(
      initializeProject(root, template, {
        name: "Bad",
        answers: { unknown: { value: "bad" } },
      }),
    ).rejects.toThrow(/unknown/i);
    await expect(
      initializeProject(root, template, {
        name: "Missing required answer",
        answers: {},
      }),
    ).rejects.toThrow(/required/);
    await expect(
      initializeProject(root, template, {
        name: "Bad",
        inferred: true,
        answers: { "problem.goal": { value: "Guess" } },
      }),
    ).rejects.toThrow(/source/);
    expect(await readdir(root)).toEqual([]);
    await chmod(root, 0o500);
    await expect(
      initializeProject(root, template, {
        name: "Bad",
        answers: { "problem.goal": { value: "Valid goal" } },
      }),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  } finally {
    await chmod(root, 0o700);
    await rm(root, { recursive: true, force: true });
  }
});
it("confirming an inferred answer records the actor/time; changing a confirmed value creates a linked draft", async () => {
  const root = await temporary(),
    template = await loadTemplate(general);
  try {
    const answers: Record<string, { value: unknown; source: string }> =
      Object.fromEntries(
        template.blocks.flatMap((b) =>
          b.questions.map((q) => [
            `${b.id}.${q.id}`,
            { value: null, source: "src/app.ts:1 (unresolved)" },
          ]),
        ),
      );
    answers["problem.goal"] = { value: "First goal", source: "src/app.ts:1" };
    await initializeProject(root, template, {
      name: "Existing",
      inferred: true,
      bootstrap: false,
      answers,
    });
    const path = ".voidra/profile/problem.md";
    const before = await readFile(join(root, path));
    const confirmation = await updateProfileAnswer(root, template, {
      block: "problem",
      id: "goal",
      value: "First goal",
      by: "Reviewer",
      expectedHash: hash(before),
    });
    expect(confirmation.action).toBeUndefined();
    const confirmed = await readFile(join(root, path)),
      profile = parseRecord(path, confirmed);
    expect(profile.data.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "confirmed",
          confirmedBy: "Reviewer",
          source: "src/app.ts:1",
          updatedAt: expect.any(String),
        }),
      ]),
    );
    await expect(
      updateProfileAnswer(root, template, {
        block: "problem",
        id: "goal",
        value: "Stale",
        by: "Reviewer",
        expectedHash: hash(before),
      }),
    ).rejects.toThrow(/changed/);
    const changed = await updateProfileAnswer(root, template, {
      block: "problem",
      id: "goal",
      value: "New goal",
      by: "Reviewer",
      expectedHash: hash(confirmed),
    });
    expect(changed.action).toMatch(/^act-/);
    const checked = await checkProject(root),
      action = checked.records.get(
        `.voidra/actions/${changed.action}/action.md`,
      );
    expect(action?.document.data).toMatchObject({
      type: "profile-change",
      status: "draft",
      profileChange: {
        block: "problem",
        answerId: "goal",
        before: "First goal",
        after: "New goal",
      },
      links: [".voidra/profile/problem.md#goal"],
    });
    expect(checked.diagnostics).toEqual([]);
    await expect(
      updateProfileAnswer(root, template, {
        block: "wrong",
        id: "goal",
        value: "No",
        by: "Reviewer",
        expectedHash: hash(confirmed),
      }),
    ).rejects.toThrow();
    const current = await readFile(join(root, path));
    expect(
      (
        await updateProfileAnswer(root, template, {
          block: "problem",
          id: "goal",
          value: "New goal",
          by: "Reviewer",
          expectedHash: hash(current),
        })
      ).action,
    ).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
