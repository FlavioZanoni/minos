#!/usr/bin/env node
import * as fs from "node:fs/promises";
import { loadMergedConfig } from "./config.js";
import { evaluate } from "./evaluate.js";
import type { CheckInput, Decision } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

interface ClaudeHookInput {
  session_id?: string;
  cwd?: string;
  tool_name: string;
  tool_input: { command?: string; file_path?: string };
}

function hookOutputPreBash(decision: Decision): string {
  const permissionDecision = decision.decision === "block" ? "deny" : "allow";
  const out: any = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
    },
  };
  if (decision.decision !== "allow") {
    out.hookSpecificOutput.permissionDecisionReason = `[rule-guard:${decision.ruleId}] ${decision.reason ?? ""}`;
  }
  return JSON.stringify(out);
}

async function cmdCheck(): Promise<void> {
  const raw = await readStdin();
  const input: CheckInput = JSON.parse(raw);
  const merged = await loadMergedConfig(input.cwd ?? process.cwd());
  const decision = await evaluate(input, merged);
  process.stdout.write(JSON.stringify(decision) + "\n");
  process.exit(0);
}

async function cmdHookPreBash(): Promise<void> {
  const raw = await readStdin();
  const hookInput: ClaudeHookInput = JSON.parse(raw);
  const input: CheckInput = {
    event: "command",
    tool: hookInput.tool_name,
    command: hookInput.tool_input?.command,
    cwd: hookInput.cwd,
    sessionId: hookInput.session_id,
  };
  const merged = await loadMergedConfig(input.cwd ?? process.cwd());
  const decision = await evaluate(input, merged);

  if (decision.decision === "block") {
    process.stdout.write(hookOutputPreBash(decision) + "\n");
    process.exit(0);
  }
  if (decision.decision === "warn") {
    process.stderr.write(
      `[rule-guard:${decision.ruleId}] ${decision.reason ?? ""}\n`,
    );
    process.stdout.write(hookOutputPreBash(decision) + "\n");
    process.exit(0);
  }
  process.stdout.write(hookOutputPreBash(decision) + "\n");
  process.exit(0);
}

async function cmdHookPostWrite(): Promise<void> {
  const raw = await readStdin();
  const hookInput: ClaudeHookInput = JSON.parse(raw);
  const filePath = hookInput.tool_input?.file_path;
  if (!filePath) {
    process.exit(0);
  }
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch {
    process.exit(0);
  }
  const input: CheckInput = {
    event: "content",
    tool: hookInput.tool_name,
    path: filePath,
    content,
    cwd: hookInput.cwd,
    sessionId: hookInput.session_id,
  };
  const merged = await loadMergedConfig(input.cwd ?? process.cwd());
  const decision = await evaluate(input, merged);

  if (decision.decision === "block") {
    process.stderr.write(
      `[rule-guard:${decision.ruleId}] ${decision.reason ?? ""}\n`,
    );
    process.exit(2);
  }
  if (decision.decision === "warn") {
    const out = {
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `[rule-guard:${decision.ruleId}] ${decision.reason ?? ""}`,
      },
    };
    process.stdout.write(JSON.stringify(out) + "\n");
    process.exit(0);
  }
  process.exit(0);
}

async function cmdConfig(args: string[]): Promise<void> {
  const scope = args.includes("--global")
    ? "global"
    : args.includes("--project")
      ? "project"
      : undefined;
  if (!scope) {
    process.stderr.write("Usage: rule-guard config --global|--project\n");
    process.exit(1);
  }
  const { serveConfigUI } = await import("./server.js");
  await serveConfigUI(scope, process.cwd());
}

async function main(): Promise<void> {
  const [, , cmd, sub, ...rest] = process.argv;

  if (cmd === "check") {
    await cmdCheck();
    return;
  }
  if (cmd === "hook" && (sub === "pre-bash" || sub === "post-write")) {
    // Hook adapters must never crash the hook: fail-open on any internal error.
    try {
      if (sub === "pre-bash") await cmdHookPreBash();
      else await cmdHookPostWrite();
    } catch (err) {
      process.stderr.write(
        `rule-guard: internal error: ${(err as Error).message}\n`,
      );
      process.exit(0);
    }
    return;
  }
  if (cmd === "config") {
    await cmdConfig([sub, ...rest].filter(Boolean) as string[]);
    return;
  }
  process.stderr.write(
    "Usage: rule-guard check | rule-guard hook pre-bash | rule-guard hook post-write | rule-guard config --global|--project\n",
  );
  process.exit(1);
}

main();
