import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateTaskAssignee } from "@/hooks/mutations/task/use-update-task-assignee";
import useGetMembersOfProjects from "@/hooks/queries/workspace-users/use-get-members-of-projects";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import {
  getTaskAssigneeIds,
  resolveTaskAssignees,
  toggleTaskAssigneeId,
} from "@/lib/resolve-task-assignees";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import { AssigneeOptionsMenu } from "./menus/assignee-options-menu";

type SubtaskAssigneePopoverProps = {
  tasks: Task[];
  workspaceId: string;
  children: React.ReactNode;
};

export default function SubtaskAssigneePopover({
  tasks,
  workspaceId,
  children,
}: SubtaskAssigneePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mutateAsync: updateTaskAssignee, isPending } =
    useUpdateTaskAssignee();
  const { data: members = [] } = useGetMembersOfProjects({
    workspaceId,
    projectIds: tasks.map((task) => task.projectId),
  });
  const { canAssignTasks } = useWorkspacePermission();
  const tasksKey = tasks
    .map((task) => `${task.id}:${getTaskAssigneeIds(task).join(",")}`)
    .join("|");
  const [idsByTask, setIdsByTask] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      tasks.map((task) => [task.id, getTaskAssigneeIds(task)]),
    ),
  );
  const pendingByTaskRef = useRef<Record<string, string[]>>(idsByTask);

  useEffect(() => {
    const next = Object.fromEntries(
      tasks.map((task) => [task.id, getTaskAssigneeIds(task)]),
    );
    pendingByTaskRef.current = next;
    setIdsByTask(next);
  }, [tasksKey, tasks]);

  if (!canAssignTasks()) return <>{children}</>;

  const firstTaskIds = tasks[0]
    ? (idsByTask[tasks[0].id] ?? getTaskAssigneeIds(tasks[0]))
    : [];
  const common = firstTaskIds.filter((id) =>
    tasks.every((task) =>
      (idsByTask[task.id] ?? getTaskAssigneeIds(task)).includes(id),
    ),
  );
  const current =
    common.length > 0 ||
    tasks.every(
      (task) => (idsByTask[task.id] ?? getTaskAssigneeIds(task)).length === 0,
    )
      ? common
      : undefined;

  const changeAssignee = async (userId: string) => {
    if (isPending) return;
    if (!userId) {
      setOpen(false);
    }
    const previousMap = { ...pendingByTaskRef.current };
    const allHaveUser =
      Boolean(userId) &&
      tasks.every((task) =>
        (
          pendingByTaskRef.current[task.id] ?? getTaskAssigneeIds(task)
        ).includes(userId),
      );
    const assigneeMode = userId ? (allHaveUser ? "remove" : "add") : "set";
    const nextMap: Record<string, string[]> = { ...previousMap };
    for (const task of tasks) {
      const currentIds = previousMap[task.id] ?? getTaskAssigneeIds(task);
      nextMap[task.id] = !userId
        ? []
        : allHaveUser
          ? currentIds.filter((id) => id !== userId)
          : currentIds.includes(userId)
            ? currentIds
            : toggleTaskAssigneeId(currentIds, userId);
    }
    pendingByTaskRef.current = nextMap;
    setIdsByTask(nextMap);

    try {
      await Promise.all(
        tasks.map((task) => {
          const nextUserIds = nextMap[task.id] ?? [];
          const nextAssignees = resolveTaskAssignees(
            { ...task, userId: nextUserIds[0] ?? null, userIds: nextUserIds },
            members,
          );
          return updateTaskAssignee({
            ...task,
            userId,
            assigneeMode,
            userIds: nextUserIds,
            assigneeIds: nextUserIds,
            assignees: nextAssignees,
          });
        }),
      );
    } catch (error) {
      pendingByTaskRef.current = previousMap;
      setIdsByTask(previousMap);
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:popover.assignee.updateError"),
      );
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <AssigneeOptionsMenu
          members={members}
          current={current}
          onSelect={changeAssignee}
          disabled={isPending}
        />
      </PopoverContent>
    </Popover>
  );
}
