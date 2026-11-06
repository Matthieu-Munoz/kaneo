import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { withLockedTask } from "./with-locked-task";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishTaskMutation } from "./task-mutation-effects";
import {
  assertAssignableUsers,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import {
  areAssigneeListsEqual,
  getTaskAssigneeIds,
  loadTaskAssigneesMap,
  resolveAssigneeIds,
  syncTaskAssignees,
} from "../task-assignees";

async function updateTaskAssignee({
  id,
  userId,
  userIds,
  assigneeIds,
  mode = "set",
  currentUserId,
}: {
  id: string;
  userId?: string | null;
  userIds?: string[] | null;
  assigneeIds?: string[] | null;
  mode?: "set" | "add" | "remove";
  currentUserId: string;
}) {
  const requestedIds = resolveAssigneeIds({ userId, userIds, assigneeIds });

  const {
    before: existingTask,
    after: { task: updatedTask, beforeIds, afterIds, changed },
  } = await withLockedTask(id, async (tx, existingTask) => {
    const currentIds = await getTaskAssigneeIds(tx, id, existingTask.userId);
    const nextUserIds =
      mode === "add"
        ? Array.from(new Set([...currentIds, ...requestedIds]))
        : mode === "remove"
          ? currentIds.filter((candidate) => !requestedIds.includes(candidate))
          : requestedIds;
    if (nextUserIds.length > 100) {
      throw new HTTPException(400, {
        message: "A task can have at most 100 assignees",
      });
    }
    const nextPrimaryId = nextUserIds[0] ?? null;

    if (mode !== "remove" && requestedIds.length > 0) {
      await assertAssignableUsers(
        requestedIds,
        await getProjectWorkspaceId(existingTask.projectId, tx),
        existingTask.projectId,
        tx,
      );
    }

    if (
      areAssigneeListsEqual(currentIds, nextUserIds) &&
      existingTask.userId === nextPrimaryId
    ) {
      return {
        task: existingTask,
        beforeIds: currentIds,
        afterIds: nextUserIds,
        changed: false,
      };
    }

    const syncResult = await syncTaskAssignees(
      tx,
      id,
      nextUserIds,
      existingTask.userId,
    );

    const [updatedTask] = await tx
      .update(taskTable)
      .set({ userId: syncResult.primaryUserId })
      .where(eq(taskTable.id, id))
      .returning();

    if (!updatedTask) {
      throw new HTTPException(500, {
        message: "Failed to update task assignee",
      });
    }

    return {
      task: updatedTask,
      beforeIds: syncResult.beforeIds,
      afterIds: syncResult.afterIds,
      changed: true,
    };
  });

  if (changed) {
    await publishTaskMutation(existingTask, updatedTask, currentUserId, {
      fields: ["userId"],
      beforeUserIds: beforeIds,
      afterUserIds: afterIds,
    });
  }

  const assigneesMap =
    afterIds.length > 0 ? await loadTaskAssigneesMap(db, [updatedTask]) : null;
  const assignees = assigneesMap?.get(updatedTask.id) ?? [];

  return {
    ...updatedTask,
    userIds: afterIds,
    assignees,
  };
}

export default updateTaskAssignee;
