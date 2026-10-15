import { hash, type ProjectInspection, schemas, type Template } from "voidra";
import {
  type AiContext,
  type AiIntent,
  aiContextSchema,
  aiIntentSchema,
  aiQuestionSchema,
} from "../shared/ai.ts";

/** Select public planning data explicitly. Never read source, docs, private receipts or unknown fields. */
export function collectAiContext(
  project: ProjectInspection,
  templates: Template[],
  raw: AiIntent,
): AiContext {
  const intent = aiIntentSchema.parse(raw),
    sources: AiContext["sources"] = [];
  const add = (path: string, label: string, text: string) => {
    const record = project.records.get(path);
    if (!record) throw new Error("Selected planning record is unavailable");
    sources.push({ path, label, text, revision: hash(record.document.raw) });
  };
  if (
    intent.feature === "rewrite" ||
    intent.feature === "task-title" ||
    intent.feature === "task-capture"
  )
    return aiContextSchema.parse({
      feature: intent.feature,
      notes: intent.notes,
      target: intent.target,
      sources,
    });
  if (intent.feature === "profile" || intent.feature === "followup") {
    if (
      project.metadata?.template &&
      (project.metadata.template.id !== intent.template ||
        project.metadata.template.version !== intent.templateVersion)
    )
      throw new Error("Selected template changed");
    const template = templates.find(
        (template) =>
          template.id === intent.template &&
          template.version === intent.templateVersion,
      ),
      question = template?.blocks
        .find((block) => block.id === intent.block)
        ?.questions.find((question) => question.id === intent.answer);
    if (!question) throw new Error("Selected template question is unavailable");
    const descriptor = aiQuestionSchema.parse({
      id: question.id,
      question: question.question,
      help: question.help,
      type: question.type,
      ...(question.required !== undefined
        ? { required: question.required }
        : {}),
      ...(question.allowFreeText !== undefined
        ? { allowFreeText: question.allowFreeText }
        : {}),
      ...(question.options
        ? {
            options: question.options.map(({ value, label }) => ({
              value,
              label,
            })),
          }
        : {}),
    });
    sources.push({
      path: "form:profile-question",
      label: "Selected profile question",
      text: `${question.question}\n${question.help}\nAnswer type: ${question.type}${question.options ? `\nChoices: ${question.options.map((option) => option.label).join(", ")}` : ""}`,
      revision: hash(JSON.stringify(descriptor)),
    });
    const path = `.voidra/profile/${intent.block}.md`,
      profile = project.records.get(path);
    if (profile) {
      const answer = schemas.profile
        .parse(profile.document.data)
        .answers.find((answer) => answer.id === intent.answer);
      if (answer)
        add(
          path,
          "Current answer",
          `${answer.question}\n${JSON.stringify(answer.answer)}\nStatus: ${answer.status}`,
        );
    }
    return aiContextSchema.parse({
      feature: intent.feature,
      notes: intent.notes,
      question: descriptor,
      sources,
    });
  }
  const path = `.voidra/actions/${intent.action}/action.md`,
    record = project.records.get(path);
  if (record?.kind !== "action")
    throw new Error("Selected action is unavailable");
  const action = schemas.action.parse(record.document.data);
  add(
    path,
    "Selected action",
    `Title: ${action.title}\nType: ${action.type}\nStage: ${action.stage ?? "human checklist"}\nStatus: ${action.status}\n\n${record.document.body}`,
  );
  if (intent.feature === "summary") {
    const runs = [...project.records.values()]
      .filter(
        (record) =>
          record.kind === "run" &&
          record.document.data.action === action.id &&
          (!intent.run || record.document.data.id === intent.run),
      )
      .sort((a, b) =>
        String(b.document.data.startedAt).localeCompare(
          String(a.document.data.startedAt),
        ),
      );
    const run = runs[0];
    if (!run) throw new Error("Selected run report is unavailable");
    const data = schemas.run.parse(run.document.data);
    add(
      run.document.file,
      "Run result",
      `Outcome: ${data.outcome}\nStage: ${data.toStage ?? data.fromStage}\nCommit: ${data.commit ?? "None recorded"}\nChecks: ${JSON.stringify(data.checks ?? [])}\n\n${run.document.body}`,
    );
  } else {
    if (action.type !== "release")
      throw new Error("Select a Release action to draft notes");
    for (const id of action.releaseActions ?? []) {
      const memberPath = `.voidra/actions/${id}/action.md`,
        member = project.records.get(memberPath);
      if (!member) throw new Error("Selected release member is unavailable");
      const data = schemas.action.parse(member.document.data);
      add(
        memberPath,
        "Selected work",
        `${data.title}\nStage: ${data.stage ?? "human checklist"}\n${member.document.body}`,
      );
    }
    if (action.releaseVersion) {
      const releasePath = `.voidra/releases/${action.releaseVersion}.md`,
        release = project.records.get(releasePath);
      if (release)
        add(
          releasePath,
          "Current release proposal",
          `Version: ${action.releaseVersion}\nStatus: ${release.document.data.status}\n\n${release.document.body}`,
        );
    }
  }
  return aiContextSchema.parse({
    feature: intent.feature,
    notes: intent.notes,
    sources,
  });
}
