/** Repository docs references only; filesystem containment is rechecked by the service. */
export function resolveDocumentLink(
  source: string,
  href: string,
): string | null {
  if (
    /^[a-z][a-z\d+.-]*:/i.test(href) ||
    href.startsWith("//") ||
    href.includes("\0")
  )
    return null;
  try {
    const root =
      href.startsWith("docs/") ||
      href === "GLOSSARY.md" ||
      href.startsWith("/docs/") ||
      href === "/GLOSSARY.md";
    const value = new URL(
      root ? `/project/${href.replace(/^\//, "")}` : href,
      `https://voidra.invalid/project/${source}`,
    );
    if (
      value.origin !== "https://voidra.invalid" ||
      !value.pathname.startsWith("/project/")
    )
      return null;
    const path = decodeURIComponent(value.pathname.slice("/project/".length));
    if (
      path.includes("\\") ||
      path.includes("\0") ||
      path
        .split("/")
        .some((part) => part === "" || part === "." || part === "..")
    )
      return null;
    return path === "GLOSSARY.md" ||
      (path.startsWith("docs/") && path.endsWith(".md"))
      ? path
      : null;
  } catch {
    return null;
  }
}
