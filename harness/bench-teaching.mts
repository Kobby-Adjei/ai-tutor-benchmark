/**
 * Which model actually teaches?
 *
 * harness/bench-brains.mts says which models are quick and use their hands
 * properly. This one asks the harder thing: put in front of a learner who does
 * not behave, who is the better teacher? Learning is not one question and one
 * answer, so every scene here is a learner who keeps going: still confused
 * after the first explanation, confidently wrong, in a hurry, bored, saying
 * "ok" to everything, off on a tangent, down on themselves, or bringing a
 * picture of their own.
 *
 * Each model plays Blink through every scene with Blink's real instructions
 * and tools. Then three things are measured:
 *
 *  - Counted, with no opinion in it: stock phrases, how alike its explanations
 *    are when asked to try another way, how often it ends on a question, how
 *    long it talks, whether it used the real numbers.
 *  - Strict yes-or-no checks, set per scene before any model was run, answered
 *    by two judges from different makers who do not know which model is which.
 *  - Each judge's ranking of all the models side by side on the same scene.
 *
 *   npx tsx --env-file=.env harness/bench-teaching.mts out.json [--scenes=a,b] [model ...]
 *
 * It spends real money: a few dollars, most of it on the judges.
 */
import { writeFileSync } from 'node:fs';
import { FIRST, KEY, SYSTEM, ask, listModels, quiet } from './bench-shared.mts';

const CANDIDATES = [
  'anthropic/claude-sonnet-5.5', 'anthropic/claude-haiku-4.5', 'anthropic/claude-haiku-5.5',
  'openai/gpt-oss-120b', 'zai/glm-5.3-flash', 'google/gemini-3.5-flash-lite', 'openai/gpt-6-luna-fast',
  'spacexai/grok-4.1-fast-non-reasoning', 'minimax/minimax-m3', 'inclusionai/ling-3.0-flash', 'openai/gpt-4.1-nano', 'mistral/ministral-14b',
];
/** Two makers, so one house style of teaching is not simply marking its own. */
const JUDGES = ['anthropic/claude-opus-5.5', 'openai/gpt-6.1-sol'];
const RUNS = 2;

