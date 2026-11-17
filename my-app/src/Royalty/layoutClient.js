// Runs royalTreeLayout.layoutGraph in a Web Worker and resolves with its
// result. One request runs at a time; while it runs, only the newest request
// waits, and any request it replaces rejects with a StaleLayoutError (its
// render was superseded anyway). Where Worker doesn't exist (jsdom tests),
// layout runs on the main thread. If the worker fails, outstanding requests
// reject and the page shows its error message; the next request starts a
// fresh worker.
import { layoutGraph } from './royalTreeLayout';

export class StaleLayoutError extends Error {
  constructor() {
    super('Layout request superseded');
    this.name = 'StaleLayoutError';
  }
}

let worker = null;
let nextId = 0;
let running = null; // { id, resolve, reject }
let queued = null; // { elements, options, resolve, reject }

function startWorker() {
  const w = new Worker(new URL('./royalTreeLayout.worker.js', import.meta.url), { type: 'module' });
  w.onmessage = (event) => {
    const { id, result, error } = event.data;
    if (!running || running.id !== id) return;
    const done = running;
    running = null;
    if (error) done.reject(new Error(error));
    else done.resolve(result);
    runNext();
  };
  w.onerror = (event) => {
    event.preventDefault?.();
    const failed = [running, queued].filter(Boolean);
    running = null;
    queued = null;
    w.terminate();
    if (worker === w) worker = null;
    failed.forEach(r => r.reject(new Error('The layout worker failed: ' + (event.message || 'unknown error'))));
  };
  return w;
}

function runNext() {
  if (running || !queued) return;
  const next = queued;
  queued = null;
  try {
    worker = worker || startWorker();
  } catch (e) {
    next.reject(e);
    return;
  }
  running = { id: ++nextId, resolve: next.resolve, reject: next.reject };
  worker.postMessage({ id: running.id, elements: next.elements, options: next.options });
}

export function requestLayout(elements, options = {}) {
  if (typeof Worker === 'undefined') {
    return new Promise((resolve) => resolve(layoutGraph(elements, options)));
  }
  return new Promise((resolve, reject) => {
    if (queued) queued.reject(new StaleLayoutError());
    queued = { elements, options, resolve, reject };
    runNext();
  });
}

export function terminateLayoutWorker() {
  if (worker) worker.terminate();
  worker = null;
  [running, queued].filter(Boolean).forEach(r => r.reject(new StaleLayoutError()));
  running = null;
  queued = null;
}
