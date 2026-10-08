/**
 * What the benchmarks share: the problem on screen, what the tutor is told
 * (harness/tutor), and one request to a model through the Vercel AI Gateway,
 * timed.
 */
import { instructions } from './tutor/instructions.ts';
import { plainTools } from './tutor/tools.ts';

// A key of its own if there is one, so a benchmark never spends a product's budget.
export const KEY = process.env.BENCH_GATEWAY_KEY || process.env.AI_GATEWAY_API_KEY;
if (!KEY) throw new Error('Neither BENCH_GATEWAY_KEY nor AI_GATEWAY_API_KEY is set');
export const GATEWAY = 'https://ai-gateway.vercel.sh/v1';

export const CODE = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
}`;
const MATERIAL = `<problem>Two Sum. Given a list of numbers and a target, return the indexes of the two numbers that add up to the target. Example: nums = [2, 7, 11, 15], target = 9 gives [0, 1].</problem>
<what_the_creator_said>So for each number I work out what I still need to reach the target, and I check whether I have already seen it. If I have, that is my pair. If not, I remember this number and where it was.</what_the_creator_said>`;
const SPOKEN = `

How you are heard: everything you write is spoken aloud by a voice. Write only the words to say, with no stage directions, no asterisks, no lists, and no line breaks. Keep a turn to two or three short sentences, and never more than five. Messages in (round brackets) are notes from the page, not something the learner said: act on them, never read them out.`;
/** What Blink is told when this is the sync on screen. */
export const systemFor = (material: string, code: string) => instructions(material, code) + SPOKEN;
export const SYSTEM = systemFor(MATERIAL, CODE);
export const FIRST = "Hey, I'm Blink. What do you make of this code so far, or where did it lose you?";

export type Call = { name: string; args: Record<string, unknown> | null };
export const TOOLS = plainTools();

export type Reply = { ok: boolean; why?: string; first: number; total: number; text: string; calls: Array<Call & { id: string; raw: string }>; cost: number; thought: number };

export async function ask(model: string, extra: object, messages: unknown[]): Promise<Reply> {
  const t0 = Date.now();
  const out: Reply = { ok: false, first: 0, total: 0, text: '', calls: [], cost: 0, thought: 0 };
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 1000, temperature: 0.4, stream: true, stream_options: { include_usage: true }, tools: TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })), messages, ...extra }),
      signal: AbortSignal.timeout(40_000),
    });
    if (!res.ok || !res.body) { out.why = `${res.status} ${(await res.text()).slice(0, 160)}`; out.total = Date.now() - t0; return out; }
    const parts: Array<{ id: string; name: string; raw: string }> = [];
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        let d: any;
        try { d = JSON.parse(line.slice(6)); } catch { continue; }
        if (d.error) { out.why = JSON.stringify(d.error).slice(0, 160); continue; }
        if (d.usage) { out.cost = Number(d.usage.cost) || 0; out.thought = Number(d.usage.completion_tokens_details?.reasoning_tokens) || 0; }
        const delta = d.choices?.[0]?.delta;
        if (!delta) continue;
        if ((delta.content || delta.tool_calls?.length) && !out.first) out.first = Date.now() - t0;
        if (typeof delta.content === 'string') out.text += delta.content;
        for (const c of delta.tool_calls ?? []) {
          const at = c.index ?? parts.length - 1;
          parts[at] ??= { id: '', name: '', raw: '' };
          if (c.id) parts[at]!.id = c.id;
          if (c.function?.name) parts[at]!.name = c.function.name;
          if (c.function?.arguments) parts[at]!.raw += c.function.arguments;
        }
      }
    }
    out.total = Date.now() - t0;
    out.calls = parts.filter(Boolean).map((p, i) => {
      let args: Record<string, unknown> | null = null;
      try { args = JSON.parse(p.raw || '{}') as Record<string, unknown>; } catch { /* arguments that do not parse are a failed call */ }
      return { id: p.id || `call_${i}`, name: p.name, raw: p.raw || '{}', args };
    });
    out.ok = !out.why;
  } catch (err) {
    out.why = String((err as Error).message).slice(0, 120);
    out.total = Date.now() - t0;
  }
  return out;
}


export type Listed = { id: string; pricing?: { input?: string; output?: string }; tags?: string[] };
export const listModels = async () => ((await (await fetch(`${GATEWAY}/models`)).json()) as { data: Listed[] }).data;

/** The furthest down a model's thinking will turn, or nothing if it does not think. A voice cannot wait on it. */
export async function quiet(id: string, listed: Listed[]): Promise<object | null> {
  if (!listed.find((m) => m.id === id)?.tags?.includes('reasoning')) return null;
  for (const effort of ['none', 'minimal', 'low']) {
    const probe = await ask(id, { reasoning_effort: effort }, [{ role: 'user', content: 'Say hi.' }]);
    if (probe.ok) return { reasoning_effort: effort };
  }
  return null;
}
