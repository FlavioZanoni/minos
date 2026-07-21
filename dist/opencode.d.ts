export declare const MinosPlugin: (ctx: {
    directory?: string;
}) => Promise<{
    'tool.execute.before': (input: {
        tool?: string;
        sessionID?: string;
        callID?: string;
    }, output: {
        args?: Record<string, unknown>;
    }) => Promise<void>;
    'tool.execute.after': (input: {
        tool?: string;
        sessionID?: string;
        callID?: string;
    }, output: {
        title?: string;
        output?: unknown;
        metadata?: unknown;
    }) => Promise<void>;
}>;
export default MinosPlugin;
