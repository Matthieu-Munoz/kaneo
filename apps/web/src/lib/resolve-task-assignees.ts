import type Task from "@/types/task";

export type ResolvedTaskAssignee = {
  id: string;
  name: string | null;
  image: string | null;
};

type MemberCandidate = {
  id?: string;
  userId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
};

function deduplicateIds(ids: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export function getTaskAssigneeIds(
  task: Pick<Task, "userId" | "userIds" | "assignees"> | null | undefined,
): string[] {
  if (!task) {
    return [];
  }

  if (Array.isArray(task.userIds)) {
    const ids = deduplicateIds(task.userIds);
    if (ids.length > 0 || !task.userId) {
      return ids;
    }
  }

  if (Array.isArray(task.assignees)) {
    const ids = deduplicateIds(task.assignees.map((assignee) => assignee.id));
    if (ids.length > 0 || !task.userId) {
      return ids;
    }
  }

  const primary = typeof task.userId === "string" ? task.userId.trim() : "";
  return primary ? [primary] : [];
}

export function toggleTaskAssigneeId(
  currentIds: readonly string[],
  userId: string,
): string[] {
  const trimmed = userId.trim();
  if (!trimmed) {
    return [];
  }
  if (currentIds.includes(trimmed)) {
    return currentIds.filter((id) => id !== trimmed);
  }
  return [...currentIds, trimmed];
}

export function resolveTaskAssignees(
  task:
    | Pick<
        Task,
        "userId" | "userIds" | "assignees" | "assigneeName" | "assigneeImage"
      >
    | null
    | undefined,
  members?: readonly MemberCandidate[] | null,
): ResolvedTaskAssignee[] {
  const ids = getTaskAssigneeIds(task);
  if (ids.length === 0) {
    return [];
  }

  const memberMap = new Map<
    string,
    { name: string | null; image: string | null }
  >();
  for (const member of members ?? []) {
    const id = member.userId ?? member.user?.id ?? member.id;
    if (!id) continue;
    const name =
      member.user?.name ??
      member.name ??
      member.user?.email ??
      member.email ??
      null;
    const image = member.user?.image ?? member.image ?? null;
    memberMap.set(id, { name, image });
  }

  const taskAssigneeMap = new Map<
    string,
    { name: string | null; image: string | null }
  >();
  for (const assignee of task?.assignees ?? []) {
    if (!assignee.id) continue;
    taskAssigneeMap.set(assignee.id, {
      name: assignee.name ?? null,
      image: assignee.image ?? null,
    });
  }

  return ids.map((id) => {
    const fromMember = memberMap.get(id);
    const fromTask = taskAssigneeMap.get(id);
    const isPrimary = task?.userId === id;
    return {
      id,
      name:
        fromMember?.name ??
        fromTask?.name ??
        (isPrimary ? (task?.assigneeName ?? null) : null),
      image:
        fromMember?.image ??
        fromTask?.image ??
        (isPrimary ? (task?.assigneeImage ?? null) : null),
    };
  });
}

export function formatAssigneeNames(
  assignees: readonly { name: string | null | undefined }[],
  fallback = "",
): string {
  const names = assignees
    .map((assignee) => assignee.name?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names.join(", ") : fallback;
}
