import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { checkProject, loadTemplate } from "voidra";
import { buildAiPrompt, parseAiSuggestion } from "../src/main/ai-prompts.ts";
import { collectAiContext } from "../src/project-service/ai-context.ts";
import type { AiContext } from "../src/shared/ai.ts";

it("builds versioned prompts from selected public planning fields only and refuses source/private path injection", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-context-"));
  try {
    await cp(resolve("fixtures/new-project/project"), root, {
      recursive: true,
    });
    await writeFile(join(root, "README.md"), "SOURCE_FILE_CANARY");
    await writeFile(join(root, ".voidra/local-secret.txt"), "PRIVATE_CANARY");
    const template = await loadTemplate(
        resolve("templates/general/template.yaml"),
      ),
      project = await checkProject(root);
    const context = collectAiContext(project, [template], {
      feature: "profile",
      notes: "Use offline storage.",
      template: "general",
      templateVersion: "1.0.0",
      block: "problem",
      answer: "goal",
    });
    const prompt = buildAiPrompt(context);
    expect(prompt.version).toBe(1);
    expect(prompt.messages[1]?.content).toContain("Use offline storage.");
    expect(JSON.stringify(prompt)).not.toMatch(
      /SOURCE_FILE_CANARY|PRIVATE_CANARY|confirmedBy/,
    );
    expect(context.question?.type).toBe("long-text");
    for (const path of [
      "README.md",
      ".voidra/local/run.lock",
      ".voidra/profile/../../README.md",
    ])
      expect(() =>
        buildAiPrompt({
          ...context,
          sources: [
            {
              path,
              label: "Untrusted",
              text: "SOURCE_FILE_CANARY",
              revision: "0".repeat(64),
            },
          ],
        }),
      ).toThrow();
    expect(() =>
      collectAiContext(project, [template], {
        feature: "summary",
        notes: "",
        action: "act-999999",
      }),
    ).toThrow(/action/i);
    expect(() =>
      collectAiContext(project, [template], {
        feature: "profile",
        notes: "",
        template: "general",
        templateVersion: "9.0.0",
        block: "problem",
        answer: "goal",
      }),
    ).toThrow(/template/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("validates editable suggestions, matching template values and follow-up question bounds without persisting any result", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-ai-suggestions-"));
  try {
    await cp(resolve("fixtures/new-project/project"), root, {
      recursive: true,
    });
    const template = await loadTemplate(
        resolve("templates/general/template.yaml"),
      ),
      project = await checkProject(root);
    const rewrite = collectAiContext(project, [template], {
      feature: "rewrite",
      notes: "rough wording",
      target: "idea",
    });
    expect(
      parseAiSuggestion(
        rewrite,
        '{"title":"Clear title","description":"A clear outcome."}',
      ),
    ).toEqual({
      feature: "rewrite",
      title: "Clear title",
      description: "A clear outcome.",
    });
    const profile = collectAiContext(project, [template], {
      feature: "profile",
      notes: "",
      template: "general",
      templateVersion: "1.0.0",
      block: "problem",
      answer: "goal",
    });
    expect(
      parseAiSuggestion(profile, '{"value":"Save offline notes"}'),
    ).toEqual({ feature: "profile", value: "Save offline notes" });
    expect(() =>
      parseAiSuggestion(profile, '{"value":["Wrong type"]}'),
    ).toThrow(/suggestion|answer/i);
    const followup = { ...profile, feature: "followup" as const };
    expect(
      parseAiSuggestion(followup, '{"questions":["Which users?"]}'),
    ).toEqual({ feature: "followup", questions: ["Which users?"] });
    for (const output of [
      "not JSON",
      '{"questions":[]}',
      '{"questions":["ok"],"approve":true}',
    ])
      expect(() => parseAiSuggestion(followup, output)).toThrow(/suggestion/i);
    expect((await checkProject(root)).files).toEqual(project.files);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("parses the five recorded v1 response fixtures and keeps prompt version/source bounds explicit", async () => {
  const responses = JSON.parse(
    await readFile(resolve("apps/desktop/tests/fixtures/ai-v1.json"), "utf8"),
  ) as Record<AiContext["feature"], unknown>;
  for (const feature of [
    "rewrite",
    "profile",
    "followup",
    "summary",
    "release-notes",
  ] as const) {
    const context: AiContext = {
      feature,
      notes: "Selected planning notes.",
      sources: [],
      ...(feature === "profile"
        ? {
            question: {
              id: "goal",
              question: "Goal?",
              type: "long-text" as const,
              help: "Describe the useful outcome.",
            },
          }
        : {}),
    };
    expect(buildAiPrompt(context).version).toBe(1);
    expect(
      parseAiSuggestion(context, JSON.stringify(responses[feature])).feature,
    ).toBe(feature);
  }
  expect(() =>
    buildAiPrompt({
      feature: "rewrite",
      notes: "a".repeat(20000),
      sources: [
        {
          path: ".voidra/profile/problem.md",
          label: "Long answer",
          text: "b".repeat(20000),
          revision: "0".repeat(64),
        },
      ],
    }),
  ).toThrow(/too long/i);
});
