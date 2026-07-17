export const meta = {
  name: 'gen-questions',
  description: 'Generate 100 new hard/extreme questions for each of 8 text quiz banks',
  phases: [{ title: 'Generate' }],
}

// Each bank: id, per-agent instruction, and a JSON schema for one question object.
const OPTION3 = { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 }
const TIER = { type: 'string', enum: ['hard', 'extreme'] }

const BANKS = [
  {
    id: 'trivia',
    desc: 'General-knowledge multiple-choice trivia. Fields: q (question), options (EXACTLY 4 strings, the correct answer FIRST at index 0), answer (always 0), tier.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['q', 'options', 'answer', 'tier'],
      properties: {
        q: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
        answer: { type: 'integer', enum: [0] },
        tier: TIER,
      },
    },
    topics: ['world geography & landmarks', 'history & famous events', 'sports & the Olympics', 'movies, music & pop culture', 'nature & animals', 'famous people & inventors', 'space & the planets', 'food, drink & world cultures'],
  },
  {
    id: 'truefalse',
    desc: 'True/false statements that are surprising or counterintuitive. Fields: s (statement), a (boolean answer), tier. Mix true and false roughly evenly.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['s', 'a', 'tier'],
      properties: { s: { type: 'string' }, a: { type: 'boolean' }, tier: TIER },
    },
    topics: ['surprising history facts', 'animal & nature facts', 'geography & world records', 'the human body', 'space & science', 'famous people & pop culture'],
  },
  {
    id: 'riddles',
    desc: 'Classic lateral-thinking riddles. Fields: riddle (the riddle text), correct (the answer), decoys (EXACTLY 3 wrong-but-plausible answers), tier. The answer must be a short noun phrase.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['riddle', 'correct', 'decoys', 'tier'],
      properties: { riddle: { type: 'string' }, correct: { type: 'string' }, decoys: OPTION3, tier: TIER },
    },
    topics: ['objects & everyday things', 'nature & elements', 'abstract concepts (time, silence, shadow)', 'wordplay riddles', 'what-am-I riddles', 'logic riddles'],
  },
  {
    id: 'capitals',
    desc: 'World capital-city questions. Fields: country, flag (the emoji flag), capital (correct answer), decoys (EXACTLY 3 other real capital cities), tier. Favor lesser-known countries.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['country', 'flag', 'capital', 'decoys', 'tier'],
      properties: { country: { type: 'string' }, flag: { type: 'string' }, capital: { type: 'string' }, decoys: OPTION3, tier: TIER },
    },
    topics: ['African nations', 'Central Asian & Caucasus states', 'Pacific & Caribbean island nations', 'small European states', 'Southeast Asian nations', 'South American nations'],
  },
  {
    id: 'oddoneout',
    desc: 'Odd-one-out puzzles. Fields: items (EXACTLY 4 strings), odd (integer 0-3 = index of the item that does not belong), reason (why it is the odd one), tier. Make the distinction subtle but unambiguous.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['items', 'odd', 'reason', 'tier'],
      properties: {
        items: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
        odd: { type: 'integer', minimum: 0, maximum: 3 },
        reason: { type: 'string' }, tier: TIER,
      },
    },
    topics: ['everyday categories (animals, foods, sports)', 'geography (countries, rivers, capitals)', 'famous people & history', 'movies, music & entertainment', 'the natural world', 'general science everyone learns in school'],
  },
  {
    id: 'emoji',
    desc: 'Emoji rebus puzzles for movies/shows/phrases. Fields: emoji (2-4 emoji that represent the title), correct (the title), decoys (EXACTLY 3 other plausible titles of the same medium), tier.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['emoji', 'correct', 'decoys', 'tier'],
      properties: { emoji: { type: 'string' }, correct: { type: 'string' }, decoys: OPTION3, tier: TIER },
    },
    topics: ['classic & award-winning films', 'animated & family films', 'TV series', 'thrillers & horror', 'sci-fi & fantasy', 'famous phrases & idioms'],
  },
  {
    id: 'words',
    desc: 'Unscramble puzzles with moderately challenging but FAMILIAR words (words an average adult knows and uses, just longer/trickier to unscramble — e.g. KNOWLEDGE, ADVENTURE, CHAMPION, MOUNTAIN, HOSPITAL). Avoid rare/archaic vocabulary. Fields: prompt (MUST be the string "Unscramble: XXXX" where XXXX is the answer letters rearranged into a NON-identical anagram), correct (the target word, UPPERCASE), decoys (EXACTLY 3 other real UPPERCASE words of similar length), tier. The scramble MUST NOT equal the answer.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['prompt', 'correct', 'decoys', 'tier'],
      properties: { prompt: { type: 'string' }, correct: { type: 'string' }, decoys: OPTION3, tier: TIER },
    },
    topics: ['everyday objects & places', 'common longer words', 'geography words', 'feelings & actions', 'school subjects & jobs', 'nature & animals'],
  },
  {
    id: 'colors',
    desc: 'Named-color to hex questions. Fields: name (the color name), hex (its canonical #RRGGBB code, UPPERCASE), decoys (EXACTLY 3 near-miss #RRGGBB codes close to but different from the real one), tier. Use real named web/X11 colors.',
    schema: {
      type: 'object', additionalProperties: false,
      required: ['name', 'hex', 'decoys', 'tier'],
      properties: { name: { type: 'string' }, hex: { type: 'string' }, decoys: OPTION3, tier: TIER },
    },
    topics: ['X11/web named colors', 'Pantone-style shades', 'earth tones', 'blues & greens', 'reds & pinks', 'purples & neutrals'],
  },
]

