import * as path from 'node:path';
import { matchesRule } from './matchers.js';
import { resolveToolingContext } from './tooling.js';
import { runJudge } from './judge.js';
import { anyRegexMatchesBounded } from './saferegex.js';
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
        // Bounded so a catastrophic-backtracking pattern (from a shared repo's
        // config) can't hang the hook; invalid patterns are skipped in-worker.
        const haystack = input.content ?? input.command ?? '';
        const { fired, timedOut } = await anyRegexMatchesBounded(trigger.patterns, 'm', haystack);
        if (timedOut) {
            process.stderr.write(`minos: rule ${rule.id} regex evaluation timed out; treating as no match\n`);
        }
        return { fires: fired, reason: rule.message };
    }
    if (trigger.type === 'llm-judge') {
        let toolingContext;
        if (trigger.context === 'tooling') {
            toolingContext = await resolveToolingContext(input.cwd ?? process.cwd(), merged.tooling, input.sessionId);
        }
        // Contain the prompt path within the config dir that defined the rule, so a
        // project config can't point it at ../../etc/passwd and exfiltrate via the judge.
        let promptPath;
        if (trigger.prompt) {
            const base = path.resolve(rule.configDir);
            const resolved = path.resolve(rule.configDir, trigger.prompt);
            if (resolved === base || resolved.startsWith(base + path.sep)) {
                promptPath = resolved;
            }
            else {
                process.stderr.write(`minos: rule ${rule.id} prompt path "${trigger.prompt}" escapes its config dir; ignoring it\n`);
            }
        }
        const judge = trigger.model ? { ...merged.judge, command: undefined, model: trigger.model } : merged.judge;
        const result = await runJudge({ file: promptPath, text: trigger.promptText }, judge, {
            toolingContext,
            command: input.command,
            content: input.content,
            path: input.path,
        });
        return { fires: !result.pass, reason: combineReason(rule.message, result.reason) };
    }
    // Unknown/misspelled trigger type: do NOT silently route to the judge (which
    // would fail open and disable the rule invisibly). Skip loudly instead.
    process.stderr.write(`minos: rule ${rule.id} has unknown trigger type "${trigger.type}"; skipping\n`);
    return { fires: false };
}
export async function evaluateAll(input, merged) {
    const decisions = [];
    for (const rule of merged.rules) {
        if (rule.enabled === false)
            continue;
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