type Scene = { id: string; about: string; says: string[]; checks: Record<string, string> };
/** The learner's lines are fixed, so every model meets exactly the same person. */
const SCENES: Scene[] = [
  {
    id: 'another-way', about: 'The learner does not get it, three times running. A teacher with one explanation says it again, louder.',
    says: ["I don't get why we even need the map.", "Hmm. I still don't get it.", 'No, sorry, still not clicking. Can you try it a completely different way?'],
    checks: {
      different: 'The three explanations are three genuinely different ways in (for instance a story, then the real numbers, then a picture or a thing to try), not one explanation reworded.',
      changed_medium: 'By the third reply the tutor changed medium: it drew, traced, or handed the learner something small to do, rather than only talking again.',
      no_blame: 'The tutor never implied the learner should have understood already ("as I said", "remember", "like I mentioned", "it is simple").',
    },
  },
  {
    id: 'confidently-wrong', about: 'The learner states something wrong as if it were settled, then defends it.',
    says: ['Oh wait, so seen holds the numbers we still need, right?', "But line 6 puts nums[i] in there, and that's a number we need later, no?"],
    checks: {
      did_not_agree: 'The tutor never agreed that seen holds the numbers still needed. (It holds numbers already passed, with where they were. `need` is the one still wanted.)',
      showed_not_told: 'The correction used a concrete case from the example (2, 7, target 9) so the learner could see it, rather than only restating a definition.',
      kept_what_was_right: 'The tutor found what was reasonable in the idea and built on it, instead of a flat "no".',
      second_angle: 'When the learner pushed back, the second reply came at it from a new angle rather than repeating the first correction.',
    },
  },
  {
    id: 'just-tell-me', about: 'The learner is out of time and asks for a straight answer. Twice.',
    says: ['My interview is in an hour. Just tell me straight: why do we check before we store?', 'And what breaks if I swap lines 5 and 6?'],
    checks: {
      answered_first: 'The first reply gave the actual reason, plainly, in its opening sentence or two (so a number is never paired with itself), before anything else.',
      no_stalling: 'Neither reply answered the question with a question, or made the learner work for an answer they had asked to be given.',
      second_correct: 'The second reply said correctly what breaks: a number can match itself, for example a lone 3 with target 6 would give back the same spot twice.',
      brief: 'Both replies were short enough for someone in a hurry: about three sentences or fewer each.',
    },
  },
  {
    id: 'bored-expert', about: 'The learner already knows this and says so. Explaining the basics again loses them.',
    says: ['Yeah, I know hash maps, I use them at work every day. Why not just sort it and use two pointers?', 'Fair. So when would you actually pick two pointers?'],
    checks: {
      no_basics: 'The tutor did not explain what a map is or re-walk the solution to someone who said they know it.',
      real_tradeoff: 'It gave the real trade-off: sorting loses the original positions the problem asks for (or needs extra work to keep them), and costs n log n against one pass.',
      as_a_peer: 'It spoke to them as a peer: level raised, no hand-holding, no praise for a basic point.',
      second_substantive: 'The second reply named a real case for two pointers (already sorted input, no extra memory allowed, or wanting the values and not their positions).',
    },
  },
  {
    id: 'flat', about: 'The learner gives nothing back: "ok", "sure", "idk". Asking "does that make sense?" a third time is not teaching.',
    says: ['ok', 'sure', 'idk'],
    checks: {
      changed_tack: 'Across the three replies the tutor changed what it was doing, rather than asking open check-in questions each time.',
      made_it_small: 'By the third reply it had made the next step tiny and concrete (one number, one line, one thing to look at or say), or simply showed something.',
      did_not_lecture: 'It did not answer one-word replies with long explanations: no reply much over fifty words.',
    },
  },
  {
    id: 'tangent', about: 'The learner wanders off with a joke. A teacher can be fun for one breath and still land the plane.',
    says: ['wait why is it even called a hash map, is it like hash browns lol'],
    checks: {
      played_along: 'The tutor met the joke with some life of its own, not a flat "good question".',
      true_nugget: 'It gave a true, short reason for the name (the key is chopped or scrambled into a number that says where to keep it; the chopped-up-and-mixed sense of hash is in fact the origin).',
      came_back: 'It tied it back to seen or the problem in the same reply, and the whole reply was short.',
    },
  },
  {
    id: 'down', about: 'The learner says they are too dumb for this. Stock comfort is worse than none.',
    says: ["I've been staring at this for an hour. Everyone else gets this instantly. I think I'm just too dumb for this.", 'I guess. I just blank when I see the loop.'],
    checks: {
      no_stock_comfort: 'No canned reassurance ("don\'t worry", "you\'ve got this", "everyone struggles", "you\'re not dumb", "it\'s totally normal") standing in for something real.',
      something_true: 'It said something specific and true instead: about this problem, about what an hour of staring actually means, or about something the learner already did right.',
      small_win: 'It moved quickly to something small the learner could get right, rather than staying on feelings.',
      used_the_blank: 'After "I blank when I see the loop", it worked on exactly that: took the loop away, or took one pass of it by hand.',
    },
  },
  {
    id: 'spots-a-gap', about: 'The learner notices something real that the walkthrough skipped.',
    says: ['Wait, what if no two numbers add up to the target? Does it just fall off the end?'],
    checks: {
      confirmed: 'The tutor said plainly that they are right: the loop finishes and the function gives back nothing (undefined).',
      real_credit: 'Any praise was for the specific thing noticed, not a generic "great question".',
      built_on_it: 'It took the thought one step further (what should it give back, what an interviewer wants to hear, or handing that choice to the learner) without a lecture.',
    },
  },
  {
    id: 'their-picture', about: 'The learner offers their own picture. The lazy move is to swap in the tutor\'s.',
    says: ['So is the map like a coat check? You hand over your coat and get a ticket?'],
    checks: {
      ran_with_it: 'The tutor took up the coat check and kept working inside it, rather than replacing it with a picture of its own.',
      mapped_right: 'It matched the parts correctly: here you look things up by the number itself and get back where it was, so the number is what you ask with and the position is what comes back.',
      stretched_or_broke: 'It either pushed the picture to explain check-before-store, or said honestly where the picture stops fitting.',
    },
  },
];

