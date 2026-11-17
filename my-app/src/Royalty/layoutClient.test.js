import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestLayout, terminateLayoutWorker, StaleLayoutError } from './layoutClient';

// A stand-in Worker that records messages and lets the test answer them.
class FakeWorker {
  static instances = [];
  constructor() {
    this.sent = [];
    FakeWorker.instances.push(this);
  }
  postMessage(msg) { this.sent.push(msg); }
  terminate() { this.terminated = true; }
  reply(result) {
    const { id } = this.sent[this.sent.length - 1];
    this.onmessage({ data: { id, result } });
  }
}

describe('layoutClient', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => {
    terminateLayoutWorker();
    vi.unstubAllGlobals();
  });

  it('keeps only the newest request waiting while the worker is busy', async () => {
    const a = requestLayout(['a']);
    const b = requestLayout(['b']);
    const c = requestLayout(['c']);
    const w = FakeWorker.instances[0];
    expect(w.sent.map(m => m.elements)).toEqual([['a']]);
    await expect(b).rejects.toBeInstanceOf(StaleLayoutError);

    w.reply('A');
    await expect(a).resolves.toBe('A');
    expect(w.sent.map(m => m.elements)).toEqual([['a'], ['c']]);
    w.reply('C');
    await expect(c).resolves.toBe('C');
  });

  it('rejects outstanding requests when the worker fails, then starts a new one', async () => {
    const a = requestLayout(['a']);
    const b = requestLayout(['b']);
    FakeWorker.instances[0].onerror({ message: 'boom', preventDefault() {} });
    await expect(a).rejects.toThrow(/layout worker failed: boom/);
    await expect(b).rejects.toThrow(/layout worker failed/);
    expect(FakeWorker.instances[0].terminated).toBe(true);

    const c = requestLayout(['c']);
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].reply('C');
    await expect(c).resolves.toBe('C');
  });
});
