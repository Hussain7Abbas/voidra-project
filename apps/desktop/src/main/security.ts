import { createHash, randomBytes } from "node:crypto";
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
export function contentPolicy(html: string, styleNonce?: string): string {
  if (styleNonce && !/^[A-Za-z0-9_-]{32}$/.test(styleNonce))
    throw Error("Invalid editor style nonce");
  const hashes = Array.from(
    html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g),
    (match) =>
      `'sha256-${createHash("sha256")
        .update(match[1] ?? "")
        .digest("base64")}'`,
  );
  return `default-src 'none'; script-src 'self' ${hashes.join(" ")}; style-src 'self'${styleNonce ? ` 'nonce-${styleNonce}'` : ""}; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`;
}

/** Only main-generated document styles are authorized; scripts retain exact build hashes. */
export function rendererDocument(
  html: string,
  theme: "light" | "dark",
): { html: string; policy: string } {
  if (!/<head(?:\s[^>]*)?>/.test(html))
    throw Error("Renderer document has no head");
  const nonce = randomBytes(24).toString("base64url");
  const body = html
    .replace(/<html\b/, `<html data-theme="${theme}"`)
    .replace(
      /<head(?:\s[^>]*)?>/,
      (head) => `${head}<meta name="voidra-style-nonce" content="${nonce}">`,
    );
  return { html: body, policy: contentPolicy(body, nonce) };
}
