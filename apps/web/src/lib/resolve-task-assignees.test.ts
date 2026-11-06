import { describe, expect, it } from "vite-plus/test";
import {
  formatAssigneeNames,
  getTaskAssigneeIds,
  resolveTaskAssignees,
  toggleTaskAssigneeId,
} from "./resolve-task-assignees";

describe("resolve-task-assignees", () => {
  it("extracts assignee IDs from userIds, assignees, or legacy userId", () => {
    expect(
      getTaskAssigneeIds({
        userId: "u1",
        userIds: ["u1", "u2", "u1"],
      }),
    ).toEqual(["u1", "u2"]);

    expect(
      getTaskAssigneeIds({
        userId: "u1",
        assignees: [
          { id: "u1", name: "Alice" },
          { id: "u2", name: "Bob" },
        ],
      }),
    ).toEqual(["u1", "u2"]);

    expect(getTaskAssigneeIds({ userId: "u1" })).toEqual(["u1"]);
    expect(getTaskAssigneeIds({ userId: null })).toEqual([]);
  });

  it("toggles assignee IDs and clears all on empty value", () => {
    expect(toggleTaskAssigneeId(["u1"], "u2")).toEqual(["u1", "u2"]);
    expect(toggleTaskAssigneeId(["u1", "u2"], "u1")).toEqual(["u2"]);
    expect(toggleTaskAssigneeId(["u1", "u2"], "")).toEqual([]);
  });

  it("resolves assignee names and images from workspace members and task data", () => {
    const resolved = resolveTaskAssignees(
      {
        userId: "u1",
        userIds: ["u1", "u2"],
        assigneeName: "Fallback Alice",
        assignees: [
          { id: "u1", name: "Task Alice", image: null },
          { id: "u2", name: "Task Bob", image: "https://example.com/bob.png" },
        ],
      },
      [
        {
          userId: "u1",
          user: { name: "Live Alice", image: "https://example.com/alice.png" },
        },
      ],
    );

    expect(resolved).toEqual([
      {
        id: "u1",
        name: "Live Alice",
        image: "https://example.com/alice.png",
      },
      {
        id: "u2",
        name: "Task Bob",
        image: "https://example.com/bob.png",
      },
    ]);
    expect(formatAssigneeNames(resolved)).toBe("Live Alice, Task Bob");
  });
});
