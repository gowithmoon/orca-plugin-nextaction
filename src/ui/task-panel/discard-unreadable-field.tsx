// "Discard and reset" (#106), in a popup whose data this plugin cannot read:
// what discarding means, and the button. Only shown while the data is
// unreadable. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import { t } from "../../shared/l10n/l10n";

export function DiscardUnreadableField(props: {
  busy: boolean;
  onDiscard: () => void;
}) {
  const { Button } = orca.components;
  return (
    <div className="nextaction-recurrence-popup-field">
      <div className="nextaction-recurrence-popup-hint">
        {t(
          "It may have been written by a newer version of this plugin. Once discarded, this version cannot bring it back; you can undo it.",
        )}
      </div>
      <div>
        <Button
          variant="dangerous"
          disabled={props.busy}
          onClick={props.onDiscard}
        >
          {t("Discard and reset")}
        </Button>
      </div>
    </div>
  );
}
