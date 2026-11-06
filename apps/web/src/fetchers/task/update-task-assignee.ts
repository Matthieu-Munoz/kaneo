import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type Task from "@/types/task";

type UpdateTaskAssigneePayload = Pick<Task, "userId"> & {
  userIds?: string[];
};

async function updateTaskAssignee(
  taskId: string,
  task: UpdateTaskAssigneePayload,
) {
  const userIds =
    task.userIds !== undefined
      ? task.userIds.filter(Boolean)
      : task.userId
        ? [task.userId]
        : [];
  const response = await client.task.assignee[":id"].$put({
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
