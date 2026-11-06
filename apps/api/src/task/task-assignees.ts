import { asc, eq, inArray, or, type SQLWrapper, sql } from "drizzle-orm";
import type db from "../database";
import { taskAssigneeTable, taskTable, userTable } from "../database/schema";
import {
  areAssigneeListsEqual,
  diffAssigneeIds,
  mergePrimaryAssignee,
  normalizeAssigneeInput,
  resolveAssigneeIds,
  type TaskAssigneeItem,
} from "./assignee-ids";

export {
  areAssigneeListsEqual,
  diffAssigneeIds,
  mergePrimaryAssignee,
  normalizeAssigneeInput,
  resolveAssigneeIds,
  type TaskAssigneeItem,
};

type SelectDb = Pick<typeof db, "select">;
type WriteDb = Pick<typeof db, "select" | "insert" | "delete">;

export function hasTaskAssignee(userId: string | SQLWrapper) {
  return or(
    eq(taskTable.userId, userId),
    sql`exists (select 1 from ${taskAssigneeTable} where ${taskAssigneeTable.taskId} = ${taskTable.id} and ${taskAssigneeTable.userId} = ${userId})`,
  );
}

export async function getTaskAssigneeIds(
  database: SelectDb,
  taskId: string,
  fallbackUserId?: string | null,
): Promise<string[]> {
  const rows = await database
    .select({ userId: taskAssigneeTable.userId })
    .from(taskAssigneeTable)
    .where(eq(taskAssigneeTable.taskId, taskId))
    .orderBy(asc(taskAssigneeTable.createdAt), asc(taskAssigneeTable.id));

  const ids = rows.map((row) => row.userId);
  const fallback = fallbackUserId?.trim() || null;
  if (fallback && !ids.includes(fallback)) {
    return [fallback, ...ids];
  }
  return ids;
}

export async function syncTaskAssignees(
  tx: WriteDb,
  taskId: string,
  nextIdsInput: readonly string[],
  fallbackBeforeUserId?: string | null,
): Promise<{
  beforeIds: string[];
  afterIds: string[];
  added: string[];
  removed: string[];
  primaryUserId: string | null;
}> {
  const afterIds = normalizeAssigneeInput({ userIds: nextIdsInput }) ?? [];
  const existingRows = await tx
    .select({ userId: taskAssigneeTable.userId })
    .from(taskAssigneeTable)
    .where(eq(taskAssigneeTable.taskId, taskId))
    .orderBy(asc(taskAssigneeTable.createdAt), asc(taskAssigneeTable.id));

  const storedIds = existingRows.map((row) => row.userId);
  const fallback = fallbackBeforeUserId?.trim() || null;
  const beforeIds =
    fallback && !storedIds.includes(fallback)
      ? [fallback, ...storedIds]
      : storedIds;

  if (!areAssigneeListsEqual(storedIds, afterIds)) {
    await tx
      .delete(taskAssigneeTable)
      .where(eq(taskAssigneeTable.taskId, taskId));

    if (afterIds.length > 0) {
      const baseTime = Date.now();
      await tx.insert(taskAssigneeTable).values(
        afterIds.map((userId, index) => ({
          taskId,
          userId,
          createdAt: new Date(baseTime + index),
        })),
      );
    }
  }

  const { added, removed } = diffAssigneeIds(beforeIds, afterIds);
  return {
    beforeIds,
    afterIds,
    added,
    removed,
    primaryUserId: afterIds[0] ?? null,
  };
}

export async function loadTaskAssigneesMap(
  database: SelectDb,
  tasks: ReadonlyArray<{
    id: string;
    userId?: string | null;
    assigneeName?: string | null;
    assigneeImage?: string | null;
  }>,
): Promise<Map<string, TaskAssigneeItem[]>> {
  const map = new Map<string, TaskAssigneeItem[]>();
  if (tasks.length === 0) {
    return map;
  }

  if (tasks.length > 500) {
    for (let offset = 0; offset < tasks.length; offset += 500) {
      const chunkMap = await loadTaskAssigneesMap(
        database,
        tasks.slice(offset, offset + 500),
      );
      for (const [taskId, assignees] of chunkMap) {
        map.set(taskId, assignees);
      }
    }
    return map;
  }

  const taskIds = tasks.map((task) => task.id);
  const rows = await database
    .select({
      taskId: taskAssigneeTable.taskId,
      userId: userTable.id,
      name: userTable.name,
      image: userTable.image,
    })
    .from(taskAssigneeTable)
    .innerJoin(userTable, eq(taskAssigneeTable.userId, userTable.id))
    .where(inArray(taskAssigneeTable.taskId, taskIds))
    .orderBy(asc(taskAssigneeTable.createdAt), asc(taskAssigneeTable.id));

  for (const row of rows) {
    const list = map.get(row.taskId) ?? [];
    list.push({
      id: row.userId,
      name: row.name,
      image: row.image,
    });
    map.set(row.taskId, list);
  }

  const missingPrimaryUserIds = Array.from(
    new Set(
      tasks
        .filter(
          (task) =>
            task.userId &&
            (task.assigneeName === undefined ||
              task.assigneeImage === undefined) &&
            !(map.get(task.id) ?? []).some((item) => item.id === task.userId),
        )
        .map((task) => task.userId as string),
    ),
  );

  const fallbackUsersById = new Map<
    string,
    { name: string | null; image: string | null }
  >();
  if (missingPrimaryUserIds.length > 0) {
    const users = await database
      .select({
        id: userTable.id,
        name: userTable.name,
        image: userTable.image,
      })
      .from(userTable)
      .where(inArray(userTable.id, missingPrimaryUserIds));
    for (const user of users) {
      fallbackUsersById.set(user.id, {
        name: user.name,
        image: user.image,
      });
    }
  }

  for (const task of tasks) {
    const joinItems = map.get(task.id) ?? [];
    const fallbackUser = task.userId
      ? fallbackUsersById.get(task.userId)
      : undefined;
    map.set(
      task.id,
      mergePrimaryAssignee(
        {
          id: task.userId,
          name: task.assigneeName ?? fallbackUser?.name ?? null,
          image: task.assigneeImage ?? fallbackUser?.image ?? null,
        },
        joinItems,
      ),
    );
  }

  return map;
}
