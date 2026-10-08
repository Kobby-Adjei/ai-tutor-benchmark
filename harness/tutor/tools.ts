/**
 * The tutor's hands: what it can do besides talk. Eleven tools, as plain JSON
 * schema, exactly as Blink had them when the study ran. To benchmark a tutor
 * of your own, replace this list and the instructions beside it.
 */
import { readFileSync } from 'node:fs';

export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
const TOOLS = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url), 'utf8')) as ToolDef[];
export const plainTools = (): ToolDef[] => TOOLS;
