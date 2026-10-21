// Use case: the values offered for contexts and tags (#35, #224
// "读取候选值"), so one context is not written two ways.
import type { Candidates, TaskRepository } from "../ports/task-repository";

/**
 * The candidate values of contexts and tags, each once, from
 * one read. Errors are thrown as they are.
 */
export type ReadCandidates = () => Promise<Candidates>;

export function createReadCandidates(deps: {
  repository: TaskRepository;
}): ReadCandidates {
  return () => deps.repository.readCandidates();
}
