import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { hash } from "./lifecycle.ts";
import { parseRecord } from "./records.ts";

export interface ProjectDocument {
  path: string;
  title: string;
  body: string;
  revision: string;
}
export interface AdrDocument extends ProjectDocument {
  at: string | null;
  by: string | null;
  action: string | null;
}
export interface DocumentProblem {
  path: string;
  message: string;
}
const MAX_DOCUMENT_BYTES = 256 * 1024;
function documentPath(path: string, directory = false): boolean {
  return (
    !path.includes("\\") &&
    !path.includes("\0") &&
    !path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..") &&
    (path === "GLOSSARY.md" ||
      (directory && path === "docs") ||
      (path.startsWith("docs/") && (directory || path.endsWith(".md"))))
  );
}
async function checkedPath(
  root: string,
  path: string,
  directory = false,
): Promise<string> {
  if (!documentPath(path, directory))
    throw new Error("Invalid project document path");
  let cursor = await realpath(root);
  const parts = path.split("/");
  for (let index = 0; index < parts.length; index++) {
    cursor = join(cursor, parts[index] as string);
    const info = await lstat(cursor);
    if (info.isSymbolicLink())
      throw new Error("Project document path contains a symlink");
    if (
      index < parts.length - 1
        ? !info.isDirectory()
        : directory
          ? !info.isDirectory()
          : !info.isFile()
    )
      throw new Error("Project document path has an unexpected file type");
  }
  return cursor;
}
export async function projectDocumentPath(
  root: string,
  path: string,
): Promise<string> {
  return checkedPath(root, path);
}
async function bytes(root: string, path: string): Promise<Buffer> {
  const target = await checkedPath(root, path),
    file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await checkedPath(root, path);
    const info = await file.stat();
    if (!info.isFile())
      throw new Error("Project document must be a regular file");
    if (info.size > MAX_DOCUMENT_BYTES)
      throw new Error("Project document exceeds the 256 KiB reading limit");
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= MAX_DOCUMENT_BYTES) {
      const chunk = Buffer.alloc(
        Math.min(64 * 1024, MAX_DOCUMENT_BYTES + 1 - total),
      );
      const { bytesRead } = await file.read(chunk, 0, chunk.length, total);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > MAX_DOCUMENT_BYTES)
        throw new Error("Project document exceeds the 256 KiB reading limit");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    await checkedPath(root, path);
    return Buffer.concat(chunks, total);
  } finally {
    await file.close();
  }
}
function decoded(raw: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new Error("Project document is not valid UTF-8");
  }
}
function parts(
  path: string,
  raw: Buffer,
): { data: Record<string, unknown>; body: string; title: string } {
  const text = decoded(raw),
    doc = /^---\r?\n/.test(text) ? parseRecord(path, text) : null,
    body = doc?.body ?? text,
    data = doc?.data ?? {};
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  return {
    data,
    body,
    title:
      typeof data.title === "string"
        ? data.title
        : (heading ?? basename(path, ".md")),
  };
}
export async function readProjectDocument(
  root: string,
  path: string,
): Promise<ProjectDocument> {
  const raw = await bytes(root, path),
    doc = parts(path, raw);
  return { path, title: doc.title, body: doc.body, revision: hash(raw) };
}
/** Bounded public Markdown inventory; every body passes the ordinary contained reader. */
export async function listProjectDocuments(root: string): Promise<{
  entries: ProjectDocument[];
  problems: DocumentProblem[];
}> {
  const entries: ProjectDocument[] = [],
    problems: DocumentProblem[] = [];
  let visited = 0,
    total = 0;
  const problem = (path: string, error: unknown) =>
    problems.push({
      path,
      message: error instanceof Error ? error.message : "Document unreadable",
    });
  async function read(path: string): Promise<void> {
    try {
      const doc = await readProjectDocument(root, path);
      total += Buffer.byteLength(doc.body);
      if (total > 8 * 1024 * 1024)
        throw Error("Documentation exceeds the 8 MiB index limit");
      entries.push(doc);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        problem(path, error);
    }
  }
  async function visit(path: string, depth: number): Promise<void> {
    try {
      if (depth > 24)
        throw Error("Documentation exceeds the directory depth limit");
      const target = await checkedPath(root, path, true);
      const listing = await readdir(target);
      for (const name of listing.sort()) {
        if (++visited > 2048 || total > 8 * 1024 * 1024) {
          problem(path, Error("Documentation index limit reached"));
          break;
        }
        const item = `${path}/${name}`,
          info = await lstat(join(target, name));
        if (info.isSymbolicLink())
          problem(item, Error("Document path contains a symlink"));
        else if (info.isDirectory()) await visit(item, depth + 1);
        else if (name.endsWith(".md")) await read(item);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        problem(path, error);
    }
  }
  await read("GLOSSARY.md");
  await visit("docs", 0);
  return { entries, problems };
}
export function parseAdr(path: string, raw: Buffer): AdrDocument {
  const doc = parts(path, raw),
    date =
      typeof doc.data.date === "string"
        ? doc.data.date
        : (/^(\d{4}-\d{2}-\d{2})/.exec(basename(path))?.[1] ?? null);
  if (
    date !== null &&
    (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) ||
      Number.isNaN(Date.parse(date)))
  )
    throw new Error("ADR date is not valid");
  return {
    path,
    title: doc.title,
    body: doc.body,
    revision: hash(raw),
    at: date,
    by:
      typeof doc.data.by === "string"
        ? doc.data.by
        : typeof doc.data.author === "string"
          ? doc.data.author
          : null,
    action:
      typeof doc.data.action === "string" &&
      /^act-[0-9a-hjkmnp-tv-z]{6}$/.test(doc.data.action)
        ? doc.data.action
        : null,
  };
}
export async function listProjectAdrs(
  root: string,
): Promise<{ entries: AdrDocument[]; problems: DocumentProblem[] }> {
  const entries: AdrDocument[] = [],
    problems: DocumentProblem[] = [];
  async function visit(path: string): Promise<void> {
    let listing: string[];
    try {
      await checkedPath(root, path, true);
      listing = await readdir(join(root, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        problems.push({
          path,
          message:
            error instanceof Error
              ? error.message
              : "Document folder unreadable",
        });
      return;
    }
    for (const name of listing) {
      const item = `${path}/${name}`;
      try {
        const state = await lstat(join(root, item));
        if (state.isSymbolicLink())
          throw new Error("ADR path contains a symlink");
        if (state.isDirectory()) await visit(item);
        else if (name.endsWith(".md"))
          entries.push(parseAdr(item, await bytes(root, item)));
      } catch (error) {
        problems.push({
          path: item,
          message: error instanceof Error ? error.message : "ADR unreadable",
        });
      }
    }
  }
  await visit("docs/adr");
  return { entries, problems };
}
