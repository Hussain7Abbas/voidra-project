import { expect, it } from "vitest";
import { resolveDocumentLink } from "../src/shared/document-links.ts";

it("resolves root citations and normal relative docs links without escaping the project", () => {
  expect(
    resolveDocumentLink(
      ".voidra/profile/technology.md",
      "docs/architecture.md",
    ),
  ).toBe("docs/architecture.md");
  expect(
    resolveDocumentLink(
      "docs/adr/2026-storage.md",
      "../architecture.md#storage",
    ),
  ).toBe("docs/architecture.md");
  expect(
    resolveDocumentLink(
      ".voidra/actions/act-000000/blueprint.md",
      "../../../GLOSSARY.md",
    ),
  ).toBe("GLOSSARY.md");
  expect(resolveDocumentLink("docs/intro.md", "a%23b.md")).toBe("docs/a#b.md");
  for (const href of [
    "../../outside.md",
    "../../../docs/outside.md",
    "file:///secret.md",
    "https://example.com/docs/page.md",
    "//example.com/page.md",
    "../.voidra/local/run.lock",
    "javascript:alert(1)",
  ])
    expect(resolveDocumentLink("docs/intro.md", href)).toBeNull();
});