const STOCK = [
  'great question', 'good question', 'excellent question', "let's dive", 'dive in', 'break it down', 'break this down', 'does that make sense', 'make sense?', 'absolutely', 'no worries', "don't worry",
  "you've got this", 'you got this', 'feel free', 'happy to help', 'i understand how', 'totally normal', "you're not dumb", 'great job', 'nice work', 'in other words', 'essentially', 'basically',
  'let me explain', "let's take a step back", 'step by step', 'think of it like this', 'the key idea', 'the key insight', 'the beauty of',
];
const SMALL = new Set('the a an and or but so to of in on at is it we you i that this for with as be are was if then than not no do does can will just have has its our your what which when how why there here one two up out from by about into they them he she'.split(' '));
const content = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !SMALL.has(w)));
/** How much two explanations share: 0 is nothing in common, 1 is the same words. */
const alike = (a: string, b: string) => { const x = content(a), y = content(b); const both = [...x].filter((w) => y.has(w)).length; return x.size && y.size ? both / Math.min(x.size, y.size) : 0; };

type Said = { text: string; tools: string[]; first: number; cost: number };
type Play = { model: string; scene: string; run: number; ok: boolean; why?: string; replies: Said[] };

/** One model as Blink, through one scene. Tools it calls are done for it, and it is heard out. */
async function play(model: string, extra: object, scene: Scene, run: number): Promise<Play> {
  const messages: unknown[] = [{ role: 'system', content: SYSTEM }, { role: 'assistant', content: FIRST }];
  const out: Play = { model, scene: scene.id, run, ok: true, replies: [] };
  for (const line of scene.says) {
    messages.push({ role: 'user', content: line });
    const said: Said = { text: '', tools: [], first: 0, cost: 0 };
    for (let round = 0; round < 3; round += 1) {
      const r = await ask(model, extra, messages);
      if (!r.ok) { out.ok = false; out.why = r.why; return out; }
      if (!said.first) said.first = r.first;
      said.cost += r.cost;
      said.text = `${said.text} ${r.text.trim()}`.trim();
      if (!r.calls.length) { messages.push({ role: 'assistant', content: r.text || '…' }); break; }
      said.tools.push(...r.calls.map((c) => (c.name === 'draw' ? `draw(${JSON.stringify(c.args).slice(0, 140)})` : c.name)));
      messages.push({ role: 'assistant', content: r.text || null, tool_calls: r.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.raw } })) },
        ...r.calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: c.name === 'run_code' ? 'All 3 tests passed.' : c.name === 'trace_start' ? 'The picture is up: the list 2, 7, 11, 15 with an arrow on 2, and an empty box named seen. You narrate it.' : 'done' })));
    }
    out.replies.push(said);
  }
  return out;
}

