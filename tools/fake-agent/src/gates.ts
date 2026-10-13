// Scripted planning/results for the app's gate tests. This is not real-agent evidence.
import {
  applyOperation,
  checkProject,
  createId,
  hash,
  parseRecord,
  schemas,
  serializeRecord,
} from "voidra";
export async function publishFakeGate(
  root: string,
  id: string,
  kind: "questions" | "assumption" | "plan" | "review",
): Promise<void> {
  const project = await checkProject(root),
    path = `.voidra/actions/${id}/action.md`,
    doc = project.records.get(path)?.document;
  if (!doc) throw new Error("Action missing");
  const action = schemas.action.parse(doc.data),
    changes: {
      path: string;
      expectedHash: string | null;
      content: string | null;
    }[] = [],
    now = new Date().toISOString();
  function put(path: string, data: Record<string, unknown>, body = "") {
    const old = project.files.get(path),
      record = old
        ? parseRecord(path, old)
        : parseRecord(path, "---\n{}\n---\n");
    changes.push({
      path,
      expectedHash: old ? hash(old) : null,
      content: serializeRecord(record, data, body).toString(),
    });
  }
  const qPath = `.voidra/actions/${id}/questions.md`,
    qDoc = project.records.get(qPath)?.document,
    questions = qDoc
      ? schemas.questions.parse(qDoc.data)
      : { action: id, rounds: [] };
  if (kind === "questions") {
    const previous = questions.rounds.flatMap((r) => r.questions);
    questions.rounds.push({
      round: questions.rounds.length + 1,
      askedAt: now,
      questions: [
        {
          id: createId("q"),
          text: previous.length
            ? "Which export format?"
            : "Who can read the notes?",
          why: "Defines the public boundary.",
          options: [
            {
              label: "a",
              description: previous.length ? "JSON" : "Only the owner",
              recommended: true,
            },
            {
              label: "b",
              description: previous.length ? "Markdown" : "The team",
              recommended: false,
            },
          ],
          allowFreeText: true,
          ...(previous[0] ? { dependsOn: [previous[0].id] } : {}),
        },
      ],
    });
    put(qPath, questions);
    action.status = "waiting";
  } else if (kind === "assumption") {
    for (const round of questions.rounds)
      for (const q of round.questions)
        if (q.answer?.kind === "agent-decides")
          q.agentChoice = {
            choice: "Use JSON export",
            reason: "Keeps the existing CLI contract simple.",
            by: "codex",
            at: now,
          };
    put(qPath, questions);
    action.status = "ready";
  } else if (kind === "plan") {
    put(
      `.voidra/actions/${id}/requirements.md`,
      { action: id },
      "## Goal\nExport private notes.\n## Out of scope\nShared accounts.\n",
    );
    put(
      `.voidra/actions/${id}/blueprint.md`,
      { action: id },
      "## Approach\nUse the existing export boundary.\n## Testing seams\nPublic CLI export.\n## Proposed ADRs\nNone.\n",
    );
    put(
      `.voidra/actions/${id}/acceptance.md`,
      { action: id },
      "- Exported notes can be read again.\n",
    );
    if (action.planApproval) {
      action.approvalHistory = [
        ...(action.approvalHistory ?? []),
        action.planApproval,
      ];
      delete action.planApproval;
    }
    action.stage = action.type === "release" ? "review" : "plan";
    action.status = "waiting";
  } else {
    const run = createId("run");
    put(
      `.voidra/actions/${id}/runs/${now.replaceAll(":", "-")}-codex-${run}.md`,
      {
        id: run,
        action: id,
        agent: "codex",
        startedAt: now,
        endedAt: now,
        fromStage: action.stage,
        toStage: "review",
        outcome: "advanced",
        consumedRecords: [id],
        ...(!["release", "research"].includes(action.type)
          ? { commit: "f".repeat(40) }
          : {}),
        checks: [{ name: "Scripted fixture check", passed: true }],
      },
      "## Summary\nCompleted the scripted app-side gate scenario.\n## Files changed\nNo source files are changed by this gate fixture.\n",
    );
    action.stage = "review";
    action.status = "waiting";
  }
  put(path, action, doc.body);
  await applyOperation(root, { changes });
}
