import { execFileSync } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseRecord, readTemplates } from "voidra";
import { z } from "zod";

const names = z.string().regex(/^voidra-[a-z]+(?:-[a-z]+)*$/);
export interface SyncOptions {
  sourceRoot: string;
  destinationRoot: string;
  dryRun: boolean;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}
export interface SyncResult {
  paths: string[];
  diff: string;
  published: string[];
}
const begin = "<!-- voidra-project-release:start -->",
  end = "<!-- voidra-project-release:end -->";
function managed(text: string, body: string): string {
  const block = `${begin}\n${body.trim()}\n${end}`;
  const start = text.indexOf(begin),
    finish = text.indexOf(end);
  if (start < 0 && finish < 0) return `${text.trimEnd()}\n\n${block}\n`;
  if (
    start < 0 ||
    finish < start ||
    text.indexOf(begin, start + 1) >= 0 ||
    text.indexOf(end, finish + 1) >= 0
  )
    throw new Error(
      "Malformed Voidra catalog markers; preserve and repair them before syncing.",
    );
  return `${text.slice(0, start)}${block}${text.slice(finish + end.length)}`;
}
async function containedTree(root: string): Promise<void> {
  const stat = await lstat(root);
  if (stat.isSymbolicLink())
    throw new Error("Release payload contains a symbolic link");
  if (stat.isDirectory())
    for (const name of await readdir(root))
      await containedTree(join(root, name));
  else if (!stat.isFile())
    throw new Error("Release payload contains an unsupported file");
}
function runner(options: SyncOptions) {
  const env = { ...process.env, ...options.env };
  const command = (root: string, exe: string, args: string[]): string =>
    execFileSync(exe, args, {
      cwd: root,
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  return {
    command,
    git: (root: string, args: string[]) => command(root, "git", args).trimEnd(),
    make: (root: string, args: string[]) => {
      options.log?.(`make ${args.join(" ")}`);
      command(root, "make", args);
    },
  };
}
/** Prevalidate an immutable staged release; publish skills singly before the shared catalog. */
export async function syncSkills(options: SyncOptions): Promise<SyncResult> {
  const destination = resolve(options.destinationRoot),
    source = resolve(options.sourceRoot),
    { git, make } = runner(options);
  if (git(destination, ["status", "--porcelain", "--untracked-files=all"]))
    throw new Error("Distribution working tree must be clean; preserved.");
  if (git(destination, ["symbolic-ref", "--short", "HEAD"]) !== "main")
    throw new Error("Distribution checkout must be on main");
  const base = git(destination, ["rev-parse", "HEAD"]),
    remote = git(destination, ["ls-remote", "origin", "refs/heads/main"]).split(
      /\s/,
    )[0];
  if (remote !== base)
    throw new Error(
      "Distribution main differs from origin; reconcile it before syncing.",
    );
  const temp = await mkdtemp(join(tmpdir(), "voidra-skills-preview-")),
    prepared = join(temp, "prepared");
  try {
    git(temp, ["clone", "--quiet", "--no-hardlinks", destination, prepared]);
    const metadata: { name: string; description: string }[] = [];
    for (const entry of (
      await readdir(join(source, "skills"), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || !entry.name.startsWith("voidra-")) continue;
      const name = names.parse(entry.name),
        path = join(source, "skills", name);
      await containedTree(path);
      const skill = parseRecord(
        "SKILL.md",
        await readFile(join(path, "SKILL.md"), "utf8"),
      );
      const data = z
        .object({
          name: z.literal(name),
          description: z.string().min(1),
          metadata: z.object({
            version: z.string().regex(/^\d+\.\d+\.\d+$/),
            "format-version": z.string().regex(/^\d+$/),
          }),
        })
        .parse(skill.data);
      metadata.push({ name, description: data.description });
      const target = join(prepared, "skills", name);
      await rm(target, { recursive: true, force: true });
      await cp(path, target, { recursive: true });
      await cp(join(source, "LICENSE"), join(target, "LICENSE"));
    }
    if (!metadata.length) throw new Error("No distributable Voidra skills");
    await containedTree(join(source, "templates"));
    const catalog = await readTemplates(join(source, "templates"));
    if (catalog.diagnostics.length || !catalog.templates.length)
      throw new Error("Template release payload is invalid");
    await rm(join(prepared, "templates"), { recursive: true, force: true });
    await cp(join(source, "templates"), join(prepared, "templates"), {
      recursive: true,
    });
    await cp(join(source, "LICENSE"), join(prepared, "templates/LICENSE"));
    await writeFile(
      join(prepared, "templates/AGENTS.md"),
      "# Distributed Voidra templates\n\nThese are validated release copies from [Voidra Project](https://github.com/Hussain7Abbas/voidra-project). Develop changes in the source repository and sync releases; preserve IDs, versions, required format and supported question types. The files use AGPL-3.0-or-later; see LICENSE. Keep CLAUDE.md as only @AGENTS.md with a trailing newline.\n",
    );
    await writeFile(join(prepared, "templates/CLAUDE.md"), "@AGENTS.md\n");
    const readmePath = join(prepared, "README.md"),
      readme = await readFile(readmePath, "utf8"),
      table = metadata
        .map(
          (skill) =>
            `| [${skill.name}](skills/${skill.name}/SKILL.md) | ${skill.description.replaceAll("|", "\\|").replaceAll("\n", " ")} |`,
        )
        .join("\n");
    await writeFile(
      readmePath,
      managed(
        readme,
        `## Voidra Project release skills\n\nThese AGPL-3.0-or-later release copies come from [Voidra Project](https://github.com/Hussain7Abbas/voidra-project); develop changes there. Each skill contains its own runtime, matching references/templates and license. Shared template copies are in [templates/](templates/).\n\n| Skill | Purpose |\n| --- | --- |\n${table}\n\nInstall selected copies with \`npx skills add Hussain7Abbas/voidra-skills --skill ${metadata.map((skill) => skill.name).join(" ")}\`. For Codex, check the installed CLI's global destination against current agent documentation; the desktop installer owns exact local copies. A Git push does not promise immediate skills.sh indexing.`,
      ),
    );
    const configPath = join(prepared, "skills.sh.json"),
      config = JSON.parse(await readFile(configPath, "utf8")) as {
        groupings: Array<{
          title: string;
          description: string;
          skills: string[];
        }>;
        [key: string]: unknown;
      };
    if (!Array.isArray(config.groupings))
      throw new Error("Distribution catalog is invalid");
    config.groupings = config.groupings.filter(
      (group) => group.title !== "Voidra Project",
    );
    config.groupings.push({
      title: "Voidra Project",
      description:
        "Plan and track software projects with exact local gates and standalone coding agents.",
      skills: metadata.map((skill) => skill.name),
    });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const instructions = join(prepared, "AGENTS.md");
    await writeFile(
      instructions,
      managed(
        await readFile(instructions, "utf8"),
        "## Voidra release copies\n\n- `templates/` contains validated release copies; follow [their instructions](templates/AGENTS.md).\n- Voidra skills/templates are developed in Voidra Project. Publish one committed skill at a time through make publish; publish shared catalogs/templates separately. Preserve unrelated skills and AGPL license files.",
      ),
    );
    const docs = join(prepared, "docs/skills.md");
    await writeFile(
      docs,
      managed(
        await readFile(docs, "utf8"),
        "## Voidra Project copies\n\nThe [README catalog](../README.md#voidra-project-release-skills) lists the shipped Voidra skills. [Templates](../templates/) and these self-contained skill copies are synchronized from Voidra Project through its make skills-sync release command. They retain AGPL-3.0-or-later licenses; edit them in the source repository, then prevalidate and publish each skill separately from shared catalog changes.",
      ),
    );
    make(prepared, ["setup"]);
    make(prepared, ["validate"]);
    make(prepared, ["skills-config"]);
    for (const skill of metadata)
      make(prepared, ["validate", `SKILL=${skill.name}`]);
    git(prepared, ["add", "--intent-to-add", "."]);
    const paths = git(prepared, ["diff", "--name-only"])
        .split("\n")
        .filter(Boolean),
      diff = git(prepared, ["diff", "--no-ext-diff", "--binary"]);
    if (options.dryRun) {
      options.log?.(diff || "Release copies are current.");
      return { paths, diff, published: [] };
    }
    if (
      git(destination, ["rev-parse", "HEAD"]) !== base ||
      git(destination, ["status", "--porcelain"]) ||
      git(destination, ["ls-remote", "origin", "refs/heads/main"]).split(
        /\s/,
      )[0] !== base
    )
      throw new Error(
        "Distribution changed during validation; no publication started.",
      );
    make(destination, ["setup"]);
    const published: string[] = [];
    for (const skill of metadata) {
      const target = join(destination, "skills", skill.name);
      await rm(target, { recursive: true, force: true });
      await cp(join(prepared, "skills", skill.name), target, {
        recursive: true,
      });
      make(destination, ["validate", `SKILL=${skill.name}`]);
      git(destination, ["add", `skills/${skill.name}`]);
      const changed = !!git(destination, ["diff", "--cached", "--name-only"]);
      if (changed)
        git(destination, [
          "commit",
          "-m",
          `Sync ${skill.name} from Voidra Project`,
        ]);
      make(destination, ["publish", `SKILL=${skill.name}`]);
      if (changed) published.push(skill.name);
      options.log?.(
        `${skill.name}: ${changed ? "published" : "current"} at ${git(destination, ["rev-parse", "HEAD"])}`,
      );
    }
    for (const path of [
      "templates",
      "README.md",
      "skills.sh.json",
      "AGENTS.md",
      "docs/skills.md",
    ]) {
      await rm(join(destination, path), { recursive: true, force: true });
      await mkdir(dirname(join(destination, path)), { recursive: true });
      await cp(join(prepared, path), join(destination, path), {
        recursive: true,
      });
    }
    make(destination, ["validate"]);
    make(destination, ["skills-config"]);
    git(destination, [
      "add",
      "templates",
      "README.md",
      "skills.sh.json",
      "AGENTS.md",
      "docs/skills.md",
    ]);
    if (git(destination, ["diff", "--cached", "--name-only"])) {
      git(destination, [
        "commit",
        "-m",
        "Update Voidra release templates and catalog",
      ]);
      git(destination, [
        "-c",
        "push.followTags=false",
        "push",
        "origin",
        "HEAD:refs/heads/main",
      ]);
    }
    options.log?.(
      `Published ${published.length} checked Voidra skill copies and shared release catalog.`,
    );
    return { paths, diff, published };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
