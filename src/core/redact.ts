/* Copyright Advanced Software and AI Solutions LLC */
const SECRET_PATTERNS: RegExp[] = [
  /SESSION_SECRET\s*[:=]\s*\S+/gi,
  /ADMIN_PASSWORD\s*[:=]\s*\S+/gi,
  /password\s*[:=]\s*\S+/gi,
  /authorization:\s*\S+/gi,
  /cookie:\s*[^\r\n]+/gi,
  /(?:api[_-]?key|token|secret)\s*[:=]\s*\S+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

export function appendCappedLog(existing: string, chunk: string, maxBytes: number): string {
  const redacted = redactSecrets(chunk);
  const combined = existing + redacted;
  const buf = Buffer.from(combined, 'utf8');
  if (buf.byteLength <= maxBytes) return combined;
  const sliced = buf.subarray(buf.byteLength - maxBytes);
  return sliced.toString('utf8');
}
