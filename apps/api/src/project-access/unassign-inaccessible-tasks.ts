import { and, asc, eq, inArray, not } from "drizzle-orm";
import createActivities from "../activity/controllers/create-activities";
import { schema } from "../database";
import type { DbOrTx } from "./db-or-tx";
import { projectAccessCondition } from "./project-access-condition";

export async function unassignInaccessibleTasks(
  database: DbOrTx,
  change: { workspaceId: string; userId: string; actorId: string },
): Promise<{ id: string; projectId: string }[]> {
  const inaccessibleProjectsSubquery = database
    .select({ id: schema.projectTable.id })
    .from(schema.projectTable)
    .where(
      and(
        eq(schema.projectTable.workspaceId, change.workspaceId),
        not(projectAccessCondition(change.userId, schema.projectTable.id)),
      ),
    );

  const removedJoinRows = await database
    .delete(schema.taskAssigneeTable)
    .where(
      and(
        eq(schema.taskAssigneeTable.userId, change.userId),
        inArray(
          schema.taskAssigneeTable.taskId,
          database
            .select({ id: schema.taskTable.id })
            .from(schema.taskTable)
            .where(
              inArray(schema.taskTable.projectId, inaccessibleProjectsSubquery),
            ),
        ),
      ),
    )
    .returning({ taskId: schema.taskAssigneeTable.taskId });

  const primaryTasks = await database
    .select({
      id: schema.taskTable.id,
      projectId: schema.taskTable.projectId,
    })
    .from(schema.taskTable)
    .where(
      and(
        eq(schema.taskTable.userId, change.userId),
        inArray(schema.taskTable.projectId, inaccessibleProjectsSubquery),
      ),
    );

  for (const task of primaryTasks) {
    const [nextAssignee] = await database
      .select({ userId: schema.taskAssigneeTable.userId })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.taskId, task.id))
      .orderBy(
        asc(schema.taskAssigneeTable.createdAt),
        asc(schema.taskAssigneeTable.id),
      )
      .limit(1);

    await database
      .update(schema.taskTable)
      .set({ userId: nextAssignee?.userId ?? null })
      .where(eq(schema.taskTable.id, task.id));
  }

  const affectedMap = new Map<string, { id: string; projectId: string }>();
  for (const task of primaryTasks) {
    affectedMap.set(task.id, task);
  }

  const extraTaskIds = removedJoinRows
    .map((row) => row.taskId)
    .filter((taskId) => !affectedMap.has(taskId));

  if (extraTaskIds.length > 0) {
    const extraTasks = await database
      .select({
        id: schema.taskTable.id,
        projectId: schema.taskTable.projectId,
      })
      .from(schema.taskTable)
      .where(inArray(schema.taskTable.id, extraTaskIds));
    for (const task of extraTasks) {
      affectedMap.set(task.id, task);
    }
  }

  const unassigned = Array.from(affectedMap.values());

  await createActivities(
    unassigned.map((task) => ({
      taskId: task.id,
      type: "unassigned",
      userId: change.actorId,
      content: null,
      eventData: {},
    })),
    database,
  );

  return unassigned;
}
