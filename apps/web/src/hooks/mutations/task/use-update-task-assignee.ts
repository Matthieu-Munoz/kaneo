import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskAssignee from "@/fetchers/task/update-task-assignee";
import {
  getBoardCacheVersion,
  markBoardCacheChanged,
} from "@/lib/board-cache-version";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import { isPerTaskRelationQuery } from "@/lib/relation-query-keys";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";
import type Task from "@/types/task";

export function useUpdateTaskAssignee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      task: Task & {
        assigneeMode?: "set" | "add" | "remove";
        assigneeIds?: string[];
      },
    ) => updateTaskAssignee(task.id, task),
    onMutate: async (variables) => {
      const nextUserIds =
        variables.userIds !== undefined
          ? variables.userIds.filter(Boolean)
          : variables.userId
            ? [variables.userId]
            : [];
      const nextUserId = nextUserIds[0] ?? null;

      markBoardCacheChanged(queryClient, variables.projectId, variables.id);
      const taskQueryKey = ["task", variables.id];
      await queryClient.cancelQueries({ queryKey: taskQueryKey });
      const previousTask = queryClient.getQueryData<Task>(taskQueryKey);

      const optimisticPatch: Partial<Task> = {
        userId: nextUserId,
        assigneeId: nextUserId,
        userIds: nextUserIds,
        ...(variables.assignees !== undefined
          ? {
              assignees: variables.assignees,
              assigneeName: variables.assignees[0]?.name ?? null,
              assigneeImage: variables.assignees[0]?.image ?? null,
            }
          : !nextUserId
            ? { assignees: [], assigneeName: null, assigneeImage: null }
            : {}),
      };

      queryClient.setQueryData<Task>(taskQueryKey, (current) =>
        current ? { ...current, ...optimisticPatch } : current,
      );
      const version = getBoardCacheVersion(
        queryClient,
        variables.projectId,
        variables.id,
      );
      updateBoardTaskCache(
        queryClient,
        variables.projectId,
        variables.id,
        optimisticPatch,
        version,
      );

      return { previousTask, version };
    },
    onError: (_error, variables, context) => {
      if (context?.previousTask !== undefined) {
        queryClient.setQueryData(["task", variables.id], context.previousTask);
      }
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
    },
    onSuccess: (updated, variables, context) => {
      updateBoardTaskCache(
        queryClient,
        variables.projectId,
        variables.id,
        {
          userId: updated.userId ?? null,
          userIds: updated.userIds,
          assignees: updated.assignees,
        },
        context?.version,
      );
      invalidateMyWork(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["task", variables.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["notifications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["projects"],
      });
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.id],
      });
      // Per-task relation responses embed the linked tasks' status and
      // assignee, so they stale here; the project-scoped query returns edges
      // alone and does not.
      queryClient.invalidateQueries({ predicate: isPerTaskRelationQuery });
    },
  });
}
