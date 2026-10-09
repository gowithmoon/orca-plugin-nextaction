// Use case: the values the task panel offers for contexts and labels (#35
// "读取候选值"), so one context is not written two ways.
import type { Candidates, TaskRepository } from "../ports/task-repository";

/**
 * The candidate values of contexts and labels, each once per property, from
 * one read. Errors are thrown as they are.
 */
export type ReadCandidates = () => Promise<Candidates>;

export function createReadCandidates(deps: {
  repository: TaskRepository;
}): ReadCandidates {
  return () => deps.repository.readCandidates();
}
