import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStore } from "../src/main/state.ts";
import { requestSchema } from "../src/shared/bridge.ts";

it("accepts only fixed-client complete-bundle commands and contained Team operations", () => {
  const revision = "a".repeat(64),
    id = "00000000-0000-4000-8000-000000000001";
  for (const input of [
    { command: "set-coding-client", client: "copilot" },
    {
      command: "team-add",
      name: "Ada",
      email: "ada@example.test",
      revision,
      project: "/arbitrary",
    },
    { command: "team-me", id: "Ada", revision },
    {
      command: "team-project-member",
      id,
      revision,
      enabled: true,
      path: "/arbitrary",
    },
    {
      command: "skills-bundle-apply",
      agent: "codex",
      revision,
      confirmed: true,
      name: "voidra-go",
    },
    {
      command: "skills-bundle-apply",
      agent: "codex",
      revision,
      confirmed: true,
      operation: "remove",
    },
    {
      command: "skills-bundle-apply",
      agent: "claude",
      revision,
      confirmed: "yes",
    },
    { command: "skills-bundle-preview", agent: "codex", home: "/arbitrary" },
    {
      command: "skills-preview",
      agent: "codex",
      name: "voidra-go",
      operation: "install",
    },
    {
      command: "skills-apply",
      agent: "codex",
      name: "voidra-go",
      operation: "install",
      revision,
      bundleRevision: revision,
      confirmed: true,
    },
  ])
    expect(requestSchema.safeParse(input).success).toBe(false);
  expect(
    requestSchema.safeParse({
      command: "skills-bundle-apply",
      agent: "codex",
      revision,
      confirmed: true,
    }).success,
  ).toBe(true);
  expect(
    requestSchema.safeParse({
      command: "team-project-member",
      id,
      revision,
      enabled: false,
    }).success,
  ).toBe(true);
});
it("serializes concurrent settings edits, refuses competing roster revisions and preserves failed-entry recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "voidra-settings-integrity-"));
  try {
    const project = join(root, "project"),
      file = join(root, "settings.json");
    await mkdir(project);
    const store = new AppStore(file),
      initial = await store.team(project);
    const results = await Promise.allSettled([
      store.changeTeam(
        {
          command: "team-add",
          revision: initial.revision,
          name: "Ada",
          email: "ADA@example.test",
        },
        project,
      ),
      store.changeTeam(
        {
          command: "team-add",
          revision: initial.revision,
          name: "Grace",
          email: "grace@example.test",
        },
        project,
      ),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    let team = await store.team(project);
    expect(team.members).toHaveLength(1);
    expect(team.members[0]?.email).toBe("ADA@example.test");
    await Promise.all([
      store.setTheme("dark"),
      store.setClient("claude-code"),
      store.changeTeam(
        {
          command: "team-add",
          revision: team.revision,
          name: "Grace",
          email: "grace@example.test",
        },
        project,
      ),
    ]);
    const reopened = new AppStore(file),
      settings = await reopened.read();
    team = await reopened.team(project);
    expect(settings.theme).toBe("dark");
    expect(settings.defaultClient).toBe("claude-code");
    expect(team.members).toHaveLength(2);
    const before = await readFile(file, "utf8"),
      member = team.members[0];
    if (!member) throw Error("Missing member");
    await expect(
      reopened.changeTeam(
        {
          command: "team-project-member",
          revision: team.revision,
          id: member.id,
          enabled: true,
        },
        null,
      ),
    ).rejects.toThrow(/Open a project/);
    expect(await readFile(file, "utf8")).toBe(before);
    await expect(reopened.setClient("copilot" as never)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(before);
    await reopened.setClient("codex");
    expect((await reopened.read()).team.members).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
