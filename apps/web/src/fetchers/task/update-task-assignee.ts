import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type Task from "@/types/task";

type UpdateTaskAssigneePayload = Pick<Task, "userId"> & {
  userIds?: string[];
  assigneeIds?: string[];
  assigneeMode?: "set" | "add" | "remove";
};

async function updateTaskAssignee(
  taskId: string,
  task: UpdateTaskAssigneePayload,
) {
  const list = task.assigneeIds ?? task.userIds;
  const userIds =
    list !== undefined
      ? list.filter(Boolean)
      : task.userId
        ? [task.userId]
        : [];
  const response =
    task.assigneeMode === "add" && task.userId
      ? await client.task[":id"].assignees.$post({
          param: { id: taskId },
          json: { userId: task.userId },
        })
      : task.assigneeMode === "remove" && task.userId
        ? await client.task[":id"].assignees[":userId"].$delete({
            param: { id: taskId, userId: task.userId },
          })
        : task.assigneeMode === "set"
          ? await client.task[":id"].assignees.$put({
              param: { id: taskId },
              json: { assigneeIds: userIds },
            })
          : await client.task.assignee[":id"].$put({
              param: { id: taskId },
              json: {
                userId: userIds[0] ?? "",
                userIds,
              },
            });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  const data = await response.json();

  return data;
}

export default updateTaskAssignee;
