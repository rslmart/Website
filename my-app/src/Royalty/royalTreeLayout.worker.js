// Web Worker wrapper around layoutGraph, so dagre never blocks the page.
// Messages in: { id, elements, options }. Out: { id, result } or { id, error }.
import { layoutGraph } from './royalTreeLayout';

self.onmessage = (event) => {
  const { id, elements, options } = event.data;
  try {
    self.postMessage({ id, result: layoutGraph(elements, options) });
  } catch (error) {
    self.postMessage({ id, error: String(error && error.message ? error.message : error) });
  }
};
