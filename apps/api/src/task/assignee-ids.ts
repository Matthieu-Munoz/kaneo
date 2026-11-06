export type TaskAssigneeItem = {
  id: string;
  name: string | null;
  image: string | null;
};

export function normalizeAssigneeInput(input: {
  userId?: string | null;
  userIds?: readonly (string | null | undefined)[] | null;
  assigneeIds?: readonly (string | null | undefined)[] | null;
}): string[] | undefined {
  const rawList =
    input.assigneeIds !== undefined && input.assigneeIds !== null
      ? input.assigneeIds
      : input.userIds;
  if (rawList !== undefined && rawList !== null) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of rawList) {
      const trimmed = typeof raw === "string" ? raw.trim() : "";
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
    return result;
  }

  if (input.userId !== undefined) {
    const trimmed = typeof input.userId === "string" ? input.userId.trim() : "";
    return trimmed ? [trimmed] : [];
  }

  return undefined;
}

export function resolveAssigneeIds(
  input: {
    userId?: string | null;
    userIds?: readonly (string | null | undefined)[] | null;
    assigneeIds?: readonly (string | null | undefined)[] | null;
  },
  fallbackUserIds?: string | readonly string[] | null,
  preLockPrimaryUserId?: string | null,
): string[] {
  const rawList =
    input.assigneeIds !== undefined && input.assigneeIds !== null
      ? input.assigneeIds
      : input.userIds;
  if (rawList !== undefined && rawList !== null) {
    return normalizeAssigneeInput({ userIds: rawList }) ?? [];
  }

  const fallbackList = Array.isArray(fallbackUserIds)
    ? (normalizeAssigneeInput({ userIds: fallbackUserIds }) ?? [])
    : typeof fallbackUserIds === "string" && fallbackUserIds.trim()
      ? [fallbackUserIds.trim()]
      : [];

  if (input.userId !== undefined) {
    const trimmed = typeof input.userId === "string" ? input.userId.trim() : "";
    const preLockTrimmed =
      typeof preLockPrimaryUserId === "string"
        ? preLockPrimaryUserId.trim()
        : "";
    if (!trimmed) {
      if (preLockPrimaryUserId === null) {
        return fallbackList;
      }
      return [];
    }
    if (
      (fallbackList.length > 0 &&
        (fallbackList[0] === trimmed || fallbackList.includes(trimmed))) ||
      (preLockTrimmed && preLockTrimmed === trimmed)
    ) {
      return fallbackList;
    }
    return [trimmed];
  }

  return fallbackList;
}

export function areAssigneeListsEqual(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function diffAssigneeIds(
  before: readonly string[],
  after: readonly string[],
): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((id) => !beforeSet.has(id)),
    removed: before.filter((id) => !afterSet.has(id)),
  };
}

export function mergePrimaryAssignee(
  primary: {
    id: string | null | undefined;
    name?: string | null;
    image?: string | null;
  },
  assignees: readonly TaskAssigneeItem[],
): TaskAssigneeItem[] {
  const primaryId = primary.id?.trim() || null;
  if (assignees.length === 0) {
    if (!primaryId) {
      return [];
    }
    return [
      {
        id: primaryId,
        name: primary.name ?? null,
        image: primary.image ?? null,
      },
    ];
  }

  if (primaryId && !assignees.some((assignee) => assignee.id === primaryId)) {
    return [
      {
        id: primaryId,
        name: primary.name ?? null,
        image: primary.image ?? null,
      },
      ...assignees,
    ];
  }

  return [...assignees];
}
