import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { GitHubRemote, StagedRelease } from "./release.ts";
export const RELEASE_REPOSITORY = "Hussain7Abbas/voidra-project";
const releaseSchema = z.object({
  id: z.number().int().positive(),
  draft: z.boolean(),
  body: z.string().nullable(),
  assets: z.array(
    z.object({ id: z.number().int().positive(), name: z.string() }),
  ),
});
type GitHubRelease = z.infer<typeof releaseSchema>;
export class GitHubReleaseRemote implements GitHubRemote {
  readonly stage: StagedRelease;
  readonly env: NodeJS.ProcessEnv;
  private execute: (args: string[]) => Buffer;
  constructor(
    stage: StagedRelease,
    env: NodeJS.ProcessEnv = process.env,
    execute?: (args: string[]) => Buffer,
  ) {
    this.stage = stage;
    this.env = env;
    this.execute =
      execute ??
      ((args) =>
        execFileSync("gh", args, {
          env: this.env,
          maxBuffer: 512 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        }));
  }
  command(args: string[]): Buffer {
    return this.execute(args);
  }
  async release(): Promise<GitHubRelease | null> {
    try {
      return releaseSchema.parse(
        JSON.parse(
          this.command([
            "api",
            `repos/${RELEASE_REPOSITORY}/releases/tags/${this.stage.tag}`,
          ]).toString(),
        ),
      );
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("HTTP 404")))
        throw error;
    }
    // The tag endpoint exposes published releases; CLI lookup also finds drafts.
    let lookup: { apiUrl: string; tagName: string };
    try {
      lookup = z
        .object({ apiUrl: z.string(), tagName: z.literal(this.stage.tag) })
        .parse(
          JSON.parse(
            this.command([
              "release",
              "view",
              this.stage.tag,
              "--repo",
              RELEASE_REPOSITORY,
              "--json",
              "apiUrl,tagName",
            ]).toString(),
          ),
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes("release not found"))
        return null;
      throw error;
    }
    const prefix = `https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/`,
      id = lookup.apiUrl.startsWith(prefix)
        ? lookup.apiUrl.slice(prefix.length)
        : "";
    if (!/^[1-9]\d*$/.test(id))
      throw Error("Draft release endpoint is invalid");
    return releaseSchema.parse(
      JSON.parse(
        this.command([
          "api",
          `repos/${RELEASE_REPOSITORY}/releases/${id}`,
        ]).toString(),
      ),
    );
  }
  async source(): Promise<string> {
    let object = JSON.parse(
      this.command([
        "api",
        `repos/${RELEASE_REPOSITORY}/git/ref/tags/${this.stage.tag}`,
      ]).toString(),
    ).object as { type: string; sha: string };
    for (let n = 0; n < 4; n++) {
      if (object.type === "commit" && /^[a-f0-9]{40}$/.test(object.sha))
        return object.sha;
      if (object.type !== "tag" || !/^[a-f0-9]{40}$/.test(object.sha)) break;
      object = JSON.parse(
        this.command([
          "api",
          `repos/${RELEASE_REPOSITORY}/git/tags/${object.sha}`,
        ]).toString(),
      ).object;
    }
    throw Error("Remote version tag does not identify a commit");
  }
  async inspect() {
    const release = await this.release();
    return release
      ? {
          draft: release.draft,
          notes: release.body ?? "",
          source: await this.source(),
        }
      : null;
  }
  async createDraft(): Promise<void> {
    const notes = join(this.stage.directory, "release-notes.md");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(notes, this.stage.notes);
    this.command([
      "release",
      "create",
      this.stage.tag,
      "--repo",
      RELEASE_REPOSITORY,
      "--verify-tag",
      "--draft",
      "--title",
      `Voidra Project ${this.stage.version}`,
      "--notes-file",
      notes,
      ...(this.stage.version.startsWith("0.") ? ["--prerelease"] : []),
    ]);
  }
  async readAsset(name: string): Promise<Buffer | null> {
    const release = await this.release(),
      asset = release?.assets.find((asset) => asset.name === name);
    return asset
      ? this.command([
          "api",
          `repos/${RELEASE_REPOSITORY}/releases/assets/${asset.id}`,
          "-H",
          "Accept: application/octet-stream",
        ])
      : null;
  }
  async upload(name: string, body: Buffer): Promise<void> {
    const file = join(this.stage.directory, name);
    if (!(await readFile(file)).equals(body))
      throw Error("Asset changed before upload");
    this.command([
      "release",
      "upload",
      this.stage.tag,
      file,
      "--repo",
      RELEASE_REPOSITORY,
    ]);
  }
  async publish(): Promise<void> {
    this.command([
      "release",
      "edit",
      this.stage.tag,
      "--repo",
      RELEASE_REPOSITORY,
      "--draft=false",
    ]);
  }
}
