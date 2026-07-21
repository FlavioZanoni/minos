export declare function anyRegexMatchesBounded(patterns: string[], flags: string, haystack: string, timeoutMs?: number): Promise<{
    fired: boolean;
    timedOut: boolean;
}>;
