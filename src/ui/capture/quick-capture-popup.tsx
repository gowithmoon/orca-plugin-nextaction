// The quick capture popup (GLOSSARY: 快速捕获) and the command that opens it.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { QuickCapture } from "../../application/usecases/quick-capture";
import type { CommandFn } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { useQuickCapture } from "../hooks/use-quick-capture";

function QuickCapturePopup(props: {
  quickCapture: QuickCapture;
  pluginName: string;
  /** Closes the popup by unmounting it. */
  onClose: () => void;
}) {
  const { ModalOverlay, CompositionInput } = orca.components;
  const [text, setText] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  const capture = useQuickCapture(props.quickCapture, props.pluginName);

  React.useEffect(() => {
    input.current?.focus();
  }, []);

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter that confirms an IME composition is not a capture.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      // Empty text and failures keep the popup and its text.
      if ((await capture(text)) === "captured") props.onClose();
    }
  };

  // Always visible while mounted: closing unmounts it at once instead of
  // waiting for `onClosed`, whose timing is not documented, so the command
  // can reopen it right away.
  return (
    <ModalOverlay visible={true} canClose={true} onClose={props.onClose}>
      <div
        style={{
          width: "min(36rem, calc(100vw - 2rem))",
          margin: "20vh auto 0",
        }}
      >
        <CompositionInput
          ref={input}
          autoFocus
          aria-label={t("Quick capture")}
          placeholder={t("What's on your mind? Press Enter to capture")}
          value={text}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setText(e.target.value)
          }
          onKeyDown={onKeyDown}
          style={{ width: "100%" }}
        />
      </div>
    </ModalOverlay>
  );
}

/**
 * The "Quick capture" command: opens the popup in `render`'s root. At most
 * one popup at a time; running the command while it is open does nothing.
 */
export function createQuickCaptureCommand(
  quickCapture: QuickCapture,
  pluginName: string,
  render: (node: React.ReactNode) => void,
): CommandFn {
  let open = false;
  return () => {
    if (open) return;
    open = true;
    render(
      <QuickCapturePopup
        quickCapture={quickCapture}
        pluginName={pluginName}
        onClose={() => {
          open = false;
          render(null);
        }}
      />,
    );
  };
}
