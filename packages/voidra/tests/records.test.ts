import { describe, expect, it } from "vitest";
import { VoidraError } from "../src/errors.ts";
import { fieldLine, parseRecord, serializeRecord } from "../src/records.ts";

describe("records at the byte boundary", () => {
  it("locates fields and exposes readable diagnostics", () => {
    const record = parseRecord("x.md", "---\na: 1\nb:\n  nested: 2\n---\n");
    expect(fieldLine(record, ["b", "nested"])).toBe(4);
    expect(fieldLine(record, ["missing"])).toBe(2);
    expect(fieldLine(parseRecord("x.json", "{}"), ["missing"])).toBe(1);
    expect(
      new VoidraError("invalid", "x.md", "Bad field", "a", 2).diagnostic(),
    ).toEqual({
      code: "invalid",
      file: "x.md",
      message: "Bad field",
      field: "a",
      line: 2,
    });
    expect(() => serializeRecord(record, { bad: undefined })).toThrow(/JSON/);
  });
  for (const eol of ["\n", "\r\n"]) {
    for (const bom of ["", "\ufeff"]) {
      for (const body of ["", `# Notes${eol}Untouched body.${eol}`]) {
        it(`round trips ${JSON.stringify({ eol, bom, body })}`, () => {
          const raw = `${bom}---${eol}title: 'Original' # keep me${eol}custom:${eol}  nested: [one, two]${eol}---${eol}${body}`;
          const record = parseRecord("test.md", raw);
          expect(serializeRecord(record)).toEqual(Buffer.from(raw));
          expect(
            serializeRecord(record, {
              ...record.data,
              title: "Changed",
            }).toString(),
          ).toContain("# keep me");
          expect(
            serializeRecord(record, {
              ...record.data,
              title: "Changed",
            }).toString(),
          ).toContain(body);
          expect(
            parseRecord(
              "test.md",
              serializeRecord(record, { ...record.data, title: "Changed" }),
            ).data.custom,
          ).toEqual({ nested: ["one", "two"] });
        });
      }
    }
  }
  it("preserves JSON bytes and unknown fields; writes deliberate edits", () => {
    const raw = '\ufeff{ "format": 1, "custom": {"a": 1} }\r\n';
    const record = parseRecord("test.json", raw);
    expect(serializeRecord(record).toString()).toBe(raw);
    expect(
      parseRecord(
        "test.json",
        serializeRecord(record, { ...record.data, format: 2 }),
      ).data,
    ).toEqual({ format: 2, custom: { a: 1 } });
  });
  it("changes the body without reformatting its header", () => {
    const raw = "---\ntitle: 'Original'\n---\nold";
    expect(
      serializeRecord(parseRecord("test.md", raw), undefined, "new").toString(),
    ).toBe(raw.replace("old", "new"));
  });
  it("adds and deletes fields without dropping other content", () => {
    const record = parseRecord("x.md", "---\na: 1\nb: 2\n---\n");
    expect(
      parseRecord("x.md", serializeRecord(record, { b: 2, c: 3 })).data,
    ).toEqual({ b: 2, c: 3 });
  });
  it.each([
    ["x.md", "---\nid: act-000000\n", "incomplete-write"],
    ["x.md", "no header", "frontmatter"],
    ["x.md", "---\na: [\n---\n", "yaml"],
    ["x.md", "---\n- list\n---\n", "mapping"],
    ["x.json", "{", "json"],
    ["x.json", "[]", "mapping"],
  ])("reports malformed %s", (file, raw, code) => {
    expect(() => parseRecord(file, raw)).toThrow(
      expect.objectContaining({ code, file, line: expect.any(Number) }),
    );
  });
  it("rejects invalid UTF-8, aliases with non-JSON values and conflict markers", () => {
    expect(() => parseRecord("x.md", Buffer.from([0xff]))).toThrow(/UTF-8/);
    expect(() => parseRecord("x.md", "---\na: .inf\n---\n")).toThrow(/JSON/);
    expect(() =>
      parseRecord(
        "x.md",
        "---\na: 1\n---\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> other\n",
      ),
    ).toThrow(/conflict/);
  });
});
it("rejects cyclic aliases but retains ordinary aliases", () => {
  expect(() => parseRecord("x.md", "---\na: &a {self: *a}\n---\n")).toThrow(
    /JSON/,
  );
  const raw = "---\na: &a [1, 2]\nb: *a\n---\n";
  expect(serializeRecord(parseRecord("x.md", raw)).toString()).toBe(raw);
});
it("preserves nested comments and unknowns when editing a nested field", () => {
  const raw =
    "---\nprofile:\n  name: Old # retain nested comment\n  future: yes # retain unknown comment\nlist:\n  - name: One # retain list comment\n---\nbody\n";
  const record = parseRecord("x.md", raw);
  const edited = serializeRecord(record, {
    ...record.data,
    profile: { ...(record.data.profile as object), name: "New" },
    list: [{ name: "Two" }],
  }).toString();
  expect(edited).toContain("# retain nested comment");
  expect(edited).toContain("# retain unknown comment");
  expect(edited).toContain("# retain list comment");
  expect(edited).toContain("body\n");
});
