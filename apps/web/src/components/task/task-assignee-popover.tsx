import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import useGetProjectMembers from "@/hooks/queries/workspace-users/use-get-project-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import {
  getTaskAssigneeIds,
  resolveTaskAssignees,
  toggleTaskAssigneeId,
} from "@/lib/resolve-task-assignees";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { AssigneeOptionsMenu } from "./menus/assignee-options-menu";

type TaskAssigneePopoverProps = {
  task: Task;
  workspaceId: string;
  children: React.ReactNode;
};

export default function TaskAssigneePopover({
  task,
  workspaceId,
  children,
}: TaskAssigneePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTaskAssignee, isPending } =
    useUpdateTaskAssignee();
  const { data: members = [] } = useGetProjectMembers({
    workspaceId,
    projectId: task.projectId,
  });
  const { canAssignTasks } = useWorkspacePermission();
  const propAssigneeIds = getTaskAssigneeIds(task);
  const propAssigneeKey = propAssigneeIds.join(",");
  const [selectedIds, setSelectedIds] = useState<string[]>(propAssigneeIds);
  const pendingIdsRef = useRef<string[]>(propAssigneeIds);

  useEffect(() => {
    const next = getTaskAssigneeIds(task);
    pendingIdsRef.current = next;
    setSelectedIds(next);
  }, [propAssigneeKey, task]);

  if (!canAssignTasks()) return <>{children}</>;

  const changeAssignee = async (userId: string) => {
    if (isPending) return;
    if (!userId) {
      setOpen(false);
    }
    const previousIds = pendingIdsRef.current;
    const assigneeMode = userId
      ? previousIds.includes(userId)
        ? "remove"
        : "add"
      : "set";
    const nextUserIds = toggleTaskAssigneeId(previousIds, userId);
    pendingIdsRef.current = nextUserIds;
    setSelectedIds(nextUserIds);
    const nextAssignees = resolveTaskAssignees(
      { ...task, userId: nextUserIds[0] ?? null, userIds: nextUserIds },
      members,
    );
    try {
      await updateTaskAssignee({
        ...task,
        userId,
        assigneeMode,
        userIds: nextUserIds,
        assigneeIds: nextUserIds,
        assignees: nextAssignees,
      });
    } catch (error) {
      pendingIdsRef.current = previousIds;
      setSelectedIds(previousIds);
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:popover.assignee.updateError"),
      );
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <AssigneeOptionsMenu
          members={members}
          current={selectedIds}
          onSelect={changeAssignee}
          disabled={isPending}
        />
      </PopoverContent>
    </Popover>
  );
}
