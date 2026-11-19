/* Copyright Advanced Software and AI Solutions LLC */
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  STREAM_CLIENT_CAP,
  getStreamClientCount,
  subscribeStream,
  unsubscribeStream,
  type StreamEvent,
  type StreamSubscriber,
} from '../core/stream-hub.js';

export function parseLastEventId(request: FastifyRequest): number | undefined {
  const raw = request.headers['last-event-id'];
  if (!raw) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function attachSseStream(
  request: FastifyRequest,
  reply: FastifyReply,
  streamKey: string,
): void {
  if (getStreamClientCount(streamKey) >= STREAM_CLIENT_CAP) {
    void reply.code(429).send({ error: 'Too many stream clients' });
    return;
  }

  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  raw.write(': connected\n\n');

  const writeEvent = (event: StreamEvent) => {
    raw.write(`id: ${event.id}\n`);
    raw.write(`event: ${event.type}\n`);
    for (const line of event.data.split(/\r?\n/)) {
      raw.write(`data: ${line}\n`);
    }
    raw.write('\n');
  };

  const subscriber: StreamSubscriber = {
    onEvent: writeEvent,
    onClose: () => {
      raw.end();
    },
  };

  const joined = subscribeStream(streamKey, subscriber, {
    lastEventId: parseLastEventId(request),
    clientCap: STREAM_CLIENT_CAP,
  });
  if (!joined.ok) {
    raw.end();
    return;
  }

  const cleanup = () => {
    unsubscribeStream(streamKey, subscriber);
  };
  request.raw.on('close', cleanup);
  request.raw.on('error', cleanup);
}
