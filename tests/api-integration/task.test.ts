import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { checkDueDateReminders } from "../../apps/api/src/scheduler/due-date-reminders";
import { DUE_DATE_DURATION_MS } from "../../apps/api/src/scheduler/reminder-timing";
import deleteAccountData from "../../apps/api/src/user/controllers/delete-account-data";
import { handleMemberRemoved } from "../../apps/api/src/workspace-members/handle-member-removed";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { readErrorBody } from "./helpers/error-body";

describe("API integration: task creation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated task creation requests", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Unauthorized task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(401);
    expect(await readErrorBody(response)).toMatchObject({
      message: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("creates a task with the matching column, assignee, and next number", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Delivery",
      slug: "delivery",
    });

    await db.insert(schema.taskTable).values({
      projectId: project.id,
      userId: member.user.id,
      title: "Existing task",
      description: "Already there",
      status: "to-do",
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 1,
    });
    await db
      .update(schema.projectTable)
      .set({ lastTaskNumber: 1 })
      .where(eq(schema.projectTable.id, project.id));

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Ship integration flow",
        description: "Cover the first create-task path",
        priority: "high",
        status: "to-do",
        userId: member.user.id,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      projectId: string;
      title: string;
      description: string;
      priority: string;
      status: string;
      userId: string | null;
      number: number | null;
      position: number | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      projectId: project.id,
      title: "Ship integration flow",
      description: "Cover the first create-task path",
      priority: "high",
      status: "to-do",
      userId: member.user.id,
      number: 2,
      position: 2,
      assigneeName: member.user.name,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      projectId: project.id,
      columnId: columns.todo.id,
      userId: member.user.id,
      title: "Ship integration flow",
      priority: "high",
      status: "to-do",
      number: 2,
      position: 2,
    });
  });

  it("rejects task creation for users outside the project workspace", async () => {
    const member = await createWorkspaceMember();
    const outsiderId = `user-${randomUUID()}`;
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Task Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Forbidden task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(404);
    expect(await readErrorBody(response)).toMatchObject({
      message: "Project not found",
      code: "NOT_FOUND",
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: and(
        eq(schema.taskTable.projectId, project.id),
        eq(schema.taskTable.title, "Forbidden task"),
      ),
    });

    expect(persistedTask).toBeUndefined();
  });

  it("creates an unassigned task with parsed dates when optional fields are provided", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Plan release cut",
        description: "Track optional fields too",
        priority: "medium",
        status: "in-progress",
        startDate: "2026-04-01T09:00:00.000Z",
        dueDate: "2026-04-05T17:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      userId: string | null;
      columnId: string | null;
      startDate: string | null;
      dueDate: string | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      userId: null,
      columnId: columns.inProgress.id,
      startDate: "2026-04-01T09:00:00.000Z",
      dueDate: "2026-04-05T17:00:00.000Z",
    });
    expect(payload.assigneeName).toBeUndefined();

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      userId: null,
      columnId: columns.inProgress.id,
      status: "in-progress",
    });
    expect(persistedTask?.startDate?.toISOString()).toBe(
      "2026-04-01T09:00:00.000Z",
    );
    expect(persistedTask?.dueDate?.toISOString()).toBe(
      "2026-04-05T17:00:00.000Z",
    );
  });

  it("creates tasks without a column when the status has no matching project column", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Future status task",
        description: "Status does not map to a seeded column",
        priority: "low",
        status: "planned",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      status: string;
      columnId: string | null;
      position: number | null;
    };

    expect(payload).toMatchObject({
      status: "planned",
      columnId: null,
      position: 1,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      status: "planned",
      columnId: null,
      position: 1,
    });
  });

  it("rejects task creation for an assignee that cannot be assigned, without revealing whether the user exists", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const missingAssigneeId = `user-${randomUUID()}`;

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Ghost assignee task",
        description: "Should fail because the assignee does not exist",
        priority: "low",
        status: "to-do",
        userId: missingAssigneeId,
      }),
    });

    // A missing user and a non-member both answer 403 with the same message, so
    // the endpoint cannot be used to probe which user ids exist.
    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain(
      "Assignee is not a member of this workspace",
    );

    const persistedTask = await db.query.taskTable.findFirst({
      where: and(
        eq(schema.taskTable.projectId, project.id),
        eq(schema.taskTable.title, "Ghost assignee task"),
      ),
    });

    expect(persistedTask).toBeUndefined();
  });

  it("creates a task when the assignee userId is surrounded by whitespace", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const paddedAssigneeId = `  ${member.user.id}  `;

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Padded assignee task",
        description: "Whitespace around userId should be trimmed",
        priority: "medium",
        status: "to-do",
        userId: paddedAssigneeId,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      userId: string;
      assigneeName?: string;
    };

    expect(payload.userId).toBe(member.user.id);
    expect(payload.assigneeName).toBe(member.user.name);

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      projectId: project.id,
      columnId: columns.todo.id,
      userId: member.user.id,
      title: "Padded assignee task",
    });
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
  ])(
    "creates an unassigned task when the assignee userId is %s",
    async (label, userId) => {
      const member = await createWorkspaceMember();
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const title = `Blank assignee task (${label})`;
      const response = await app.request(`/api/task/${project.id}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title,
          description: "Blank userId means unassigned",
          priority: "low",
          status: "to-do",
          userId,
        }),
      });

      expect(response.status).toBe(200);
      const payload = (await response.json()) as {
        userId: string | null;
        assigneeName?: string;
      };

      expect(payload.userId).toBeNull();
      expect(payload.assigneeName).toBeUndefined();

      const persistedTask = await db.query.taskTable.findFirst({
        where: and(
          eq(schema.taskTable.projectId, project.id),
          eq(schema.taskTable.title, title),
        ),
      });

      expect(persistedTask?.userId).toBeNull();
    },
  );

  it("supports creating, updating, filtering, and listing tasks with multiple assignees", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const [secondUser] = await db
      .insert(schema.userTable)
      .values({
        name: "Second Assignee",
        email: `second-${randomUUID()}@example.com`,
      })
      .returning();
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: secondUser.id,
      role: "admin",
      joinedAt: new Date(),
    });

    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const createRes = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Multi-assignee task",
        description: "Shared responsibility",
        priority: "high",
        status: "to-do",
        userIds: [owner.user.id, secondUser.id],
      }),
    });

    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      id: string;
      userId: string | null;
      userIds: string[];
      assignees: Array<{ id: string; name: string | null }>;
    };
    expect(created.userId).toBe(owner.user.id);
    expect(created.userIds).toEqual([owner.user.id, secondUser.id]);
    expect(created.assignees).toEqual([
      expect.objectContaining({ id: owner.user.id, name: owner.user.name }),
      expect.objectContaining({ id: secondUser.id, name: secondUser.name }),
    ]);

    const boardFilterRes = await app.request(
      `/api/task/tasks/${project.id}?assigneeId=${secondUser.id}`,
    );
    expect(boardFilterRes.status).toBe(200);
    const boardFiltered = (await boardFilterRes.json()) as {
      data: {
        columns: Array<{
          tasks: Array<{
            id: string;
            userIds: string[];
            assignees: Array<{ id: string }>;
          }>;
        }>;
      };
    };
    const filteredTasks = boardFiltered.data.columns.flatMap((c) => c.tasks);
    expect(filteredTasks.map((t) => t.id)).toEqual([created.id]);
    expect(filteredTasks[0]?.userIds).toEqual([owner.user.id, secondUser.id]);

    mockAuthenticatedSession(secondUser);
    const assignedRes = await app.request(
      `/api/task/assigned?workspaceId=${owner.workspace.id}`,
    );
    expect(assignedRes.status).toBe(200);
    const assignedBody = (await assignedRes.json()) as {
      tasks: Array<{ id: string }>;
      total: number;
    };
    expect(assignedBody.total).toBe(1);
    expect(assignedBody.tasks.map((t) => t.id)).toEqual([created.id]);

    mockAuthenticatedSession(owner.user);
    const updateAssigneesRes = await app.request(
      `/api/task/assignee/${created.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: [secondUser.id] }),
      },
    );
    expect(updateAssigneesRes.status).toBe(200);
    const updated = (await updateAssigneesRes.json()) as {
      userId: string | null;
      userIds: string[];
    };
    expect(updated.userId).toBe(secondUser.id);
    expect(updated.userIds).toEqual([secondUser.id]);

    const clearRes = await app.request(`/api/task/assignee/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: [] }),
    });
    expect(clearRes.status).toBe(200);
    const cleared = (await clearRes.json()) as {
      userId: string | null;
      userIds: string[];
    };
    expect(cleared.userId).toBeNull();
    expect(cleared.userIds).toEqual([]);
  });

  it("preserves secondary assignees on legacy full update, supports bulk add/remove, and promotes primary on account deletion", async () => {
    const owner = await createWorkspaceMember({ role: "owner" });
    const [secondUser, memberUser] = await db
      .insert(schema.userTable)
      .values([
        {
          name: "Second Assignee",
          email: `second-${randomUUID()}@example.com`,
        },
        {
          name: "Regular Member",
          email: `member-${randomUUID()}@example.com`,
        },
      ])
      .returning();

    await db.insert(schema.workspaceUserTable).values([
      {
        workspaceId: owner.workspace.id,
        userId: secondUser.id,
        role: "admin",
        joinedAt: new Date(),
      },
      {
        workspaceId: owner.workspace.id,
        userId: memberUser.id,
        role: "member",
        joinedAt: new Date(),
      },
    ]);

    const { project } = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const createRes = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Shared task",
        description: "Initial",
        priority: "medium",
        status: "to-do",
        userIds: [secondUser.id, owner.user.id],
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      id: string;
      position: number;
    };

    mockAuthenticatedSession(memberUser);
    const legacyPutRes = await app.request(`/api/task/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Edited by member",
        description: "Updated",
        priority: "high",
        status: "to-do",
        projectId: project.id,
        position: created.position,
        userId: secondUser.id,
      }),
    });
    expect(legacyPutRes.status).toBe(200);
    const legacyPutBody = (await legacyPutRes.json()) as {
      title: string;
      userId: string | null;
      userIds: string[];
      position: number;
    };
    expect(legacyPutBody.title).toBe("Edited by member");
    expect(legacyPutBody.userId).toBe(secondUser.id);
    expect(legacyPutBody.userIds).toEqual([secondUser.id, owner.user.id]);

    const omittedUserPutRes = await app.request(`/api/task/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Edited without userId",
        description: "Updated",
        priority: "high",
        status: "to-do",
        projectId: project.id,
        position: legacyPutBody.position,
      }),
    });
    expect(omittedUserPutRes.status).toBe(200);
    const omittedUserPutBody = (await omittedUserPutRes.json()) as {
      title: string;
      userIds: string[];
    };
    expect(omittedUserPutBody.title).toBe("Edited without userId");
    expect(omittedUserPutBody.userIds).toEqual([secondUser.id, owner.user.id]);

    mockAuthenticatedSession(owner.user);
    const atomicAddRes = await app.request(
      `/api/task/${created.id}/assignees`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: memberUser.id }),
      },
    );
    expect(atomicAddRes.status).toBe(200);
    expect(
      ((await atomicAddRes.json()) as { userIds: string[] }).userIds,
    ).toEqual([secondUser.id, owner.user.id, memberUser.id]);

    const atomicRemoveRes = await app.request(
      `/api/task/${created.id}/assignees/${memberUser.id}`,
      {
        method: "DELETE",
      },
    );
    expect(atomicRemoveRes.status).toBe(200);
    expect(
      ((await atomicRemoveRes.json()) as { userIds: string[] }).userIds,
    ).toEqual([secondUser.id, owner.user.id]);

    const bulkAddRes = await app.request("/api/task/bulk", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        taskIds: [created.id],
        operation: "updateAssignee",
        assigneeMode: "add",
        value: memberUser.id,
      }),
    });
    expect(bulkAddRes.status).toBe(200);

    await db
      .update(schema.taskTable)
      .set({
        dueDate: new Date(Date.now() - DUE_DATE_DURATION_MS - 5 * 60_000),
      })
      .where(eq(schema.taskTable.id, created.id));
    await checkDueDateReminders();
    const overdueNotifications = await db
      .select()
      .from(schema.notificationTable)
      .where(
        and(
          eq(schema.notificationTable.resourceId, created.id),
          eq(schema.notificationTable.type, "task_overdue"),
        ),
      );
    expect(new Set(overdueNotifications.map((n) => n.userId))).toEqual(
      new Set([secondUser.id, owner.user.id, memberUser.id]),
    );

    await db
      .delete(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, owner.workspace.id),
          eq(schema.workspaceUserTable.userId, memberUser.id),
        ),
      );
    await handleMemberRemoved({
      workspaceId: owner.workspace.id,
      userId: memberUser.id,
      userRole: null,
    });

    await deleteAccountData(secondUser.id);
    await db
      .delete(schema.userTable)
      .where(eq(schema.userTable.id, secondUser.id));

    const persistedAfterDelete = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, created.id),
    });
    expect(persistedAfterDelete?.userId).toBe(owner.user.id);
  });
});
