// The contract every game module implements. The chain is game-agnostic: it only sees a stake and a
// final multiplier, so any game reduces to "produce rounds, score answers". Add a game = add a module.

/** What the client is allowed to see for a round. NEVER includes the correct answer. */
export interface RoundView {
  roundIndex: number; // 0-based
  totalRounds: number;
  prompt: string; // question / instruction
  imageUrl?: string; // optional media (used by geo/landmark/logo/movie modules)
  // Visual treatment for image-based rounds. Absent = full colour.
  // 'hard'    → greyscale (strips colour cues that give away famous landmarks)
  // 'extreme' → greyscale + blur + zoomed into an unusual crop (iconic features hidden)
  imageStyle?: 'hard' | 'extreme';
  options: string[]; // choices the player picks from
  timeLimitSec: number; // client countdown; server enforces authoritatively
}

/** Internal round state the server keeps (includes the answer key). Never sent to the client. */
export interface RoundState {
  view: RoundView;
  correctIndex: number;
  deadline: number; // ms epoch; answers after this are scored wrong
  servedAt: number; // ms epoch when the round was served — basis for the anti-cheat response time
  timeLimitMs: number; // the round's time budget in ms (for computing response time within the round)
}

export type Scored = "correct" | "wrong";

export interface GameModule {
  id: string;
  title: string;
  description: string;
  thumbnail: string; // emoji or asset path for the lobby card
  maxRounds: number; // base (lowest-stake) round count; the played count scales with the bet
  bankSize: number; // unique questions available; caps stake-driven rounds so a session never repeats
  available: boolean; // false => shown as "coming soon" in the lobby

  /**
   * Build the next round for a session. `roundIndex` is 0-based. `seed` is a stable per-session
   * value (derived from the session id) so a module can lay out a per-session, no-repeat ordering
   * of its bank instead of showing every player the same sequence. `difficulty` is a 0..1 fraction
   * derived from the bet (1 == max stake); modules that generate questions use it to get harder.
   */
  buildRound(roundIndex: number, seed: number, difficulty?: number): RoundState;
}

export interface GameMeta {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  maxRounds: number;
  bankSize: number;
  available: boolean;
}

export function toMeta(m: GameModule): GameMeta {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    thumbnail: m.thumbnail,
    maxRounds: m.maxRounds,
    bankSize: m.bankSize,
    available: m.available,
  };
}
