/** All replay timing lives here. No clock time or random data enters fixtures. */
export const REPLAY_CONFIG = {
  eventIntervalMs: 650,
  eventTimestampIntervalMs: 650,
  speeds: [0.5, 1, 2, 4] as const,
  defaultSpeed: 1,
  graphFocusDurationMs: 500,
  graphTransitionDurationMs: 350,
  focusDurationMs: 350,
  stageTransitionMs: 180,
} as const;
