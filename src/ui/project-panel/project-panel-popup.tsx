// The project panel's popup shell (GLOSSARY: 项目属性面板, #232): the form in a
// plugin window, rendered into its own React root. At most one at a time:
// opening another project replaces it; the task panel's popup is apart and
// may be open alongside. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { ProjectId } from "../../domain/project/project";
import { t } from "../../shared/l10n/l10n";
import { PluginWindow } from "../components/plugin-window";
import {
  ProjectPanelForm,
  type ProjectPanelFormDeps,
} from "./project-panel-form";

function ProjectPanelPopup(props: {
  deps: ProjectPanelFormDeps;
  projectId: ProjectId;
  onClose: () => void;
}) {
  const restoreFocus = React.useRef(true);
  return (
    <PluginWindow
      onClose={props.onClose}
      label={t("Project panel")}
      restoreFocus={restoreFocus}
    >
      <ProjectPanelForm
        deps={props.deps}
        projectId={props.projectId}
        onClose={props.onClose}
        // The popup would cover the block just opened, and the focus
        // belongs with that block now.
        onOpenedInNotes={() => {
          restoreFocus.current = false;
          props.onClose();
        }}
      />
    </PluginWindow>
  );
}

/** Opens project `projectId` in the popup, replacing the one shown. */
export type OpenProjectPanel = (projectId: ProjectId) => void;

/** The popup in `render`'s root; at most one at a time. */
export function createProjectPanelPopup(options: {
  deps: ProjectPanelFormDeps;
  render: (node: React.ReactNode) => void;
}): OpenProjectPanel {
  /** Which opening is shown, so a late close of a replaced one does nothing. */
  let shown = 0;
  return (projectId) => {
    shown += 1;
    const mine = shown;
    options.render(
      <ProjectPanelPopup
        // Another project starts afresh: nothing typed for the previous one stays.
        key={mine}
        deps={options.deps}
        projectId={projectId}
        onClose={() => {
          if (mine !== shown) return;
          shown += 1;
          options.render(null);
        }}
      />,
    );
  };
}
