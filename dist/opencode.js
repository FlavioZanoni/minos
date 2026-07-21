// OpenCode adapter: imports the runner in-process, no subprocess.
// Wire it up with a stub file in .opencode/plugins/ re-exporting MinosPlugin.
import * as fs from 'node:fs/promises';
import { loadMergedConfig } from './config.js';
import { evaluate } from './evaluate.js';
const TOOL_MAP = { bash: 'Bash', edit: 'Edit', write: 'Write' };
function note(d) {
    return `[minos:${d.ruleId}] ${d.reason ?? ''}`.trim();
}
export const MinosPlugin = async (ctx) => {
    const cwd = ctx?.directory ?? process.cwd();
    // tool.execute.after doesn't receive args, so capture them here keyed by callID
    const pendingArgs = new Map();
    return {
        'tool.execute.before': async (input, output) => {
            const tool = TOOL_MAP[input?.tool ?? ''];
            if (!tool)
                return;
            if (tool !== 'Bash') {
                if (input.callID)
                    pendingArgs.set(input.callID, output?.args ?? {});
                return;
            }
            const command = output?.args?.command;
            if (typeof command !== 'string')
                return;
            let decision;
            try {
                const merged = await loadMergedConfig(cwd);
                decision = await evaluate({ event: 'command', tool, command, cwd, sessionId: input.sessionID }, merged);
            }
            catch (err) {
                // internal errors fail open, never wedge the session
                console.error(`minos: internal error: ${err.message}`);
                return;
            }
            if (decision.decision === 'block')
                throw new Error(note(decision));
            if (decision.decision === 'warn')
                console.error(note(decision));
        },
        'tool.execute.after': async (input, output) => {
            const tool = TOOL_MAP[input?.tool ?? ''];
            const args = input?.callID ? pendingArgs.get(input.callID) : undefined;
            if (input?.callID)
                pendingArgs.delete(input.callID);
            if (tool !== 'Edit' && tool !== 'Write')
                return;
            const filePath = (args?.filePath ?? args?.file_path ?? args?.path);
            if (typeof filePath !== 'string')
                return;
            let decision;
            try {
                const content = await fs.readFile(filePath, 'utf8');
                const merged = await loadMergedConfig(cwd);
                decision = await evaluate({ event: 'content', tool, path: filePath, content, cwd, sessionId: input.sessionID }, merged);
            }
            catch (err) {
                console.error(`minos: internal error: ${err.message}`);
                return;
            }
            if (decision.decision === 'block') {
                // the write already happened; throwing surfaces the violation so the model fixes the file
                throw new Error(`${note(decision)} The file was written anyway; fix it to comply.`);
            }
            if (decision.decision === 'warn' && typeof output?.output === 'string') {
                output.output += `\n\n${note(decision)}`;
            }
        },
    };
};
export default MinosPlugin;
