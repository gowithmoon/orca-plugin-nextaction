// Reads the question an entry asks before it runs (#150), e.g. "Drop project"
// naming how many open tasks go with it. Verified by hand in Orca
// (docs/ARCHITECTURE.md §5).
import * as React from "react";
import type { Project } from "../../domain/project/project";
import { useReadById } from "./use-task";

/**
 * The entry's question for `project`: `undefined` while it is read, `null`
 * when reading it failed (the confirmation reports its own errors), else
 * `{ question }`, whose `question` is `null` when the entry runs without
 * asking. Read once per project.
 */
export function useConfirmation(
  confirmation: (project: Project) => Promise<string | null>,
  project: Project,
): { question: string | null } | null | undefined {
  // Kept per project ID, so a menu re-rendering does not read it again.
  const latest = React.useRef({ confirmation, project });
  latest.current = { confirmation, project };
  const read = React.useCallback(
    async () => ({
      question: await latest.current.confirmation(latest.current.project),
    }),
    [],
  );
  return useReadById(read, project.id, ignore);
}

/** The confirmation reports its own failures. */
function ignore() {}
