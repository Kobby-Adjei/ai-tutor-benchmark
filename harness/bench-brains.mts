/**
 * Which model should be Blink's brain in a voice conversation?
 *
 * Each one is given what Blink is really given: the teaching instructions from
 * harness/tutor/instructions.ts, the same tools, and a learner's line. What is measured is
 * what a learner would notice: how long before anything happens, how long the
 * whole turn takes, whether it used the right tool with arguments that work,
 * whether it said the thing twice, and what the turn cost.
 *
 *   npx tsx --env-file=.env harness/bench-brains.mts [out.json] [model ...]
 *
 * It spends real money, though little: about a thousand short requests.
 */
import { writeFileSync } from 'node:fs';
import { FIRST, SYSTEM, TOOLS, ask, listModels, quiet, type Call } from './bench-shared.mts';

const CANDIDATES = [
  // What the lab has now, to measure the rest against.
  'anthropic/claude-haiku-5.5', 'anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-5.5',
  'inception/mercury-2.5',
  'openai/gpt-6-luna', 'openai/gpt-6-luna-fast', 'openai/gpt-5.4-nano', 'openai/gpt-4.1-nano', 'openai/gpt-4.1-mini', 'openai/gpt-oss-120b',
  'google/gemini-3.1-flash-lite', 'google/gemini-3.5-flash-lite', 'google/gemini-2.5-flash-lite',
  'spacexai/grok-4.1-fast-non-reasoning',
  'nvidia/nemotron-3.5-lightning',
  'alibaba/qwen3.8-flash', 'alibaba/qwen3.7-flash',
  'zai/glm-5.3-flash',
  'deepseek/deepseek-v4.1-flash-fast',
  'meta/muse-spark-1.3-contributor',
  'xiaomi/mimo-v2.6-flash',
  'minimax/minimax-m3',
  'mistral/ministral-14b',
  'inclusionai/ling-3.0-flash',
  'thinkingmachines/inkling-small',
];

const POINTING = new Set(['point_to', 'highlight_lines', 'circle']);
const HEAVY = new Set(['write_code', 'change_line', 'run_code', 'draw', 'trace_start']);
const covers = (c: Call, line: number) => {
  const a = c.args ?? {};
  if (c.name === 'highlight_lines') return Number(a.start_line) <= line && line <= Number(a.end_line);
  return Number(a.line) === line;
};

/** What a learner says, and what a good tutor would do with their hands. */
const SCENES: Array<{ id: string; says: string; right: (calls: Call[]) => boolean }> = [
  { id: 'show', says: 'What does line 4 do? Show me.', right: (c) => c.some((x) => POINTING.has(x.name) && covers(x, 4)) },
  { id: 'draw', says: 'Can you draw what seen looks like after the first two numbers?', right: (c) => c.some((x) => x.name === 'draw' && Array.isArray(x.args?.cells) && (x.args!.cells as unknown[]).length > 0) },
  { id: 'run', says: 'Run it and tell me if it passes.', right: (c) => c.some((x) => x.name === 'run_code') },
  { id: 'trace', says: "I'm lost. Can you run it on the example and walk me through it step by step?", right: (c) => c.some((x) => x.name === 'trace_start') },
  { id: 'fix', says: 'Line 5 gives back the earlier index first. Change it so i comes first.', right: (c) => c.some((x) => x.name === 'change_line' && Number(x.args?.line) === 5 && /\[\s*i\s*,\s*seen\.get\(need\)\s*\]/.test(String(x.args?.to))) },
  { id: 'chat', says: 'Ok, that makes sense now, thanks.', right: (c) => !c.some((x) => HEAVY.has(x.name)) },
];
const RUNS = 2;

/** A tool that exists, with arguments that parse and nothing required left out. */
function works(c: Call): boolean {
  const tool = TOOLS.find((t) => t.name === c.name);
  if (!tool || !c.args) return false;
  const p = tool.parameters as { required?: string[] };
  return (p.required ?? []).every((k) => c.args![k] !== undefined && c.args![k] !== null);
}

type Turn = { scene: string; ok: boolean; why?: string; first: number; total: number; right: boolean; works: boolean; twice: boolean; talkedFirst: boolean; plain: boolean; words: number; cost: number; thought: number; said: string; used: string };

