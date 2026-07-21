import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
/** Drop a comma that is immediately followed (past whitespace) by } or ], string-aware. */
function stripTrailingCommas(s) {
    let out = '';
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inString) {
            out += c;
            if (c === '\\') {
                out += s[i + 1] ?? '';
                i++;
            }
            else if (c === stringChar) {
                inString = false;
            }
            continue;
        }
        if (c === '"' || c === "'") {
            inString = true;
            stringChar = c;
            out += c;
            continue;
        }
        if (c === ',') {
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j]))
                j++;
            if (s[j] === '}' || s[j] === ']')
                continue; // trailing comma: drop it
        }
        out += c;
    }
    return out;
}
/** Strip // and /* *\/ comments (respecting strings) + trailing commas, then JSON.parse. */
export function parseJsonc(text) {
    let out = '';
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const next = text[i + 1];
        if (inString) {
            out += c;
            if (c === '\\') {
                out += next;
                i++;
            }
            else if (c === stringChar) {
                inString = false;
            }
            continue;
        }
        if (c === '"' || c === "'") {
            inString = true;
            stringChar = c;
            out += c;
            continue;
        }
        if (c === '/' && next === '/') {
            while (i < text.length && text[i] !== '\n')
                i++;
            out += '\n';
            continue;
        }
        if (c === '/' && next === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/'))
                i++;
            i++;
            continue;
        }
        out += c;
    }
    // string-aware, so a comma inside a value like "x{2,}" or "a,]" is preserved
    return JSON.parse(stripTrailingCommas(out));
}
export function globalConfigPath() {
    const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(base, 'minos', 'rules.jsonc');
}
export function projectConfigPath(cwd) {
    return path.join(cwd, '.minos', 'rules.jsonc');
}
async function loadConfigFile(filePath) {
    try {
        const text = await fs.readFile(filePath, 'utf8');
        return parseJsonc(text);
    }
    catch {
        return {};
    }
}
function disableEntryId(entry) {
    return typeof entry === 'string' ? entry : entry.id;
}
function disableEntryReason(entry) {
    return typeof entry === 'string' ? undefined : entry.reason;
}
export async function loadMergedConfig(cwd) {
    const globalPath = globalConfigPath();
    const projectPath = projectConfigPath(cwd);
    const globalConfig = await loadConfigFile(globalPath);
    const projectConfig = await loadConfigFile(projectPath);
    const globalDir = path.dirname(globalPath);
    const projectDir = path.dirname(projectPath);
    const globalRules = globalConfig.rules ?? [];
    const projectRules = projectConfig.rules ?? [];
    const disableEntries = projectConfig.disable ?? [];
    const disabledIds = new Map();
    for (const entry of disableEntries) {
        disabledIds.set(disableEntryId(entry), disableEntryReason(entry));
    }
    const projectRuleIds = new Set(projectRules.map((r) => r.id));
    const resolved = [];
    const disabled = [];
    for (const rule of globalRules) {
        if (projectRuleIds.has(rule.id)) {
            // will be added below as project-override
            continue;
        }
        if (disabledIds.has(rule.id)) {
            disabled.push({ rule, reason: disabledIds.get(rule.id) });
            continue;
        }
        resolved.push({ ...rule, source: 'global', configDir: globalDir });
    }
    const globalRuleIds = new Set(globalRules.map((r) => r.id));
    for (const rule of projectRules) {
        const source = globalRuleIds.has(rule.id) ? 'project-override' : 'project';
        resolved.push({ ...rule, source, configDir: projectDir });
    }
    const tooling = projectConfig.tooling ?? globalConfig.tooling ?? {};
    const judge = projectConfig.judge ?? globalConfig.judge ?? {};
    return {
        rules: resolved,
        disabled,
        tooling,
        judge,
        globalPath,
        projectPath,
    };
}
