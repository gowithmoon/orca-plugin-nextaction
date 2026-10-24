import type { TaskRepository } from "../application/ports/task-repository";
import { createAddNewProjectBlockRefTarget } from "../application/usecases/add-new-project-block-ref-target";
import { createChangeProjectStatus } from "../application/usecases/change-project-status";
import { createEditProject } from "../application/usecases/edit-project";
import { createReadProjectBlockRefCandidates } from "../application/usecases/read-block-ref-candidates";
import { createReadProjectForPanel } from "../application/usecases/read-project-for-panel";
import { createSetProjectCustomProperty } from "../application/usecases/set-project-custom-property";
import type { CalendarDate } from "../domain/task/task";
import { systemClock } from "../infra/system-clock";
import type { ChangeSignalSource } from "../shared/change-signal";
import type { TaskActionsDeps } from "../ui/hooks/use-task-actions";
import { openInNotesReporting } from "../ui/panel/open-in-notes";
import type { ProjectPanelFormDeps } from "../ui/project-panel/project-panel-form";
import {
  createProjectPanelPopup,
  type OpenProjectPanel,
} from "../ui/project-panel/project-panel-popup";
import type { FeatureModule } from "./bootstrap";

/**
 * The project panel (GLOSSARY: 项目属性面板, #232): the popup's own React
 * root, apart from the task panel's, unmounted on unload; its style sheets
 * come from the popup styles feature. `open` is what the project menu calls;
 * it may be handed out before the feature loads and does nothing outside a
 * load.
 */
export function createProjectPanelFeature(deps: {
  repository: TaskRepository;
  /** Projects may have changed: an open project panel reads it again. */
  changes: ChangeSignalSource;
  today: () => CalendarDate;
  /** "Open in notes" and notices, shared with the plugin panel (#39). */
  taskActions: TaskActionsDeps;
  /** Whether the project tag is paused (#143). */
  projectsPaused: () => boolean;
}): { feature: FeatureModule; open: OpenProjectPanel } {
  const { repository } = deps;
  // Until a load says otherwise, writing on leaving is allowed.
  let releasing = () => false;
  const formDeps: ProjectPanelFormDeps = {
    readProjectForPanel: createReadProjectForPanel({ repository }),
    changeProjectStatus: createChangeProjectStatus({ repository }),
    editProject: createEditProject({ repository }),
    setProjectCustomProperty: createSetProjectCustomProperty({
      repository,
      clock: systemClock,
    }),
    addNewProjectBlockRefTarget: createAddNewProjectBlockRefTarget({
      repository,
    }),
    readProjectBlockRefCandidates: createReadProjectBlockRefCandidates({
      repository,
    }),
    // As the project block, any block in the notes (#115).
    openBlockInNotes: (blockId) =>
      openInNotesReporting(
        deps.taskActions.openInNotes,
        deps.taskActions.notify,
        blockId,
      ),
    // Outside the plugin panel's React tree: the plugin panel is worked out
    // from the active panel, as the task panel's popup does.
    openInNotes: (projectId) =>
      openInNotesReporting(
        deps.taskActions.openInNotes,
        deps.taskActions.notify,
        projectId,
      ),
    notify: deps.taskActions.notify,
    changes: deps.changes,
    projectsPaused: deps.projectsPaused,
    today: deps.today,
    unloading: () => releasing(),
  };
  let current: OpenProjectPanel | undefined;

  const feature: FeatureModule = (context) => {
    const { pluginName, registry } = context;
    releasing = context.releasing;
    const root = registry.reactRoot("projectPanelPopup", null);
    let live = true;
    const open = createProjectPanelPopup({
      deps: formDeps,
      // Nothing renders into a root that is gone.
      render: (node) => {
        if (live) root.render(node);
      },
    });
    current = open;
    // Recorded after the root, so it is released first: nothing opens a
    // popup into a root that is going away.
    registry.add(`${pluginName}.projectPanelOpen`, () => {
      live = false;
      if (current === open) current = undefined;
    });
  };

  return {
    feature,
    open: (projectId) => current?.(projectId),
  };
}