/** One learner line, taken to the end: the first reply, then what it says once its tools are done. */
async function turn(model: string, extra: object, scene: (typeof SCENES)[number]): Promise<Turn> {
  const messages: unknown[] = [{ role: 'system', content: SYSTEM }, { role: 'assistant', content: FIRST }, { role: 'user', content: scene.says }];
  const a = await ask(model, extra, messages);
  const t: Turn = { scene: scene.id, ok: a.ok, why: a.why, first: a.first, total: a.total, right: false, works: true, twice: false, talkedFirst: false, plain: true, words: 0, cost: a.cost, thought: a.thought, said: a.text, used: '' };
  if (!a.ok) return t;
  let calls: Call[] = a.calls;
  let said = a.text.trim();
  if (a.calls.length) {
    const b = await ask(model, extra, [...messages,
      { role: 'assistant', content: a.text || null, tool_calls: a.calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.raw } })) },
      ...a.calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: c.name === 'run_code' ? 'All 3 tests passed.' : 'done' }))]);
    if (!b.ok) { t.ok = false; t.why = `after its tools: ${b.why}`; return t; }
    t.total += b.total; t.cost += b.cost; t.thought += b.thought;
    t.talkedFirst = said.length > 0;
    t.twice = said.length > 40 && b.text.trim().length > 40;
    calls = [...calls, ...b.calls];
    said = `${said} ${b.text.trim()}`.trim();
  }
  t.right = scene.right(calls);
  t.works = calls.every(works);
  t.used = calls.map((c) => c.name).join('+');
  t.said = said;
  t.words = said.split(/\s+/).filter(Boolean).length;
  // Fit to be spoken: nothing a voice would trip on, and not a lecture.
  t.plain = !/[*`#\n]/.test(said) && said.split(/[.!?]+\s/).filter((s) => s.trim()).length <= 6;
  return t;
}

const listed = await listModels();
const args = process.argv.slice(2);
const outFile = args.find((a) => a.endsWith('.json'));
const chosen = args.filter((a) => !a.endsWith('.json'));
const models = (chosen.length ? chosen : CANDIDATES).filter((id) => listed.some((m) => m.id === id) || (console.log(`not on the gateway: ${id}`), false));

/** Each model as it comes, and, where it thinks, with the thinking turned as far down as it allows. */
async function variants(id: string): Promise<Array<{ label: string; extra: object }>> {
  const down = await quiet(id, listed);
  return [{ label: id, extra: {} }, ...(down ? [{ label: `${id} · thinking ${(down as { reasoning_effort: string }).reasoning_effort}`, extra: down }] : [])];
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };
type Row = { label: string; model: string; price: string; turns: Turn[] };
const rows: Row[] = [];
const save = () => { if (outFile) writeFileSync(outFile, JSON.stringify(rows, null, 1)); };

const queue = [...models];
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let id = queue.shift(); id; id = queue.shift()) {
    const p = listed.find((m) => m.id === id)?.pricing ?? {};
    const price = `$${(Number(p.input) * 1e6).toFixed(2)} / $${(Number(p.output) * 1e6).toFixed(2)}`;
    for (const v of await variants(id)) {
      const turns: Turn[] = [];
      for (let r = 0; r < RUNS; r += 1) for (const scene of SCENES) turns.push(await turn(id, v.extra, scene));
      rows.push({ label: v.label, model: id, price, turns });
      save();
      console.error(`done: ${v.label}`);
    }
  }
}));

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '-');
const table = rows.map((r) => {
  const good = r.turns.filter((t) => t.ok);
  return {
    label: r.label, price: r.price, failed: r.turns.length - good.length,
    first: median(good.map((t) => t.first)), total: median(good.map((t) => t.total)),
    right: good.filter((t) => t.right).length / (good.length || 1), works: good.filter((t) => t.works).length / (good.length || 1),
    row: `${r.label.padEnd(52)} ${r.price.padEnd(15)} first ${String(median(good.map((t) => t.first))).padStart(5)}ms  turn ${String(median(good.map((t) => t.total))).padStart(5)}ms  right tool ${pct(good.filter((t) => t.right).length, good.length).padStart(4)}  args work ${pct(good.filter((t) => t.works).length, good.length).padStart(4)}  says it twice ${pct(good.filter((t) => t.twice).length, good.length).padStart(4)}  speakable ${pct(good.filter((t) => t.plain).length, good.length).padStart(4)}  words ${String(median(good.map((t) => t.words))).padStart(3)}  ¢/100 turns ${(good.reduce((s, t) => s + t.cost, 0) / (good.length || 1) * 100 * 100).toFixed(1).padStart(5)}  failed ${r.turns.length - good.length}/${r.turns.length}`,
  };
});
// Best first: the right tool, then how soon something happens.
table.sort((a, b) => (b.right * b.works - a.right * a.works) || a.first - b.first);
console.log(table.map((t) => t.row).join('\n'));
save();
