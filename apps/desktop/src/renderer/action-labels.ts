import type { ActionType } from "../shared/bridge.ts";
export const actionLabels: Record<ActionType, string> = {
  feature: "Feature",
  bug: "Bug",
  improvement: "Improvement / refactor",
  docs: "Docs / chore",
  "profile-change": "Profile change",
  research: "Research",
  release: "Release",
};
