import type { JudgeConfig } from './types.js';
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
