import * as path from 'node:path';
import { matchesRule } from './matchers.js';
import { resolveToolingContext } from './tooling.js';
import { runJudge } from './judge.js';
function combineReason(message, judgeReason) {
    if (message && judgeReason)
        return `${message} (${judgeReason})`;
    return message ?? judgeReason;
}
async function checkFires(rule, input, merged) {
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
    let toolingContext;
    if (trigger.context === 'tooling') {
        toolingContext = await resolveToolingContext(input.cwd ?? process.cwd(), merged.tooling, input.sessionId);
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
export async function evaluateAll(input, merged) {
    const decisions = [];
    for (const rule of merged.rules) {
        if (!matchesRule(rule, input))
            continue;
        const { fires, reason } = await checkFires(rule, input, merged);
        if (fires) {
            decisions.push({ decision: rule.action, reason, ruleId: rule.id });
        }
    }
    return decisions;
}
export async function evaluate(input, merged) {
    const decisions = await evaluateAll(input, merged);
    const block = decisions.find((d) => d.decision === 'block');
    if (block)
        return block;
    const warn = decisions.find((d) => d.decision === 'warn');
    if (warn)
        return warn;
    return { decision: 'allow' };
}
