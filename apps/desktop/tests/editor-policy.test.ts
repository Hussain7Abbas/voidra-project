import { expect, it } from "vitest";
import { contentPolicy, rendererDocument } from "../src/main/security.ts";

it("authorizes generated editor styles with a fresh per-document nonce without enabling arbitrary inline styles or scripts", () => {
  const html =
    "<html><head><script>trusted()</script></head><body></body></html>";
  const a = rendererDocument(html, "dark"),
    b = rendererDocument(html, "light");
  const nonce = a.html.match(
    /name="voidra-style-nonce" content="([A-Za-z0-9_-]+)"/,
  )?.[1];
  expect(nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect(a.html).toContain('data-theme="dark"');
  expect(b.html).not.toContain(nonce);
  expect(a.policy).toContain(`style-src 'self' 'nonce-${nonce}'`);
  expect(
    a.policy.split(";").find((p) => p.includes("script-src")),
  ).not.toContain("nonce-");
  expect(a.policy).toContain("sha256-");
  expect(a.policy).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(a.policy).toContain("connect-src 'none'");
  expect(() => contentPolicy(html, "bad'nonce")).toThrow();
  expect(() =>
    rendererDocument("<body>missing head</body>", "light"),
  ).toThrow();
});
