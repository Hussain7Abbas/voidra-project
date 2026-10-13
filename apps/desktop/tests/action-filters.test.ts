import { expect, it } from "vitest";
import {
  filterActionViews,
  groupActionViews,
} from "../src/renderer/action-filters.ts";

const actions = [
  {
    data: {
      id: "act-000000",
      type: "feature",
      status: "ready",
      doneBy: "agent",
      title: "Parent",
    },
  },
  {
    data: {
      id: "act-000001",
      type: "bug",
      status: "waiting",
      doneBy: "agent",
      assignee: "Owner",
      parent: "act-000000",
      title: "Child",
    },
  },
  {
    data: {
      id: "act-000002",
      type: "docs",
      status: "complete",
      doneBy: "you",
      title: "Account",
    },
  },
];
it("filters by each board field and keeps parent context for matching slices", () => {
  const all = { type: "all", status: "all", doneBy: "all", assignee: "all" };
  for (const [field, value, ids] of [
    ["type", "bug", ["act-000001"]],
    ["status", "complete", ["act-000002"]],
    ["doneBy", "you", ["act-000002"]],
    ["assignee", "Owner", ["act-000001"]],
    ["assignee", "unassigned", ["act-000000", "act-000002"]],
  ] as [string, string, string[]][])
    expect(
      filterActionViews(actions, { ...all, [field]: value }).map(
        (a) => a.data.id,
      ),
    ).toEqual(ids);
  expect(
    filterActionViews(actions, { ...all, type: "bug", status: "complete" }),
  ).toEqual([]);
  const groups = groupActionViews(
    actions,
    filterActionViews(actions, { ...all, type: "bug" }),
  );
  expect(groups).toHaveLength(1);
  expect(groups[0]?.parent?.data.id).toBe("act-000000");
  expect(groups[0]?.actions.map((a) => a.data.id)).toEqual(["act-000001"]);
});
