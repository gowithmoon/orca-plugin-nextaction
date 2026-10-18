// The My Day view's layout (GLOSSARY: 布局, #197): the timeline layout, the
// list or the Eisenhower Matrix (GLOSSARY: 四象限, #198); anything
// unreadable reads as the timeline layout. In memory only
// (ui/components/layout-store.ts).
import {
  createLayoutStore,
  type LayoutStore,
} from "../../components/layout-store";

/** The layouts in the order offered (the header's switch, the setting). */
export const myDayLayouts = ["timeline", "list", "matrix"] as const;

export type MyDayLayout = (typeof myDayLayouts)[number];

export type MyDayLayoutStore = LayoutStore<MyDayLayout>;

export function createMyDayLayoutStore(): MyDayLayoutStore {
  return createLayoutStore(myDayLayouts);
}
