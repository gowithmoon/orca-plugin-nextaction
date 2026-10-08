// Use case: the values the task panel offers for contexts and labels (#35
// "读取候选值"), so one context is not written two ways.
import type { ChoiceProperty, TaskRepository } from "../ports/task-repository";

/**
 * The candidate values of contexts or labels, each once. Errors are thrown
 * as they are.
 */
export type ReadCandidates = (property: ChoiceProperty) => Promise<string[]>;

export function createReadCandidates(deps: {
  repository: TaskRepository;
}): ReadCandidates {
  return (property) => deps.repository.readCandidates(property);
}
