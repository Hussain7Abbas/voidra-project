import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { lifecycles, planFiles, planRevision } from "../src/lifecycle.ts";
import {
  checkProject,
  type ProjectFiles,
  readProjectFiles,
} from "../src/project.ts";
import { type Action, schemas } from "../src/schemas.ts";
import { initializeProject, loadTemplate } from "../src/templates.ts";
import { bodies, markdown, samples, time } from "../tests/samples.ts";

const buffer = (raw: string): Buffer => Buffer.from(raw);
export function minimalFiles(): ProjectFiles {
  return new Map([
    [
      ".voidra/voidra.json",
      buffer(`${JSON.stringify(samples.project, null, 2)}\n`),
    ],
    [".voidra/README.md", buffer("# Voidra\n\nPlanning fixture.\n")],
    [".voidra/.gitignore", buffer("local/\n")],
  ]);
}
const numberId = (n: number): string => {
  const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out = alphabet[n & 31] + out;
    n = Math.floor(n / 32);
  }
  return `act-${out}`;
};
function addAction(files: ProjectFiles, action: Action): void {
  if (lifecycles[action.type].planGate || action.type === "release") {
    const plan = Object.fromEntries(
      planFiles.map((file) => [
        file,
        buffer(
          markdown({ action: action.id }, bodies[file.replace(".md", "")]),
        ),
      ]),
    ) as Record<(typeof planFiles)[number], Buffer>;
    for (const file of planFiles)
      files.set(`.voidra/actions/${action.id}/${file}`, plan[file]);
    const revision = planRevision(plan);
    if (
      lifecycles[action.type].planGate &&
      ["implement", "verify", "review", "done", "released"].includes(
        action.stage ?? "",
      )
    )
      action = {
        ...action,
        planApproval: {
          by: "Fixture author",
          at: time,
          hashes: revision.hashes,
        },
      };
    if (action.type === "release" && action.stage === "released")
      action = {
        ...action,
        reviewDecision: {
          by: "Fixture author",
          at: time,
          revision: revision.revision,
          decision: "accepted",
        },
        commits: ["abcdef"],
        releaseTag: "v0.1.0",
      };
  }
  files.set(
    `.voidra/actions/${action.id}/action.md`,
    buffer(markdown(action, "Fixture work.\n")),
  );
}
export function busyFiles(): ProjectFiles {
  const files = minimalFiles();
  let n = 0;
  let doneId = "";
  const releasedIds: string[] = [];
  for (const type of Object.keys(lifecycles) as Action["type"][])
    for (const stage of [
      ...lifecycles[type].stages,
      ...(type !== "release" ? ["released" as const] : []),
      "cancelled" as const,
    ]) {
      const id = numberId(n++);
      const terminal = ["done", "released", "cancelled"].includes(stage);
      addAction(files, {
        id,
        type,
        title: `${type} ${stage}`,
        stage,
        status: terminal
          ? "complete"
          : stage === "review" ||
              (stage === "plan" && lifecycles[type].planGate)
            ? "waiting"
            : "ready",
        doneBy: "agent",
      });
      if (stage === "done" && !doneId) doneId = id;
      if (stage === "released") releasedIds.push(id);
    }
  const parent = numberId(n++);
  addAction(files, {
    id: parent,
    type: "docs",
    title: "Parent slice",
    stage: "implement",
    status: "ready",
    doneBy: "agent",
    blockedBy: [doneId],
  });
  addAction(files, {
    id: numberId(n++),
    type: "docs",
    title: "Child slice",
    stage: "implement",
    status: "ready",
    doneBy: "agent",
    parent,
  });
  addAction(files, {
    id: numberId(n++),
    type: "docs",
    title: "Account setup",
    status: "waiting",
    doneBy: "you",
    steps: [{ id: "account", title: "Create an account", done: false }],
  });
  files.set(
    ".voidra/profile/problem.md",
    buffer(
      markdown({
        ...samples.profile,
        answers: [{ ...samples.profile.answers[0], status: "assumed" }],
      }),
    ),
  );
  files.set(
    ".voidra/backlog/idea-000000.md",
    buffer(
      markdown({ ...samples.idea, status: "promoted", promotedTo: parent }),
    ),
  );
  files.set(
    `.voidra/actions/${parent}/questions.md`,
    buffer(
      markdown({
        ...samples.questions,
        action: parent,
        rounds: [
          {
            round: 1,
            askedAt: time,
            questions: [
              {
                ...samples.questions.rounds[0]?.questions[0],
                answer: { kind: "agent-decides", by: "You", at: time },
                agentChoice: {
                  choice: "a",
                  reason: "Smallest useful scope",
                  by: "Agent",
                  at: time,
                },
              },
            ],
          },
        ],
      }),
    ),
  );
  files.set(
    `.voidra/actions/${parent}/runs/2026-10-13T00-00-00Z-codex-run-000000.md`,
    buffer(
      markdown({
        ...samples.run,
        action: parent,
        consumedRecords: [parent],
        fromStage: "implement",
        toStage: "review",
        outcome: "advanced",
        endedAt: time,
        checks: [{ name: "fixture", passed: true }],
      }),
    ),
  );
  files.set(
    ".voidra/releases/0.1.0.md",
    buffer(
      markdown({
        ...samples.release,
        status: "released",
        actions: releasedIds,
        tag: "v0.1.0",
        date: time,
      }),
    ),
  );
  files.set(
    ".voidra/local/pending-actions.md",
    buffer(markdown(samples.queue, `1. [ ] ${parent}\n`)),
  );
  files.set(
    ".voidra/local/run.lock",
    buffer(JSON.stringify({ ...samples.lock, action: parent })),
  );
  files.set(
    ".voidra/local/operations/op-000000.json",
    buffer(JSON.stringify(samples.operation)),
  );
  return files;
}
export function fixtureProjects(): Map<string, ProjectFiles> {
  const all = new Map<string, ProjectFiles>();
  all.set("empty-folder", new Map());
  all.set(
    "existing-code",
    new Map([["src/app.ts", buffer('export const greeting = "Hello";\n')]]),
  );
  const fresh = minimalFiles();
  fresh.set(".voidra/profile/problem.md", buffer(markdown(samples.profile)));
  addAction(fresh, schemas.action.parse(samples.action));
  all.set("new-project", fresh);
  all.set("busy-project", busyFiles());
  for (const [kind] of Object.entries(schemas)) {
    const files = new Map(fresh);
    const path =
      kind === "project"
        ? ".voidra/voidra.json"
        : kind === "profile"
          ? ".voidra/profile/problem.md"
          : kind === "idea"
            ? ".voidra/backlog/idea-000000.md"
            : kind === "release"
              ? ".voidra/releases/0.1.0.md"
              : kind === "queue"
                ? ".voidra/local/pending-actions.md"
                : kind === "lock"
                  ? ".voidra/local/run.lock"
                  : kind === "operation"
                    ? ".voidra/local/operations/op-000000.json"
                    : kind === "run"
                      ? ".voidra/actions/act-000000/runs/time-codex-run-000000.md"
                      : `.voidra/actions/act-000000/${kind}.md`;
    files.set(
      path,
      buffer(
        kind === "project" || kind === "lock" || kind === "operation"
          ? "{}\n"
          : markdown({ invalid: true }),
      ),
    );
    all.set(`broken/${kind}`, files);
  }
  for (const [name, patch] of Object.entries({
    "missing-reference": { blockedBy: ["act-111111"] },
    "missing-link": { links: ["idea-111111"] },
    "missing-plan": { stage: "plan", status: "waiting" },
    "dependency-cycle": { blockedBy: ["act-000000"] },
    "parent-cycle": { parent: "act-000000" },
    stage: { type: "research", stage: "implement" },
    status: { status: "waiting" },
  })) {
    const files = new Map(fresh);
    files.set(
      ".voidra/actions/act-000000/action.md",
      buffer(markdown({ ...samples.action, ...patch })),
    );
    if (name === "missing-plan")
      for (const file of planFiles)
        files.delete(`.voidra/actions/act-000000/${file}`);
    all.set(`broken/${name}`, files);
  }
  for (const kind of ["guide", "ignore"]) {
    const files = new Map(fresh);
    files.set(
      kind === "guide" ? ".voidra/README.md" : ".voidra/.gitignore",
      buffer(kind === "guide" ? "" : "not ignored\n"),
    );
    all.set(`broken/${kind}`, files);
  }
  const child = new Map(fresh);
  addAction(child, {
    ...schemas.action.parse(samples.action),
    type: "docs",
    stage: "done",
    status: "complete",
  });
  addAction(child, {
    ...schemas.action.parse(samples.action),
    id: "act-111111",
    parent: "act-000000",
  });
  all.set("broken/parent-incomplete", child);
  const truncate = new Map(fresh);
  truncate.set(
    ".voidra/actions/act-000000/action.md",
    buffer("---\nid: act-000000\n"),
  );
  all.set("broken/truncated", truncate);
  const newer = new Map(fresh);
  newer.set(
    ".voidra/voidra.json",
    buffer(
      JSON.stringify(
        {
          ...samples.project,
          format: 99,
          requiredVoidra: "9.0.0",
        },
        null,
        2,
      ) + "\n",
    ),
  );
  all.set("newer-format", newer);
  const conflict = new Map(fresh);
  conflict.set(
    ".voidra/actions/act-000000/action.md",
    buffer(
      `${markdown(samples.action)}<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n`,
    ),
  );
  all.set("conflicted", conflict);
  const interrupted = new Map(fresh);
  interrupted.set(
    ".voidra/actions/act-000000/runs/2026-10-13T00-00-00Z-codex-run-000000.md",
    buffer(markdown(samples.run)),
  );
  interrupted.set(
    ".voidra/local/run.lock",
    buffer(JSON.stringify(samples.lock)),
  );
  interrupted.set(
    ".voidra/local/operations/op-000000.json",
    buffer(JSON.stringify({ ...samples.operation, state: "prepared" })),
  );
  all.set("interrupted-run", interrupted);
  const stale = minimalFiles();
  for (let i = 0; i < planFiles.length; i++) {
    const id = numberId(i);
    addAction(stale, {
      ...schemas.action.parse(samples.action),
      id,
      stage: "implement",
    });
    const file = planFiles[i] as string;
    const path = `.voidra/actions/${id}/${file}`;
    stale.set(path, buffer(`${stale.get(path)?.toString()} \n`));
  }
  all.set("stale-approval", stale);
  const old = new Map(fresh);
  old.set(
    ".voidra/voidra.json",
    buffer(
      JSON.stringify({
        ...samples.project,
        format: 0,
        requiredVoidra: "0.0.0",
      }),
    ),
  );
  old.set(
    ".voidra/actions/act-000000/action.md",
    buffer(
      markdown({ ...samples.action, stage: undefined, state: "discovery" }),
    ),
  );
  all.set("prototype-format", old);
  return all;
}
export function largeFiles(): ProjectFiles {
  const files = minimalFiles();
  for (let n = 0; n < 1000; n++)
    addAction(files, {
      id: numberId(n),
      type: "docs",
      title: `Generated action ${n}`,
      stage: "implement",
      status: "ready",
      doneBy: "agent",
    });
  return files;
}
export async function writeProject(
  root: string,
  files: ProjectFiles,
): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const [path, raw] of files) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), raw);
  }
}
export async function writeFixtures(root: string): Promise<void> {
  const catalog = [];
  for (const [name, files] of fixtureProjects()) {
    const project = `fixtures/${name}/project`;
    await rm(resolve(root, project), { recursive: true, force: true });
    await writeProject(
      resolve(root, project),
      name === "new-project" ? await generalFiles(root) : files,
    );
    const result = await checkProject(resolve(root, project));
    const expected = `fixtures/${name}/expected.json`;
    await writeFile(
      resolve(root, expected),
      `${JSON.stringify(
        {
          exitCode: result.diagnostics.length ? 1 : 0,
          diagnostics: result.diagnostics,
        },
        null,
        2,
      )}\n`,
    );
    catalog.push({ name, project, expected });
  }
  await writeFile(
    resolve(root, "fixtures/catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
}
/** Actual approved-template initialization, normalized only for reproducible fixture IDs/time. */
export async function generalFiles(repository: string): Promise<ProjectFiles> {
  const root = await mkdtemp(resolve(tmpdir(), "voidra-general-fixture-"));
  try {
    const template = await loadTemplate(
      resolve(repository, "templates/general/template.yaml"),
    );
    const result = await initializeProject(root, template, {
      name: "Example",
      answers: {
        "problem.goal": {
          value: "Save and reopen private project notes offline.",
        },
      },
      by: "Fixture author",
    });
    const project = await checkProject(root);
    const files: ProjectFiles = new Map();
    for (const [path, bytes] of (await readProjectFiles(root)).files) {
      const normalize = (text: string) =>
        text
          .replaceAll(project.metadata?.project.id as string, "prj-000000")
          .replaceAll(result.bootstrap as string, "act-000000")
          .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, time);
      files.set(normalize(path), Buffer.from(normalize(bytes.toString())));
    }
    return files;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] === "--large") {
    const target = process.argv[3];
    if (!target)
      throw new Error(
        "Give an output directory for the generated large fixture",
      );
    await writeProject(resolve(target), largeFiles());
  } else await writeFixtures(process.cwd());
}
