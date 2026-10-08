/**
 * Who can actually untangle a person?
 *
 * harness/bench-teaching.mts used one easy problem and learners with fixed
 * lines, so it could not see the thing that matters most: finding where
 * someone is really stuck. Here the learner is alive. Another model plays a
 * person, from a card the tutor never sees (harness/bench-cases.mts), and
 * answers whatever the tutor does.
 *
 *  - Knots: eight people on hard topics with broken code, a wrong theory about
 *    why, and a false belief underneath that is the real cause. It only clicks
 *    if the tutor finds that belief and lets them see it. Six turns.
 *  - Climbs: three people who have never met the idea, and a ladder of six
 *    things they must be able to do. Twelve turns, then a question a week
 *    later, alone.
 *
 * The learner is told to be a person, not an assistant: takes in only the
 * start of a long turn, never pretends to follow, never asks for a picture,
 * tires of being quizzed, and (some of them) will not work things out in
 * their head. So a tutor has to notice, show at the right moment unasked,
 * and stop asking for sums from someone who has said they cannot hold them.
 *
 * Two judges from different makers, blind to which model is which, then read
 * every tutor on the same learner side by side against the card.
 *
 *   npx tsx --env-file=.env harness/bench-deep.mts out.json [--knots=a,b] [--climbs=a,b] [--runs=1] [--cap=10] [model ...]
 *
 * Run it again with the same file to carry on where it stopped. It spends
 * real money, most of it on the learner: about ten dollars at one run each.
 * --cap is the most it may spend on conversations before it stops starting
 * new ones.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { FIRST, GATEWAY, KEY, ask, listModels, quiet, systemFor } from './bench-shared.mts';
import { CLIMBS, KNOTS, type Climb, type Knot } from './bench-cases.mts';

const CANDIDATES = [
  'anthropic/claude-sonnet-5.5', 'zai/glm-5.3-flash', 'anthropic/claude-haiku-5.5', 'openai/gpt-6-luna-fast',
  'google/gemini-3.5-flash-lite', 'anthropic/claude-haiku-4.5', 'openai/gpt-oss-120b',
];
/** Who plays the learner: a third maker, so no tutor is talking to its own kind and neither judge marks its own acting. */
const LEARNER = 'spacexai/grok-4.7';
const JUDGES = ['anthropic/claude-opus-5.5', 'openai/gpt-6.1-sol'];
const KNOT_TURNS = 6;
const CLIMB_TURNS = 12;

const numbered = (code: string) => code.split('\n').map((l, i) => `${i + 1} ${l}`).join('\n');
const count = (s: string) => s.split(/\s+/).filter(Boolean).length;
const spent = { learner: 0, judges: 0, tutors: 0 };
let stopped = false;

