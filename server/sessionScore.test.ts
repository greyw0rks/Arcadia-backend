import { describe, it, expect } from "vitest";
import { createSession, scoreAnswer, nextRound, correctCount, isComplete } from "./sessions";
import { getGame } from "./games/registry";

// V2 banks rounds against correctCount(), so these two helpers are a security boundary: they are
// what makes the score the SERVER's opinion rather than the client's. An earlier revision of
// /api/v2/run/round took `correct` from the request body, which let a tester claim 15/15 every
// round and would have corrupted both payouts and the calibration data.

const PLAYER = "0xabc0000000000000000000000000000000000001";

function playSession(answers: Array<"right" | "wrong">) {
  const game = getGame("trivia")!;
  const s = createSession(game, PLAYER, answers.length, "celo", undefined, {
    isDemo: true,
    difficulty: 0.5,
  });
  for (const answer of answers) {
    const view = nextRound(game, s)!;
    const correctIndex = s.current!.correctIndex;
    const pick = answer === "right" ? correctIndex : (correctIndex + 1) % view.options.length;
    scoreAnswer(s, pick);
  }
  return s;
}

describe("correctCount — the server's own tally", () => {
  it("counts only correct answers", () => {
    const s = playSession(["right", "wrong", "right", "right", "wrong"]);
    expect(correctCount(s)).toBe(3);
  });

  it("is 0 for a perfect miss", () => {
    expect(correctCount(playSession(["wrong", "wrong", "wrong"]))).toBe(0);
  });

  it("is the full count for a perfect run", () => {
    expect(correctCount(playSession(["right", "right", "right"]))).toBe(3);
  });

  it("is 0 before anything is answered", () => {
    const game = getGame("trivia")!;
    const s = createSession(game, PLAYER, 5, "celo", undefined, { isDemo: true, difficulty: 0 });
    expect(correctCount(s)).toBe(0);
  });

  it("cannot be influenced by the answer index the client sends — only by correctness", () => {
    // Two sessions with the same outcomes must agree, regardless of which wrong option was picked.
    const a = playSession(["right", "wrong"]);
    const b = playSession(["right", "wrong"]);
    expect(correctCount(a)).toBe(correctCount(b));
  });
});

describe("isComplete — no banking a half-played round", () => {
  it("is false until every committed round is answered", () => {
    const game = getGame("trivia")!;
    const s = createSession(game, PLAYER, 3, "celo", undefined, { isDemo: true, difficulty: 0 });
    expect(isComplete(s)).toBe(false);

    nextRound(game, s);
    scoreAnswer(s, s.current!.correctIndex);
    expect(isComplete(s)).toBe(false);
  });

  it("is true once all rounds are answered", () => {
    expect(isComplete(playSession(["right", "wrong", "right"]))).toBe(true);
  });

  // Abandoning bad rounds and only submitting good ones is the attack this blocks.
  it("stays false for an abandoned session", () => {
    const game = getGame("trivia")!;
    const s = createSession(game, PLAYER, 15, "celo", undefined, { isDemo: true, difficulty: 0 });
    for (let i = 0; i < 4; i++) {
      nextRound(game, s);
      scoreAnswer(s, s.current!.correctIndex);
    }
    expect(isComplete(s)).toBe(false);
    expect(correctCount(s)).toBe(4); // it scored well — but it is not a full round
  });
});
