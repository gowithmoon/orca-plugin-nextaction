// A notice in place of a view's or the task panel's content: empty, paused,
// or a failed read with a retry. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import type * as React from "react";
import { describeError } from "../../shared/describe-error";
import { t } from "../../shared/l10n/l10n";
import { pausedText } from "../notify";

export function ViewNotice(props: {
  icon: string;
  title?: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="nextaction-view-notice" role="status">
      <i className={props.icon} aria-hidden="true" />
      {props.title && (
        <div className="nextaction-view-notice-title">{props.title}</div>
      )}
      {props.detail && (
        <div className="nextaction-view-notice-detail">{props.detail}</div>
      )}
      {props.action}
    </div>
  );
}

/** Task features are paused: nothing can be read. */
export function PausedNotice() {
  return <ViewNotice icon="ti ti-player-pause" title={pausedText()} />;
}

/** A read failed: `message(reason)` says what, with a retry button. */
export function FailedNotice(props: {
  error: unknown;
  message: (reason: string) => string;
  onRetry: () => void;
}) {
  const { Button } = orca.components;
  return (
    <ViewNotice
      icon="ti ti-alert-circle"
      title={props.message(describeError(props.error))}
      action={
        <Button variant="outline" onClick={props.onRetry}>
          {t("Retry")}
        </Button>
      }
    />
  );
}