phase('Generate')

// Two agents per bank (50 each) with different topic slices. Each agent WRITES its own slice to a
// small JSON file and returns "done" — avoids passing large payloads through the orchestrator.
const OUTDIR = '/home/greyw0rks/Arcadia/arcadia-backend/scripts/qgen'
const results = await parallel(
  BANKS.flatMap((bank) => {
    const half = Math.ceil(bank.topics.length / 2)
    const slices = [bank.topics.slice(0, half), bank.topics.slice(half)]
    return slices.map((topics, i) => () => {
      const outfile = `${OUTDIR}/${bank.id}-${i + 1}.json`
      return agent(
        `You are generating quiz questions for the "${bank.id}" game bank.\n\n` +
        `FORMAT: ${bank.desc}\n\n` +
        `Generate exactly 50 questions. Each question's "tier" field must be "hard" or "extreme" only ` +
        `(roughly half each) — NO easy or medium.\n\n` +
        `CRITICAL STYLE RULE — HARD GENERAL KNOWLEDGE, NOT SPECIALIST TRIVIA:\n` +
        `Every question must be GENERAL KNOWLEDGE: something a well-educated, curious adult could plausibly ` +
        `know or reason out — the kind of question satisfying on a pub quiz or game show. ` +
        `"Hard" means the answer is less commonly remembered or the options are close, NOT that it requires ` +
        `a specialist degree.\n` +
        `ALLOWED (hard but general): "Which planet has the most moons?", "What year did the Titanic sink?", ` +
        `"Which country has the most time zones?", "Who wrote War and Peace?", "What is the capital of Australia?".\n` +
        `BANNED (too obscure/specialist): technical jargon, obscure named constants or theorems, chemical ` +
        `nomenclature, respiratory pigments, enzyme names, niche taxonomy, academic minutiae. If a normal ` +
        `smart person has never plausibly heard of it, DO NOT use it.\n` +
        `Draw loosely from these areas, keeping every item broadly accessible: ${topics.join(', ')}.\n\n` +
        `Every question must be factually correct and unambiguous. Decoys must be plausible but clearly wrong. ` +
        `Do not repeat questions within your set.\n\n` +
        `OUTPUT: Use the Write tool to write a JSON ARRAY of exactly 50 question objects to this exact path:\n` +
        `${outfile}\n` +
        `The file content must be ONLY the JSON array (starting with [ and ending with ]), no markdown, no prose. ` +
        `Each object must have exactly these fields: ${Object.keys(bank.schema.properties).join(', ')}. ` +
        `After writing, reply with just "done".`,
        { label: `${bank.id}:${i + 1}`, phase: 'Generate' }
      ).then(() => ({ bank: bank.id, outfile }))
    })
  })
)

log(`agents finished: ${results.filter(Boolean).length}/16 — slices written to ${OUTDIR}`)
return { outdir: OUTDIR, files: results.filter(Boolean) }
