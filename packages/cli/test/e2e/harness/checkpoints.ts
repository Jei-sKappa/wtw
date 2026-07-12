import type { Checkpoint } from "./case-manifest";

/**
 * A runtime tracker the scenario test (Task 14) uses to prove every declared
 * checkpoint is reached and asserted. The scenario runs a step's assertions and
 * then calls `reach(id)`; a failing assertion aborts the test before `reach`, so
 * an asserted-false checkpoint is inherently "not reached". After all steps,
 * `assertAllReached()` fails the scenario if any declared checkpoint was skipped
 * — a drifted scenario fails loudly rather than silently under-proving.
 */
export type CheckpointTracker = {
  /** Mark a declared checkpoint reached. Throws on an undeclared id (the
   * scenario drifted from its declarations) or a second reach of the same id
   * (the scenario and its declarations disagree). */
  reach(id: string): void;
  /** Throw if any declared checkpoint was never reached, naming each. */
  assertAllReached(): void;
};

export function createCheckpointTracker(
  declared: readonly Pick<Checkpoint, "id">[],
): CheckpointTracker {
  const declaredIds = new Set(declared.map((checkpoint) => checkpoint.id));
  const reached = new Set<string>();

  return {
    reach(id: string): void {
      if (!declaredIds.has(id)) {
        throw new Error(
          `checkpoint reach(${id}) is not a declared checkpoint id`,
        );
      }
      if (reached.has(id)) {
        throw new Error(`checkpoint ${id} was already reached`);
      }
      reached.add(id);
    },
    assertAllReached(): void {
      const missing = [...declaredIds].filter((id) => !reached.has(id));
      if (missing.length > 0) {
        throw new Error(
          `declared checkpoints never reached: ${missing.join(", ")}`,
        );
      }
    },
  };
}
