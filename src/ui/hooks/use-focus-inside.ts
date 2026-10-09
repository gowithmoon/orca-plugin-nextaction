// Focus handling shared by the plugin's popups (the task panel popup, the
// quick capture window). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";

/**
 * Moves the focus into the popup when it opens, and back where it was (e.g.
 * the note editor) when it closes, unless `restore` was turned off (the user
 * went to the block in the notes). Without it, keys keep going to the editor
 * behind the popup: typing edits the note and Esc never reaches the popup.
 */
export function useFocusInside(
  ref: React.RefObject<HTMLElement>,
  restore: React.RefObject<boolean>,
) {
  React.useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (restore.current && before?.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
  }, [ref, restore]);
}
