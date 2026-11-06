import { describe, expect, it } from "vite-plus/test";
import {
  areAssigneeListsEqual,
  diffAssigneeIds,
  mergePrimaryAssignee,
  normalizeAssigneeInput,
  resolveAssigneeIds,
} from "./assignee-ids";

describe("assignee-ids helpers", () => {
  describe("normalizeAssigneeInput", () => {
    it("deduplicates and trims userIds when provided", () => {
      expect(
        normalizeAssigneeInput({
          userIds: [" u1 ", "u2", "u1", "", "   ", null, undefined],
          userId: "ignored",
        }),
      ).toEqual(["u1", "u2"]);
    });

    it("returns empty array when userIds is empty", () => {
      expect(normalizeAssigneeInput({ userIds: [] })).toEqual([]);
    });

    it("falls back to userId when userIds is omitted", () => {
      expect(normalizeAssigneeInput({ userId: "  u1  " })).toEqual(["u1"]);
      expect(normalizeAssigneeInput({ userId: "" })).toEqual([]);
      expect(normalizeAssigneeInput({ userId: "   " })).toEqual([]);
      expect(normalizeAssigneeInput({ userId: null })).toEqual([]);
    });

    it("returns undefined when neither userIds nor userId is provided", () => {
      expect(normalizeAssigneeInput({})).toBeUndefined();
    });
  });

  describe("resolveAssigneeIds", () => {
    it("uses fallbackUserIds when input has neither userId nor userIds", () => {
      expect(resolveAssigneeIds({}, "u-fallback")).toEqual(["u-fallback"]);
      expect(resolveAssigneeIds({}, ["u1", "u2"])).toEqual(["u1", "u2"]);
      expect(resolveAssigneeIds({ userId: null }, ["u1", "u2"])).toEqual([]);
      expect(
        resolveAssigneeIds({ userIds: ["u1", "u2"] }, "u-fallback"),
      ).toEqual(["u1", "u2"]);
    });

    it("preserves secondary assignees in fallbackUserIds when legacy caller echoes primary userId", () => {
      expect(resolveAssigneeIds({ userId: "u1" }, ["u1", "u2", "u3"])).toEqual([
        "u1",
        "u2",
        "u3",
      ]);
      expect(resolveAssigneeIds({ userId: "u1" }, ["u3", "u2"], "u1")).toEqual([
        "u3",
        "u2",
      ]);
      expect(resolveAssigneeIds({ userId: "u9" }, ["u1", "u2"])).toEqual([
        "u9",
      ]);
    });
  });

  describe("areAssigneeListsEqual & diffAssigneeIds", () => {
    it("compares ordered assignee lists and computes added/removed sets", () => {
      expect(areAssigneeListsEqual(["u1", "u2"], ["u1", "u2"])).toBe(true);
      expect(areAssigneeListsEqual(["u1", "u2"], ["u2", "u1"])).toBe(false);
      expect(diffAssigneeIds(["u1", "u2"], ["u2", "u3"])).toEqual({
        added: ["u3"],
        removed: ["u1"],
      });
    });
  });

  describe("mergePrimaryAssignee", () => {
    it("synthesizes primary assignee when join rows are empty", () => {
      expect(
        mergePrimaryAssignee(
          { id: "u1", name: "Alice", image: "https://example.com/a.png" },
          [],
        ),
      ).toEqual([
        { id: "u1", name: "Alice", image: "https://example.com/a.png" },
      ]);
      expect(mergePrimaryAssignee({ id: null }, [])).toEqual([]);
    });

    it("prepends primary assignee if missing from join rows", () => {
      expect(
        mergePrimaryAssignee({ id: "u1", name: "Alice", image: null }, [
          { id: "u2", name: "Bob", image: null },
        ]),
      ).toEqual([
        { id: "u1", name: "Alice", image: null },
        { id: "u2", name: "Bob", image: null },
      ]);
    });

    it("preserves join rows when primary is already included", () => {
      const existing = [
        { id: "u1", name: "Alice", image: null },
        { id: "u2", name: "Bob", image: null },
      ];
      expect(
        mergePrimaryAssignee(
          { id: "u1", name: "Alice", image: null },
          existing,
        ),
      ).toEqual(existing);
    });
  });
});
