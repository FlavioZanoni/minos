export type EventType = 'content' | 'command';
/** Input to a single evaluation (CLI stdin JSON, or direct module call). */
export interface CheckInput {
    event: EventType;
    tool: string;
    path?: string;
    content?: string;
    command?: string;
    cwd?: string;
    sessionId?: string;
}
/** Output of a single evaluation. Adapters translate this into host schemas. */
export interface Decision {
    decision: 'allow' | 'warn' | 'block';
    reason?: string;
    ruleId?: string;
}
export type Trigger = {
    type: 'contains';
    patterns: string[];
} | {
    type: 'regex';
    patterns: string[];
} | {
    type: 'llm-judge';
    context?: 'tooling';
    prompt?: string;
    promptText?: string;
    model?: string;
};
export interface Rule {
    id: string;
    summary?: string;
    enabled?: boolean;
    appliesTo: {
        tools?: string[];
        pathGlob?: string[];
        commandMatch?: string[];
    };
    trigger: Trigger;
    action: 'block' | 'warn';
    message?: string;
}
export interface DeclaredTool {
    name: string;
    description: string;
}
export interface ToolingConfig {
    discover?: {
        sources?: string[];
        cache?: 'session';
    };
    describe?: ('declared' | 'tldr' | 'help' | 'man')[];
    declare?: DeclaredTool[];
}
/** How to invoke the judge model. argv array; prompt is piped via stdin. */
export interface JudgeConfig {
    command?: string[];
    model?: string;
    timeoutMs?: number;
}
export type DisableEntry = string | {
    id: string;
    reason?: string;
};
/** Shape of a rules.jsonc file (global or project). */
export interface ConfigFile {
    rules?: Rule[];
    disable?: DisableEntry[];
    tooling?: ToolingConfig;
    judge?: JudgeConfig;
}
export type RuleSource = 'global' | 'project' | 'project-override';
export interface ResolvedRule extends Rule {
    source: RuleSource;
    /** Absolute dir of the config file that defined this rule (for resolving prompt paths). */
    configDir: string;
}
export interface DisabledRule {
    rule: Rule;
    reason?: string;
}
/** Result of loading + merging global and project config. */
export interface MergedConfig {
    rules: ResolvedRule[];
    disabled: DisabledRule[];
    tooling: ToolingConfig;
    judge: JudgeConfig;
    globalPath: string;
    projectPath: string;
}
