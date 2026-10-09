// Status names in the interface language; the note-facing names live in
// infra (docs/ARCHITECTURE.md §4 界面文字).
import type { TaskStatus } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";

export function statusLabel(status: TaskStatus): string {
  switch (status) {
    case "inbox":
      return t("Inbox");
    case "todo":
      return t("Todo");
    case "doing":
      return t("Doing");
    case "waiting":
      return t("Waiting");
    case "someday":
      return t("Someday");
    case "done":
      return t("Done");
  }
}
