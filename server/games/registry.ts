import { GameModule, toMeta, GameMeta } from "./types";
import { triviaModule } from "./trivia";
import { wordModule } from "./word";
import { geoModule } from "./geo";
import { trueFalseModule } from "./truefalse";
import { oddOneOutModule } from "./oddoneout";
import { emojiModule } from "./emoji";
import { riddlesModule } from "./riddles";
import { capitalsModule } from "./capitals";
import { mathModule } from "./math";
import { landmarkModule } from "./landmark";
import { logoModule } from "./logo";
import { movieModule } from "./movie";
import { colorModule } from "./color";

// Register every game module here. Adding a game = implement GameModule + add it to this list.
const MODULES: GameModule[] = [
  triviaModule,
  wordModule,
  geoModule,
  trueFalseModule,
  oddOneOutModule,
  emojiModule,
  riddlesModule,
  capitalsModule,
  mathModule,
  landmarkModule,
  logoModule,
  movieModule,
  colorModule,
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export function getGame(id: string): GameModule | undefined {
  return BY_ID.get(id);
}

export function listGameMeta(): GameMeta[] {
  return MODULES.map(toMeta);
}
