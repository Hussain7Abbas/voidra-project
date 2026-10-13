import { z } from "zod";
import { createId } from "./ids.ts";
import {
  approvalCurrent,
  hash,
  planFiles,
  projectLifecycles,
} from "./lifecycle.ts";
import {
  blockingPlanningDiagnostics,
  checkProject,
  PACKAGE_VERSION,
  type ProjectInspection,
  readPlan,
} from "./project.ts";
import { parseRecord, serializeRecord } from "./records.ts";
import { schemas } from "./schemas.ts";
import { applyOperation } from "./writer.ts";

export interface PlanningDecision {
  id: string;
  kind: "question" | "profile" | "plan";
  assumed: boolean;
  title: string;
  text: string;
  path: string;
  anchor: string | null;
  action: string | null;
  at: string | null;
  by: string | null;
  revision: string;
  state: "recorded" | "pending" | "stale";
}
function valueText(value: unknown): string {
  return typeof value === "string"
    ? value
    : (JSON.stringify(value, null, 2) ?? "Not specified");
}
export function collectPlanningDecisions(
  project: ProjectInspection,
): PlanningDecision[] {
  const entries: PlanningDecision[] = [];
  for (const { kind, document: doc } of project.records.values()) {
    const revision = hash(doc.raw);
    if (kind === "profile") {
      const profile = schemas.profile.parse(doc.data);
      for (const answer of profile.answers.filter(
        (a) => a.status === "assumed",
      ))
        entries.push({
          id: `profile:${doc.file}#${answer.id}`,
          kind: "profile",
          assumed: true,
          title: answer.question,
          text: valueText(answer.answer),
          path: doc.file,
          anchor: answer.id,
          action: null,
          at: answer.updatedAt ?? null,
          by: typeof answer.assumedBy === "string" ? answer.assumedBy : null,
          revision,
          state: "recorded",
        });
    }
    if (kind === "questions") {
      const questions = schemas.questions.parse(doc.data);
      for (const round of questions.rounds)
        for (const question of round.questions) {
          const answer = question.answer;
          if (!answer) continue;
          const assumed = answer.kind === "agent-decides",
            choice = question.agentChoice;
          const text =
            answer.kind === "text"
              ? answer.text
              : answer.kind === "choice"
                ? `${answer.choice}: ${question.options.find((o) => o.label === answer.choice)?.description ?? ""}`
                : choice
                  ? `${choice.choice}: ${choice.reason}`
                  : "Agent choice pending";
          entries.push({
            id: `question:${doc.file}#${question.id}`,
            kind: "question",
            assumed,
            title: question.text,
            text,
            path: doc.file,
            anchor: question.id,
            action: questions.action,
            at: assumed ? (choice?.at ?? answer.at) : answer.at,
            by: assumed ? (choice?.by ?? null) : answer.by,
            revision,
            state: assumed && !choice ? "pending" : "recorded",
          });
        }
    }
    if (kind === "action") {
      const action = schemas.action.parse(doc.data);
      const approval =
        action.planApproval ??
        (action.type === "release" &&
        action.reviewDecision?.decision === "accepted" &&
        action.reviewDecision.hashes
          ? {
              hashes: action.reviewDecision.hashes,
              at: action.reviewDecision.at,
              by: action.reviewDecision.by,
            }
          : undefined);
      if (!approval) continue;
      const plan = readPlan(project.files, action.id, project.records),
        current =
          !!plan &&
          approvalCurrent(approval, plan) &&
          (action.type !== "release" ||
            action.reviewDecision?.revision === plan.revision);
      entries.push({
        id: `plan:${action.id}`,
        kind: "plan",
        assumed: false,
        title: `Plan: ${action.title}`,
        text:
          current && plan
            ? planFiles
                .map(
                  (file) =>
                    project.records.get(`.voidra/actions/${action.id}/${file}`)
                      ?.document.body ?? "",
                )
                .concat(
                  action.type === "release" && action.releaseVersion
                    ? [
                        project.records.get(
                          `.voidra/releases/${action.releaseVersion}.md`,
                        )?.document.body ?? "",
                      ]
                    : [],
                )
                .join("\n\n")
            : "Approval applies to an earlier revision; review the current plan.",
        path: doc.file,
        anchor: null,
        action: action.id,
        at: approval.at,
        by: approval.by,
        revision: plan?.revision ?? revision,
        state: current ? "recorded" : "stale",
      });
    }
  }
  return entries;
}
const revisitInput = z.strictObject({
  id: z.string().min(1),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  by: z.string().min(1),
});
export async function revisitAssumption(
  root: string,
  raw: z.input<typeof revisitInput>,
): Promise<string> {
  const input = revisitInput.parse(raw),
    project = await checkProject(root);
  if (
    project.files.has(".voidra/local/run.lock") ||
    project.files.has(".voidra/local/planning.lock") ||
    [...project.records.values()].some(
      (record) =>
        record.kind === "run" && record.document.data.outcome === "running",
    )
  )
    throw new Error(
      "Finish or recover pending work before revisiting an assumption",
    );
  if (blockingPlanningDiagnostics(project).length)
    throw new Error(
      "Fix planning-file problems before revisiting an assumption",
    );
  const entry = collectPlanningDecisions(project).find(
    (e) => e.id === input.id && e.assumed,
  );
  if (!entry || entry.revision !== input.revision)
    throw new Error("Assumption changed; refresh its source before continuing");
  if (entry.state === "pending")
    throw new Error(
      "Wait for the agent to record its choice before revisiting it",
    );
  const doc = project.records.get(entry.path)?.document;
  if (!doc) throw new Error("Assumption source missing");
  const id = createId(
      "act",
      new Set(
        [...project.records.values()]
          .filter((r) => r.kind === "action")
          .map((r) => String(r.document.data.id)),
      ),
    ),
    path = `.voidra/actions/${id}/action.md`,
    type = entry.kind === "profile" ? "profile-change" : "research";
  const action = schemas.action.parse({
    id,
    type,
    title: `Revisit: ${entry.title}`.slice(0, 160),
    stage: projectLifecycles(project.metadata)[type].stages[0],
    status: type === "profile-change" ? "draft" : "ready",
    doneBy: "agent",
    createdBy: input.by,
    createdAt: new Date().toISOString(),
    links:
      type === "profile-change"
        ? [`${entry.path}#${entry.anchor}`]
        : [entry.anchor, entry.action].filter(Boolean),
    assumptionSource: {
      path: entry.path,
      anchor: entry.anchor,
      revision: entry.revision,
    },
  });
  const metadata = project.records.get(".voidra/voidra.json")?.document;
  if (!metadata) throw new Error("Project metadata missing");
  await applyOperation(root, {
    changes: [
      {
        path,
        expectedHash: null,
        content: serializeRecord(
          parseRecord(path, "---\n{}\n---\n"),
          action,
          `Re-evaluate the assumption at ${entry.path}#${entry.anchor} and its impact. Read the original answer there. Ask for missing facts and leave the proposal at its human gate.\n`,
        ).toString(),
      },
      {
        path: entry.path,
        expectedHash: entry.revision,
        content: doc.raw.toString(),
      },
      {
        path: metadata.file,
        expectedHash: hash(metadata.raw),
        content:
          project.metadata?.requiredVoidra === PACKAGE_VERSION
            ? metadata.raw.toString()
            : serializeRecord(metadata, {
                ...metadata.data,
                requiredVoidra: PACKAGE_VERSION,
              }).toString(),
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
