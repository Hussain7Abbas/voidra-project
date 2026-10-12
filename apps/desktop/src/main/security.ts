import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
export const APP_ORIGIN = "app://voidra-project";
export function isTrustedFrame(url: string, mainFrame: boolean): boolean {
  try {
    const parsed = new URL(url);
    return (
      mainFrame &&
      parsed.protocol === "app:" &&
      parsed.host === "voidra-project"
    );
  } catch {
    return false;
  }
}
export async function resolveAsset(
  root: string,
  input: string,
): Promise<string> {
  const url = new URL(input);
  if (!isTrustedFrame(input, true)) throw new Error("Untrusted app origin");
  const path = decodeURIComponent(url.pathname);
  if (
    path.includes("\0") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  )
    throw new Error("Unsafe asset path");
  const canonical = await realpath(root);
  const target = await realpath(
    join(canonical, path === "/" ? "index.html" : path),
  );
  const rel = relative(canonical, target);
  if (rel.startsWith("..") || isAbsolute(rel) || !(await stat(target)).isFile())
    throw new Error("Asset escapes renderer directory");
  return target;
}
export function contentPolicy(html: string): string {
  const hashes = Array.from(
    html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
    (match) =>
      `'sha256-${createHash("sha256")
        .update(match[1] ?? "")
        .digest("base64")}'`,
  );
  return `default-src 'none'; script-src 'self' ${hashes.join(" ")}; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`;
}
