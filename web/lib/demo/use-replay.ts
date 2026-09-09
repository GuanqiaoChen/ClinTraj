'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { REPLAY_CONFIG } from './config';
import { MockTraceEventSource } from './mock-trace-event-source';
import { clampCursor, deriveReplayState, nextStepCursor, previousStepCursor } from './replay-state';
import type { DemoCase } from './types';

export function useReplay(caseData: DemoCase) {
  const source = useMemo(() => new MockTraceEventSource(caseData), [caseData]);
  const [transport, setTransport] = useState({ caseId: caseData.caseId, cursor: -1, playing: false });
  const [speed, updateSpeed] = useState<number>(REPLAY_CONFIG.defaultSpeed);
  // Case identity invalidates old transport synchronously, before effects can paint it.
  const current = transport.caseId === caseData.caseId ? transport : { caseId: caseData.caseId, cursor: -1, playing: false };
  if (transport.caseId !== caseData.caseId) setTransport(current);
  const snapshot = useMemo(() => deriveReplayState(source.getCase(), current.cursor, current.playing), [source, current.cursor, current.playing]);

  useEffect(() => {
    if (snapshot.status !== 'playing') return;
    const caseId = caseData.caseId;
    const timer = window.setTimeout(() => {
      setTransport((previous) => {
        if (previous.caseId !== caseId || !previous.playing) return previous;
        const cursor = clampCursor(previous.cursor + 1, source.getEvents().length);
        return { caseId, cursor, playing: cursor < source.getEvents().length - 1 };
      });
    }, REPLAY_CONFIG.eventIntervalMs / speed);
    return () => window.clearTimeout(timer);
  }, [caseData.caseId, snapshot.cursor, snapshot.status, source, speed]);

  const seek = useCallback((index: number) => setTransport({ caseId: caseData.caseId, cursor: clampCursor(index, source.getEvents().length), playing: false }), [caseData.caseId, source]);
  const play = useCallback(() => setTransport((previous) => ({
    caseId: caseData.caseId,
    cursor: previous.caseId !== caseData.caseId || previous.cursor >= source.getEvents().length - 1 ? -1 : previous.cursor,
    playing: source.getEvents().length > 0,
  })), [caseData.caseId, source]);
  const pause = useCallback(() => setTransport((previous) => ({ caseId: caseData.caseId, cursor: previous.caseId === caseData.caseId ? previous.cursor : -1, playing: false })), [caseData.caseId]);
  const next = useCallback(() => seek(nextStepCursor(source.getEvents(), current.cursor)), [source, current.cursor, seek]);
  const previous = useCallback(() => seek(previousStepCursor(source.getEvents(), current.cursor)), [source, current.cursor, seek]);
  const restart = useCallback(() => seek(-1), [seek]);
  const setSpeed = useCallback((value: number) => {
    if (REPLAY_CONFIG.speeds.some((allowed) => allowed === value)) updateSpeed(value);
  }, []);

  return { ...snapshot, play, pause, next, previous, restart, seek, speed, setSpeed };
}