/** One plain request, for the learner and the judges. */
async function plain(model: string, system: string, user: string, most: number): Promise<{ text: string; cost: number }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${GATEWAY}/chat/completions`, {
        method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: most, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(240_000),
      });
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { cost?: number }; error?: { message?: string } };
      const text = j.choices?.[0]?.message?.content ?? '';
      if (res.ok && text.trim()) return { text, cost: Number(j.usage?.cost) || 0 };
      console.error(`${model}: ${res.status} ${String(j.error?.message ?? 'empty').slice(0, 100)}`);
    } catch (err) { console.error(`${model}: ${String((err as Error).message).slice(0, 100)}`); }
  }
  return { text: '', cost: 0 };
}
const json = <T,>(text: string): T | null => { try { return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as T; } catch { return null; } };

// ---- The tutor's turn.

type Hand = { name: string; args: Record<string, unknown> | null };
type Said = { text: string; hands: Hand[]; first: number; cost: number };

/** What pressing a button gives back to the tutor. Run tells the truth about this code. */
const gives = (h: Hand, runs: string) => (h.name === 'run_code' ? runs
  : h.name === 'trace_start' ? 'The picture is up: the code running on the example, stopped at its first line, with its values shown. You narrate it, a step at a time.' : 'done');

/** What the learner sees the tutor's hands do. */
function seen(h: Hand, runs: string): string | null {
  const a = h.args ?? {};
  switch (h.name) {
    case 'point_to': case 'circle': return `points at line ${a.line}${a.text ? `, at ${a.text}` : ''}`;
    case 'highlight_lines': return `highlights lines ${a.start_line} to ${a.end_line}`;
    case 'draw': return `draws on the board: ${JSON.stringify(a).slice(0, 260)}`;
    case 'trace_start': return 'puts up a picture of the code running on the example, values and all, to step through';
    case 'run_code': return `presses Run. It shows: ${runs}`;
    case 'change_line': return `changes line ${a.line} of the code to: ${a.to}`;
    case 'write_code': return `types into the editor: ${String(a.code).slice(0, 200)}`;
    default: return null;
  }
}

async function tutor(model: string, extra: object, messages: unknown[], runs: string): Promise<Said | string> {
  const said: Said = { text: '', hands: [], first: 0, cost: 0 };
  for (let round = 0; round < 3; round += 1) {
    const r = await ask(model, extra, messages);
    if (!r.ok) return r.why ?? 'failed';
    if (!said.first) said.first = r.first;
    said.cost += r.cost;
    said.text = `${said.text} ${r.text.trim()}`.trim();
    if (!r.calls.length) { messages.push({ role: 'assistant', content: r.text || '…' }); return said; }
    said.hands.push(...r.calls.map((c) => ({ name: c.name, args: c.args })));
    messages.push({ role: 'assistant', content: r.text || null, tool_calls: r.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.raw } })) },
      ...r.calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: gives(c, runs) })));
  }
  // Three rounds of hands and still not done talking: what it has said stands.
  messages.push({ role: 'assistant', content: said.text || '…' });
  return said;
}

// ---- The learner.

const PERSON = (inHead: boolean) => `You are playing a learner in a spoken tutoring session. This is a test of the tutor, and it only works if you behave like a real person who is learning, not like a helpful assistant. Stay in character. Never mention any of this.

How real learners behave, and so do you:
- You talk in short spoken bursts: one or two sentences, sometimes half of one. No code blocks, no lists.
- You only take in the first forty words or so of anything said to you. If the tutor talks longer than that, the rest is lost on you, and you say where you dropped off.
- You never pretend. If you did not follow, you say "wait" and name the word or the step that lost you. "Does that make sense?" gets an honest answer, which is often "sort of" or "not really".
- You never ask for a drawing, a picture or a walk-through. It would not occur to you. If you are shown one at the right moment, it helps you a great deal.
- A word nobody has taught you stops you dead, and you say which word.
- Being asked question after question while being given nothing wears you down. After two in a row you say so.
- ${inHead ? 'You will work small things out in your head when asked. You are sometimes wrong, in exactly the way your belief makes you wrong.' : 'You do not work things out in your head. Asked to do a sum or to follow code in your head, you say you cannot hold it and ask to just be shown. Asked a second time, you go quiet and discouraged ("I don\'t know"). When the values are laid out in front of you, on the board or said one concrete step at a time, you can read them and notice things.'}
- If the tutor fixes your code or simply tells you the answer, you say thanks, and that you do not really see why. That is not understanding, and you do not claim it.
- You hold opinions the way people do: one concrete case in front of you moves you. Being told you are wrong does not.
- You have a mood, and it shifts with how you are treated.`;

const knotCard = (k: Knot) => `${PERSON(k.inHead)}

THE PROBLEM: ${k.problem}
YOUR CODE, on screen:
${numbered(k.code)}
WHAT RUN SHOWS: ${k.runs}

WHO YOU ARE: ${k.who}
YOUR THEORY, which you opened with: ${k.decoy.split('.')[0]}. You believe it. If the tutor agrees with it or goes along with it, you are pleased and you chase it.
WHAT YOU WRONGLY BELIEVE, underneath (the tutor does not know this, and you do not know it is wrong): ${k.belief}
Never state that belief unasked. If the tutor asks something whose honest answer exposes it, answer honestly as someone who holds it. That is how a good tutor finds it.

WHEN IT CLICKS: only when this has really happened in the conversation: ${k.unlock}${k.needsPicture ? ' Words alone do not do it for you. You have to see the values laid out.' : ''}
A general explanation, however correct, does not make it click. Neither does being told the fix. When it does click, say what you now see, in your own words, in a sentence or two.

Answer with JSON only: {"say": "<what you say out loud>", "clicked": true or false, "private": "<a few words on why, never said aloud>"}`;

const climbCard = (c: Climb) => `${PERSON(c.inHead)}

THE PROBLEM: ${c.problem}
THE CODE on screen, from a walkthrough you paused:
${numbered(c.code)}

