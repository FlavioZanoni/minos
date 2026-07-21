import type { CheckInput, Decision, MergedConfig } from './types.js';
export declare function evaluateAll(input: CheckInput, merged: MergedConfig): Promise<Decision[]>;
export declare function evaluate(input: CheckInput, merged: MergedConfig): Promise<Decision>;
