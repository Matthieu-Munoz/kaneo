import { useTranslation } from "react-i18next";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import {
  formatAssigneeNames,
  resolveTaskAssignees,
} from "@/lib/resolve-task-assignees";
import type Task from "@/types/task";
import { AssigneeAvatarStack } from "../properties/assignee-avatar-stack";
import SubtaskAssigneePopover from "../subtask-assignee-popover";

type ReferenceAssigneeButtonProps = {
  tasks: Task[];
  workspaceId: string;
  name: string | null | undefined;
  image: string | null | undefined;
};

export function ReferenceAssigneeButton({
  tasks,
  workspaceId,
  name,
  image,
}: ReferenceAssigneeButtonProps) {
  const { t } = useTranslation();
  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(workspaceId);
  const firstTask = tasks[0];
  const assignees = resolveTaskAssignees(
    firstTask
      ? {
          ...firstTask,
          assigneeName: firstTask.assigneeName ?? name ?? null,
          assigneeImage: firstTask.assigneeImage ?? image ?? null,
        }
      : null,
    workspaceUsers?.members,
  );
  const label =
    assignees.length > 0
      ? formatAssigneeNames(
          assignees,
          name || t("tasks:popover.assignee.unassigned"),
        )
      : t("tasks:popover.assignee.unassigned");

  return (
    <SubtaskAssigneePopover tasks={tasks} workspaceId={workspaceId}>
      <button
        type="button"
        aria-label={label}
        title={label}
        className="relative flex shrink-0 rounded-full outline-none before:absolute before:-inset-1 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AssigneeAvatarStack assignees={assignees} />
      </button>
    </SubtaskAssigneePopover>
  );
}
