import { randomUUID } from "node:crypto";
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

const settingsSchema = z.looseObject({
  version: z.literal(1),
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
