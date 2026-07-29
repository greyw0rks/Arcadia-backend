// server/v2/calibration.ts — per-answer sampling for the private beta.
//
// The V2 difficulty model has exactly four free parameters: the per-tier accuracies (easy/medium/
// hard/extreme) that spec §4.1 and the bust simulation in §5.2a are built on. They were invented.
// Every downstream number — bust rate, pass mark, payout spread — inherits their error.
//
// This records the raw material to replace them: one row per scored answer, tagged with the tier
// that was actually served. It cannot be reconstructed later, so it has to be live before testers
// start playing rather than after.
//
// Scope: V2_ENABLED only. That flag is on for the private-tester staging deploy (own project, own
// database) and off in production, so no production player is ever sampled by this.

import { query } from "../db";
import { V2_ENABLED } from "./flag";

export interface CalibrationSample {
  sessionId: string;
  player: string;
  chain: string;
  gameId: string;
  roundIndex: number;
  tier?: number; // absent for procedural games (math), which have no tagged bank
  correct: boolean;
  onTime: boolean;
  responseMs: number;
  difficulty?: number;
  isDemo: boolean;
}

/**
 * Persist one scored answer. Fire-and-forget by design: this is measurement, and a sampling write
 * must never fail or delay the answer the player is waiting on. A dropped sample costs a data
 * point; a thrown error would cost the round.
 */
export function recordSample(s: CalibrationSample): void {
  if (!V2_ENABLED) return;
  void query(
    `INSERT INTO calibration_samples
       (session_id, player, chain, game_id, round_index, tier, correct, on_time, response_ms,
        difficulty, is_demo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (session_id, round_index) DO NOTHING`,
    [
      s.sessionId,
      s.player,
      s.chain,
      s.gameId,
      s.roundIndex,
      s.tier ?? null,
      s.correct,
      s.onTime,
      Math.round(s.responseMs),
      s.difficulty ?? null,
      s.isDemo,
    ]
  );
}

export interface TierAccuracy {
  tier: number | null;
  answers: number;
  correct: number;
  accuracy: number;
  meanMs: number;
  timeouts: number;
}

export interface GameAccuracy {
  gameId: string;
  answers: number;
  accuracy: number;
}

export interface PlayerSkill {
  player: string;
  answers: number;
  accuracy: number;
}

export interface CalibrationReport {
  totalSamples: number;
  players: number;
  /** The four numbers the difficulty model assumes. Compare against easy 85 / medium 65 / hard 45 / extreme 30. */
  byTier: TierAccuracy[];
  byGame: GameAccuracy[];
  /**
   * Per-player accuracy, descending. Platform bust rate is driven more by the SPREAD of this than by
   * any individual's luck (spec §5.2a), so the distribution matters as much as the mean.
   */
  skill: PlayerSkill[];
}

/**
 * Aggregate the sample into the numbers §4.2 needs. Excludes demo plays: a free session has nothing
 * at stake, so its answers are not drawn from the same effort distribution as a paid one.
 */
export async function calibrationReport(minAnswers = 1): Promise<CalibrationReport | null> {
  if (!V2_ENABLED) return null;

  const byTier = await query<{
    tier: number | null;
    answers: string;
    correct: string;
    mean_ms: string;
    timeouts: string;
  }>(
    `SELECT tier,
            COUNT(*)                                  AS answers,
            COUNT(*) FILTER (WHERE correct)           AS correct,
            AVG(response_ms)                          AS mean_ms,
            COUNT(*) FILTER (WHERE NOT on_time)       AS timeouts
       FROM calibration_samples
      WHERE NOT is_demo
      GROUP BY tier
      ORDER BY tier NULLS LAST`
  );
  if (!byTier) return null;

  const byGame = await query<{ game_id: string; answers: string; correct: string }>(
    `SELECT game_id, COUNT(*) AS answers, COUNT(*) FILTER (WHERE correct) AS correct
       FROM calibration_samples
      WHERE NOT is_demo
      GROUP BY game_id
      ORDER BY COUNT(*) DESC`
  );

  const skill = await query<{ player: string; answers: string; correct: string }>(
    `SELECT player, COUNT(*) AS answers, COUNT(*) FILTER (WHERE correct) AS correct
       FROM calibration_samples
      WHERE NOT is_demo
      GROUP BY player
     HAVING COUNT(*) >= $1
      ORDER BY (COUNT(*) FILTER (WHERE correct))::float / COUNT(*) DESC`,
    [minAnswers]
  );

  const ratio = (correct: string, answers: string) => Number(correct) / Number(answers);

  const tiers = byTier.rows.map((r) => ({
    tier: r.tier,
    answers: Number(r.answers),
    correct: Number(r.correct),
    accuracy: ratio(r.correct, r.answers),
    meanMs: Math.round(Number(r.mean_ms)),
    timeouts: Number(r.timeouts),
  }));

  return {
    totalSamples: tiers.reduce((n, t) => n + t.answers, 0),
    players: skill?.rowCount ?? 0,
    byTier: tiers,
    byGame: (byGame?.rows ?? []).map((r) => ({
      gameId: r.game_id,
      answers: Number(r.answers),
      accuracy: ratio(r.correct, r.answers),
    })),
    skill: (skill?.rows ?? []).map((r) => ({
      player: r.player,
      answers: Number(r.answers),
      accuracy: ratio(r.correct, r.answers),
    })),
  };
}
