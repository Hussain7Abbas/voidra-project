import type { AiContext } from "../../shared/ai.ts";
export const PROMPT_VERSION = 1;
export const prompts: Record<AiContext["feature"], string> = {
  "task-title":
    "Create a concise title of at most 160 characters from the supplied task description. Preserve facts and uncertainty. Return only JSON with a nonempty title string. Do not invent completed work or approvals.",
  "task-capture":
    "Turn the supplied task notes into one clear software task. Return only JSON with title (at most 160 characters), description (Markdown, at most 20000 characters), and type (feature, bug, improvement, docs, profile-change, research, or release). Preserve facts and uncertainty; do not invent implementation, approvals or completion.",
  rewrite:
    "Rewrite the supplied rough notes into a clear software idea or action. Preserve facts and uncertainty. Return only JSON with title and description strings. Do not invent implementation, approvals or completed work.",
  profile:
    "Suggest an answer using only the provided information and the described answer type/choices. Return only JSON with a value field. Use null if evidence is insufficient; do not invent facts or human confirmation.",
  followup:
    "Suggest up to six useful, independent follow-up questions that clarify the selected profile answer. Return only JSON with a nonempty questions array of strings. Do not ask dependent questions before their prerequisites are answered.",
  summary:
    "Summarize the selected run evidence concisely. Distinguish waiting for review, actual completion, failed checks and remaining issues. Never infer success or a commit without evidence. Return only JSON with a text string.",
  "release-notes":
    "Draft concise Markdown release notes from selected completed work and the supplied proposal. Do not claim publishing, a tag or finalization without evidence. Preserve the provided convention. Return only JSON with a text string.",
};
