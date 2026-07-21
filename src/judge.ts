import { spawn } from 'node:child_process';
import type { JudgeConfig } from './types.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_TIMEOUT_MS = 30000;

export interface PromptSource {
  file?: string; // path to a prompt file
  text?: string; // inline prompt; takes precedence over file
}

interface JudgePayload {
  toolingContext?: string;
  command?: string;
  content?: string;
  path?: string;
}

function buildPrompt(promptFileContents: string, payload: JudgePayload): string {
  let prompt = promptFileContents;

  if (payload.toolingContext) {
    prompt += `\n\n## Project tooling\n${payload.toolingContext}`;
  }

  if (payload.command !== undefined) {
    prompt += `\n\n## Pending command\n\`\`\`\n${payload.command}\n\`\`\``;
  } else if (payload.content !== undefined) {
    const label = payload.path ? ` (${payload.path})` : '';
    prompt += `\n\n## Pending content${label}\n\`\`\`\n${payload.content}\n\`\`\``;
  }

  prompt += `\n\nReply with exactly one line: "PASS" or "FAIL: <one-sentence reason>".`;

  return prompt;
}

function parseVerdict(output: string): { pass: boolean; reason?: string } | undefined {
  const lines = output.split('\n');
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

function failOpen(warning: string): { pass: boolean; reason?: string } {
  process.stderr.write(`rule-guard: judge warning: ${warning}\n`);
  return { pass: true };
}

export async function runJudge(
  promptSource: PromptSource,
  judge: JudgeConfig,
  payload: JudgePayload,
): Promise<{ pass: boolean; reason?: string }> {
  let promptContents: string;
  if (promptSource.text) {
    promptContents = promptSource.text;
  } else if (promptSource.file) {
    const fs = await import('node:fs/promises');
    try {
      promptContents = await fs.readFile(promptSource.file, 'utf8');
    } catch (err) {
      return failOpen(`could not read prompt file ${promptSource.file}: ${(err as Error).message}`);
    }
  } else {
    return failOpen('llm-judge rule has neither promptText nor prompt file');
  }

  const prompt = buildPrompt(promptContents, payload);
  const command = judge.command ?? ['claude', '-p', '--model', judge.model ?? DEFAULT_MODEL];
  const timeoutMs = judge.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [bin, ...args] = command;

  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      if (settled) return;
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
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(failOpen(`judge command failed to spawn: ${err.message}`));
    });

    child.on('close', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const verdict = parseVerdict(stdout);
      if (!verdict) {
        resolve(
          failOpen(
            `judge command produced no parseable PASS/FAIL verdict (stdout: ${stdout.slice(0, 200)}, stderr: ${stderr.slice(0, 200)})`,
          ),
        );
        return;
      }
      resolve(verdict);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
