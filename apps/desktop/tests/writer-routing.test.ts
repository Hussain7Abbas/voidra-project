import { expect, it } from "vitest";
import {
  workspaceEdits,
  workspaceRequestSchema,
} from "../src/shared/bridge.ts";

it("classifies every validated project command and allows only reads, Git recovery and replay outside edit history", () => {
  const commands = workspaceRequestSchema.options
    .map((schema) => schema.shape.command.value)
    .sort();
  expect(Object.keys(workspaceEdits).sort()).toEqual(commands);
  expect(
    Object.entries(workspaceEdits)
      .filter(([, label]) => label === null)
      .map(([command]) => command)
      .sort(),
  ).toEqual(
    [
      "workspace",
      "commit-planning",
      "recover-planning",
      "discard-planning",
      "undo",
      "redo",
    ].sort(),
  );
});

it("preserves exact Markdown source through answer and plan-feedback bridge validation", () => {
  const source = "\r\n    Preserve indentation\r\n**العربية** 🧭\r\n",
    revision = "0".repeat(64);
  const answer = workspaceRequestSchema.parse({
    command: "answer-question",
    id: "act-000000",
    question: "q-000000",
    revision,
    answer: { kind: "text", text: source },
  });
  expect(
    answer.command === "answer-question" && answer.answer.kind === "text"
      ? answer.answer.text
      : null,
  ).toBe(source);
  const feedback = workspaceRequestSchema.parse({
    command: "reject-plan",
    id: "act-000000",
    revision,
    feedback: source,
  });
  expect(feedback.command === "reject-plan" ? feedback.feedback : null).toBe(
    source,
  );
});
