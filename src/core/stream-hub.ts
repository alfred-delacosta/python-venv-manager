/* Copyright Advanced Software and AI Solutions LLC */
import { redactSecrets } from './redact.js';
import { stripAnsi } from './ansi.js';

export type StreamEvent = {
  id: number;
  type: 'line' | 'status' | 'heartbeat' | 'end';
  data: string;
};

export type StreamSubscriber = {
  onEvent: (event: StreamEvent) => void;
  onClose: () => void;
};

const DEFAULT_CLIENT_CAP = 4;
const HEARTBEAT_MS = 15_000;
const MAX_BUFFER_EVENTS = 5_000;

type StreamState = {
  nextId: number;
  buffer: StreamEvent[];
  subscribers: Set<StreamSubscriber>;
  closed: boolean;
  endPayload?: string;
  heartbeat?: ReturnType<typeof setInterval>;
};

const streams = new Map<string, StreamState>();

function getOrCreate(key: string): StreamState {
  let state = streams.get(key);
  if (!state) {
    state = {
      nextId: 1,
      buffer: [],
      subscribers: new Set(),
      closed: false,
    };
    state.heartbeat = setInterval(() => {
      if (state!.closed) return;
      const event: StreamEvent = {
        id: state!.nextId++,
        type: 'heartbeat',
        data: String(Date.now()),
      };
      state!.buffer.push(event);
      trimBuffer(state!);
      for (const sub of state!.subscribers) sub.onEvent(event);
    }, HEARTBEAT_MS);
    streams.set(key, state);
  }
  return state;
}

function trimBuffer(state: StreamState): void {
  if (state.buffer.length > MAX_BUFFER_EVENTS) {
    state.buffer.splice(0, state.buffer.length - MAX_BUFFER_EVENTS);
  }
}

export function streamKeyJob(jobId: number): string {
  return `job:${jobId}`;
}

export function streamKeyRun(runId: number): string {
  return `run:${runId}`;
}

export function appendStreamLine(key: string, chunk: string): void {
  const state = getOrCreate(key);
  if (state.closed) return;
  const text = stripAnsi(redactSecrets(chunk));
  if (!text) return;
  const event: StreamEvent = {
    id: state.nextId++,
    type: 'line',
    data: text,
  };
  state.buffer.push(event);
  trimBuffer(state);
  for (const sub of state.subscribers) sub.onEvent(event);
}

export function appendStreamStatus(key: string, status: string): void {
  const state = getOrCreate(key);
  if (state.closed) return;
  const event: StreamEvent = {
    id: state.nextId++,
    type: 'status',
    data: redactSecrets(status),
  };
  state.buffer.push(event);
  trimBuffer(state);
  for (const sub of state.subscribers) sub.onEvent(event);
}

export function closeStream(key: string, endPayload = 'done'): void {
  const state = getOrCreate(key);
  if (state.closed) return;
  state.closed = true;
  state.endPayload = endPayload;
  if (state.heartbeat) clearInterval(state.heartbeat);
  const event: StreamEvent = {
    id: state.nextId++,
    type: 'end',
    data: endPayload,
  };
  state.buffer.push(event);
  for (const sub of [...state.subscribers]) {
    sub.onEvent(event);
    sub.onClose();
  }
  state.subscribers.clear();
}

export function subscribeStream(
  key: string,
  subscriber: StreamSubscriber,
  options: { lastEventId?: number; clientCap?: number } = {},
): { ok: true } | { ok: false; reason: 'full' } {
  const state = getOrCreate(key);
  const cap = options.clientCap ?? DEFAULT_CLIENT_CAP;
  if (state.subscribers.size >= cap) {
    return { ok: false, reason: 'full' };
  }
  state.subscribers.add(subscriber);
  const lastId = options.lastEventId ?? 0;
  for (const event of state.buffer) {
    if (event.id > lastId) subscriber.onEvent(event);
  }
  if (state.closed) {
    subscriber.onClose();
    state.subscribers.delete(subscriber);
  }
  return { ok: true };
}

export function unsubscribeStream(key: string, subscriber: StreamSubscriber): void {
  const state = streams.get(key);
  if (!state) return;
  state.subscribers.delete(subscriber);
}

export function getStreamClientCount(key: string): number {
  return streams.get(key)?.subscribers.size ?? 0;
}

export function isStreamClosed(key: string): boolean {
  return streams.get(key)?.closed ?? false;
}

/** Test helper to reset in-memory streams. */
export function resetStreamHubForTests(): void {
  for (const state of streams.values()) {
    if (state.heartbeat) clearInterval(state.heartbeat);
  }
  streams.clear();
}

export const STREAM_CLIENT_CAP = DEFAULT_CLIENT_CAP;
export const STREAM_HEARTBEAT_MS = HEARTBEAT_MS;
