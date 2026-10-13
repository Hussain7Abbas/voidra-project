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