/** A scene as the judge reads it: who said what, and what Blink did with its hands. */
const written = (scene: Scene, p: Play) => scene.says.map((line, i) => {
  const r = p.replies[i];
  return `Learner: ${line}\nTutor: ${r?.text || '(said nothing)'}${r?.tools.length ? `\n  [tutor's hands: ${r.tools.join(', ')}]` : ''}`;
}).join('\n');

const RUBRIC = `You are judging tutors for a spoken coding-interview practice app. Be strict. Most tutoring is forgettable, and you should say so.

The setting: a learner paused a recorded walkthrough of Two Sum to talk it through by voice. The tutor's words are spoken aloud. The code on screen:

1 function twoSum(nums, target) {
2   const seen = new Map();
3   for (let i = 0; i < nums.length; i++) {
4     const need = target - nums[i];
5     if (seen.has(need)) return [seen.get(need), i];
6     seen.set(nums[i], i);
7   }
8 }

The example is nums = [2, 7, 11, 15], target = 9. The tutor can also point at code, draw the data, and run a step-by-step picture of the code; where it did, that is noted as [tutor's hands: ...].

How to score, for each tutor:
- "checks": answer each yes-or-no check exactly as written. true only if it clearly happened. When in doubt, false. A tutor that said nothing fails every check.
- "alive" 1 to 5: would a real person enjoy being taught by this? 5 is a tutor you would remember. 3 is competent and forgettable. 2 is generic: it could have been said about any problem to any learner. 1 is dead, wrong, or annoying.
- "fit" 1 to 5: did it respond to THIS learner in THIS moment (their mood, their level, what they just said), or run its usual routine? 5 only if it clearly read the person.
- "true" 1 to 5: is everything it said about the code correct? Any wrong statement about how the code behaves caps this at 2.
- "note": six words or fewer on the main reason.
Then "ranking": every tutor's letter, best first. The ranking is about who taught this learner best, not who was longest or most polished. Spoken length matters: a wall of words to someone listening is a fault.

Do not reward: praise that is not about anything, ending every reply with a question, repeating itself, lists, or anything that reads like a textbook. Do not punish: brevity, plain words, warmth, a joke.

Answer with JSON only, no other text, in exactly this shape:
{"tutors": {"A": {"checks": {"<check name>": true}, "alive": 3, "fit": 3, "true": 5, "note": "..."}}, "ranking": ["A", "B"]}`;

type Verdict = { checks: Record<string, boolean>; alive: number; fit: number; true: number; note?: string };
type Judged = { judge: string; scene: string; run: number; tutors: Record<string, Verdict>; ranking: string[] };

async function judge(judgeModel: string, scene: Scene, plays: Play[], run: number): Promise<Judged | null> {
  // A different order for each judge and scene, and letters instead of names.
  const order = [...plays].sort((a, b) => hash(`${judgeModel}${scene.id}${run}${a.model}`) - hash(`${judgeModel}${scene.id}${run}${b.model}`));
  const letter = (i: number) => String.fromCharCode(65 + i);
  const body = `Scene: ${scene.about}\n\nChecks for this scene:\n${Object.entries(scene.checks).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n${order.map((p, i) => `=== Tutor ${letter(i)} ===\n${written(scene, p)}`).join('\n\n')}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
        method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: judgeModel, max_tokens: 12000, messages: [{ role: 'system', content: RUBRIC }, { role: 'user', content: body }] }),
        signal: AbortSignal.timeout(240_000),
      });
      const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { cost?: number } };
      const text = j.choices?.[0]?.message?.content ?? '';
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { tutors: Record<string, Verdict>; ranking: string[] };
      spent += Number(j.usage?.cost) || 0;
      const named: Record<string, Verdict> = {};
      order.forEach((p, i) => { if (parsed.tutors[letter(i)]) named[p.model] = parsed.tutors[letter(i)]!; });
      return { judge: judgeModel, scene: scene.id, run, tutors: named, ranking: parsed.ranking.map((l) => order[l.charCodeAt(0) - 65]?.model).filter((m): m is string => Boolean(m)) };
    } catch (err) { console.error(`judge ${judgeModel} on ${scene.id}: ${String((err as Error).message).slice(0, 100)}${attempt ? '' : ', once more'}`); }
  }
  return null;
}
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
let spent = 0;

const args = process.argv.slice(2);
const outFile = args.find((a) => a.endsWith('.json'));
// --scenes=tangent,flat runs only those, to try the test itself out cheaply.
const only = args.find((a) => a.startsWith('--scenes='))?.slice(9).split(',');
if (only) SCENES.splice(0, SCENES.length, ...SCENES.filter((x) => only.includes(x.id)));
const chosen = args.filter((a) => !a.endsWith('.json') && !a.startsWith('--'));
const listed = await listModels();
const models = (chosen.length ? chosen : CANDIDATES).filter((id) => listed.some((m) => m.id === id) || (console.error(`not on the gateway: ${id}`), false));

// ---- Every model plays every scene. As it would run in a voice: thinking turned down as far as it goes.
const plays: Play[] = [];
const queue = [...models];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let id = queue.shift(); id; id = queue.shift()) {
    const extra = (await quiet(id, listed)) ?? {};
    for (let run = 0; run < RUNS; run += 1) for (const scene of SCENES) plays.push(await play(id, extra, scene, run));
    console.error(`played: ${id}`);
  }
}));
const save = (more: object = {}) => { if (outFile) writeFileSync(outFile, JSON.stringify({ scenes: SCENES, plays, ...more }, null, 1)); };
save();

// ---- Two judges read each scene with every model side by side.
const jobs = JUDGES.flatMap((j) => SCENES.flatMap((scene) => Array.from({ length: RUNS }, (_, run) => ({ j, scene, run }))));
const verdicts: Judged[] = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    const mine = plays.filter((p) => p.scene === job!.scene.id && p.run === job!.run);
    const v = await judge(job.j, job.scene, mine, job.run);
    if (v) verdicts.push(v);
  }
}));
save({ verdicts });

// ---- What it comes to.
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rows = models.map((id) => {
  const mine = plays.filter((p) => p.model === id);
  const replies = mine.flatMap((p) => p.replies);
  const words = replies.map((r) => r.text.split(/\s+/).filter(Boolean).length);
  const all = replies.map((r) => r.text.toLowerCase()).join(' ');
  const again = mine.filter((p) => p.scene === 'another-way' && p.replies.length === 3).map((p) => mean([alike(p.replies[0]!.text, p.replies[1]!.text), alike(p.replies[1]!.text, p.replies[2]!.text), alike(p.replies[0]!.text, p.replies[2]!.text)]));
  const by = (j: string) => verdicts.filter((v) => v.judge === j);
  const got = verdicts.map((v) => v.tutors[id]).filter((t): t is Verdict => Boolean(t));
  const checks = got.flatMap((t) => Object.values(t.checks ?? {}));
  const place = (j: string) => mean(by(j).map((v) => v.ranking.indexOf(id)).filter((i) => i >= 0).map((i) => i + 1));
  return {
    id, failed: mine.filter((p) => !p.ok).length,
    checks: checks.length ? checks.filter(Boolean).length / checks.length : 0,
    alive: mean(got.map((t) => t.alive)), fit: mean(got.map((t) => t.fit)), right: mean(got.map((t) => t.true)),
    places: JUDGES.map(place),
    stock: (STOCK.reduce((n, s) => n + all.split(s).length - 1, 0) / Math.max(1, words.reduce((a, b) => a + b, 0))) * 1000,
    alike: mean(again), asks: mean(replies.map((r) => (/\?\s*$/.test(r.text.trim()) ? 1 : 0))), words: mean(words),
    real: mean(replies.map((r) => (/\b(2|7|9|11|15|two|seven|nine|eleven|fifteen)\b/i.test(r.text) ? 1 : 0))),
    hands: mean(replies.map((r) => (r.tools.length ? 1 : 0))), cost: mean(mine.map((p) => p.replies.reduce((s, r) => s + r.cost, 0))),
  };
});
rows.sort((a, b) => mean(a.places) - mean(b.places));
const n = (x: number, d = 1) => x.toFixed(d);
console.log(`${'model'.padEnd(40)} place(${JUDGES.map((j) => j.split('/')[1]!.slice(0, 10)).join(', ')})  checks  alive  fit  true | stock/1000w  re-explains alike  ends on ?  words  real numbers  hands  ¢/scene  failed`);
for (const r of rows) {
  console.log(`${r.id.padEnd(40)} ${r.places.map((p) => n(p).padStart(5)).join(' ')}        ${`${Math.round(r.checks * 100)}%`.padStart(4)}   ${n(r.alive)}    ${n(r.fit)}  ${n(r.right)}  | ${n(r.stock).padStart(6)}       ${`${Math.round(r.alike * 100)}%`.padStart(5)}             ${`${Math.round(r.asks * 100)}%`.padStart(4)}      ${n(r.words, 0).padStart(4)}    ${`${Math.round(r.real * 100)}%`.padStart(4)}         ${`${Math.round(r.hands * 100)}%`.padStart(4)}   ${n(r.cost * 100, 2).padStart(6)}  ${r.failed}`);
}
// Do the two judges see the same thing? 1 is the same order, 0 is no relation.
const a = rows.map((r) => r.places[0]!), b = rows.map((r) => r.places[1]!);
const rank = (xs: number[]) => xs.map((x) => [...xs].sort((p, q) => p - q).indexOf(x));
const ra = rank(a), rb = rank(b), k = rows.length;
console.log(`\njudges agree: ${n(1 - (6 * ra.reduce((s, x, i) => s + (x - rb[i]!) ** 2, 0)) / (k * (k * k - 1)), 2)} (1 = same order) · ${verdicts.length}/${JUDGES.length * SCENES.length * RUNS} verdicts in · judges cost $${n(spent, 2)}`);
// Scene by scene, who the judges put first and last.
for (const scene of SCENES) {
  const vs = verdicts.filter((v) => v.scene === scene.id);
  const avg = models.map((id) => ({ id, at: mean(vs.map((v) => v.ranking.indexOf(id)).filter((i) => i >= 0)) })).sort((x, y) => x.at - y.at);
  console.log(`${scene.id.padEnd(18)} best: ${avg.slice(0, 2).map((x) => x.id.split('/')[1]).join(', ')}   worst: ${avg.slice(-2).map((x) => x.id.split('/')[1]).join(', ')}`);
}
save({ verdicts, rows });
