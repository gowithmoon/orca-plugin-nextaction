// Project status names in the interface language (GLOSSARY: 项目状态); the
// note-facing names live in infra (docs/ARCHITECTURE.md §4 界面文字).
import type { ProjectStatus } from "../../domain/project/project";
import { t } from "../../shared/l10n/l10n";

export function projectStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case "planning":
      return t("Planning");
    case "active":
      return t("Active");
    case "paused":
      return t("Paused");
    case "someday":
      return t("Someday");
    case "done":
      return t("Done");
  }
}
