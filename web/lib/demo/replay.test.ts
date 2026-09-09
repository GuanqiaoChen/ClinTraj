import { describe, expect, it } from 'vitest';
import { DEMO_CASES } from '../../data/demo/cases';
import { ACTION_TYPES, RELATION_TYPES } from './types';
import { ARCHITECTURE_AGENTS } from './architecture';
import { clampCursor, deriveReplayState, nextStepCursor, previousStepCursor } from './replay-state';
import { MockTraceEventSource } from './mock-trace-event-source';

describe.each(DEMO_CASES)('$caseId trajectory and trace', (scenario) => {
  it('preserves forward graph structure and explicit problem semantics', () => {
    expect(new Set(scenario.nodes.map(node => node.stepId)).size).toBe(scenario.nodes.length);
    const latestByProblem = new Map<string, string>();
    const ownerByProblem = new Map<string, string>();
    for (const node of scenario.nodes) {
      expect(ACTION_TYPES).toContain(node.actionType);
      expect(RELATION_TYPES).toContain(node.relation);
      const incoming = scenario.edges.filter(edge => edge.target === node.stepId);
      expect(incoming.length).toBe(node.relation === 'START' ? 0 : node.relation === 'RETURN' ? 2 : 1);
      for (const edge of incoming) {
        const parent = scenario.nodes.find(item => item.stepId === edge.source)!;
        expect(parent.clock).toBeLessThan(node.clock);
        expect(parent.position.x).toBeLessThan(node.position.x);
      }
      if (node.relation === 'BRANCH') {
        expect(latestByProblem.has(node.problemId)).toBe(false);
        expect(node.parentProblemId).toBeTruthy();
        expect(node.owner).toBe(ownerByProblem.get(node.parentProblemId!));
      }
      if (node.relation === 'CONSULT') expect(node.owner).toBe(ownerByProblem.get(node.problemId));
      if (node.relation === 'TRANSFER') expect(node.owner).not.toBe(ownerByProblem.get(node.problemId));
      if (node.relation === 'RETURN') {
        expect(node.actionType).toBe('REASSESS');
        expect(incoming.map(edge => edge.source)).toContain(latestByProblem.get(node.problemId));
        const branchParent = scenario.nodes.find(item => item.stepId === incoming.find(edge => edge.relation === 'RETURN')!.source)!;
        expect(branchParent.parentProblemId).toBe(node.problemId);
        expect(latestByProblem.get(branchParent.problemId)).toBe(branchParent.stepId);
      }
      latestByProblem.set(node.problemId, node.stepId);
      ownerByProblem.set(node.problemId, node.owner);
    }
  });

  it('finalizes only after simulated physician acceptance and execution', () => {
    for (const node of scenario.nodes) {
      const events = scenario.events.filter(event => event.stepId === node.stepId);
      const approval = events.findIndex(event => event.type === 'PHYSICIAN_DECISION');
      const execution = events.findIndex(event => event.agentId === 'executor');
      const finalized = events.findIndex(event => event.type === 'NODE_FINALIZED');
      expect(approval).toBeGreaterThan(0);
      expect(execution).toBeGreaterThan(approval);
      expect(finalized).toBeGreaterThan(execution);
      const cursor = scenario.events.indexOf(events[finalized]);
      expect(deriveReplayState(scenario, cursor - 1).finalizedStepIds).not.toContain(node.stepId);
      expect(deriveReplayState(scenario, cursor).finalizedStepIds).toContain(node.stepId);
    }
    expect(scenario.events.map(event => event.sequence)).toEqual(scenario.events.map((_, i) => i));
    expect(new Set(scenario.events.map(event => event.id)).size).toBe(scenario.events.length);
  });

  it('seeks, reverses, completes, and restarts without stale state', () => {
    const ready = deriveReplayState(scenario, -1);
    expect(ready.status).toBe('ready');
    expect(Object.values(ready.agentStatuses).every(status => status === 'IDLE')).toBe(true);
    let cursor = -1;
    for (const node of scenario.nodes) {
      cursor = nextStepCursor(scenario.events, cursor);
      expect(deriveReplayState(scenario, cursor).activeStepId).toBe(node.stepId);
    }
    expect(deriveReplayState(scenario, cursor).status).toBe('completed');
    const previous = previousStepCursor(scenario.events, cursor);
    expect(deriveReplayState(scenario, previous).activeStepId).toBe(scenario.nodes.at(-2)!.stepId);
    expect(deriveReplayState(scenario, previous).finalizedStepIds).not.toContain(scenario.nodes.at(-1)!.stepId);
    const secondStart = scenario.events.findIndex(event => event.stepId === 'S2');
    const second = deriveReplayState(scenario, secondStart);
    expect(second.agentStatuses.environment).toBe('ACTIVE');
    expect(second.agentStatuses.physician_hitl).toBe('PENDING');
    expect(deriveReplayState(scenario, -1)).toEqual(ready);
    expect(new MockTraceEventSource(scenario).getEvents()).toEqual(scenario.events);
  });
});

it('uses actual role ordering and independent safety-filtered ranking', () => {
  const ids = ARCHITECTURE_AGENTS.map(agent => agent.id);
  for (const [before, after] of [['action_generator', 'information_gain'], ['information_gain', 'specialist_router'], ['validation', 'safety_critic'], ['safety_critic', 'policy_ranking'], ['policy_ranking', 'arbiter'], ['physician_hitl', 'problem_transition']]) {
    expect(ids.indexOf(before)).toBeLessThan(ids.indexOf(after));
  }
});

it('contains distinct structures and warnings only in the acute scenario', () => {
  expect(DEMO_CASES[0].edges.every(edge => edge.relation === 'CONTINUE')).toBe(true);
  expect(DEMO_CASES[1].edges.some(edge => edge.relation === 'CONSULT')).toBe(true);
  expect(DEMO_CASES[1].edges.some(edge => edge.relation === 'TRANSFER')).toBe(false);
  for (const scenario of DEMO_CASES.slice(2)) expect(scenario.edges.some(edge => edge.relation === 'TRANSFER')).toBe(true);
  expect(DEMO_CASES.slice(0, 4).flatMap(scenario => scenario.events).some(event => event.type === 'SAFETY_WARNING')).toBe(false);
  const acute = DEMO_CASES[4];
  const warning = acute.events.findIndex(event => event.type === 'SAFETY_WARNING');
  expect(deriveReplayState(acute, warning).agentStatuses.safety_critic).toBe('WARNING');
  const resumed = acute.nodes.findIndex(node => node.relation === 'RETURN');
  expect(acute.nodes.findIndex(node => node.actionType === 'PROCEDURE')).toBeGreaterThan(resumed);
});

it('clamps invalid event cursors', () => {
  expect(clampCursor(NaN, 10)).toBe(-1);
  expect(clampCursor(-20, 10)).toBe(-1);
  expect(clampCursor(20, 10)).toBe(9);
});
