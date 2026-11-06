import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";
import {
  formatAssigneeNames,
  resolveTaskAssignees,
} from "@/lib/resolve-task-assignees";
import type Task from "@/types/task";

type PublicTaskAssigneesProps = {
  task: Pick<
    Task,
    "userId" | "userIds" | "assignees" | "assigneeName" | "assigneeImage"
  >;
  variant?: "card" | "row" | "detail";
};

export function PublicTaskAssignees({
  task,
  variant = "card",
}: PublicTaskAssigneesProps) {
  const assignees = resolveTaskAssignees(task);
  const names = formatAssigneeNames(assignees, task.assigneeName ?? "");
  if (!names) {
    return null;
  }

  const isDetail = variant === "detail";

  return (
    <div
      className={cn(
        "flex items-center",
        variant === "card" && "gap-1.5 mb-2",
        variant === "row" && "gap-1.5",
        isDetail &&
          "gap-2 px-2.5 py-1 text-xs bg-muted text-muted-foreground rounded-md",
      )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center",
          isDetail ? "-space-x-1" : "-space-x-1.5",
        )}
      >
        {assignees.slice(0, 3).map((assignee) => (
          <Avatar
            key={assignee.id}
            className={cn(
              "ring-1",
              isDetail ? "h-4 w-4 ring-muted" : "h-5 w-5 ring-card",
            )}
          >
            <AvatarImage src={assignee.image ?? ""} alt={assignee.name ?? ""} />
            <AvatarFallback
              className={cn(
                "text-[10px]",
                !isDetail && "font-medium border border-border/30",
              )}
            >
              {getInitials(assignee.name)}
            </AvatarFallback>
          </Avatar>
        ))}
      </span>
      <span
        className={cn(
          variant === "card" &&
            "text-[10px] text-muted-foreground font-medium truncate",
          variant === "row" && "text-xs text-muted-foreground font-medium",
        )}
      >
        {names}
      </span>
    </div>
  );
}
