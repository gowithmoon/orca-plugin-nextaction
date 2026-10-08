// The inbox view (GLOSSARY: 收集箱视图). A placeholder until #37 lists tasks.
import { t } from "../../../shared/l10n/l10n";
import { ViewHeader } from "../../components/view-header";
import type { PanelView } from "../../panel/panel-views";

function InboxView() {
  return <ViewHeader title={t("Inbox")} />;
}

export const inboxView: PanelView = {
  id: "inbox",
  order: 10,
  icon: "ti ti-inbox",
  label: () => t("Inbox"),
  component: InboxView,
};
