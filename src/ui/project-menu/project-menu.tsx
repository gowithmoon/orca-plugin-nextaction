// The project menu (GLOSSARY: 项目操作菜单; #144) rendered into Orca's tag
// menu of the project tag (project-tag: right-clicking the project tag gives
// the project tag block, also on a block with both tags). Not in the block
// handle's menu. The project row (#147) renders the same registrations with
// `ProjectMenu`. Verified by hand in Orca (docs/ARCHITECTURE.md §5).
import type { ReadProject } from "../../application/usecases/read-project";
import type { Project, ProjectId } from "../../domain/project/project";
import type { Block, BlockRef, TagMenuCommand } from "../../orca.d.ts";
import { t } from "../../shared/l10n/l10n";
import { useReadById } from "../hooks/use-task";
import { createNotify } from "../notify";
import { notifyProjectActionFailure } from "./builtin-items";
import type { ProjectMenuItem, ProjectMenuItems } from "./menu-items";

export interface ProjectMenuDeps {
  items: ProjectMenuItems;
  readProject: ReadProject;
  /** Titles the notices. */
  pluginName: string;
  /** The project tag block's ID; `undefined` while the project tag is paused. */
  projectTagBlockId: () => number | undefined;
}

function itemEntry(item: ProjectMenuItem, project: Project, close: () => void) {
  const { MenuText } = orca.components;
  const current = item.isCurrent?.(project) ?? false;
  return (
    <MenuText
      key={item.id}
      title={item.label(project)}
      preIcon={item.icon}
      postIcon={current ? "ti ti-check" : undefined}
      dangerous={item.dangerous}
      aria-current={current || undefined}
      onClick={() => {
        close();
        void item.run(project);
      }}
    />
  );
}

/**
 * The registered entries for `project`, without a container: Orca's tag
 * menu provides its own, and a `ContextMenu` (the project row) already is a
 * menu.
 */
export function ProjectMenu(props: {
  items: ProjectMenuItems;
  project: Project;
  close: () => void;
}) {
  const { items, project, close } = props;
  const { Menu, MenuText } = orca.components;
  return (
    <>
      {items.arrange(project).map((group) => {
        const entries = group.items.map((item) =>
          itemEntry(item, project, close),
        );
        if (!group.submenu) return entries;
        return (
          <MenuText
            key={`group-${group.group}`}
            title={group.submenu.label(project)}
            preIcon={group.submenu.icon?.(project)}
          >
            <Menu>{entries}</Menu>
          </MenuText>
        );
      })}
    </>
  );
}

/** Reads the project, then shows its entries; nothing for a block that is not one. */
function ReadProjectMenuEntries(props: {
  deps: ProjectMenuDeps;
  projectId: ProjectId | undefined;
  close: () => void;
}) {
  const { deps, projectId, close } = props;
  const onError = (error: unknown) =>
    notifyProjectActionFailure(createNotify(deps.pluginName), error, (reason) =>
      t("Could not open the project menu: ${reason}", { reason }),
    );
  const project = useReadById(deps.readProject, projectId, onError);
  if (!project) return null;
  return <ProjectMenu items={deps.items} project={project} close={close} />;
}

/**
 * The tag menu command: shows only when opened on an instance of the project
 * tag (`tagRef` present); the tagged block is `tagRef.from`, the source
 * block also inside a mirror (project-tag round 2).
 */
export function createProjectTagMenuCommand(
  deps: ProjectMenuDeps,
): TagMenuCommand {
  return {
    // `render` must return an element, so "nothing" is an element without a project.
    render: (tagBlock: Block, close: () => void, tagRef?: BlockRef) => {
      const projectId =
        tagRef && tagBlock.id === deps.projectTagBlockId()
          ? tagRef.from
          : undefined;
      return (
        <ReadProjectMenuEntries
          key={projectId}
          deps={deps}
          projectId={projectId}
          close={close}
        />
      );
    },
  };
}
