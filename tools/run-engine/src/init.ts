import { randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  applyOperation,
  checkProject,
  detectCode,
  type IntakeOptions,
  initializeProject,
  PACKAGE_VERSION,
  type Template,
} from "voidra";

const section = `\n<!-- Voidra planning -->\n## Voidra planning\n\nRead [.voidra/README.md](.voidra/README.md), the project profile and action before work. Respect the question, exact-content plan and review gates. Use the Voidra skills for tracked work, and validate after planning writes with the matching installed skill’s bundled checker (Voidra ${PACKAGE_VERSION}): \`node <skill-folder>/scripts/voidra.mjs check .\`. Registry installation is not required.\n`;
async function readInstruction(
  root: string,
  name: string,
): Promise<string | null> {
  try {
    if ((await lstat(join(root, name))).isSymbolicLink())
      throw new Error(`Instruction path is a symlink: ${name}`);
    return await readFile(join(root, name), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function writeInstruction(
  root: string,
  name: "AGENTS.md" | "CLAUDE.md",
  before: string | null,
  after: string,
): Promise<void> {
  const current = await readInstruction(root, name);
  if (current !== before)
    throw new Error(`Instruction changed during intake: ${name}`);
  if (before === after) return;
  const file = join(root, name),
    temp = join(dirname(file), `.${name}.voidra-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, after, { mode: 0o644 });
    if ((await readInstruction(root, name)) !== before)
      throw new Error(`Instruction changed during intake: ${name}`);
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true });
  }
}
async function validSource(root: string, source: string): Promise<void> {
  const path = source.split(/:\d+/)[0]?.trim() ?? "";
  if (!path || isAbsolute(path) || path.split(/[\\/]/).includes(".."))
    throw new Error("Inference source must name a file inside the project");
  const canonical = await realpath(root);
  let target = canonical;
  for (const part of path.split("/")) {
    target = join(target, part);
    const stat = await lstat(target).catch(() => null);
    if (!stat || stat.isSymbolicLink())
      throw new Error(`Inference source is missing or linked: ${path}`);
  }
  const located = await realpath(resolve(root, path));
  if (
    relative(canonical, located).startsWith("..") ||
    !(await lstat(located)).isFile()
  )
    throw new Error(`Inference source is not a project file: ${path}`);
}
export async function initializeExisting(
  root: string,
  template: Template,
  options: IntakeOptions & {
    glossary: string;
    checkpoint?: () => Promise<void> | void;
  },
): Promise<{ paths: string[] }> {
  if (!(await detectCode(root)).hasCode)
    throw new Error("No existing code detected; use new-project onboarding");
  for (const answer of Object.values(options.answers)) {
    if (!answer.source) throw new Error("Every inference requires a source");
    await validSource(root, answer.source);
  }
  const agents = await readInstruction(root, "AGENTS.md"),
    claude = await readInstruction(root, "CLAUDE.md"),
    glossary = await readInstruction(root, "GLOSSARY.md");
  if (!options.glossary.trim()) throw new Error("A draft glossary is required");
  const result = await initializeProject(root, template, {
      ...options,
      inferred: true,
      bootstrap: false,
      by: "Agent",
    }),
    paths = [...result.paths];
  const verify = async () => {
    const checked = await checkProject(root);
    if (checked.diagnostics.length)
      throw new Error(checked.diagnostics.map((d) => d.message).join("; "));
  };
  await verify();
  await options.checkpoint?.();
  if (glossary === null) {
    await applyOperation(
      root,
      {
        changes: [
          {
            path: "GLOSSARY.md",
            expectedHash: null,
            content: options.glossary,
          },
        ],
      },
      { allowGlossary: true },
    );
    paths.push("GLOSSARY.md");
    await verify();
  }
  const append = (before: string | null) =>
    before?.includes(".voidra/README.md")
      ? before
      : (before ?? "# Project instructions\n") + section;
  if (agents !== null || claude === null || claude.trim() === "@AGENTS.md") {
    const after = append(agents);
    await writeInstruction(root, "AGENTS.md", agents, after);
    if (after !== agents) paths.push("AGENTS.md");
    await verify();
    if (claude === null) {
      await writeInstruction(root, "CLAUDE.md", null, "@AGENTS.md\n");
      paths.push("CLAUDE.md");
      await verify();
    } else if (claude.trim() !== "@AGENTS.md") {
      const afterClaude = append(claude);
      await writeInstruction(root, "CLAUDE.md", claude, afterClaude);
      if (afterClaude !== claude) paths.push("CLAUDE.md");
      await verify();
    }
  } else {
    const after = append(claude);
    await writeInstruction(root, "CLAUDE.md", claude, after);
    if (after !== claude) paths.push("CLAUDE.md");
    await verify();
    // Preserve Claude-only rules and give Codex the same instruction entry point.
    await writeInstruction(
      root,
      "AGENTS.md",
      null,
      `# Project instructions\n\nRead [CLAUDE.md](CLAUDE.md) for existing project instructions.\n${section}`,
    );
    paths.push("AGENTS.md");
    await verify();
  }
  return { paths };
}
