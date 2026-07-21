import type { MergedConfig } from './types.js';
/** Strip // and /* *\/ comments (respecting strings) + trailing commas, then JSON.parse. */
export declare function parseJsonc(text: string): any;
export declare function globalConfigPath(): string;
export declare function projectConfigPath(cwd: string): string;
export declare function loadMergedConfig(cwd: string): Promise<MergedConfig>;
