import type { Rule, CheckInput } from './types.js';
/** Convert a glob (supporting **, *, ?) to a RegExp for matching paths. */
export declare function globToRegex(glob: string): RegExp;
export declare function matchesRule(rule: Rule, input: CheckInput): boolean;
