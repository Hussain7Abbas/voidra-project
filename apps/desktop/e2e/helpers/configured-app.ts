import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { _electron } from "@playwright/test";

/** Workspace scenarios start after setup; onboarding tests launch Electron directly. */
export async function launchConfiguredApp(
  options: Parameters<typeof _electron.launch>[0],
) {
  const directory = options?.env?.VOIDRA_DATA_DIR;
  if (!directory) throw Error("A disposable app-data directory is required.");
  const file = join(directory, "settings.json");
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(await readFile(file, "utf8"));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    settings = {
      version: 1,
      theme: "system",
      recents: [],
      skillsOfferSeen: true,
    };
  }
  if (settings.setupCompleted === undefined) {
    await mkdir(directory, { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify({ ...settings, setupCompleted: true })}\n`,
    );
  }
  return _electron.launch(options);
}
