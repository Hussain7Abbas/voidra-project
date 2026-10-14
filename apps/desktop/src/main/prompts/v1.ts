import type { AiContext } from "../../shared/ai.ts";
export const PROMPT_VERSION = 1;
export const prompts: Record<AiContext["feature"], string> = {
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
