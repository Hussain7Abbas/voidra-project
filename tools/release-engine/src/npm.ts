import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { RELEASE_REPOSITORY } from "./github.ts";
import type { NpmRemote, StagedRelease } from "./release.ts";

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (response.status === 404) return null;
  if (!response.ok) throw Error(`Registry request failed: ${response.status}`);
  const text = await response.text();
  if (text.length > 4 * 1024 * 1024)
    throw Error("Registry response is too large");
  return JSON.parse(text);
}
export function provenanceSource(
  raw: unknown,
  stage: StagedRelease,
): string | null {
  if (
    !raw ||
    typeof raw !== "object" ||
    !Array.isArray((raw as { attestations?: unknown }).attestations)
  )
    return null;
  const data = raw as {
    attestations?: Array<{ bundle?: { dsseEnvelope?: { payload?: string } } }>;
  };
  for (const entry of data.attestations ?? []) {
    try {
      const encoded = entry.bundle?.dsseEnvelope?.payload;
      if (!encoded || encoded.length > 2 * 1024 * 1024) continue;
      const payload = JSON.parse(Buffer.from(encoded, "base64").toString()) as {
        subject?: Array<{ name: string; digest?: { sha512?: string } }>;
        predicate?: {
          buildDefinition?: {
            externalParameters?: {
              workflow?: { repository?: string; path?: string; ref?: string };
            };
            resolvedDependencies?: Array<{ digest?: { gitCommit?: string } }>;
          };
        };
      };
      const definition = payload.predicate?.buildDefinition,
        workflow = definition?.externalParameters?.workflow;
      if (
        workflow?.repository !== `https://github.com/${RELEASE_REPOSITORY}` ||
        workflow.path !== ".github/workflows/publish-npm.yml" ||
        workflow.ref !== `refs/tags/${stage.tag}`
      )
        continue;
      const expected = Buffer.from(
        stage.npmIntegrity.replace(/^sha512-/, ""),
        "base64",
      ).toString("hex");
      if (
        !payload.subject?.some(
          (subject) =>
            subject.name === `pkg:npm/voidra@${stage.version}` &&
            subject.digest?.sha512 === expected,
        )
      )
        continue;
      const source = definition?.resolvedDependencies?.find(
        (value) => value.digest?.gitCommit,
      )?.digest?.gitCommit;
      if (source && /^[a-f0-9]{40}$/.test(source)) return source;
    } catch {}
  }
  return null;
}
export async function inspectNpm(
  stage: StagedRelease,
): Promise<{ integrity: string; source: string } | null> {
  const raw = (await json(
    `https://registry.npmjs.org/voidra/${stage.version}`,
  )) as {
    dist?: { integrity?: string; attestations?: { url?: string } };
  } | null;
  if (!raw) return null;
  const integrity = raw.dist?.integrity ?? "",
    address = raw.dist?.attestations?.url;
  if (!address) return { integrity, source: "" };
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "registry.npmjs.org" ||
    !url.pathname.startsWith("/-/npm/v1/attestations/") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("Unexpected registry provenance endpoint");
  return {
    integrity,
    source: provenanceSource(await json(address), stage) ?? "",
  };
}
export class NpmReleaseRemote implements NpmRemote {
  readonly stage: StagedRelease;
  private env: NodeJS.ProcessEnv;
  private execute: (args: string[]) => void;
  constructor(
    stage: StagedRelease,
    env: NodeJS.ProcessEnv = process.env,
    execute?: (args: string[]) => void,
  ) {
    this.stage = stage;
    this.env = env;
    this.execute =
      execute ??
      ((args) => {
        execFileSync("npm", args, { env: this.env, stdio: "inherit" });
      });
  }
  inspect() {
    return inspectNpm(this.stage);
  }
  async publish(): Promise<void> {
    if (
      this.env.GITHUB_ACTIONS !== "true" ||
      this.env.GITHUB_SHA !== this.stage.source ||
      this.env.GITHUB_REF !== `refs/tags/${this.stage.tag}` ||
      !this.env.ACTIONS_ID_TOKEN_REQUEST_URL ||
      !this.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
    )
      throw Error(
        "npm publication requires the exact-tag GitHub OIDC workflow",
      );
    this.execute([
      "publish",
      join(this.stage.directory, this.stage.npmAsset),
      "--provenance",
      "--access",
      "public",
      "--tag",
      this.stage.version.startsWith("0.") ? "next" : "latest",
    ]);
  }
}
