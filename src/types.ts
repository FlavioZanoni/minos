// Shared contract for the minos runner core.
// The runner is host-neutral: no Claude Code / OpenCode schemas in here.

export type EventType = 'content' | 'command';

/** Input to a single evaluation (CLI stdin JSON, or direct module call). */
export interface CheckInput {
  event: EventType;
  tool: string;
  path?: string;      // file path, for content events
  content?: string;   // file content, for content events
  command?: string;   // shell command, for command events
  cwd?: string;       // project root; defaults to process.cwd()
  sessionId?: string; // used to key the session-scoped tooling cache
}

/** Output of a single evaluation. Adapters translate this into host schemas. */
export interface Decision {
  decision: 'allow' | 'warn' | 'block';
  reason?: string;
  ruleId?: string;
}

export type Trigger =
  | { type: 'contains'; patterns: string[] } // case-insensitive substring, any match
  | { type: 'regex'; patterns: string[] }    // any regex match
  // prompt = path to a prompt file, relative to the config file that defined the rule;
  // promptText = inline prompt (takes precedence when both are set);
  // model = per-rule judge model override (inherits the config default when absent)
  | { type: 'llm-judge'; context?: 'tooling'; prompt?: string; promptText?: string; model?: string };

export interface Rule {
  id: string;
  summary?: string;  // one-line description shown in the config UI
  enabled?: boolean; // false = rule is kept in config but never evaluated; default true
  appliesTo: {
    tools?: string[];        // e.g. ["Edit", "Write"] or ["Bash"]
    pathGlob?: string[];     // content events: any glob must match input.path
    commandMatch?: string[]; // command events: any substring must appear in input.command
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
  discover?: { sources?: string[]; cache?: 'session' };
  describe?: ('declared' | 'tldr' | 'help' | 'man')[];
  declare?: DeclaredTool[];
}

/** How to invoke the judge model. argv array; prompt is piped via stdin. */
export interface JudgeConfig {
  command?: string[]; // default: ["claude", "-p", "--model", <model>]; overrides `model` entirely
  model?: string;     // model for the default command; default "claude-haiku-4-5-20251001"
  timeoutMs?: number; // default 30000
}

export type DisableEntry = string | { id: string; reason?: string };

/** Shape of a rules.jsonc file (global or project). */
export interface ConfigFile {
  rules?: Rule[];
  disable?: DisableEntry[]; // project config only: drop these global rules
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
  disabled: DisabledRule[]; // global rules dropped by project `disable`, for UI display
  tooling: ToolingConfig;
  judge: JudgeConfig;
  globalPath: string;  // path of global rules.jsonc (may not exist)
  projectPath: string; // path of project rules.jsonc (may not exist)
}
