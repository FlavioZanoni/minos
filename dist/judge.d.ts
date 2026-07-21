import type { JudgeConfig } from './types.js';
/**
 * Resolve the judge argv. Explicit judge.command always wins. Otherwise the
 * model decides the CLI: provider/model ids (OpenCode style, e.g.
 * "anthropic/claude-haiku-4-5") run via `opencode run -m`, bare ids via `claude -p`.
 */
export declare function judgeCommand(judge: JudgeConfig): string[];
export interface PromptSource {
    file?: string;
    text?: string;
}
interface JudgePayload {
    toolingContext?: string;
    command?: string;
    content?: string;
    path?: string;
}
export declare function runJudge(promptSource: PromptSource, judge: JudgeConfig, payload: JudgePayload): Promise<{
    pass: boolean;
    reason?: string;
}>;
export {};
