import { expect, it } from "vitest";
import { createId } from "../src/ids.ts";

it("generates all prefixes and retries collisions", () => {
  for (const prefix of ["act", "idea", "q", "run", "op", "prj"] as const)
    expect(createId(prefix)).toMatch(
      new RegExp(`^${prefix}-[0-9a-hjkmnp-tv-z]{6}$`),
    );
  let n = 0;
  expect(
    createId("act", new Set(["act-000000"]), () => Buffer.alloc(6, n++)),
  ).toBe("act-111111");
  expect(() =>
    createId("act", new Set(["act-000000"]), () => Buffer.alloc(6)),
  ).toThrow(/collision/);
  expect(() => createId("no" as "act")).toThrow(/prefix/);
  expect(() => createId("act", new Set(), () => Buffer.alloc(1))).toThrow(
    /six/,
  );
});
