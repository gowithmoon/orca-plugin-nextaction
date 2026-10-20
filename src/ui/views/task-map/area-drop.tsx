// A card let go on the empty space of a project's box, or of the no-project
// area (#222): it is made to belong to that project, or to none
// (application/usecases/move-to-area.ts). On a project's box a window asks
// how: moving it under the project's block, or setting the property only; a
// way that cannot be taken is greyed out with why, and when neither can, the
// user is told instead. On the no-project area it is done at once. Nothing
// happens when it already belongs there. The window is in `document.body`,
// out of the view, as the card drag's chip is. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import { createPortal } from "react-dom";
import {
  type MoveToArea,
  type MoveToAreaChoice,
  type MoveToAreaInfeasibility,
  MoveToAreaInfeasibleError,
  type MoveToAreaOption,
  type MoveToAreaTarget,
  type MoveUnderProjectOption,
  type ReadMoveToArea,
} from "../../../application/usecases/move-to-area";
import type { Task } from "../../../domain/task/task";
import { t } from "../../../shared/l10n/l10n";
import { shownText } from "../../components/format";
import {
  PluginWindow,
  WindowFooter,
  WindowHeader,
  WindowSpacer,
} from "../../components/plugin-window";
import { type Notify, notifyActionFailure } from "../../notify";

export interface AreaDropDeps {
  readMoveToArea: ReadMoveToArea;
  moveToArea: MoveToArea;
}

/** Why a way cannot be taken, as the window and the notice say it. */
function reasonText(reason: MoveToAreaInfeasibility): string {
  switch (reason.kind) {
    case "decidedByParentTask":
      return t('Its parent task "${task}" decides its project.', {
        task: shownText(reason.task).text,
      });
    case "ontoSelf":
      return t("The project's block is this task or below it.");
    case "cycle":
      return t('It would make a dependency cycle with "${task}".', {
        task: shownText(reason.task).text,
      });
  }
}

interface Pending {
  readonly task: Task;
  readonly target: MoveToAreaTarget & { readonly kind: "project" };
  readonly moveUnderProject: MoveUnderProjectOption;
  readonly setProjectOnly: MoveToAreaOption;
}

/**
 * The drop on an area's empty space, and the window it may open while the
 * way waits for an answer. Never throws: failures are told to the user.
 */
export function useAreaDrop(
  deps: AreaDropDeps,
  notify: Notify,
): {
  onAreaDrop: (task: Task, target: MoveToAreaTarget) => void;
  window: React.ReactNode;
} {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const failed = React.useCallback(
    (error: unknown) => {
      if (error instanceof MoveToAreaInfeasibleError) {
        notify("warn", reasonText(error.reason));
        return;
      }
      notifyActionFailure(notify, error, (reason) =>
        t("Could not move the task: ${reason}", { reason }),
      );
    },
    [notify],
  );
  const onAreaDrop = React.useCallback(
    (task: Task, target: MoveToAreaTarget) => {
      void (async () => {
        try {
          // The no-project area asks nothing: how it belongs now decides.
          if (target.kind === "noProject") {
            await deps.moveToArea(task.id, target);
            return;
          }
          const plan = await deps.readMoveToArea(task.id, target);
          if (plan.kind !== "choose") return;
          const { moveUnderProject, setProjectOnly } = plan;
          if (!moveUnderProject.feasible && !setProjectOnly.feasible) {
            notify(
              "warn",
              t("Cannot put the task in this project: ${reason}", {
                reason: reasonText(setProjectOnly.reason),
              }),
            );
            return;
          }
          setPending({ task, target, moveUnderProject, setProjectOnly });
        } catch (error) {
          failed(error);
        }
      })();
    },
    [deps, notify, failed],
  );
  const choose = (choice: MoveToAreaChoice) => {
    if (!pending) return;
    setPending(null);
    void deps.moveToArea(pending.task.id, pending.target, choice).catch(failed);
  };
  const window =
    pending &&
    createPortal(
      <AreaDropWindow
        pending={pending}
        onChoose={choose}
        onClose={() => setPending(null)}
      />,
      document.body,
    );
  return { onAreaDrop, window };
}

function AreaDropWindow(props: {
  pending: Pending;
  onChoose: (choice: MoveToAreaChoice) => void;
  onClose: () => void;
}) {
  const { pending, onChoose, onClose } = props;
  const { Button } = orca.components;
  const titleId = React.useId();
  const { moveUnderProject, setProjectOnly } = pending;
  return (
    <PluginWindow
      onClose={onClose}
      className="nextaction-area-drop"
      labelledBy={titleId}
    >
      <WindowHeader
        title={t("Put in this project")}
        titleId={titleId}
        task={pending.task}
        onClose={onClose}
      />
      <div className="nextaction-area-drop-options">
        <AreaDropOption
          label={t("Move under the project block")}
          detail={
            moveUnderProject.feasible
              ? moveUnderProject.clearsOwnSetting
                ? t(
                    "Goes to the end of the project's block. Its own project setting is cleared.",
                  )
                : t("Goes to the end of the project's block.")
              : reasonText(moveUnderProject.reason)
          }
          disabled={!moveUnderProject.feasible}
          onClick={() => onChoose("moveUnderProject")}
        />
        <AreaDropOption
          label={t("Set the property only")}
          detail={
            setProjectOnly.feasible
              ? t("Sets its project; the block stays where it is.")
              : reasonText(setProjectOnly.reason)
          }
          disabled={!setProjectOnly.feasible}
          onClick={() => onChoose("setProjectOnly")}
        />
      </div>
      <WindowFooter>
        <WindowSpacer />
        <Button variant="plain" onClick={onClose}>
          {t("Cancel")}
        </Button>
      </WindowFooter>
    </PluginWindow>
  );
}

function AreaDropOption(props: {
  label: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="nextaction-area-drop-option"
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="nextaction-area-drop-option-label">{props.label}</span>
      <span className="nextaction-area-drop-option-detail">{props.detail}</span>
    </button>
  );
}
