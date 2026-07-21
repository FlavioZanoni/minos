import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);
const DEFAULT_SOURCES = ['package.json#scripts', 'Makefile', 'justfile', 'bin/*'];
const DEFAULT_DESCRIBE = [
    'declared',
    'tldr',
    'help',
    'man',
];
async function readFileMaybe(p) {
    try {
        return await fs.readFile(p, 'utf8');
    }
    catch {
        return undefined;
    }
}
async function npmScriptsLines(cwd) {
    const text = await readFileMaybe(path.join(cwd, 'package.json'));
    if (!text)
        return [];
    try {
        const pkg = JSON.parse(text);
        const scripts = pkg.scripts ?? {};
        return Object.entries(scripts).map(([name, cmd]) => `npm run ${name} - ${cmd}`);
    }
    catch {
        return [];
    }
}
async function makefileLines(cwd) {
    const text = await readFileMaybe(path.join(cwd, 'Makefile'));
    if (!text)
        return [];
    const lines = [];
    for (const line of text.split('\n')) {
        const m = line.match(/^([A-Za-z0-9_.-]+):/);
        if (!m)
            continue;
        if (m[1].startsWith('.'))
            continue;
        lines.push(`make ${m[1]}`);
    }
    return lines;
}
async function justfileLines(cwd) {
    let text = await readFileMaybe(path.join(cwd, 'justfile'));
    if (!text)
        text = await readFileMaybe(path.join(cwd, 'Justfile'));
    if (!text)
        return [];
    const lines = [];
    for (const raw of text.split('\n')) {
        if (/^\s/.test(raw) || raw.trim() === '' || raw.startsWith('#'))
            continue;
        const m = raw.match(/^([A-Za-z_][A-Za-z0-9_-]*)/);
        if (!m)
            continue;
        const rest = raw.slice(m[0].length);
        if (!rest.includes(':'))
            continue;
        if (rest.trimStart().startsWith(':='))
            continue; // variable assignment
        lines.push(`just ${m[1]}`);
    }
    return lines;
}
async function binEntries(cwd) {
    const dir = path.join(cwd, 'bin');
    let names;
    try {
        names = await fs.readdir(dir);
    }
    catch {
        return [];
    }
    const entries = [];
    for (const name of names) {
        const fullPath = path.join(dir, name);
        try {
            const st = await fs.stat(fullPath);
            if (st.isFile() && (st.mode & 0o111) !== 0) {
                entries.push({ name, fullPath });
            }
        }
        catch {
            // ignore
        }
    }
    return entries;
}
async function tldrDescribe(name) {
    try {
        const { stdout } = await execFileP('tldr', [name], { timeout: 2000 });
        const text = stdout.split('\n').slice(0, 6).join('\n').trim();
        return text || undefined;
    }
    catch {
        return undefined;
    }
}
async function helpDescribe(binPath) {
    try {
        const { stdout } = await execFileP(binPath, ['--help'], { timeout: 2000 });
        const text = stdout.split('\n').slice(0, 3).join('\n').trim();
        return text || undefined;
    }
    catch {
        return undefined;
    }
}
async function manDescribe(name) {
    try {
        const { stdout } = await execFileP('man', [name], { timeout: 2000 });
        const idx = stdout.indexOf('NAME');
        if (idx === -1)
            return undefined;
        const after = stdout.slice(idx + 4);
        const line = after.split('\n').find((l) => l.trim().length > 0);
        return line?.trim();
    }
    catch {
        return undefined;
    }
}
async function describeBinEntry(entry, order, declaredByName) {
    for (const source of order) {
        if (source === 'declared') {
            const d = declaredByName.get(entry.name);
            if (d)
                return d;
        }
        else if (source === 'tldr') {
            const d = await tldrDescribe(entry.name);
            if (d)
                return d;
        }
        else if (source === 'help') {
            const d = await helpDescribe(entry.fullPath);
            if (d)
                return d;
        }
        else if (source === 'man') {
            const d = await manDescribe(entry.name);
            if (d)
                return d;
        }
    }
    return undefined;
}
async function buildToolingContext(cwd, tooling) {
    const sources = tooling.discover?.sources ?? DEFAULT_SOURCES;
    const order = tooling.describe ?? DEFAULT_DESCRIBE;
    const declared = tooling.declare ?? [];
    const declaredByName = new Map(declared.map((d) => [d.name, d.description]));
    const lines = [];
    for (const d of declared) {
        lines.push(`${d.name} - ${d.description}`);
    }
    if (sources.includes('package.json#scripts')) {
        lines.push(...(await npmScriptsLines(cwd)));
    }
    if (sources.includes('Makefile')) {
        lines.push(...(await makefileLines(cwd)));
    }
    if (sources.includes('justfile')) {
        lines.push(...(await justfileLines(cwd)));
    }
    if (sources.includes('bin/*')) {
        const entries = await binEntries(cwd);
        for (const entry of entries) {
            if (declaredByName.has(entry.name))
                continue; // already listed above
            const desc = await describeBinEntry(entry, order, declaredByName);
            if (desc)
                lines.push(`${entry.name} - ${desc}`);
            // omit entirely if no description resolves
        }
    }
    return lines.join('\n');
}
export async function resolveToolingContext(cwd, tooling, sessionId) {
    const cacheDir = path.join(os.tmpdir(), 'minos');
    const hash = crypto.createHash('sha1').update(cwd).digest('hex');
    const cacheFile = path.join(cacheDir, `${hash}-${sessionId || 'nosession'}.json`);
    try {
        const cached = await fs.readFile(cacheFile, 'utf8');
        const parsed = JSON.parse(cached);
        if (typeof parsed.text === 'string')
            return parsed.text;
    }
    catch {
        // no cache, fall through
    }
    const text = await buildToolingContext(cwd, tooling);
    try {
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.writeFile(cacheFile, JSON.stringify({ text }));
    }
    catch {
        // ignore cache write failures
    }
    return text;
}
