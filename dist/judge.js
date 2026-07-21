import { spawn } from 'node:child_process';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_TIMEOUT_MS = 30000;
/**
 * Resolve the judge argv. Explicit judge.command always wins. Otherwise the
 * model decides the CLI: provider/model ids (OpenCode style, e.g.
 * "anthropic/claude-haiku-4-5") run via `opencode run -m`, bare ids via `claude -p`.
 */
export function judgeCommand(judge) {
    if (judge.command)
        return judge.command;
    const model = judge.model ?? DEFAULT_MODEL;
    return model.includes('/')
        ? ['opencode', 'run', '-m', model]
        : ['claude', '-p', '--model', model];
}
function buildPrompt(promptFileContents, payload) {
    let prompt = promptFileContents;
    if (payload.toolingContext) {
        prompt += `\n\n## Project tooling\n${payload.toolingContext}`;
    }
    if (payload.command !== undefined) {
        prompt += `\n\n## Pending command\n\`\`\`\n${payload.command}\n\`\`\``;
    }
    else if (payload.content !== undefined) {
        const label = payload.path ? ` (${payload.path})` : '';
        prompt += `\n\n## Pending content${label}\n\`\`\`\n${payload.content}\n\`\`\``;
    }
    prompt += `\n\nReply with exactly one line: "PASS" or "FAIL: <one-sentence reason>".`;
    return prompt;
}
function parseVerdict(output) {
    // opencode run decorates output with ANSI escapes; strip before matching
    // eslint-disable-next-line no-control-regex
    const lines = output.replace(/\x1b\[[0-9;]*m/g, '').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^PASS\b/i.test(trimmed)) {
            return { pass: true };
        }
        const failMatch = trimmed.match(/^FAIL:?\s*(.*)$/i);
        if (failMatch) {
            return { pass: false, reason: failMatch[1] || undefined };
        }
    }
    return undefined;
}
function failOpen(warning) {
    process.stderr.write(`minos: judge warning: ${warning}\n`);
    return { pass: true };
}
export async function runJudge(promptSource, judge, payload) {
    let promptContents;
    if (promptSource.text) {
        promptContents = promptSource.text;
    }
    else if (promptSource.file) {
        const fs = await import('node:fs/promises');
        try {
            promptContents = await fs.readFile(promptSource.file, 'utf8');
        }
        catch (err) {
            return failOpen(`could not read prompt file ${promptSource.file}: ${err.message}`);
        }
    }
    else {
        return failOpen('llm-judge rule has neither promptText nor prompt file');
    }
    const prompt = buildPrompt(promptContents, payload);
    const command = judgeCommand(judge);
    const timeoutMs = judge.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const [bin, ...args] = command;
    return new Promise((resolve) => {
        let settled = false;
        let stdout = '';
        let stderr = '';
        const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        const timer = setTimeout(() => {
            if (settled)
                return;
            settled = true;
            child.kill();
            resolve(failOpen(`judge command timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        child.stdout.on('data', (d) => {
            stdout += d.toString();
        });
        child.stderr.on('data', (d) => {
            stderr += d.toString();
        });
        child.on('error', (err) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(failOpen(`judge command failed to spawn: ${err.message}`));
        });
        child.on('close', () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            const verdict = parseVerdict(stdout);
            if (!verdict) {
                resolve(failOpen(`judge command produced no parseable PASS/FAIL verdict (stdout: ${stdout.slice(0, 200)}, stderr: ${stderr.slice(0, 200)})`));
                return;
            }
            resolve(verdict);
        });
        child.stdin.write(prompt);
        child.stdin.end();
    });
}