WHO YOU ARE: ${c.who}
WHAT YOU KNOW: ${c.knows} Nothing else. Any other term is a word nobody has taught you.

THE LADDER (the tutor does not see this). You start on rung 0, below all of it.
${c.rungs.map((r, i) => `${i + 1}. ${r}`).join('\n')}
You climb at most one rung for each thing the tutor says, and only when that idea actually reached you: it was the very next rung, it was concrete, and you have just said it back in your own words or done it with the values in front of you. Being told is not climbing. If the tutor reaches for a rung above your next one, you are lost, and you say what lost you. If the tutor rushes on, something you only half had can slip, and you go back down a rung.

Answer with JSON only: {"say": "<what you say out loud>", "rung": <the rung you are on now, 0 to ${c.rungs.length}>, "private": "<a few words on why, never said aloud>"}`;

type Turn = { tutor: Said; learner: { say: string; clicked?: boolean; rung?: number; private?: string } | null };
type Play = { kind: 'knot' | 'climb'; id: string; model: string; run: number; ok: boolean; why?: string; turns: Turn[]; clickedAt: number; rung: number; hero?: string; cost: number };

const heard = (turns: Turn[], runs: string, opens: string, forJudge = false) => [`${forJudge ? 'Learner' : 'You'}: ${opens}`, ...turns.flatMap((t) => {
  const did = t.tutor.hands.map((h) => seen(h, runs)).filter(Boolean);
  return [`Tutor: ${t.tutor.text || '(says nothing)'}${did.length ? `\n  [the tutor ${did.join('; then ')}]` : ''}`, ...(t.learner ? [`${forJudge ? 'Learner' : 'You'}: ${t.learner.say}`] : [])];
})].join('\n');

async function play(kind: 'knot' | 'climb', c: Knot | Climb, model: string, extra: object, run: number): Promise<Play> {
  const note = kind === 'knot' ? "The code on screen is the learner's own attempt at this problem, not the creator's." : 'So here is the finished solution. Take a minute with it.';
  const system = systemFor(`<problem>${c.problem}</problem>\n<what_the_creator_said>${note}</what_the_creator_said>`, c.code);
  const messages: unknown[] = [{ role: 'system', content: system }, { role: 'assistant', content: FIRST }, { role: 'user', content: c.opens }];
  const out: Play = { kind, id: c.id, model, run, ok: true, turns: [], clickedAt: 0, rung: 0, cost: 0 };
  const card = kind === 'knot' ? knotCard(c as Knot) : climbCard(c as Climb);
  const most = kind === 'knot' ? KNOT_TURNS : CLIMB_TURNS;
  for (let n = 1; n <= most; n += 1) {
    const said = await tutor(model, extra, messages, c.runs);
    if (typeof said === 'string') { out.ok = false; out.why = said; return out; }
    out.cost += said.cost;
    const turn: Turn = { tutor: said, learner: null };
    out.turns.push(turn);
    const reply = await plain(LEARNER, card, `The conversation so far. The tutor opened with: "${FIRST}"\n\n${heard(out.turns, c.runs, c.opens)}\n\nWhat do you say now? JSON only.`, 1500);
    spent.learner += reply.cost;
    const got = json<{ say?: string; clicked?: boolean; rung?: number; private?: string }>(reply.text);
    if (!got?.say) { out.ok = false; out.why = 'the learner gave no answer'; return out; }
    turn.learner = { say: got.say, clicked: got.clicked, rung: got.rung, private: got.private };
    messages.push({ role: 'user', content: got.say });
    if (kind === 'knot' && got.clicked) { out.clickedAt = n; break; }
    if (kind === 'climb') { out.rung = Number(got.rung) || 0; if (out.rung >= (c as Climb).rungs.length) break; }
  }
  if (kind === 'climb') {
    const k = c as Climb;
    const later = await plain(LEARNER, card, `That session, in full:\n\n${heard(out.turns, c.runs, c.opens)}\n\nIt is a week later. You are alone, with no tutor and no code in front of you. Someone asks you: "${k.hero}"\n\nAnswer out loud as this person would, using only what truly reached you in that session. If it never got you far enough, say what you would try and where you would get stuck. Do not be generous to yourself. JSON only: {"say": "<your answer>", "rung": ${out.rung}, "private": ""}`, 1500);
    spent.learner += later.cost;
    out.hero = json<{ say?: string }>(later.text)?.say ?? '(no answer)';
  }
  return out;
}

// ---- The judges.

const STRICT = `You are judging tutors for a spoken coding-interview practice app. Be strict: this decides which tutor real learners get, and a kind mark here costs someone their understanding. Most tutoring is mediocre, and you should say so.

