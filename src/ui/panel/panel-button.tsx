// The editor sidetool button that opens or closes the plugin panel
// (editor-sidetool-panel). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { EditorSidetool } from "../../orca.d.ts";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { createNotify } from "../notify";

/**
 * The sidetool. `toggle` gets the panel the button sits in; its failures are
 * reported here.
 */
export function createPanelButton(
  toggle: (originPanelId: string) => void,
  pluginName: string,
): EditorSidetool {
  const notify = createNotify(pluginName);
  const onClick = (panelId: string) => {
    try {
      toggle(panelId);
    } catch (error) {
      notify(
        "error",
        t("Could not open or close the plugin panel: ${reason}", {
          reason: describeError(error),
        }),
      );
    }
  };

  return {
    render: (_rootBlockId, panelId) => {
      const { Button, Tooltip } = orca.components;
      // Orca's own sidetool class and components, so it looks like them.
      return (
        <Tooltip text={t("NextAction")} placement="horizontal">
          <Button
            className="orca-block-editor-sidetools-btn"
            variant="plain"
            aria-label={t("NextAction")}
            onClick={() => onClick(panelId)}
          >
            <i className="ti ti-checklist" aria-hidden="true" />
          </Button>
        </Tooltip>
      );
    },
  };
}
