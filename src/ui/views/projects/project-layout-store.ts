// The project details' layout (GLOSSARY: 布局, #166, #186): tree, board or
// gantt, one choice for every project; anything unreadable reads as the
// tree. In memory only (ui/components/layout-store.ts).
import {
  createLayoutStore,
  type LayoutStore,
} from "../../components/layout-store";

/** The layouts in the order offered (the toolbar, the setting). */
export const projectLayouts = ["tree", "board", "gantt"] as const;

export type ProjectLayout = (typeof projectLayouts)[number];

export type ProjectLayoutStore = LayoutStore<ProjectLayout>;

export function createProjectLayoutStore(): ProjectLayoutStore {
  return createLayoutStore(projectLayouts);
}
