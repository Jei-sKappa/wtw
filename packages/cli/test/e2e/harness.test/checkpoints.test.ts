import { describe, expect, it } from "vitest";
import { createCheckpointTracker } from "../harness/checkpoints";

// The persistent proof of spec AC-4.3's helper half: a scenario cannot silently
// under-prove. The three failure modes are real — reach() rejects undeclared and
// duplicate ids, and assertAllReached() names every declared id left unreached.
// The wired scenario half lands in Task 14.

describe("createCheckpointTracker", () => {
  it("passes when every declared checkpoint is reached", () => {
    const tracker = createCheckpointTracker([{ id: "one" }, { id: "two" }]);
    tracker.reach("one");
    tracker.reach("two");
    expect(() => tracker.assertAllReached()).not.toThrow();
  });

  it("assertAllReached names each declared checkpoint never reached", () => {
    const tracker = createCheckpointTracker([{ id: "one" }, { id: "two" }]);
    tracker.reach("one");
    expect(() => tracker.assertAllReached()).toThrow(/two/);
  });

  it("reach throws on an id not in the declared set", () => {
    const tracker = createCheckpointTracker([{ id: "one" }]);
    expect(() => tracker.reach("ghost")).toThrow(/ghost/);
  });

  it("reach throws on a second reach of the same id", () => {
    const tracker = createCheckpointTracker([{ id: "one" }]);
    tracker.reach("one");
    expect(() => tracker.reach("one")).toThrow(/one/);
  });
});
