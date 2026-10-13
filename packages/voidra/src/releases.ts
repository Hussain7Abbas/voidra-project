import { z } from "zod";
import { createId } from "./ids.ts";
import { actionComplete, hash, projectLifecycles } from "./lifecycle.ts";
import {
  blockingPlanningDiagnostics,
  checkProject,
  PACKAGE_VERSION,
  type ProjectInspection,
} from "./project.ts";
import { parseRecord, serializeRecord } from "./records.ts";
import { schemas } from "./schemas.ts";
import { applyOperation } from "./writer.ts";

export interface ReleaseCandidate {
  id: string;
  title: string;
  revision: string;
}
export function releaseCandidates(
  project: ProjectInspection,
): ReleaseCandidate[] {
  const reserved = new Set<string>();
  for (const record of project.records.values()) {
    if (record.kind === "action") {
      const action = schemas.action.parse(record.document.data);
      if (
        action.type === "release" &&
        !["cancelled", "released"].includes(action.stage ?? "")
      )
        for (const member of action.releaseActions ?? []) reserved.add(member);
    }
    if (
      record.kind === "release" &&
      (record.document.data.status === "released" ||
        (record.document.data.status === "draft" &&
          project.records.get(
            `.voidra/actions/${record.document.data.action}/action.md`,
          )?.document.data.stage !== "cancelled"))
    )
      for (const member of schemas.release.parse(record.document.data).actions)
        reserved.add(member);
  }
  return [...project.records.values()]
    .flatMap((record) => {
      if (record.kind !== "action") return [];
      if (
        project.diagnostics.some(
          (d) =>
            d.file === record.document.file &&
            ["identity", "duplicate-id"].includes(d.code),
        )
      )
        return [];
      const action = schemas.action.parse(record.document.data);
      return action.type !== "release" &&
        actionComplete(action) &&
        action.stage !== "released" &&
        !reserved.has(action.id)
        ? [
            {
              id: action.id,
              title: action.title,
              revision: hash(record.document.raw),
            },
          ]
        : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
const selection = z.strictObject({
  actions: z
    .array(
      z.strictObject({
        id: schemas.action.shape.id,
        revision: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1),
  by: z.string().trim().min(1),
});
export async function createReleaseAction(
  root: string,
  raw: z.input<typeof selection>,
): Promise<string> {
  const input = selection.parse(raw),
    project = await checkProject(root);
  if (new Set(input.actions.map((a) => a.id)).size !== input.actions.length)
    throw new Error("Duplicate release selection");
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (r) =>
        (r.kind === "run" && r.document.data.outcome === "running") ||
        (r.kind === "operation" && r.document.data.state === "prepared"),
    )
  )
    throw new Error("Finish or recover pending work before creating a release");
  if (!project.metadata || blockingPlanningDiagnostics(project).length)
    throw new Error("Fix planning-file problems before creating a release");
  const available = new Map(
    releaseCandidates(project).map((candidate) => [candidate.id, candidate]),
  );
  for (const chosen of input.actions) {
    const candidate = available.get(chosen.id);
    if (!candidate)
      throw new Error("Select only eligible done, unreleased actions");
    if (candidate.revision !== chosen.revision)
      throw new Error("Selected action changed; refresh its revision");
  }
  const id = createId(
      "act",
      new Set(
        [...project.records.values()]
          .filter((r) => r.kind === "action")
          .map((r) => String(r.document.data.id)),
      ),
    ),
    path = `.voidra/actions/${id}/action.md`,
    metadata = project.records.get(".voidra/voidra.json")?.document;
  if (!metadata) throw new Error("Project metadata missing");
  // A private token serializes simultaneous selections; public action membership is authoritative.
  const tokenPath = ".voidra/local/release-selection.json",
    oldToken = project.files.get(tokenPath);
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: null,
        content: serializeRecord(
          parseRecord(path, "---\n{}\n---\n"),
          {
            id,
            type: "release",
            title: "New release",
            stage: projectLifecycles(project.metadata).release.stages[0],
            status: "ready",
            doneBy: "agent",
            releaseActions: input.actions.map((a) => a.id),
            links: input.actions.map((a) => a.id),
            createdBy: input.by,
            createdAt: new Date().toISOString(),
          },
          "Plan the version, release notes and changelog for the selected completed actions. Follow the repository's version and changelog conventions. Leave the exact proposal at Review; commit and tag only after acceptance.\n",
        ).toString(),
      },
      ...input.actions.map((chosen) => {
        const path = `.voidra/actions/${chosen.id}/action.md`;
        return {
          path,
          expectedHash: chosen.revision,
          content: project.files.get(path)?.toString() ?? null,
        };
      }),
      {
        path: metadata.file,
        expectedHash: hash(metadata.raw),
        content:
          project.metadata.requiredVoidra === PACKAGE_VERSION
            ? metadata.raw.toString()
            : serializeRecord(metadata, {
                ...metadata.data,
                requiredVoidra: PACKAGE_VERSION,
              }).toString(),
      },
      {
        path: tokenPath,
        expectedHash: oldToken ? hash(oldToken) : null,
        content: `${JSON.stringify({ action: id })}\n`,
      },
      { path: ".voidra/local/run.lock", expectedHash: null, content: null },
      {
        path: ".voidra/local/planning.lock",
        expectedHash: null,
        content: null,
      },
    ],
  });
  return id;
}
