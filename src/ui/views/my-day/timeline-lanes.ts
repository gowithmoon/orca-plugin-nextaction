// Side by side on the timeline (#84 重叠): overlapping schedules get lanes,
// assigned greedily by start; each group of schedules that overlap one
// another shares the width evenly. Layout only, pure, shared with dragging
// (#85). Not test-driven (#81 Testing Decisions); verified by hand in Orca.

/** Where a schedule sits across the timeline: lane `lane` of `lanes`. */
export interface LaneSlot {
  readonly lane: number;
  readonly lanes: number;
}

/**
 * The lane of each of `schedules`, in their order. Touching schedules (one
 * ends when the next starts) do not overlap.
 */
export function assignLanes(
  schedules: readonly { readonly start: Date; readonly end: Date }[],
): LaneSlot[] {
  const order = schedules
    .map((schedule, index) => ({
      index,
      start: schedule.start.getTime(),
      end: schedule.end.getTime(),
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const slots: LaneSlot[] = new Array(schedules.length);
  /** The group under way: its members' lanes, and when each lane frees up. */
  let group: { index: number; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;
  const closeGroup = () => {
    for (const member of group) {
      slots[member.index] = { lane: member.lane, lanes: laneEnds.length };
    }
    group = [];
    laneEnds = [];
  };
  for (const item of order) {
    if (item.start >= groupEnd) closeGroup();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    group.push({ index: item.index, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  closeGroup();
  return slots;
}
