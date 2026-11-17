// Runs royalTreeLayout.layoutGraph in a Web Worker and resolves with its
// result. Falls back to the main thread where Worker isn't available (tests,
// very old browsers) or the worker fails to start.
import { layoutGraph } from './royalTreeLayout';

let worker = null;
let workerBroken = false;
let nextId = 0;
const pending = new Map();

function getWorker() {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./royalTreeLayout.worker.js', import.meta.url), { type: 'module' });
  } catch (e) {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event) => {
    const { id, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(result);
  };
  worker.onerror = (event) => {
    // The worker script itself failed (load or uncaught error): finish any
    // outstanding requests on the main thread and stop using the worker.
    event.preventDefault?.();
    workerBroken = true;
    worker.terminate();
    worker = null;
    const entries = Array.from(pending.values());
    pending.clear();
    entries.forEach(({ elements, options, resolve, reject }) => {
      try { resolve(layoutGraph(elements, options)); } catch (e) { reject(e); }
    });
  };
  return worker;
}

export function requestLayout(elements, options = {}) {
  const w = getWorker();
  if (!w) {
    return new Promise((resolve) => resolve(layoutGraph(elements, options)));
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { elements, options, resolve, reject });
    w.postMessage({ id, elements, options });
  });
}

export function terminateLayoutWorker() {
  if (worker) worker.terminate();
  worker = null;
  pending.clear();
}
