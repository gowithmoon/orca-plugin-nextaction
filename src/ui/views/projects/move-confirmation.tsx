// The project details' tree moves that cross the project block's boundary
// ask first (#157), with Orca's `ConfirmBox` as dropping a project does
// (#150), at the point the card was let go; cancelling changes nothing.
// Other moves, and those the move would refuse, go to `move` at once.
// Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type {
  MoveCrossing,
  ReadMoveCrossing,
} from "../../../application/usecases/read-move-crossing";
import type { TaskMove } from "../../../domain/blocking/task-move";
import type { ProjectId } from "../../../domain/project/project";
import { t } from "../../../shared/l10n/l10n";
import { usePopupLayer } from "../../components/popup-layer";
import { type Notify, notifyActionFailure } from "../../notify";

/** The question a crossing move asks, by the task's project afterwards. */
function questionOf(crossing: MoveCrossing): string {
  const { task, project } = crossing;
  switch (crossing.kind) {
    case "moveIn":
      return t(
        '"${task}" will go under the block of project "${project}". You can undo it.',
        { task, project },
      );
    case "moveOut":
      return t(
        '"${task}" will leave the block of project "${project}" and still belong to it. You can undo it.',
        { task, project },
      );
    case "noProject":
      return t(
        '"${task}" will leave the block of project "${project}", belong to no project and go from here. You can undo it.',
        { task, project },
      );
    case "otherProject":
      return t(
        '"${task}" will belong to project "${other}" once moved and go from here. You can undo it.',
        { task, other: crossing.otherProject },
      );
  }
}

interface Pending {
  readonly move: TaskMove;
  readonly at: { readonly x: number; readonly y: number };
  readonly question: string;
}

/**
 * The tree's `onMove` for project `project`, and the confirmation it shows
 * while a crossing move waits for an answer.
 */
export function useMoveConfirmation(props: {
  project: ProjectId;
  readMoveCrossing: ReadMoveCrossing;
  move: (move: TaskMove) => void;
  notify: Notify;
}): {
  onMove: (move: TaskMove, at: { x: number; y: number }) => void;
  confirmation: React.ReactNode;
} {
  const { project, readMoveCrossing, move, notify } = props;
  const [pending, setPending] = React.useState<Pending | null>(null);
  const onMove = React.useCallback(
    (next: TaskMove, at: { x: number; y: number }) => {
      void (async () => {
        let crossing: MoveCrossing | null;
        try {
          crossing = await readMoveCrossing(next, project);
        } catch (error) {
          notifyActionFailure(notify, error, (reason) =>
            t("Could not move the task: ${reason}", { reason }),
          );
          return;
        }
        if (crossing === null) move(next);
        else setPending({ move: next, at, question: questionOf(crossing) });
      })();
    },
    [project, readMoveCrossing, move, notify],
  );
  const confirmation = pending && (
    <MoveConfirmBox
      // A new one for every move, opened once.
      key={`${pending.move.id}:${pending.move.placement}:${pending.move.target}`}
      pending={pending}
      onConfirm={() => {
        setPending(null);
        move(pending.move);
      }}
      onClosed={() => setPending(null)}
    />
  );
  return { onMove, confirmation };
}

/**
 * Orca's `ConfirmBox` opened as soon as it shows, anchored to an empty
 * element at the drop point: it opens from an event, and the drop's pointer
 * events belong to the dragged card.
 */
function MoveConfirmBox(props: {
  pending: Pending;
  onConfirm: () => void;
  onClosed: () => void;
}) {
  const { pending, onConfirm, onClosed } = props;
  const { ConfirmBox } = orca.components;
  const popupLayer = usePopupLayer();
  const anchor = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    anchor.current?.click();
  }, []);
  return (
    <ConfirmBox
      text={pending.question}
      container={popupLayer}
      onConfirm={(_e, close) => {
        close();
        onConfirm();
      }}
      onClosed={onClosed}
    >
      {(open) => (
        <span
          ref={anchor}
          aria-hidden="true"
          style={{
            position: "fixed",
            left: pending.at.x,
            top: pending.at.y,
            width: 0,
            height: 0,
          }}
          onClick={open}
        />
      )}
    </ConfirmBox>
  );
}
