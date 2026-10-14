// Writing a link to a task into the notes where its card was dropped (#123).
// A failure is told to the user; success says nothing, the link showing in
// the note is the answer. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { LinkTaskInNote } from "../../application/usecases/link-task-in-note";
import { t } from "../../shared/l10n/l10n";
import type { NoteCardDrop } from "../drag/card-drag";
import { type Notify, notifyActionFailure } from "../notify";

/** Writes the dropped card's link and reports a failure. Never throws. */
export function useLinkTaskInNote(
  linkTaskInNote: LinkTaskInNote,
  notify: Notify,
): (drop: NoteCardDrop) => void {
  return React.useCallback(
    (drop) => {
      void (async () => {
        try {
          await linkTaskInNote({
            id: drop.task.id,
            plan: drop.plan,
            target: drop.target,
          });
        } catch (error) {
          notifyActionFailure(notify, error, (reason) =>
            t("Could not write the task into the note: ${reason}", { reason }),
          );
        }
      })();
    },
    [linkTaskInNote, notify],
  );
}