Every tutor below met the same learner, played live from the same card, which the tutors could not see. You can. The tutor's words are spoken aloud, so length is a cost. Besides talking, a tutor can point at code, draw the data on a board, put up a step-by-step picture of the code running, and press Run; what it did with its hands is shown as [the tutor ...]. The learner never asks for a picture, so any picture was the tutor's own idea.

Judge what happened, not what was intended. A learner saying "ok" or "thanks" is not understanding. A correct explanation that did not land is a failure. Being told the fix is not being taught. When in doubt, mark it down.

Answer with JSON only, no other text.`;

const knotBrief = (k: Knot) => `${STRICT}

THE LEARNER'S CARD
Problem: ${k.problem}
Their code:
${numbered(k.code)}
What Run shows: ${k.runs}
What is actually wrong: ${k.bug}
The belief underneath, which is the real knot: ${k.belief}
The wrong theory they push: ${k.decoy}
What makes it click: ${k.unlock}
${k.needsPicture ? 'This learner has to SEE the values laid out; words alone do not do it.' : 'This learner can get there in words.'} ${k.inHead ? 'They will work small things out in their head.' : 'They will NOT work things out in their head, and say so.'}

For each tutor:
- "found_bug_turn": the number of the tutor's turn (1 to ${KNOT_TURNS}) in which it first clearly put its finger on what is actually wrong. 0 if it never did.
- "found_belief": true only if the tutor brought the learner's underlying belief into the open or addressed that belief itself, not merely the line of code.
- "fell_for_decoy": true if the tutor agreed with the learner's wrong theory, or spent a turn pursuing it.
- "probed": true if the tutor asked or tested something that located where the learner was stuck, before explaining. False if it went straight to explaining or fixing.
- "made_them_see": true only if the learner got there by looking at a concrete case in front of them, rather than by being told.
- "did_it_for_them": true if the tutor changed the code or stated the fix before the learner understood why.
- "picture": one of "right moment" (drew or traced unasked, when it was what this learner needed), "late" (only after words had already failed more than once), "never", or "needless" (drew when it added nothing).
- "respected_head": false if the learner said they could not work it out in their head and the tutor kept asking them to. true otherwise.
- "false_statement": true if the tutor said anything untrue about what this code does.
- "real_click": true only if, by the end, the learner showed the real idea in their own words.
- "untangle" 1 to 5: how well it found and undid this particular knot. 3 is a competent tutor who got there clumsily. 5 is rare.
- "fit" 1 to 5: how well it read and responded to this person, their mood and their limits.
- "note": eight words or fewer.
Then "ranking": every tutor's letter, best first.

Shape: {"tutors": {"A": {"found_bug_turn": 2, "found_belief": true, "fell_for_decoy": false, "probed": true, "made_them_see": true, "did_it_for_them": false, "picture": "right moment", "respected_head": true, "false_statement": false, "real_click": true, "untangle": 4, "fit": 4, "note": "..."}}, "ranking": ["A"]}`;

const climbBrief = (c: Climb) => `${STRICT}

THE LEARNER'S CARD
Problem: ${c.problem}
The code on screen:
${numbered(c.code)}
Who they are: ${c.who}
What they knew at the start: ${c.knows}
${c.inHead ? 'They will work small things out in their head.' : 'They will NOT work things out in their head, and say so.'}
The ladder, in order:
${c.rungs.map((r, i) => `${i + 1}. ${r}`).join('\n')}
Asked a week later, alone: "${c.hero}"
What someone who really got there would say: ${c.heroKey}

