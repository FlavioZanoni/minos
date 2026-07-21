import * as path from 'node:path';
import type { CheckInput, Decision, MergedConfig, ResolvedRule } from './types.js';
import { matchesRule } from './matchers.js';
import { resolveToolingContext } from './tooling.js';
import { runJudge } from './judge.js';

function combineReason(message: string | undefined, judgeReason: string | undefined): string | undefined {
  if (message && judgeReason) return `${message} (${judgeReason})`;
  return message ?? judgeReason;
}

async function checkFires(
  rule: ResolvedRule,
  input: CheckInput,
  merged: MergedConfig,
): Promise<{ fires: boolean; reason?: string }> {
  const trigger = rule.trigger;

  if (trigger.type === 'contains') {
    const haystack = (input.content ?? input.command ?? '').toLowerCase();
    const fires = trigger.patterns.some((p) => haystack.includes(p.toLowerCase()));
    return { fires, reason: rule.message };
  }

  if (trigger.type === 'regex') {
    const haystack = input.content ?? input.command ?? '';
    const fires = trigger.patterns.some((p) => new RegExp(p, 'm').test(haystack));
    return { fires, reason: rule.message };
  }

  // llm-judge
  let toolingContext: string | undefined;
  if (trigger.context === 'tooling') {
    toolingContext = await resolveToolingContext(
      input.cwd ?? process.cwd(),
      merged.tooling,
      input.sessionId,
    );
  }

  const promptPath = !trigger.prompt
    ? undefined
    : path.isAbsolute(trigger.prompt)
      ? trigger.prompt
      : path.join(rule.configDir, trigger.prompt);

  const judge = trigger.model ? { ...merged.judge, command: undefined, model: trigger.model } : merged.judge;
  const result = await runJudge({ file: promptPath, text: trigger.promptText }, judge, {
    toolingContext,
    command: input.command,
    content: input.content,
    path: input.path,
  });

  return { fires: !result.pass, reason: combineReason(rule.message, result.reason) };
}

export async function evaluateAll(input: CheckInput, merged: MergedConfig): Promise<Decision[]> {
  const decisions: Decision[] = [];
  for (const rule of merged.rules) {
    if (rule.enabled === false) continue;
    if (!matchesRule(rule, input)) continue;
    const { fires, reason } = await checkFires(rule, input, merged);
    if (fires) {
      decisions.push({ decision: rule.action, reason, ruleId: rule.id });
    }
  }
  return decisions;
}

export async function evaluate(input: CheckInput, merged: MergedConfig): Promise<Decision> {
  const decisions = await evaluateAll(input, merged);
  const block = decisions.find((d) => d.decision === 'block');
  if (block) return block;
  const warn = decisions.find((d) => d.decision === 'warn');
  if (warn) return warn;
  return { decision: 'allow' };
}
