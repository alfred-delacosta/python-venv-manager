/* Copyright Advanced Software and AI Solutions LLC */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STREAM_CLIENT_CAP,
  appendStreamLine,
  closeStream,
  resetStreamHubForTests,
  subscribeStream,
  unsubscribeStream,
  type StreamEvent,
} from './stream-hub.js';

afterEach(() => {
  resetStreamHubForTests();
  vi.useRealTimers();
});

describe('stream hub', () => {
  it('replays events after Last-Event-ID', () => {
    appendStreamLine('job:1', 'one\n');
    appendStreamLine('job:1', 'two\n');
    const seen: StreamEvent[] = [];
    const sub = {
      onEvent: (e: StreamEvent) => seen.push(e),
      onClose: () => undefined,
    };
    subscribeStream('job:1', sub, { lastEventId: 1 });
    expect(seen.some((e) => e.data.includes('one'))).toBe(false);
    expect(seen.some((e) => e.data.includes('two'))).toBe(true);
    unsubscribeStream('job:1', sub);
  });

  it('closes subscribers on end', () => {
    let closed = false;
    const sub = {
      onEvent: () => undefined,
      onClose: () => {
        closed = true;
      },
    };
    subscribeStream('run:9', sub);
    closeStream('run:9', 'ok');
    expect(closed).toBe(true);
  });

  it('enforces client cap', () => {
    const subs = [];
    for (let i = 0; i < STREAM_CLIENT_CAP; i++) {
      const sub = { onEvent: () => undefined, onClose: () => undefined };
      subs.push(sub);
      expect(subscribeStream('job:cap', sub).ok).toBe(true);
    }
    const extra = { onEvent: () => undefined, onClose: () => undefined };
    expect(subscribeStream('job:cap', extra).ok).toBe(false);
  });

  it('redacts secrets and strips ANSI before buffering', () => {
    const seen: StreamEvent[] = [];
    const sub = {
      onEvent: (e: StreamEvent) => seen.push(e),
      onClose: () => undefined,
    };
    subscribeStream('job:sec', sub);
    appendStreamLine('job:sec', '\u001b[31mADMIN_PASSWORD=hunter2\u001b[0m\n');
    expect(seen[0]?.data).not.toContain('hunter2');
    expect(seen[0]?.data).not.toContain('\u001b');
    expect(seen[0]?.data).toContain('[REDACTED]');
  });
});
