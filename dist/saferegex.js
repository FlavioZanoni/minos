import { Worker } from 'node:worker_threads';
// The worker compiles and tests each user-supplied regex. Running it off the
// main thread means a catastrophic-backtracking pattern (ReDoS) can be killed
// by terminating the worker instead of hanging the whole hook process.
const WORKER_SRC = `
const { parentPort } = require('node:worker_threads');
parentPort.once('message', ({ patterns, flags, haystack }) => {
  let fired = false;
  for (const p of patterns) {
    try { if (new RegExp(p, flags).test(haystack)) { fired = true; break; } } catch (e) { /* invalid pattern: skip */ }
  }
  parentPort.postMessage(fired);
});
`;
// ponytail: one worker per regex-trigger evaluation (~30ms startup). Fine because
// regex triggers are opt-in and rare next to `contains`. Pool the worker or move
// to a linear engine (RE2) if a regex-heavy config makes this latency matter.
export async function anyRegexMatchesBounded(patterns, flags, haystack, timeoutMs = 1000) {
    const w = new Worker(WORKER_SRC, { eval: true });
    try {
        return await new Promise((resolve) => {
            let timer;
            const done = (r) => {
                clearTimeout(timer);
                resolve(r);
            };
            timer = setTimeout(() => done({ fired: false, timedOut: true }), timeoutMs);
            w.once('message', (fired) => done({ fired: Boolean(fired), timedOut: false }));
            w.once('error', () => done({ fired: false, timedOut: false }));
            w.postMessage({ patterns, flags, haystack });
        });
    }
    finally {
        await w.terminate(); // kills a runaway regex thread on timeout
    }
}
