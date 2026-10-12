import { isDeepStrictEqual } from "node:util";
import { isMap, isSeq, LineCounter, parseDocument } from "yaml";
import { VoidraError } from "./errors.ts";

export interface RecordDocument {
  file: string;
  raw: string;
  data: Record<string, unknown>;
  body: string;
  eol: string;
  bom: string;
  header: string;
  opening: string;
  closing: string;
  yaml?: ReturnType<typeof parseDocument>;
  lines?: LineCounter;
}

function jsonValue(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): boolean {
  if (depth > 1000) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => jsonValue(item, ancestors, depth + 1))
    : Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((item) =>
        jsonValue(item, ancestors, depth + 1),
      );
  ancestors.delete(value);
  return valid;
}

export function parseRecord(
  file: string,
  input: string | Uint8Array,
): RecordDocument {
  let raw: string;
  try {
    raw =
      typeof input === "string"
        ? input
        : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
            input,
          );
  } catch {
    throw new VoidraError("encoding", file, "Expected valid UTF-8");
  }
  if (/^(<<<<<<< |=======\r?$|>>>>>>> )/m.test(raw))
    throw new VoidraError("conflict", file, "Unresolved merge conflict");
  const bom = raw.startsWith("\ufeff") ? "\ufeff" : "";
  const source = raw.slice(bom.length);
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const base = {
    file,
    raw,
    eol,
    bom,
    body: "",
    header: "",
    opening: "",
    closing: "",
  };
  let data: unknown;
  if (file.endsWith(".json") || file.endsWith("/run.lock")) {
    try {
      data = JSON.parse(source);
    } catch {
      throw new VoidraError("json", file, "Invalid JSON or incomplete write");
    }
  } else {
    const opening = /^---\r?\n/.exec(source)?.[0];
    if (!opening)
      throw new VoidraError(
        "frontmatter",
        file,
        "Expected YAML frontmatter starting with ---",
      );
    const tail = source.slice(opening.length);
    const end = /^---(?:\r?\n|$)/m.exec(tail);
    if (!end)
      throw new VoidraError(
        "incomplete-write",
        file,
        "Incomplete write: closing frontmatter delimiter is missing",
      );
    const header = tail.slice(0, end.index);
    const lines = new LineCounter();
    const yaml = parseDocument(header, {
      keepSourceTokens: true,
      lineCounter: lines,
      version: "1.2",
    });
    const error = yaml.errors[0];
    if (error)
      throw new VoidraError(
        "yaml",
        file,
        error.message,
        "$",
        (error.linePos?.[0]?.line ?? 1) + 1,
      );
    try {
      data = yaml.toJS({ maxAliasCount: 100 });
    } catch {
      throw new VoidraError("yaml", file, "YAML alias limit exceeded");
    }
    Object.assign(base, {
      opening,
      header,
      closing: end[0],
      body: tail.slice(end.index + end[0].length),
      yaml,
      lines,
    });
  }
  if (data === null || typeof data !== "object" || Array.isArray(data))
    throw new VoidraError("mapping", file, "Expected a record mapping");
  if (!jsonValue(data))
    throw new VoidraError(
      "mapping",
      file,
      "Record values must be JSON-compatible",
    );
  return { ...base, data: data as Record<string, unknown> };
}

export function fieldLine(record: RecordDocument, path: PropertyKey[]): number {
  if (!record.yaml || !record.lines) return 1;
  const node = record.yaml.getIn(path, true);
  const offset =
    node && typeof node === "object" && "range" in node
      ? (node.range as number[] | undefined)?.[0]
      : undefined;
  return offset === undefined ? 2 : record.lines.linePos(offset).line + 1;
}

export function serializeRecord(
  record: RecordDocument,
  data = record.data,
  body = record.body,
): Buffer {
  const changed = !isDeepStrictEqual(record.data, data);
  if (!changed && body === record.body) return Buffer.from(record.raw);
  if (!jsonValue(data))
    throw new VoidraError(
      "mapping",
      record.file,
      "Record values must be JSON-compatible",
    );
  if (!record.yaml)
    return Buffer.from(
      record.bom +
        JSON.stringify(data, null, 2).replaceAll("\n", record.eol) +
        record.eol,
    );
  let header = record.header;
  if (changed) {
    const document = record.yaml.clone();
    const patch = (
      before: unknown,
      after: unknown,
      path: (string | number)[],
    ): void => {
      if (isDeepStrictEqual(before, after)) return;
      const node = document.getIn(path, true);
      if (
        isMap(node) &&
        before !== null &&
        after !== null &&
        typeof before === "object" &&
        typeof after === "object" &&
        !Array.isArray(before) &&
        !Array.isArray(after)
      ) {
        const old = before as Record<string, unknown>;
        const next = after as Record<string, unknown>;
        for (const key of Object.keys(old))
          if (!(key in next)) document.deleteIn([...path, key]);
        for (const [key, value] of Object.entries(next))
          patch(old[key], value, [...path, key]);
      } else if (isSeq(node) && Array.isArray(before) && Array.isArray(after)) {
        for (let i = before.length - 1; i >= after.length; i--)
          document.deleteIn([...path, i]);
        for (let i = 0; i < after.length; i++)
          patch(before[i], after[i], [...path, i]);
      } else document.setIn(path, after);
    };
    patch(record.data, data, []);
    header = document.toString().replaceAll("\n", record.eol);
  }
  return Buffer.from(
    record.bom +
      record.opening +
      header +
      record.closing +
      (body && record.closing === "---" ? record.eol : "") +
      body,
  );
}
