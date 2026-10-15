import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
} from "node:fs/promises";
import { basename, dirname } from "node:path";
import { z } from "zod";
import {
  recentSchema,
  type ThemePreference,
  themeSchema,
} from "../shared/bridge.ts";

import {
  type CodingClient,
  codingClientSchema,
  memberInputSchema,
  storedTeamSchema,
  type TeamRequest,
  type TeamView,
  teamRequestSchema,
} from "../shared/team.ts";

const teamRevision = (team: unknown): string =>
  createHash("sha256").update(JSON.stringify(team)).digest("hex");
const settingsSchema = z.looseObject({
  version: z.literal(1),
  defaultClient: codingClientSchema.default("codex"),
  team: storedTeamSchema.default(() => ({
    members: [],
    me: null,
    projects: {},
  })),
  theme: themeSchema,
  recents: z.array(recentSchema),
  skillsOfferSeen: z.boolean().default(false),
  updatesEnabled: z.boolean().default(true),
  customTitlebar: z.boolean().default(true),
});
type Settings = z.infer<typeof settingsSchema>;
export function resolveTheme(
  preference: ThemePreference,
  dark: boolean,
): "light" | "dark" {
  return preference === "system" ? (dark ? "dark" : "light") : preference;
}
export async function canonicalFolder(path: string): Promise<string> {
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory())
    throw new Error("Choose a project folder");
  return canonical;
}
export class AppStore {
  readonly file: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(file: string) {
    this.file = file;
  }
  async read(): Promise<Settings> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return {
          version: 1,
          defaultClient: "codex",
          team: { members: [], me: null, projects: {} },
          theme: "system",
          recents: [],
          skillsOfferSeen: false,
          updatesEnabled: true,
          customTitlebar: true,
        };
      throw error;
    }
    try {
      return settingsSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error(
        "Saved settings are invalid; the original file has been preserved",
      );
    }
  }
  private mutate(change: (settings: Settings) => void): Promise<void> {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        const settings = await this.read();
        change(settings);
        await mkdir(dirname(this.file), { recursive: true });
        const temp = `${this.file}.${randomUUID()}.tmp`;
        const handle = await open(temp, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(settings, null, 2)}\n`);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temp, this.file);
      });
    return this.queue;
  }
  async team(project: string | null): Promise<TeamView> {
    const { team } = await this.read();
    return {
      members: team.members,
      me: team.me,
      projectMembers: project ? (team.projects[project] ?? []) : [],
      revision: teamRevision(team),
    };
  }
  changeTeam(input: TeamRequest, project: string | null): Promise<void> {
    const request = teamRequestSchema.parse(input);
    return this.mutate((settings) => {
      const team = settings.team;
      if (teamRevision(team) !== request.revision)
        throw Error(
          "Team settings changed; review the current roster before saving.",
        );
      if (request.command === "team-add") {
        const values = memberInputSchema.parse({
          name: request.name,
          email: request.email,
        });
        if (
          team.members.some(
            (member) =>
              member.email.toLowerCase() === values.email.toLowerCase(),
          )
        )
          throw Error("This email is already in Team.");
        if (team.members.length >= 200)
          throw Error("Team has reached its 200-member limit.");
        const member = { id: randomUUID(), ...values };
        team.members.push(member);
        if (project)
          team.projects[project] = [
            ...(team.projects[project] ?? []),
            member.id,
          ];
      } else {
        if (
          request.id &&
          !team.members.some((member) => member.id === request.id)
        )
          throw Error("Team member is no longer available.");
        if (request.command === "team-me") team.me = request.id;
        else if (request.command === "team-remove") {
          team.members = team.members.filter(
            (member) => member.id !== request.id,
          );
          if (team.me === request.id) team.me = null;
          for (const key of Object.keys(team.projects))
            team.projects[key] = (team.projects[key] ?? []).filter(
              (id) => id !== request.id,
            );
        } else {
          if (!project)
            throw Error("Open a project before selecting its Team members.");
          const selected = team.projects[project] ?? [];
          team.projects[project] = request.enabled
            ? [...new Set([...selected, request.id])]
            : selected.filter((id) => id !== request.id);
        }
      }
      storedTeamSchema.parse(team);
    });
  }
  setClient(client: CodingClient): Promise<void> {
    return this.mutate((settings) => {
      settings.defaultClient = codingClientSchema.parse(client);
    });
  }
  setTheme(theme: ThemePreference): Promise<void> {
    return this.mutate((settings) => {
      settings.theme = themeSchema.parse(theme);
    });
  }
  setCustomTitlebar(enabled: boolean): Promise<void> {
    return this.mutate((settings) => {
      settings.customTitlebar = z.boolean().parse(enabled);
    });
  }
  dismissSkillsOffer(): Promise<void> {
    return this.mutate((settings) => {
      settings.skillsOfferSeen = true;
    });
  }
  setUpdates(enabled: boolean): Promise<void> {
    return this.mutate((settings) => {
      settings.updatesEnabled = enabled;
    });
  }
  async remember(path: string): Promise<void> {
    const canonical = await canonicalFolder(path);
    return this.mutate((settings) => {
      settings.recents = [
        {
          path: canonical,
          name: basename(canonical),
          lastOpened: new Date().toISOString(),
        },
        ...settings.recents.filter((p) => p.path !== canonical),
      ].slice(0, 20);
    });
  }
  remove(path: string): Promise<void> {
    return this.mutate((settings) => {
      settings.recents = settings.recents.filter((p) => p.path !== path);
    });
  }
  async list(): Promise<
    Array<z.infer<typeof recentSchema> & { missing: boolean }>
  > {
    const settings = await this.read();
    return Promise.all(
      settings.recents.map(async (recent) => {
        let missing = false;
        try {
          missing = !(await stat(recent.path)).isDirectory();
        } catch {
          missing = true;
        }
        return { ...recent, missing };
      }),
    );
  }
}
export class WindowRegistry {
  private windows = new Map<number, string | null>();
  register(id: number, project: string | null): void {
    if (project !== null && this.find(project) !== undefined)
      throw new Error("Project already has a window");
    this.windows.set(id, project);
  }
  project(id: number): string | null {
    return this.windows.get(id) ?? null;
  }
  find(project: string): number | undefined {
    return Array.from(this.windows).find(([, path]) => path === project)?.[0];
  }
  remove(id: number): void {
    this.windows.delete(id);
  }
  ids(): number[] {
    return Array.from(this.windows.keys());
  }
}
