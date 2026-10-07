// Violation sample: application depends on infra instead of a port.
// Importing domain and shared is allowed and must not be reported.
import { t } from "../shared/l10n/l10n";
import type { Task } from "../domain/task";
import { orcaTaskRepository } from "../infra/orca/repository/task-repository";

export const repository = orcaTaskRepository;
export type Label = [Task, typeof t];
