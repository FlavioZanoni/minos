// OpenCode adapter: imports the runner in-process, no subprocess.
// Wire it up with a stub file in .opencode/plugins/ re-exporting MinosPlugin.
import * as fs from 'node:fs/promises';
import { loadMergedConfig } from './config.js';
import { evaluate } from './evaluate.js';
import type { Decision } from './types.js';

const TOOL_MAP: Record<string, string> = { bash: 'Bash', edit: 'Edit', write: 'Write' };

// Content rules run in-process on the host; cap the read so a huge generated
// file can't OOM the OpenCode process. Bytes over this are not content-checked.
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;
// Backstop the callID->args map so a `before` whose `after` never fires can't
// grow it without bound over a long session.
const MAX_PENDING = 512;

function note(d: Decision): string {
  return `[minos:${d.ruleId}] ${d.reason ?? ''}`.trim();
}

function argsFilePath(args: Record<string, unknown> | undefined): string | undefined {
  const p = args?.filePath ?? args?.file_path ?? args?.path;
  return typeof p === 'string' ? p : undefined;
}

export const MinosPlugin = async (ctx: { directory?: string }) => {
  const cwd = ctx?.directory ?? process.cwd();
  // Fallback capture: some hosts pass args to `after` directly (preferred when
  // present); this map covers hosts that only provide them to `before`.
  const pendingArgs = new Map<string, Record<string, unknown>>();

  return {
    'tool.execute.before': async (
      input: { tool?: string; sessionID?: string; callID?: string },
      output: { args?: Record<string, unknown> },
    ) => {
      const tool = TOOL_MAP[input?.tool ?? ''];
      if (!tool) return;
      if (tool !== 'Bash') {
        if (input.callID) {
          if (pendingArgs.size >= MAX_PENDING) pendingArgs.clear(); // leak backstop
          pendingArgs.set(input.callID, output?.args ?? {});
        }
        return;
      }
      const command = output?.args?.command;
      if (typeof command !== 'string') return;
      let decision: Decision;
      try {
        const merged = await loadMergedConfig(cwd);
        decision = await evaluate(
          { event: 'command', tool, command, cwd, sessionId: input.sessionID },
          merged,
        );
      } catch (err) {
        // internal errors fail open, never wedge the session
        console.error(`minos: internal error: ${(err as Error).message}`);
        return;
      }
      if (decision.decision === 'block') throw new Error(note(decision));
      if (decision.decision === 'warn') console.error(note(decision));
    },

    'tool.execute.after': async (
      input: { tool?: string; sessionID?: string; callID?: string; args?: Record<string, unknown> },
      output: { title?: string; output?: unknown; metadata?: unknown },
    ) => {
      const tool = TOOL_MAP[input?.tool ?? ''];
      const captured = input?.callID ? pendingArgs.get(input.callID) : undefined;
      if (input?.callID) pendingArgs.delete(input.callID);
      if (tool !== 'Edit' && tool !== 'Write') return;
      // prefer args the host passed to `after`; fall back to the captured map
      const filePath = argsFilePath(input?.args) ?? argsFilePath(captured);
      if (typeof filePath !== 'string') return;
      let decision: Decision;
      try {
        const st = await fs.stat(filePath);
        if (st.size > MAX_CONTENT_BYTES) {
          console.error(`minos: ${filePath} exceeds ${MAX_CONTENT_BYTES} bytes; skipping content check`);
          return;
        }
        const content = await fs.readFile(filePath, 'utf8');
        const merged = await loadMergedConfig(cwd);
        decision = await evaluate(
          { event: 'content', tool, path: filePath, content, cwd, sessionId: input.sessionID },
          merged,
        );
      } catch (err) {
        console.error(`minos: internal error: ${(err as Error).message}`);
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
