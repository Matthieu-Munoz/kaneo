import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireEntitlement } from "../../billing/require-entitlement-middleware";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import {
  areAssigneeListsEqual,
  getTaskAssigneeIds,
  resolveAssigneeIds,
} from "../task-assignees";

type BulkTaskOperation =
  | "updateStatus"
  | "updatePriority"
  | "updateAssignee"
  | "addAssignee"
  | "removeAssignee"
  | "delete"
  | "addLabel"
  | "removeLabel"
  | "updateDueDate";

const BULK_OPERATIONS: readonly BulkTaskOperation[] = [
  "updateStatus",
  "updatePriority",
  "updateAssignee",
  "addAssignee",
  "removeAssignee",
  "delete",
  "addLabel",
  "removeLabel",
  "updateDueDate",
];

// Route middleware runs before the validators, so c.req.valid() is unavailable.
async function readJsonBody(c: Context): Promise<Record<string, unknown>> {
  const raw = (await c.req.json().catch(() => ({}))) as unknown;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}

async function bulkOperation(c: Context): Promise<BulkTaskOperation> {
  const { operation } = await readJsonBody(c);
  if (
    typeof operation !== "string" ||
    !(BULK_OPERATIONS as readonly string[]).includes(operation)
  ) {
    throw new HTTPException(400, {
      message: `operation must be one of: ${BULK_OPERATIONS.join(", ")}`,
    });
  }
  return operation as BulkTaskOperation;
}

export async function requireBulkTaskPermission(c: Context, next: Next) {
  const operation = await bulkOperation(c);

  if (operation === "delete") {
    return requireWorkspacePermission({ task: ["delete"] })(c, next);
  }

  if (
    operation === "updateAssignee" ||
    operation === "addAssignee" ||
    operation === "removeAssignee"
  ) {
    return requireWorkspacePermission({ task: ["assign"] })(c, next);
  }

  if (operation === "addLabel" || operation === "removeLabel") {
    return requireWorkspacePermission({ label: ["update"] })(c, next);
  }

  return requireWorkspacePermission({ task: ["update"] })(c, next);
}

export async function requireBulkTaskEntitlement(c: Context, next: Next) {
  const operation = await bulkOperation(c);

  if (
    operation === "delete" ||
    operation === "addLabel" ||
    operation === "removeLabel"
  ) {
    return next();
  }

  return requireEntitlement(c, next);
}

export async function requireTaskAssigneePermission(c: Context, next: Next) {
  const id = c.req.param("id");
  const { userId, userIds } = await readJsonBody(c);

  const [existingTask] = await db
    .select({ userId: taskTable.userId })
    .from(taskTable)
    .where(eq(taskTable.id, id ?? ""))
    .limit(1);

  if (!existingTask) {
    return next();
  }

  const currentAssigneeIds = await getTaskAssigneeIds(
    db,
    id ?? "",
    existingTask.userId,
  );
  const nextAssigneeIds = resolveAssigneeIds(
    {
      userId: typeof userId === "string" ? userId : "",
      userIds: Array.isArray(userIds)
        ? userIds.filter((item): item is string => typeof item === "string")
        : undefined,
    },
    currentAssigneeIds,
  );

  if (!areAssigneeListsEqual(currentAssigneeIds, nextAssigneeIds)) {
    return requireWorkspacePermission({ task: ["assign"] })(c, next);
  }

  return next();
}

export async function requireTaskRecurrencePermission(c: Context, next: Next) {
  const { recurrence } = await readJsonBody(c);
  return requireWorkspacePermission({
    task: recurrence == null ? ["update"] : ["update", "create"],
  })(c, next);
}
