export const meta = {
  name: 'gen-questions-topup',
  description: 'Top-up round: generate additional unique hard general-knowledge questions for shortfall banks',
  phases: [{ title: 'TopUp' }],
}

const OUTDIR = '/home/greyw0rks/Arcadia/arcadia-backend/scripts/qgen'
const AVOID = (b) => `${OUTDIR}/_avoid_${b}.txt`

// bank -> {fields desc, how many to generate (2-3x the shortfall to survive dedup), N agents}
const JOBS = [
  { id: 'trivia', fields: 'q (question), options (EXACTLY 4 strings, correct answer FIRST at index 0), answer (always 0), tier ("hard" or "extreme")', gen: 45, agents: 1,
    fmt: 'General-knowledge multiple choice.' },
  { id: 'truefalse', fields: 's (statement), a (boolean), tier ("hard" or "extreme")', gen: 70, agents: 1,
    fmt: 'Surprising true/false statements, mix true and false evenly.' },
  { id: 'riddles', fields: 'riddle (text), correct (short answer), decoys (EXACTLY 3 wrong answers, NOT equal to correct), tier ("hard" or "extreme")', gen: 110, agents: 2,
    fmt: 'Classic lateral-thinking riddles.' },
  { id: 'oddoneout', fields: 'items (EXACTLY 4 strings), odd (integer 0-3 index of the misfit), reason (why), tier ("hard" or "extreme")', gen: 45, agents: 1,
    fmt: 'Odd-one-out puzzles, subtle but unambiguous.' },
  { id: 'emoji', fields: 'emoji (2-4 emoji representing the title), correct (the title), decoys (EXACTLY 3 other real titles of the same medium, NOT equal to correct), tier ("hard" or "extreme")', gen: 160, agents: 2,
    fmt: 'Emoji rebus puzzles for well-known movies, TV shows, books, songs, and phrases. Use a WIDE range of titles.' },
  { id: 'words', fields: 'prompt (string "Unscramble: XXXX" where XXXX is the answer letters rearranged into a NON-identical anagram), correct (target word UPPERCASE), decoys (EXACTLY 3 other real UPPERCASE words), tier ("hard" or "extreme")', gen: 45, agents: 1,
    fmt: 'Unscramble puzzles with familiar-but-longer everyday words (KNOWLEDGE, ADVENTURE, HOSPITAL). No rare/archaic words.' },
  { id: 'colors', fields: 'name (color name), hex (canonical #RRGGBB UPPERCASE), decoys (EXACTLY 3 near-miss #RRGGBB codes, NOT equal to hex), tier ("hard" or "extreme")', gen: 90, agents: 2,
    fmt: 'Real named web/X11 colors and their hex codes. Draw from the full X11/CSS named-color set (there are ~140).' },
]

phase('TopUp')

const results = await parallel(
  JOBS.flatMap((job) => {
    const per = Math.ceil(job.gen / job.agents)
    return Array.from({ length: job.agents }, (_, i) => () => {
      const outfile = `${OUTDIR}/${job.id}-top${i + 1}.json`
      return agent(
        `Top-up generation for the "${job.id}" quiz bank.\n\n` +
        `STEP 1: Use the Read tool to read this file of questions that ALREADY EXIST — you must NOT duplicate any of them:\n` +
        `${AVOID(job.id)}\n\n` +
        `STEP 2: Generate ${per} BRAND-NEW questions that do NOT appear in that file.\n\n` +
        `${job.fmt}\n` +
        `Each object must have exactly these fields: ${job.fields}.\n\n` +
        `STYLE — HARD GENERAL KNOWLEDGE, NOT SPECIALIST TRIVIA: every item must be something a well-educated ` +
        `curious adult could plausibly know or reason out (pub-quiz / game-show difficulty). "Hard" = less ` +
        `commonly remembered or close options, NOT requiring a specialist degree. BAN technical jargon, obscure ` +
        `constants, chemical nomenclature, enzyme names, niche taxonomy, academic minutiae.\n\n` +
        `All ${per} tier values must be "hard" or "extreme" (roughly half each). Every question factually correct ` +
        `and unambiguous; decoys plausible but clearly wrong.\n\n` +
        `STEP 3: Use the Write tool to write a JSON ARRAY of your ${per} new objects to this exact path:\n` +
        `${outfile}\n` +
        `File content must be ONLY the JSON array (starts with [ ends with ]), no markdown/prose. Then reply "done".`,
        { label: `${job.id}:top${i + 1}`, phase: 'TopUp' }
      ).then(() => ({ bank: job.id, outfile }))
    })
  })
)

log(`top-up agents finished: ${results.filter(Boolean).length}`)
return { outdir: OUTDIR, files: results.filter(Boolean) }
