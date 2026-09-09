import type { DemoCase, TraceEvent } from './types';
import type { TraceEventSource } from './trace-event-source';

/** Entirely local and synchronous: no network, runtime, database, or model calls. */
export class MockTraceEventSource implements TraceEventSource {
  readonly caseId: string;
  constructor(private readonly caseData: DemoCase) {
    this.caseId = caseData.caseId;
  }
  getEvents(): readonly TraceEvent[] { return this.caseData.events; }
  getCase(): DemoCase { return this.caseData; }
}
