import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_AGENTS } from './architecture';
import { ARCHITECTURE_VIEW_EDGES, ARCHITECTURE_VIEW_NODES, architectureViewStatus } from './architecture-view';
import type { AgentStatus } from './types';

describe('architecture presentation groups', () => {
  it('keeps each current runtime component visible in exactly one group', () => {
    const members = ARCHITECTURE_VIEW_NODES.flatMap((node) => [...node.members]);
    expect([...members].sort()).toEqual(ARCHITECTURE_AGENTS.map((agent) => agent.id).sort());
    for (const agent of ARCHITECTURE_AGENTS.filter((agent) => agent.kind === 'agent')) {
      expect(ARCHITECTURE_VIEW_NODES.find((node) => node.id === agent.id)?.kind).toBe('agent');
    }
  });

  it('shows an active or warning member even when other members have completed', () => {
    for (const node of ARCHITECTURE_VIEW_NODES) {
      for (const member of node.members) {
        const statuses: Record<string, AgentStatus> = Object.fromEntries(node.members.map((id) => [id, 'COMPLETED']));
        statuses[member] = 'ACTIVE';
        expect(architectureViewStatus(node.members, statuses)).toBe('ACTIVE');
        statuses[member] = 'WARNING';
        expect(architectureViewStatus(node.members, statuses)).toBe('WARNING');
      }
    }
  });

  it('retains the independent safety and physician approval boundaries', () => {
    const successors = (id: string) => ARCHITECTURE_VIEW_EDGES.filter((edge) => edge.source === id).map((edge) => edge.target);
    expect(successors('safety_critic')).toEqual(['policy_ranking']);
    expect(successors('validation')).toEqual(['policy_ranking']);
    expect(successors('policy_ranking')).toEqual(['arbiter']);
    expect(successors('arbiter')).toEqual(['physician_hitl']);
    expect(ARCHITECTURE_VIEW_EDGES.filter((edge) => edge.target === 'execution').map((edge) => edge.source)).toEqual(['physician_hitl']);
  });
});
