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
  currentUserId,
}: {
  id: string;
  userId?: string | null;
  userIds?: string[] | null;
  currentUserId: string;
}) {
  const nextUserIds = resolveAssigneeIds({ userId, userIds });

  const {
    before: existingTask,
    after: { task: updatedTask, beforeIds, afterIds },
  } = await withLockedTask(id, async (tx, existingTask) => {
    const currentIds = await getTaskAssigneeIds(tx, id, existingTask.userId);
    const nextPrimaryId = nextUserIds[0] ?? null;

    if (
      areAssigneeListsEqual(currentIds, nextUserIds) &&
      existingTask.userId === nextPrimaryId
    ) {
      return {
        task: existingTask,
        beforeIds: currentIds,
        afterIds: nextUserIds,
      };
    }

    const newlyAddedIds = nextUserIds.filter(
      (candidate) => !currentIds.includes(candidate),
    );
    if (newlyAddedIds.length > 0) {
      await assertAssignableUsers(
        newlyAddedIds,
        await getProjectWorkspaceId(existingTask.projectId, tx),
        existingTask.projectId,
        tx,
      );
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
    };
  });

  await publishTaskMutation(existingTask, updatedTask, currentUserId, {
    fields: ["userId"],
    beforeUserIds: beforeIds,
    afterUserIds: afterIds,
  });

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
