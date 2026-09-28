import { describe, expect, it } from "vitest";
import { getTourThinkingMessage, TOUR_THINKING_MESSAGES } from "./thinking-messages";

const phases = ["evidence", "differential", "priorities", "candidates"] as const;
const sequence = (round: number, seed: number) => Array.from({ length: 8 }, (_, slot) => getTourThinkingMessage(round, slot / 8, seed));

describe("task-matched tour activity captions", () => {
  it("has a broad unique library without a repeated thinking prefix", () => {
    const messages = TOUR_THINKING_MESSAGES.flatMap(round => Object.values(round).flat());
    expect(messages).toHaveLength(192);
    expect(new Set(messages).size).toBe(messages.length);
    expect(messages.every(message => !message.startsWith("正在思考"))).toBe(true);
  });

  it("keeps every caption within the current round and task, without cycling", () => {
    for (let seed = 0; seed < 32; seed += 1) {
      const replay: string[] = [];
      for (let round = 1; round <= 3; round += 1) {
        const captions = sequence(round, seed);
        captions.forEach((caption, slot) => {
          expect(TOUR_THINKING_MESSAGES[round - 1][phases[Math.floor(slot / 2)]]).toContain(caption);
        });
        replay.push(...captions);
      }
      expect(new Set(replay).size).toBe(24);
    }
  });

  it("varies between replays and stays stable during pause, resume, and rewind", () => {
    const variations = new Set(Array.from({ length: 16 }, (_, seed) => sequence(1, seed).join("|")));
    expect(variations.size).toBeGreaterThan(12);
    const caption = getTourThinkingMessage(2, .52, 42);
    expect(getTourThinkingMessage(2, .6, 42)).toBe(caption);
    getTourThinkingMessage(3, .9, 42);
    expect(getTourThinkingMessage(2, .52, 42)).toBe(caption);
  });
});
