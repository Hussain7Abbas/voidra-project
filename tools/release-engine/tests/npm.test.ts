import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { inspectNpm, NpmReleaseRemote, provenanceSource } from "../src/npm.ts";
import { stageRelease } from "../src/release.ts";
import { fixture } from "./helpers.ts";

afterEach(() => vi.unstubAllGlobals());
test("registry provenance binds package bytes, repository, workflow, tag and actual source; OIDC publishing has no token fallback", async () => {
  const root = await fixture();
  try {
    const stage = await stageRelease(root, join(root, "stage"), "v0.2.0", [
        "app.dmg",
        "voidra-0.2.0.tgz",
      ]),
      payload = {
        subject: [
          {
            name: "pkg:npm/voidra@0.2.0",
            digest: {
              sha512: Buffer.from(
                stage.npmIntegrity.slice(7),
                "base64",
              ).toString("hex"),
            },
          },
        ],
        predicate: {
          buildDefinition: {
            externalParameters: {
              workflow: {
                repository: "https://github.com/Hussain7Abbas/voidra-project",
                path: ".github/workflows/publish-npm.yml",
                ref: "refs/tags/v0.2.0",
              },
            },
            resolvedDependencies: [{ digest: { gitCommit: stage.source } }],
          },
        },
      };
    const bundle = () => ({
      attestations: [
        {
          bundle: {
            dsseEnvelope: {
              payload: Buffer.from(JSON.stringify(payload)).toString("base64"),
            },
          },
        },
      ],
    });
    expect(provenanceSource(bundle(), stage)).toBe(stage.source);
    expect(provenanceSource(null, stage)).toBeNull();
    expect(
      provenanceSource(
        {
          attestations: [{ bundle: { dsseEnvelope: { payload: "not json" } } }],
        },
        stage,
      ),
    ).toBeNull();
    const url = "https://registry.npmjs.org/-/npm/v1/attestations/voidra@0.2.0";
    let mode = "valid";
    vi.stubGlobal(
      "fetch",
      async (address: unknown) =>
        new Response(
          JSON.stringify(
            String(address).includes("/attestations/")
              ? bundle()
              : mode === "no-provenance"
                ? { dist: { integrity: stage.npmIntegrity } }
                : {
                    dist: {
                      integrity: stage.npmIntegrity,
                      attestations: {
                        url:
                          mode === "outside"
                            ? "https://outside.example/data"
                            : url,
                      },
                    },
                  },
          ),
          { status: mode === "missing" ? 404 : mode === "offline" ? 503 : 200 },
        ),
    );
    expect(await inspectNpm(stage)).toEqual({
      integrity: stage.npmIntegrity,
      source: stage.source,
    });
    mode = "missing";
    expect(await inspectNpm(stage)).toBeNull();
    mode = "offline";
    await expect(inspectNpm(stage)).rejects.toThrow(/Registry/);
    mode = "outside";
    await expect(inspectNpm(stage)).rejects.toThrow(/endpoint/);
    mode = "no-provenance";
    expect((await inspectNpm(stage))?.source).toBe("");
    payload.predicate.buildDefinition.externalParameters.workflow.ref =
      "refs/heads/main";
    expect(provenanceSource(bundle(), stage)).toBeNull();
    await expect(new NpmReleaseRemote(stage, {}).publish()).rejects.toThrow(
      /OIDC/,
    );
    const calls: string[][] = [];
    const env = {
      GITHUB_ACTIONS: "true",
      GITHUB_SHA: stage.source,
      GITHUB_REF: "refs/tags/v0.2.0",
      ACTIONS_ID_TOKEN_REQUEST_URL: "fixture",
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture",
    };
    await new NpmReleaseRemote(stage, env, (args) =>
      calls.push(args),
    ).publish();
    expect(calls[0]).toContain("--provenance");
    expect(calls[0]?.slice(-2)).toEqual(["--tag", "next"]);
    const stable = { ...stage, version: "1.0.0", tag: "v1.0.0" };
    await new NpmReleaseRemote(
      stable,
      { ...env, GITHUB_REF: "refs/tags/v1.0.0" },
      (args) => calls.push(args),
    ).publish();
    expect(calls[1]?.slice(-2)).toEqual(["--tag", "latest"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
