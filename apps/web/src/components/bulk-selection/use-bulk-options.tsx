import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { assigneeMenuOptions } from "@/components/task/menus/assignee-menu-options";
import { getColumnIcon } from "@/lib/column";
import { getPriorityLabel } from "@/lib/i18n/domain";
import { resolveLabelColor } from "@/lib/label-color";
import { getPriorityIcon } from "@/lib/priority";
import type { OptionMenuItem } from "@/components/common/option-menu/option-menu-item";
import type { BulkActions } from "./use-bulk-actions";

const PRIORITIES = ["urgent", "high", "medium", "low", "no-priority"];

export function useBulkOptions(actions: BulkActions) {
  const { t } = useTranslation();
  const { columns, members, labels } = actions;

  return useMemo(() => {
    const columnOptions: OptionMenuItem[] = columns.map((column) => ({
      value: column.id,
      label: column.name,
      icon: getColumnIcon(column.id, column.isFinal, column.icon),
    }));
    const priorityOptions: OptionMenuItem[] = PRIORITIES.map((priority) => ({
      value: priority,
      label: getPriorityLabel(priority),
      icon: getPriorityIcon(priority),
    }));
    const memberOptions: OptionMenuItem[] = assigneeMenuOptions(
      members.map((member) => ({
        id: member.id,
        name: member.name || t("common:people.someone"),
        image: member.image,
      })),
      undefined,
      t("tasks:popover.assignee.unassigned"),
    );
    const labelOptions: OptionMenuItem[] = labels.map((label) => ({
      value: label.id,
      label: label.name,
      icon: (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: resolveLabelColor(label.color) }}
        />
      ),
    }));
    return { columnOptions, priorityOptions, memberOptions, labelOptions };
  }, [columns, members, labels, t]);
}
