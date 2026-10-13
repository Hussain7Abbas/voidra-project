---
{
  block: technology,
  title: Technologies and libraries,
  answers:
    [
      {
          id: stack,
          question: Which technologies are already chosen?,
          answer: TypeScript/ESM on Node.js 24; pnpm workspace; Electron 44 with a static
            Next.js 16 and React 19 renderer; shared format and run-engine
            packages.,
          status: inferred,
          source: "package.json:5-10; apps/desktop/package.json:2-16,34-43;
            packages/voidra/package.json:2-23;
            tools/run-engine/package.json:1-20",
          updatedAt: 2026-10-13T14:03:30.899Z
        },
      {
          id: libraries,
          question: Which libraries or tools must be used or avoided?,
          answer:
            [
              "Use zod for request, response, and schema validation
                (apps/desktop/package.json:18-23).",
              Use YAML-backed shared Voidra records and the public voidra
                package (packages/voidra/package.json:21-34).,
              The desktop uses better-sqlite3 and chokidar for its rebuildable
                local index and project watching
                (apps/desktop/package.json:18-23).,
              "The renderer uses TanStack Query, Tailwind CSS, Lucide, React
                Markdown and rehype-sanitize (apps/desktop/package.json:25-43)."
            ],
          status: inferred,
          source: apps/desktop/package.json:18-43; packages/voidra/package.json:21-34,
          updatedAt: 2026-10-13T14:03:30.899Z
        }
    ]
}
---
