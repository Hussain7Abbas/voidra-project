import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStore } from "../src/main/state.ts";
import { assigneeOptions, defaultAssignee } from "../src/shared/team.ts";

it("persists a private roster with project subsets, eligible Me, exact revisions and historical identities", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-team-"));
  try {
    const file = join(temp, "settings.json"),
      a = join(temp, "a"),
      b = join(temp, "b");
    await mkdir(a);
    await mkdir(b);
    const store = new AppStore(file),
      initial = await store.team(a);
    expect(initial.members).toEqual([]);
    await store.changeTeam(
      {
        command: "team-add",
        revision: initial.revision,
        name: "Ada",
        email: "ada@example.test",
      },
      a,
    );
    let team = await store.team(a);
    const member = team.members[0];
    if (!member) throw Error("Missing member");
    expect(team.projectMembers).toEqual([member.id]);
    await store.changeTeam(
      { command: "team-me", revision: team.revision, id: member.id },
      a,
    );
    team = await new AppStore(file).team(a);
    expect(defaultAssignee(team)).toBe("Ada <ada@example.test>");
    const other = await store.team(b);
    expect(other.members).toHaveLength(1);
    expect(other.projectMembers).toEqual([]);
    expect(defaultAssignee(other)).toBe("");
    expect(assigneeOptions(other)).toEqual([]);
    await store.changeTeam(
      {
        command: "team-project-member",
        revision: other.revision,
        id: member.id,
        enabled: true,
      },
      b,
    );
    expect(defaultAssignee(await store.team(b))).toBe("Ada <ada@example.test>");
    await expect(
      store.changeTeam(
        { command: "team-remove", revision: initial.revision, id: member.id },
        a,
      ),
    ).rejects.toThrow(/changed/);
    const before = await readFile(file, "utf8");
    await expect(
      store.changeTeam(
        {
          command: "team-add",
          revision: (await store.team(a)).revision,
          name: "Another Ada",
          email: "ADA@example.test",
        },
        a,
      ),
    ).rejects.toThrow(/already/);
    expect(await readFile(file, "utf8")).toBe(before);
    await store.changeTeam(
      {
        command: "team-remove",
        revision: (await store.team(a)).revision,
        id: member.id,
      },
      a,
    );
    expect((await store.team(a)).me).toBeNull();
    expect((await store.team(b)).projectMembers).toEqual([]);
    // Existing portable assignments remain selectable as a preserved historical value.
    expect(
      assigneeOptions(await store.team(a), "Ada <ada@example.test>"),
    ).toEqual([
      {
        value: "Ada <ada@example.test>",
        label: "Ada <ada@example.test> (previous assignment)",
        previous: true,
      },
    ]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
it("upgrades additive settings defaults, validates corrupt team references and preserves original bytes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "voidra-team-upgrade-"));
  try {
    const file = join(temp, "settings.json");
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        theme: "system",
        recents: [],
        future: { keep: true },
      }),
    );
    const store = new AppStore(file);
    expect((await store.read()).defaultClient).toBe("codex");
    expect((await store.team(null)).members).toEqual([]);
    await store.setClient("claude-code");
    expect((await new AppStore(file).read()).defaultClient).toBe("claude-code");
    expect(JSON.parse(await readFile(file, "utf8")).future).toEqual({
      keep: true,
    });
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        theme: "system",
        recents: [],
        team: {
          members: [],
          me: "00000000-0000-4000-8000-000000000000",
          projects: {},
        },
      }),
    );
    const before = await readFile(file, "utf8");
    await expect(store.read()).rejects.toThrow(/original.*preserved/);
    await expect(store.setClient("codex")).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(before);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
