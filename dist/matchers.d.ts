import type { Rule, CheckInput } from './types.js';
/**
 * Convert a glob (supporting **, *, ?) to a RegExp for matching paths.
 * Consecutive `**\/` segments are collapsed into a single non-capturing group
 * so the result cannot backtrack catastrophically: stacked `(.*\/)?` groups on
 * adjacent text are exponential, one `(?:.*\/)?` is linear.
 */
export declare function globToRegex(glob: string): RegExp;
export declare function matchesRule(rule: Rule, input: CheckInput): boolean;
