import { expect, it } from "vitest";
import { parseRecord } from "../src/records.ts";
import { schemas, validateRecord } from "../src/schemas.ts";
import { bodies, markdown, samples } from "./samples.ts";

for (const [kind, data] of Object.entries(samples)) {
  it(`accepts ${kind} and unknown fields`, () => {
    const record = parseRecord(
      kind === "project" || kind === "lock" || kind === "operation"
        ? `${kind}.json`
        : `${kind}.md`,
      kind === "project" || kind === "lock" || kind === "operation"
        ? JSON.stringify(data)
        : markdown({ ...data, future: { extra: true } }, bodies[kind]),
    );
    expect(validateRecord(kind as keyof typeof schemas, record)).toEqual([]);
  });
}
it("every required field fails with file, field and line", () => {
  for (const [kind, schema] of Object.entries(schemas)) {
    const record = parseRecord(`${kind}.md`, markdown({ unexpected: true }));
    const errors = validateRecord(kind as keyof typeof schemas, record);
    expect(schema.safeParse({}).success).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatchObject({
      file: `${kind}.md`,
      line: 2,
      code: "schema",
    });
    expect(errors[0]?.field).not.toBe("$");
  }
});
it("requires plan headings and checkable acceptance criteria", () => {
  expect(
    validateRecord(
      "requirements",
      parseRecord("r.md", markdown(samples.requirements)),
    ),
  ).toEqual(
    expect.arrayContaining([expect.objectContaining({ field: "body" })]),
  );
  expect(
    validateRecord(
      "blueprint",
      parseRecord("b.md", markdown(samples.blueprint)),
    ),
  ).toHaveLength(3);
  expect(
    validateRecord(
      "acceptance",
      parseRecord("a.md", markdown(samples.acceptance)),
    ),
  ).toHaveLength(1);
});
it("rejects conditional invalid records", () => {
  for (const [kind, data] of [
    ["idea", { ...samples.idea, status: "rejected" }],
    ["action", { ...samples.action, doneBy: "you" }],
    ["action", { ...samples.action, stage: undefined }],
    ["action", { ...samples.action, stage: "done" }],
    ["run", { ...samples.run, outcome: "failed" }],
    ["release", { ...samples.release, status: "released" }],
  ] as const)
    expect(
      validateRecord(kind, parseRecord("x.md", markdown(data))),
    ).not.toEqual([]);
});
it("rejects nonterminal completion and incomplete manual steps", () => {
  for (const data of [
    { ...samples.action, status: "complete" },
    {
      ...samples.action,
      doneBy: "you",
      stage: undefined,
      status: "complete",
      steps: [{ id: "account", title: "Account", done: false }],
    },
  ])
    expect(
      validateRecord("action", parseRecord("x.md", markdown(data))),
    ).not.toEqual([]);
});
