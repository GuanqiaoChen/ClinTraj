import type { DemoCase, TraceEvent } from './types';

/** A replay source boundary. A future trace adapter can implement this contract. */
export interface TraceEventSource {
  readonly caseId: string;
  getEvents(): readonly TraceEvent[];
  getCase(): DemoCase;
}
