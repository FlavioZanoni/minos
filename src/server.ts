import * as http from 'node:http';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import {
  loadMergedConfig,
  globalConfigPath,
  projectConfigPath,
} from './config.js';
import { evaluateAll } from './evaluate.js';
import type { ConfigFile, CheckInput } from './types.js';

async function readRaw(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function ownVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.version ?? '';
  } catch {
    return '';
  }
}

async function buildStatePayload(scope: 'global' | 'project', cwd: string) {
  const merged = await loadMergedConfig(cwd);
  const globalPath = globalConfigPath();
  const projectPath = projectConfigPath(cwd);
  const [globalRaw, projectRaw, version] = await Promise.all([
    readRaw(globalPath),
    readRaw(projectPath),
    ownVersion(),
  ]);
  return {
    scope,
    merged,
    globalRaw,
    projectRaw,
    globalPath,
    projectPath,
    projectName: path.basename(cwd),
    version,
  };
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {
      // no browser available in this environment; ignore
    });
    child.unref();
  } catch {
    // ignore - swallow failure to open a browser
  }
}

export async function serveConfigUI(scope: 'global' | 'project', cwd: string): Promise<void> {
  const uiIndexUrl = new URL('../ui/index.html', import.meta.url);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (req.method === 'GET' && reqUrl.pathname === '/') {
        const html = await fs.readFile(uiIndexUrl, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && reqUrl.pathname === '/api/state') {
        const payload = await buildStatePayload(scope, cwd);
        sendJson(res, 200, payload);
        return;
      }

      if (req.method === 'PUT' && reqUrl.pathname === '/api/config') {
        const bodyText = await readBody(req);
        let body: { scope: 'global' | 'project'; config: ConfigFile };
        try {
          body = JSON.parse(bodyText);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
        if (body.scope !== 'global' && body.scope !== 'project') {
          sendJson(res, 400, { error: 'body.scope must be "global" or "project"' });
          return;
        }
        if (!body.config || typeof body.config !== 'object') {
          sendJson(res, 400, { error: 'body.config is required' });
          return;
        }
        const targetPath = body.scope === 'global' ? globalConfigPath() : projectConfigPath(cwd);
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, JSON.stringify(body.config, null, 2) + '\n', 'utf8');
        const payload = await buildStatePayload(scope, cwd);
        sendJson(res, 200, payload);
        return;
      }

      if (req.method === 'POST' && reqUrl.pathname === '/api/test') {
        const bodyText = await readBody(req);
        let input: CheckInput;
        try {
          input = JSON.parse(bodyText);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
        if (!input || !input.event || !input.tool) {
          sendJson(res, 400, { error: '"event" and "tool" are required' });
          return;
        }
        const effectiveCwd = input.cwd || cwd;
        const merged = await loadMergedConfig(effectiveCwd);
        const decisions = await evaluateAll(input, merged);
        sendJson(res, 200, { decisions });
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const url = `http://127.0.0.1:${port}/`;

  // eslint-disable-next-line no-console
  console.log(`rule-guard config UI (${scope}): ${url}`);
  openBrowser(url);

  // Keep the process alive until the user hits Ctrl-C; the http server
  // itself already holds the event loop open, this just makes the intent
  // explicit and gives us a place to hang should that ever change.
  await new Promise<void>(() => {});
}