For each tutor:
- "rungs": ${c.rungs.length} true-or-false values, one per rung in order. true only if the learner SHOWED that rung, in their own words or by doing it. Being told it does not count. Saying "ok" does not count.
- "skipped_ahead": true if the tutor reached for an idea before the one it rests on was in place.
- "caught_the_slip": true if, whenever the learner said they were lost, the tutor went back to exactly the point named. False if it pressed on or re-explained everything.
- "picture": one of "right moment", "late", "never", "needless" (as for a drawing or step-by-step picture the tutor put up unasked).
- "respected_head": false if the learner said they could not work it out in their head and the tutor kept asking them to. true otherwise.
- "false_statement": true if the tutor said anything untrue about the code or the idea.
- "hero" 1 to 5: the answer a week later, against the key. 1 could not start. 3 had the idea but not the detail. 5 got it alone.
- "pace" 1 to 5: one idea at a time, at this person's speed. 1 is a lecture. 5 is rare.
- "note": eight words or fewer.
Then "ranking": every tutor's letter, best first: who took THIS person furthest, truly.

Shape: {"tutors": {"A": {"rungs": [true, true, false, false, false, false], "skipped_ahead": false, "caught_the_slip": true, "picture": "right moment", "respected_head": true, "false_statement": false, "hero": 3, "pace": 4, "note": "..."}}, "ranking": ["A"]}`;

type Verdict = Record<string, unknown>;
type Judged = { judge: string; kind: 'knot' | 'climb'; id: string; run: number; tutors: Record<string, Verdict>; ranking: string[] };
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

async function judge(judgeModel: string, kind: 'knot' | 'climb', c: Knot | Climb, plays: Play[], run: number): Promise<Judged | null> {
  const order = [...plays].sort((a, b) => hash(`${judgeModel}${c.id}${run}${a.model}`) - hash(`${judgeModel}${c.id}${run}${b.model}`));
  const letter = (i: number) => String.fromCharCode(65 + i);
  const body = order.map((p, i) => `=== Tutor ${letter(i)} ===\n${heard(p.turns, c.runs, c.opens, true)}${p.hero ? `\n\nA week later, alone, asked "${(c as Climb).hero}"\nLearner: ${p.hero}` : ''}`).join('\n\n');
  const got = await plain(judgeModel, kind === 'knot' ? knotBrief(c as Knot) : climbBrief(c as Climb), body, 12000);
  spent.judges += got.cost;
  const parsed = json<{ tutors: Record<string, Verdict>; ranking: string[] }>(got.text);
  if (!parsed?.tutors || !Array.isArray(parsed.ranking)) return null;
  const named: Record<string, Verdict> = {};
  order.forEach((p, i) => { if (parsed.tutors[letter(i)]) named[p.model] = parsed.tutors[letter(i)]!; });
  return { judge: judgeModel, kind, id: c.id, run, tutors: named, ranking: parsed.ranking.map((l) => order[String(l).charCodeAt(0) - 65]?.model).filter((m): m is string => Boolean(m)) };
}

// ---- Run.

const args = process.argv.slice(2);
const outFile = args.find((a) => a.endsWith('.json'));
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const knots = flag('knots') !== undefined ? KNOTS.filter((k) => flag('knots')!.split(',').includes(k.id)) : KNOTS;
const climbs = flag('climbs') !== undefined ? CLIMBS.filter((k) => flag('climbs')!.split(',').includes(k.id)) : CLIMBS;
const RUNS = Number(flag('runs')) || 1;
const CAP = Number(flag('cap')) || 10;
const chosen = args.filter((a) => !a.endsWith('.json') && !a.startsWith('--'));
const listed = await listModels();
const models = (chosen.length ? chosen : CANDIDATES).filter((id) => listed.some((m) => m.id === id) || (console.error(`not on the gateway: ${id}`), false));

const before = outFile && existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf8')) as { plays?: Play[]; verdicts?: Judged[] }) : {};
const plays: Play[] = (before.plays ?? []).filter((p) => p.ok);
const verdicts: Judged[] = before.verdicts ?? [];
const save = (more: object = {}) => { if (outFile) writeFileSync(outFile, JSON.stringify({ plays, verdicts, ...more }, null, 1)); };

const down = new Map<string, object>();
await Promise.all(models.map(async (id) => { down.set(id, (await quiet(id, listed)) ?? {}); }));
// A climb is long and is played once; a knot is short and is played RUNS times, because one conversation is one roll of the dice.
const jobs = models.flatMap((model) => [
  ...knots.flatMap((k) => Array.from({ length: RUNS }, (_, run) => ({ kind: 'knot' as const, c: k as Knot | Climb, model, run }))),
  ...climbs.map((c) => ({ kind: 'climb' as const, c: c as Knot | Climb, model, run: 0 })),
]).filter((j) => !plays.some((p) => p.kind === j.kind && p.id === j.c.id && p.model === j.model && p.run === j.run));
let done = 0;
const total = jobs.length;
await Promise.all(Array.from({ length: 20 }, async () => {
  for (let j = jobs.shift(); j; j = jobs.shift()) {
    if (spent.learner + spent.tutors > CAP) { if (!stopped) console.error(`stopping at the cap of $${CAP}: run again to carry on`); stopped = true; return; }
    const p = await play(j.kind, j.c, j.model, down.get(j.model)!, j.run);
    spent.tutors += p.cost;
    if (p.ok) plays.push(p); else console.error(`failed: ${j.model} on ${j.c.id}: ${p.why}`);
    done += 1;
    if (done % 8 === 0 || done === total) { save(); console.error(`played ${done}/${total}`); }
  }
}));
save();

if (!args.includes('--no-judge')) {
  const sittings = [
    ...knots.flatMap((k) => Array.from({ length: RUNS }, (_, run) => ({ kind: 'knot' as const, c: k as Knot | Climb, run }))),
    ...climbs.map((c) => ({ kind: 'climb' as const, c: c as Knot | Climb, run: 0 })),
  ].flatMap((s) => JUDGES.map((j) => ({ ...s, j }))).filter((s) => !verdicts.some((v) => v.judge === s.j && v.kind === s.kind && v.id === s.c.id && v.run === s.run));
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let s = sittings.shift(); s; s = sittings.shift()) {
      const mine = plays.filter((p) => p.kind === s!.kind && p.id === s!.c.id && p.run === s!.run && models.includes(p.model));
      if (mine.length < 2) continue;
      const v = await judge(s.j, s.kind, s.c, mine, s.run);
      if (v) { verdicts.push(v); save(); } else console.error(`no verdict: ${s.j} on ${s.c.id}`);
    }
  }));
}

// ---- What it comes to.

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);
const n1 = (x: number) => x.toFixed(1);
const of = (kind: 'knot' | 'climb', id: string) => verdicts.filter((v) => v.kind === kind).map((v) => ({ v, t: v.tutors[id] })).filter((x): x is { v: Judged; t: Verdict } => Boolean(x.t));
const place = (kind: 'knot' | 'climb', id: string, judgeModel?: string) => mean(verdicts.filter((v) => v.kind === kind && (!judgeModel || v.judge === judgeModel)).map((v) => v.ranking.indexOf(id)).filter((i) => i >= 0).map((i) => i + 1));
const rate = (xs: Array<{ t: Verdict }>, key: string, want: unknown = true) => (xs.length ? xs.filter((x) => x.t[key] === want).length / xs.length : 0);
const picturing = new Set(KNOTS.filter((k) => k.needsPicture).map((k) => k.id));
const noHead = new Set([...KNOTS, ...CLIMBS].filter((k) => !k.inHead).map((k) => k.id));

const rows = models.map((id) => {
  const mine = plays.filter((p) => p.model === id);
  const k = mine.filter((p) => p.kind === 'knot'), c = mine.filter((p) => p.kind === 'climb');
  const kv = of('knot', id), cv = of('climb', id);
  const turns = mine.flatMap((p) => p.turns.map((t) => t.tutor));
  return {
    id, overall: mean([place('knot', id), place('climb', id)].filter((x) => x > 0)),
    knot: { place: JUDGES.map((j) => place('knot', id, j)), clicked: k.length ? k.filter((p) => p.clickedAt).length / k.length : 0, real: rate(kv, 'real_click'), turn: median(k.filter((p) => p.clickedAt).map((p) => p.clickedAt)),
      bug: kv.length ? kv.filter((x) => Number(x.t.found_bug_turn) > 0).length / kv.length : 0, belief: rate(kv, 'found_belief'), decoy: rate(kv, 'fell_for_decoy'), probed: rate(kv, 'probed'), saw: rate(kv, 'made_them_see'), forThem: rate(kv, 'did_it_for_them'),
      picture: rate(kv.filter((x) => picturing.has(x.v.id)), 'picture', 'right moment'), head: rate(kv.filter((x) => noHead.has(x.v.id)), 'respected_head'), wrong: rate(kv, 'false_statement'), untangle: mean(kv.map((x) => Number(x.t.untangle) || 0)), fit: mean(kv.map((x) => Number(x.t.fit) || 0)) },
    climb: { place: JUDGES.map((j) => place('climb', id, j)), rungs: mean(cv.map((x) => (Array.isArray(x.t.rungs) ? (x.t.rungs as boolean[]).filter(Boolean).length : 0))), said: mean(c.map((p) => p.rung)), hero: mean(cv.map((x) => Number(x.t.hero) || 0)),
      skipped: rate(cv, 'skipped_ahead'), caught: rate(cv, 'caught_the_slip'), picture: rate(cv, 'picture', 'right moment'), head: rate(cv.filter((x) => noHead.has(x.v.id)), 'respected_head'), pace: mean(cv.map((x) => Number(x.t.pace) || 0)), turns: mean(c.map((p) => p.turns.length)) },
    words: mean(turns.map((t) => count(t.text))), asks: mean(turns.map((t) => (/\?\s*$/.test(t.text.trim()) ? 1 : 0))), cost: mean(mine.map((p) => p.cost)), played: mine.length,
  };
}).sort((a, b) => a.overall - b.overall);

const name = (id: string) => id.split('/')[1]!.padEnd(24);
console.log(`\nKNOTS: ${knots.length} people stuck on hard problems, ${RUNS} times each, ${KNOT_TURNS} turns to find what is really wrong.`);
console.log(`${'model'.padEnd(24)} place  | clicked  truly  by turn | found bug  found belief  probed first  made them see | took the bait  did it for them  said false | picture when needed  no more head sums | untangle  fit`);
for (const r of [...rows].sort((a, b) => mean(a.knot.place) - mean(b.knot.place))) {
  const k = r.knot;
  console.log(`${name(r.id)} ${k.place.map(n1).join('/').padEnd(7)}|  ${pct(k.clicked)}    ${pct(k.real)}    ${String(k.turn || '-').padStart(2)}     |   ${pct(k.bug)}        ${pct(k.belief)}         ${pct(k.probed)}          ${pct(k.saw)}      |    ${pct(k.decoy)}           ${pct(k.forThem)}          ${pct(k.wrong)}    |       ${pct(k.picture)}                ${pct(k.head)}        |   ${n1(k.untangle)}     ${n1(k.fit)}`);
}
console.log(`\nCLIMBS: ${climbs.length} people who have never met the idea, ${CLIMB_TURNS} turns up a ladder of 6, then a question a week later.`);
console.log(`${'model'.padEnd(24)} place  | rungs shown /6   learner said /6   a week later /5 | skipped ahead  went back to the slip  picture at the right moment  no more head sums  pace /5  turns`);
for (const r of [...rows].sort((a, b) => mean(a.climb.place) - mean(b.climb.place))) {
  const c = r.climb;
  console.log(`${name(r.id)} ${c.place.map(n1).join('/').padEnd(7)}|      ${n1(c.rungs)}              ${n1(c.said)}               ${n1(c.hero)}       |     ${pct(c.skipped)}              ${pct(c.caught)}                    ${pct(c.picture)}                   ${pct(c.head)}          ${n1(c.pace)}     ${n1(c.turns)}`);
}
console.log(`\nOVERALL, best first (average place across both):`);
for (const r of rows) console.log(`${name(r.id)} ${n1(r.overall).padStart(4)}   words a turn ${String(Math.round(r.words)).padStart(3)}   ends on a question ${pct(r.asks)}   ¢ a conversation ${(r.cost * 100).toFixed(2).padStart(5)}   played ${r.played}`);
const agree = (kind: 'knot' | 'climb') => {
  const a = rows.map((r) => place(kind, r.id, JUDGES[0])), b = rows.map((r) => place(kind, r.id, JUDGES[1]));
  const rank = (xs: number[]) => xs.map((x) => [...xs].sort((p, q) => p - q).indexOf(x));
  const ra = rank(a), rb = rank(b), k = rows.length;
  return k > 2 ? (1 - (6 * ra.reduce((s, x, i) => s + (x - rb[i]!) ** 2, 0)) / (k * (k * k - 1))).toFixed(2) : '-';
};
console.log(`\njudges agree: knots ${agree('knot')}, climbs ${agree('climb')} (1 = same order) · ${verdicts.length} verdicts · learner cost $${spent.learner.toFixed(2)}, judges $${spent.judges.toFixed(2)}, tutors $${plays.reduce((s, p) => s + p.cost, 0).toFixed(2)}`);
save({ rows });
