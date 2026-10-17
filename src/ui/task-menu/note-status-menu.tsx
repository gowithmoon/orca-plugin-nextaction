// The status menu at a status icon in the notes (#193): a click on the icon
// opens the six statuses, as the task card's status button does in the
// plugin panel; choosing one changes the status the same way. The menu goes
// into a layer under `document.body` covering the viewport, as the plugin
// panel's popups do: in a root of its own without one it does not show
// (status-icon-click). Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ChangeStatus } from "../../application/usecases/change-status";
import type { ReadTask } from "../../application/usecases/read-task";
import type { Task, TaskStatus } from "../../domain/task/task";
import { t } from "../../shared/l10n/l10n";
import { ContextMenu } from "../components/popup-controls";
import { PanelPopupLayer } from "../components/popup-layer";
import { markedStatus, StatusMenu } from "../components/status-menu";
import {
  changeStatusReporting,
  createNotify,
  notifyActionFailure,
} from "../notify";
import type { StatusIconHit } from "./orca-dom";

function NoteStatusMenu(props: {
  task: Task;
  rect: DOMRect;
  onChoose: (status: TaskStatus) => void;
  onClosed: () => void;
}) {
  const opener = React.useRef<((e: React.UIEvent) => void) | null>(null);
  // Opened once mounted, at the icon: `rect` places it, so the event only
  // has to look like one (status-icon-click, round 2).
  React.useEffect(() => {
    const anchor = document.createElement("span");
    opener.current?.({
      currentTarget: anchor,
      target: anchor,
      clientX: props.rect.left,
      clientY: props.rect.bottom,
      preventDefault() {},
      stopPropagation() {},
      nativeEvent: {},
    } as unknown as React.UIEvent);
  }, [props.rect]);
  return (
    // The plugin panel's layer and its styles (panel-style.ts): over every
    // panel, under Orca's windows.
    <PanelPopupLayer>
      <ContextMenu
        rect={props.rect}
        defaultPlacement="bottom"
        alignment="left"
        escapeToClose={true}
        onClosed={props.onClosed}
        menu={(close) => (
          <StatusMenu
            current={markedStatus(props.task)}
            onChoose={props.onChoose}
            close={close}
          />
        )}
      >
        {(openMenu) => {
          opener.current = openMenu;
          return null;
        }}
      </ContextMenu>
    </PanelPopupLayer>
  );
}

/** Opens the status menu at a status icon; at most one is open. */
export type OpenNoteStatusMenu = (hit: StatusIconHit) => Promise<void>;

export function createNoteStatusMenu(deps: {
  readTask: ReadTask;
  changeStatus: ChangeStatus;
  pluginName: string;
  /** Renders into the menu's own root; `null` empties it. */
  render: (node: React.ReactNode) => void;
}): OpenNoteStatusMenu {
  const notify = createNotify(deps.pluginName);
  // Every open bumps it, so a slow read never shows a stale menu.
  let generation = 0;
  return async (hit) => {
    const opened = ++generation;
    let task: Task | null;
    try {
      // The block may be a mirror; the task read is its source's.
      task = await deps.readTask(hit.blockId);
    } catch (error) {
      notifyActionFailure(notify, error, (reason) =>
        t("Could not open the task menu: ${reason}", { reason }),
      );
      return;
    }
    // The icon outlived its tag (e.g. just dropped elsewhere): nothing to show.
    if (!task || opened !== generation) return;
    const shown = task;
    deps.render(
      <NoteStatusMenu
        key={opened}
        task={shown}
        rect={hit.rect}
        onChoose={(status) =>
          void changeStatusReporting(
            deps.changeStatus,
            notify,
            shown.id,
            status,
          )
        }
        onClosed={() => {
          if (opened === generation) deps.render(null);
        }}
      />,
    );
  };
}
