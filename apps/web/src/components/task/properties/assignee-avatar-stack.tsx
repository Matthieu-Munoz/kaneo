import { cn } from "@/lib/cn";
import { AssigneeAvatar } from "./assignee-avatar";

type AssigneeAvatarStackItem = {
  id: string;
  name: string | null | undefined;
  image?: string | null | undefined;
};

type AssigneeAvatarStackProps = {
  assignees: readonly AssigneeAvatarStackItem[];
  maxVisible?: number;
  avatarClassName?: string;
  avatarFallbackClassName?: string;
  className?: string;
};

export function AssigneeAvatarStack({
  assignees,
  maxVisible = 3,
  avatarClassName,
  avatarFallbackClassName,
  className,
}: AssigneeAvatarStackProps) {
  if (assignees.length === 0) {
    return (
      <AssigneeAvatar
        name={null}
        image={null}
        assigned={false}
        className={avatarClassName}
        fallbackClassName={avatarFallbackClassName}
      />
    );
  }

  if (assignees.length === 1) {
    const first = assignees[0];
    return (
      <AssigneeAvatar
        name={first?.name}
        image={first?.image}
        assigned={true}
        className={avatarClassName}
        fallbackClassName={avatarFallbackClassName}
      />
    );
  }

  const visible = assignees.slice(0, maxVisible);
  const overflowCount = assignees.length - visible.length;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center -space-x-1.5",
        className,
      )}
    >
      {visible.map((assignee) => (
        <AssigneeAvatar
          key={assignee.id}
          name={assignee.name}
          image={assignee.image}
          assigned={true}
          className={cn("ring-1 ring-background", avatarClassName)}
          fallbackClassName={avatarFallbackClassName}
        />
      ))}
      {overflowCount > 0 && (
        <span
          className={cn(
            "inline-flex size-4.5 shrink-0 items-center justify-center rounded-full border border-avatar-border bg-avatar font-semibold text-[8px] text-avatar-foreground ring-1 ring-background",
            avatarClassName,
            avatarFallbackClassName,
          )}
        >
          +{overflowCount}
        </span>
      )}
    </span>
  );
}
